/*
 * vencord-file-converter
 * Copyright (c) 2026 emily7305
 * SPDX-License-Identifier: MIT
 *
 * Conversion presets. This module is intentionally free of Vencord/Discord
 * imports so it can be unit tested with plain Node (see test/presets.test.mjs).
 */

export type MediaKind = "video" | "audio" | "gif";

export interface Preset {
    id: string;
    label: string;
    description: string;
    /** Media kinds this preset makes sense for (used to filter the picker). */
    accepts: MediaKind[];
    /** Output file extension, without the dot. */
    ext: string;
    mime: string;
    /** Full ffmpeg argument list (excluding the leading `ffmpeg`). */
    args(input: string, output: string, opts: PresetOptions): string[];
    /** The whole point is a smaller file: if the output isn't smaller, keep the original. */
    mustShrink?: boolean;
}

export interface PresetOptions {
    /** x264 constant rate factor, 0 (lossless) – 51 (worst), for high-quality re-encodes. */
    crf: number;
    /** x264 CRF for the "Compress" preset. Higher = smaller. */
    compressCrf: number;
    /** x264 speed/efficiency trade-off. Slower presets are painfully slow in WASM. */
    x264Preset: string;
}

export const DEFAULT_PRESET_OPTIONS: PresetOptions = {
    crf: 20,
    compressCrf: 28,
    x264Preset: "veryfast",
};

/**
 * The single-threaded WASM build is roughly 10-20x slower than native ffmpeg,
 * so every H.264 preset pins `-pix_fmt yuv420p` (widest player support) and
 * `+faststart` (moov atom up front so Discord can start playback while
 * streaming).
 */
const H264_OUTPUT = (opts: PresetOptions, crf = opts.crf) => [
    "-c:v", "libx264",
    "-preset", opts.x264Preset,
    "-crf", String(crf),
    "-pix_fmt", "yuv420p",
    "-movflags", "+faststart",
];

// libx264 with yuv420p needs even dimensions; GIFs frequently have odd ones.
const EVEN_DIMENSIONS = ["-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2"];

// Shrink so the short side is at most 1080 px (4K/1440p phone videos → 1080p), keeping the
// aspect ratio and even dimensions. Smaller videos are left at their size.
const MAX_1080P = ["-vf", "scale=w='trunc(iw*min(1,1080/min(iw,ih))/2)*2':h='trunc(ih*min(1,1080/min(iw,ih))/2)*2'"];

export const PRESETS: Preset[] = [
    {
        id: "mp3",
        label: "Extract audio → MP3",
        description: "VBR highest quality (-q:a 0). Drops the video stream.",
        accepts: ["video", "audio"],
        ext: "mp3",
        mime: "audio/mpeg",
        args: (i, o) => ["-i", i, "-vn", "-c:a", "libmp3lame", "-q:a", "0", o],
    },
    {
        id: "flac",
        label: "Extract audio → FLAC",
        description: "Lossless compressed audio.",
        accepts: ["video", "audio"],
        ext: "flac",
        mime: "audio/flac",
        args: (i, o) => ["-i", i, "-vn", "-c:a", "flac", o],
    },
    {
        id: "wav",
        label: "Extract audio → WAV",
        description: "Uncompressed 16-bit PCM. Large files!",
        accepts: ["video", "audio"],
        ext: "wav",
        mime: "audio/wav",
        args: (i, o) => ["-i", i, "-vn", "-c:a", "pcm_s16le", o],
    },
    {
        id: "remux-mp4",
        label: "Remux → MP4 (lossless, instant)",
        description: "Stream copy (-c copy). Only works if the codecs are MP4-compatible (e.g. H.264/AAC in MKV/MOV).",
        accepts: ["video"],
        ext: "mp4",
        mime: "video/mp4",
        args: (i, o) => ["-i", i, "-map", "0", "-c", "copy", "-movflags", "+faststart", o],
    },
    {
        id: "compress",
        label: "Compress → MP4 (smaller file)",
        description: "Shrinks the file for sending: H.264, max 1080p, 128k audio. If it can't get smaller, your original is kept.",
        accepts: ["video"],
        ext: "mp4",
        mime: "video/mp4",
        mustShrink: true,
        args: (i, o, opts) => [
            "-i", i,
            ...MAX_1080P,
            ...H264_OUTPUT(opts, opts.compressCrf),
            "-c:a", "aac", "-b:a", "128k",
            o,
        ],
    },
    {
        id: "h264",
        label: "Re-encode → MP4 (high quality)",
        description: "For compatibility, not size: keeps full resolution and near-original quality, so the file may get bigger.",
        accepts: ["video"],
        ext: "mp4",
        mime: "video/mp4",
        args: (i, o, opts) => [
            "-i", i,
            ...EVEN_DIMENSIONS,
            ...H264_OUTPUT(opts),
            "-c:a", "aac", "-b:a", "160k",
            o,
        ],
    },
    {
        id: "gif-mp4",
        label: "GIF → MP4",
        description: "Usually 5-20x smaller than the GIF.",
        accepts: ["gif"],
        ext: "mp4",
        mime: "video/mp4",
        args: (i, o, opts) => ["-i", i, ...EVEN_DIMENSIONS, ...H264_OUTPUT(opts), "-an", o],
    },
    {
        id: "gif-webm",
        label: "GIF → WebM (VP8)",
        description: "Plays everywhere WebM does. VP8 because libvpx-vp9 crashes in the single-threaded @ffmpeg/core 0.12 build.",
        accepts: ["gif"],
        ext: "webm",
        mime: "video/webm",
        args: (i, o, opts) => [
            "-i", i,
            "-c:v", "libvpx",
            // VP8 CRF is 4-63 and needs a bitrate ceiling; x264 CRF 20 ≈ VP8 CRF 10.
            "-crf", String(Math.min(63, Math.max(4, opts.crf - 10))), "-b:v", "4M",
            "-deadline", "good", "-cpu-used", "4",
            "-pix_fmt", "yuv420p",
            "-an",
            o,
        ],
    },
];

export function getPreset(id: string): Preset | undefined {
    return PRESETS.find(p => p.id === id);
}

const VIDEO_EXT = new Set(["mp4", "m4v", "mkv", "mov", "webm", "avi", "flv", "wmv", "ts", "mts", "3gp", "ogv"]);
const AUDIO_EXT = new Set(["mp3", "wav", "flac", "ogg", "oga", "opus", "m4a", "aac", "wma", "aiff", "aif"]);

export function extensionOf(filename: string): string {
    const dot = filename.lastIndexOf(".");
    return dot === -1 ? "" : filename.slice(dot + 1).toLowerCase();
}

/** Classify a file by MIME type, falling back to its extension. */
export function detectMediaKind(filename: string, mime = ""): MediaKind | null {
    const ext = extensionOf(filename);
    if (mime === "image/gif" || ext === "gif") return "gif";
    if (mime.startsWith("video/") || VIDEO_EXT.has(ext)) return "video";
    if (mime.startsWith("audio/") || AUDIO_EXT.has(ext)) return "audio";
    return null;
}

export function presetsFor(kind: MediaKind): Preset[] {
    return PRESETS.filter(p => p.accepts.includes(kind));
}

/** `clip.final.MKV` + `mp4` → `clip.final.mp4` */
export function replaceExtension(filename: string, ext: string): string {
    const dot = filename.lastIndexOf(".");
    const base = dot > 0 ? filename.slice(0, dot) : filename;
    return `${base}.${ext}`;
}
