/*
 * vencord-file-converter
 * Copyright (c) 2026 emily7305
 * SPDX-License-Identifier: MIT
 *
 * Glue between the FFmpeg service, plugin settings and Discord's upload queue.
 */

import { Logger } from "@utils/Logger";
import { CloudUpload } from "@vencord/discord-types";
import { ChannelStore, DraftType, FluxDispatcher, UploadAttachmentStore, UploadHandler, UploadManager } from "@webpack/common";

import { DEFAULT_CORE_BASE_URL, FFmpegService } from "../ffmpeg/FFmpegService";
import { detectMediaKind, PresetOptions } from "../ffmpeg/presets";
import { settings } from "../settings";

export const logger = new Logger("FileConverter", "#e86fa8");

export const ffmpeg = new FFmpegService({
    onLog: line => logger.debug(line),
});

// Plugins may only request connect/img/style/font rules; connect-src is all the worker's
// fetch-and-eval fallback needs (script-src 'unsafe-eval' is already granted by Vencord).
const CSP_DIRECTIVES = ["connect-src"];

/**
 * Vencord (desktop / Vesktop) rewrites Discord's CSP. jsDelivr is allowed out of
 * the box; a custom core URL has to be approved by the user once and needs a
 * restart. On the web extension `VencordNative.csp` doesn't exist and we just try.
 */
async function ensureCspAllows(baseURL: string) {
    const { csp } = (globalThis as any).VencordNative ?? {};
    if (!csp) return;

    const { origin } = new URL(baseURL);
    if (await csp.isDomainAllowed(origin, CSP_DIRECTIVES)) return;

    const result = await csp.requestAddOverride(origin, CSP_DIRECTIVES, "FileConverter");
    throw new Error(result === "ok"
        ? `Allowed ${origin}. Fully restart Discord to apply the new security policy, then try again.`
        : `${origin} is blocked by Discord's Content Security Policy (${result}).`);
}

export async function loadFFmpeg() {
    const base = settings.store.coreBaseURL.trim() || DEFAULT_CORE_BASE_URL;
    ffmpeg.setCoreBaseURL(base);
    if (ffmpeg.isLoaded) return;
    await ensureCspAllows(base);
    await ffmpeg.load();
}

export function getPresetOptions(): PresetOptions {
    return {
        crf: Math.round(settings.store.crf),
        compressCrf: Math.round(settings.store.compressCrf),
        x264Preset: settings.store.x264Preset,
    };
}

export function checkInputSize(size: number) {
    const max = settings.store.maxInputSizeMB;
    if (max > 0 && size > max * 1024 * 1024)
        throw new Error(`File is ${(size / 1048576).toFixed(0)} MB; the limit is ${max} MB (see plugin settings).`);
}

/** Add a file to a channel's upload queue exactly as if the user had picked it. */
export function queueUpload(file: File, channelId: string, draftType = DraftType.ChannelMessage) {
    const channel = ChannelStore.getChannel(channelId);
    if (!channel) throw new Error("Channel not found");
    UploadHandler.promptToUpload([file], channel, draftType);
}

/** Swap a pending (not yet sent) upload for the converted file. */
export function replaceUpload(upload: CloudUpload, file: File, draftType = DraftType.ChannelMessage) {
    const { channelId } = upload;

    if (typeof UploadManager.remove === "function") {
        UploadManager.remove(channelId, upload.id, draftType);
    } else {
        // Fallback in case Discord renames the action creator.
        FluxDispatcher.dispatch({ type: "UPLOAD_ATTACHMENT_REMOVE_FILE", channelId, id: upload.id, draftType });
    }

    queueUpload(file, channelId, draftType);
}

type NativeHelpers = { fetchAttachment(url: string, maxBytes: number): Promise<Uint8Array>; };

/**
 * Download a received attachment. Discord's CDN rejects cross-origin requests from the client
 * ("Failed to fetch"), so on desktop this goes through native.ts in the main process. The web
 * build has no native side and falls back to a plain fetch.
 */
export async function fetchAttachment(url: string): Promise<Blob> {
    const native: NativeHelpers | undefined = (globalThis as any).VencordNative?.pluginHelpers?.FileConverter;
    if (native) {
        const data = await native.fetchAttachment(url, settings.store.maxInputSizeMB * 1024 * 1024);
        return new Blob([data as BlobPart]);
    }

    const res = await fetch(url);
    if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);
    return res.blob();
}

/** Files waiting in the chat box that we know how to convert. */
export function getPendingMediaUploads(channelId: string, draftType = DraftType.ChannelMessage): CloudUpload[] {
    return (UploadAttachmentStore.getUploads(channelId, draftType) ?? [])
        .filter(u => u.item?.file && detectMediaKind(u.filename, u.mimeType));
}
