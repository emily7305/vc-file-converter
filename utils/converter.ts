/*
 * vc-file-converter
 * Copyright (c) 2026 emily7305
 * SPDX-License-Identifier: MIT
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

// plugins can't request script-src, but connect-src is enough for the worker's eval fallback
const CSP_DIRECTIVES = ["connect-src"];

// jsdelivr is already allowed by vencord. a custom url needs approving once (+ restart).
// VencordNative.csp doesn't exist on web, just try anyway there
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
        gifMaxSize: settings.store.gifMaxSize,
        gifFps: Math.round(settings.store.gifFps),
        x264Preset: settings.store.x264Preset,
    };
}

export function checkInputSize(size: number) {
    const max = settings.store.maxInputSizeMB;
    if (max > 0 && size > max * 1024 * 1024)
        throw new Error(`File is ${(size / 1048576).toFixed(0)} MB; the limit is ${max} MB (see plugin settings).`);
}

// same as picking the file normally
export function queueUpload(file: File, channelId: string, draftType = DraftType.ChannelMessage) {
    const channel = ChannelStore.getChannel(channelId);
    if (!channel) throw new Error("Channel not found");
    UploadHandler.promptToUpload([file], channel, draftType);
}


export function replaceUpload(upload: CloudUpload, file: File, draftType = DraftType.ChannelMessage) {
    const { channelId } = upload;

    if (typeof UploadManager.remove === "function") {
        UploadManager.remove(channelId, upload.id, draftType);
    } else {
        // in case discord renames remove()
        FluxDispatcher.dispatch({ type: "UPLOAD_ATTACHMENT_REMOVE_FILE", channelId, id: upload.id, draftType });
    }

    queueUpload(file, channelId, draftType);
}

type NativeHelpers = { fetchAttachment(url: string, maxBytes: number): Promise<Uint8Array>; };

// goes through native.ts on desktop (CORS), plain fetch on web
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


export function getPendingMediaUploads(channelId: string, draftType = DraftType.ChannelMessage): CloudUpload[] {
    return (UploadAttachmentStore.getUploads(channelId, draftType) ?? [])
        .filter(u => u.item?.file && detectMediaKind(u.filename, u.mimeType));
}
