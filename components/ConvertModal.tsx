/*
 * vencord-file-converter
 * Copyright (c) 2026 emily7305
 * SPDX-License-Identifier: MIT
 *
 * Preset picker → progress bar → result, built on Discord's current Modal
 * component (exported as `Modal` from @webpack/common in both Vencord and Equicord).
 */

import { classNameFactory } from "@utils/css";
import { saveFile } from "@utils/web";
import { CloudUpload, ModalAction, RenderModalProps } from "@vencord/discord-types";
import { Modal, openModal, showToast, Toasts, useEffect, useMemo, useRef, useState } from "@webpack/common";

import { stripBanner } from "../ffmpeg/errors";
import { AbortError, ConversionError, ConvertProgress } from "../ffmpeg/FFmpegService";
import { detectMediaKind, MediaKind, presetsFor } from "../ffmpeg/presets";
import { settings } from "../settings";
import { checkInputSize, fetchAttachment, ffmpeg, getPresetOptions, loadFFmpeg, logger, queueUpload, replaceUpload } from "../utils/converter";

const cl = classNameFactory("vc-fconv-");

/** Where the input comes from decides what we do with the output. */
export type ConvertSource =
    /** A pending upload in the chat bar: replace it in place. */
    | { type: "upload"; upload: CloudUpload; draftType?: number; }
    /** A file picked from disk via the "+" menu: add it to the queue. */
    | { type: "file"; file: File; channelId: string; }
    /** A received attachment: save to disk, or re-queue in the current channel. */
    | { type: "attachment"; url: string; filename: string; mime?: string; size: number; channelId: string; };

type Phase =
    | { name: "pick"; }
    | { name: "loading"; }
    | { name: "converting"; progress: ConvertProgress; }
    | { name: "done"; file: File; }
    /** A "make it smaller" preset produced a file that isn't smaller. */
    | { name: "not-smaller"; file: File; }
    | { name: "error"; message: string; log: string[]; };

function sourceInfo(src: ConvertSource) {
    switch (src.type) {
        case "upload": return { filename: src.upload.filename, mime: src.upload.mimeType ?? "", size: src.upload.item?.file?.size ?? 0 };
        case "file": return { filename: src.file.name, mime: src.file.type, size: src.file.size };
        case "attachment": return { filename: src.filename, mime: src.mime ?? "", size: src.size };
    }
}

async function sourceBlob(src: ConvertSource): Promise<Blob> {
    switch (src.type) {
        case "upload": {
            const file = src.upload.item?.file;
            if (!file) throw new Error("Couldn't read this file from the chat box. Try removing it and adding it again.");
            return file;
        }
        case "file": return src.file;
        case "attachment": return fetchAttachment(src.url);
    }
}

function defaultPresetFor(kind: MediaKind) {
    const { defaultVideoPreset, defaultAudioPreset, defaultGifPreset } = settings.store;
    return { video: defaultVideoPreset, audio: defaultAudioPreset, gif: defaultGifPreset }[kind];
}

export function formatBytes(n: number) {
    if (n < 1024) return `${n} B`;
    const units = ["KB", "MB", "GB"];
    let i = -1;
    do { n /= 1024; i++; } while (n >= 1024 && i < units.length - 1);
    return `${n.toFixed(n < 10 ? 1 : 0)} ${units[i]}`;
}

function formatTime(s: number) {
    const m = Math.floor(s / 60);
    return `${m}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}

function ProgressBar({ progress }: { progress: ConvertProgress | null; }) {
    const ratio = progress?.ratio;
    const indeterminate = ratio == null;
    return (
        <div className={cl("progress")}>
            <div
                className={cl("progress-track")}
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={indeterminate ? undefined : Math.round(ratio * 100)}
            >
                <div
                    className={cl("progress-fill", { "progress-indeterminate": indeterminate })}
                    style={indeterminate ? undefined : { width: `${ratio * 100}%` }}
                />
            </div>
            <div className={cl("progress-label")}>
                {!progress
                    ? "Loading FFmpeg (first run downloads ~31 MB)…"
                    : indeterminate
                        ? `Processed ${formatTime(progress.seconds)}`
                        : `${Math.round(ratio * 100)}%`}
            </div>
        </div>
    );
}

function ConvertModal({ source, modalProps }: { source: ConvertSource; modalProps: RenderModalProps; }) {
    const info = useMemo(() => sourceInfo(source), [source]);
    const kind = detectMediaKind(info.filename, info.mime);
    const presets = kind ? presetsFor(kind) : [];

    const [presetId, setPresetId] = useState(() => {
        const preferred = kind && defaultPresetFor(kind);
        return presets.some(p => p.id === preferred) ? preferred! : presets[0]?.id;
    });
    const [phase, setPhase] = useState<Phase>({ name: "pick" });
    const abortRef = useRef<AbortController | null>(null);

    // Cancel a running job if the modal is closed (Esc / click outside).
    useEffect(() => () => abortRef.current?.abort(), []);

    const preset = presets.find(p => p.id === presetId);

    async function start() {
        if (!preset) return;
        const abort = abortRef.current = new AbortController();
        try {
            checkInputSize(info.size);
            setPhase({ name: "loading" });
            const [blob] = await Promise.all([sourceBlob(source), loadFFmpeg()]);
            if (abort.signal.aborted) return;

            setPhase({ name: "converting", progress: { ratio: 0, seconds: 0 } });
            const file = await ffmpeg.convert(blob, info.filename, preset, {
                presetOptions: getPresetOptions(),
                signal: abort.signal,
                onProgress: progress => {
                    if (!abort.signal.aborted) setPhase({ name: "converting", progress });
                },
            });

            if (preset.mustShrink && info.size > 0 && file.size >= info.size)
                setPhase({ name: "not-smaller", file });
            else
                finish(file);
        } catch (e) {
            // After a cancel, late failures (e.g. the core download finishing with an error) are irrelevant.
            if (e instanceof AbortError || abort.signal.aborted) return;
            logger.error("Conversion failed", e);
            setPhase({
                name: "error",
                message: e instanceof Error ? e.message : String(e),
                log: e instanceof ConversionError ? e.logTail : [],
            });
        } finally {
            if (abortRef.current === abort) abortRef.current = null;
        }
    }

    function finish(file: File) {
        const summary = `${info.filename} → ${file.name} (${formatBytes(info.size)} → ${formatBytes(file.size)})`;
        switch (source.type) {
            case "upload":
                replaceUpload(source.upload, file, source.draftType);
                showToast(`Converted ${summary}`, Toasts.Type.SUCCESS);
                modalProps.onClose();
                return;
            case "file":
                queueUpload(file, source.channelId);
                showToast(`Converted ${summary}`, Toasts.Type.SUCCESS);
                modalProps.onClose();
                return;
            case "attachment":
                if (settings.store.autoSendConverted) {
                    queueUpload(file, source.channelId);
                    showToast(`Converted ${summary}. Added to your upload queue`, Toasts.Type.SUCCESS);
                    modalProps.onClose();
                } else {
                    setPhase({ name: "done", file });
                }
        }
    }

    function cancel() {
        abortRef.current?.abort();
        setPhase({ name: "pick" });
    }

    const busy = phase.name === "loading" || phase.name === "converting";

    const actions: ModalAction[] = [];
    if (phase.name === "pick" || phase.name === "error")
        actions.push({ text: phase.name === "error" ? "Retry" : "Convert", variant: "primary", onClick: start, disabled: !preset });
    if (busy)
        actions.push({ text: "Cancel", variant: "critical-primary", onClick: cancel });
    if (phase.name === "not-smaller") {
        const { file } = phase;
        actions.push(
            { text: "Keep original", variant: "primary", onClick: modalProps.onClose },
            { text: "Use it anyway", variant: "secondary", onClick: () => finish(file) },
        );
    }
    if (phase.name === "done" && source.type === "attachment") {
        const { file } = phase;
        actions.push(
            { text: "Save", variant: "primary", onClick: () => { saveFile(file); modalProps.onClose(); } },
            { text: "Add to upload queue", variant: "secondary", onClick: () => { queueUpload(file, source.channelId); modalProps.onClose(); } },
        );
    }

    return (
        <Modal
            {...modalProps}
            size="sm"
            title="Convert Media"
            subtitle={`${info.filename} · ${formatBytes(info.size)}`}
            actions={actions}
        >
            <div className={cl("content")}>
                {!kind && <div className={cl("error")}>This file type isn't supported.</div>}

                {phase.name === "pick" && (
                    <div className={cl("presets")} role="radiogroup">
                        {presets.map(p => (
                            <label key={p.id} className={cl("preset", { "preset-selected": p.id === presetId })}>
                                <input
                                    type="radio"
                                    name="vc-fconv-preset"
                                    checked={p.id === presetId}
                                    onChange={() => setPresetId(p.id)}
                                />
                                <div>
                                    <div className={cl("preset-label")}>{p.label}</div>
                                    <div className={cl("muted")}>{p.description}</div>
                                </div>
                            </label>
                        ))}
                    </div>
                )}

                {phase.name === "loading" && <ProgressBar progress={null} />}
                {phase.name === "converting" && <ProgressBar progress={phase.progress} />}

                {phase.name === "not-smaller" && (
                    <div>
                        This video is already well compressed: the result would be {formatBytes(phase.file.size)},
                        {" "}not smaller than the original ({formatBytes(info.size)}), so nothing was changed.
                        <div className={cl("muted")}>For a smaller file, raise the compress strength in the plugin settings.</div>
                    </div>
                )}

                {phase.name === "done" && (
                    <div className={cl("success")}>
                        Done! {phase.file.name} ({formatBytes(phase.file.size)})
                    </div>
                )}

                {phase.name === "error" && (
                    <>
                        <div className={cl("error")}>{phase.message}</div>
                        {phase.log.length > 0 && (
                            <details className={cl("details")}>
                                <summary>Technical details</summary>
                                <pre className={cl("log")}>{stripBanner(phase.log).join("\n")}</pre>
                            </details>
                        )}
                    </>
                )}
            </div>
        </Modal>
    );
}

export function openConvertModal(source: ConvertSource) {
    openModal(props => <ConvertModal source={source} modalProps={props} />);
}
