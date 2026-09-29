/*
 * vencord-file-converter
 * Copyright (c) 2026 emily7305
 * SPDX-License-Identifier: MIT
 */

export type MediaKind = "video" | "audio" | "gif";

export interface Preset {
    id: string;
    label: string;
    description: string;
    /** which file types show this preset */
    accepts: MediaKind[];
    /** without the dot */
    ext: string;
    mime: string;

    args(input: string, output: string, opts: PresetOptions): string[];
    /** keep the original if the result isn't smaller */
    mustShrink?: boolean;
}

export interface PresetOptions {
    /** x264 crf (0-51, lower = better) for the high quality preset + gifs */
    crf: number;
    /** crf for compress */
    compressCrf: number;
    /** gif max width/height */
    gifMaxSize: number;
    gifFps: number;
    /** slow presets are REALLY slow in wasm */
    x264Preset: string;
}

export const DEFAULT_PRESET_OPTIONS: PresetOptions = {
    crf: 20,
    compressCrf: 28,
    gifMaxSize: 480,
    gifFps: 15,
    x264Preset: "veryfast",
};

// yuv420p so it plays everywhere, faststart so discord can start playing before it's fully loaded
const H264_OUTPUT = (opts: PresetOptions, crf = opts.crf) => [
    "-c:v", "libx264",
    "-preset", opts.x264Preset,
    "-crf", String(crf),
    "-pix_fmt", "yuv420p",
    "-movflags", "+faststart",
];

// x264 needs even width/height, gifs often aren't
const EVEN_DIMENSIONS = ["-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2"];

// max 1080p (short side), smaller videos stay the same
const MAX_1080P = ["-vf", "scale=w='trunc(iw*min(1,1080/min(iw,ih))/2)*2':h='trunc(ih*min(1,1080/min(iw,ih))/2)*2'"];

export const PRESETS: Preset[] = [
    {
        id: "mp3",
        label: "Extract audio → MP3",
        description: "Best quality MP3",
        accepts: ["video", "audio"],
        ext: "mp3",
        mime: "audio/mpeg",
        args: (i, o) => ["-i", i, "-vn", "-c:a", "libmp3lame", "-q:a", "0", o],
    },
    {
        id: "flac",
        label: "Extract audio → FLAC",
        description: "Lossless",
        accepts: ["video", "audio"],
        ext: "flac",
        mime: "audio/flac",
        args: (i, o) => ["-i", i, "-vn", "-c:a", "flac", o],
    },
    {
        id: "wav",
        label: "Extract audio → WAV",
        description: "Uncompressed, big files",
        accepts: ["video", "audio"],
        ext: "wav",
        mime: "audio/wav",
        args: (i, o) => ["-i", i, "-vn", "-c:a", "pcm_s16le", o],
    },
    {
        id: "remux-mp4",
        label: "Remux → MP4 (lossless, instant)",
        description: "Instant and lossless, but doesn't work for every video",
        accepts: ["video"],
        ext: "mp4",
        mime: "video/mp4",
        args: (i, o) => ["-i", i, "-map", "0", "-c", "copy", "-movflags", "+faststart", o],
    },
    {
        id: "compress",
        label: "Compress → MP4 (smaller file)",
        description: "Smaller file, max 1080p",
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
        description: "Fixes videos that won't play. File might get bigger",
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
        id: "gif",
        label: "Video → GIF",
        description: "Best for short clips, GIFs get big fast",
        accepts: ["video"],
        ext: "gif",
        mime: "image/gif",
        args: (i, o, { gifMaxSize: max, gifFps: fps }) => {
            const scale = `scale=w='trunc(iw*min(1,${max}/max(iw,ih)))':h='trunc(ih*min(1,${max}/max(iw,ih)))':flags=lanczos`;
            // gifs only get 256 colours so generate a palette from the video first
            const palette = "split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle";
            return ["-i", i, "-vf", `fps=${fps},${scale},${palette}`, "-loop", "0", o];
        },
    },
    {
        id: "gif-mp4",
        label: "GIF → MP4",
        description: "Way smaller than the GIF",
        accepts: ["gif"],
        ext: "mp4",
        mime: "video/mp4",
        args: (i, o, opts) => ["-i", i, ...EVEN_DIMENSIONS, ...H264_OUTPUT(opts), "-an", o],
    },
    {
        id: "gif-webm",
        label: "GIF → WebM (VP8)",
        description: "WebM version (VP8)",
        accepts: ["gif"],
        ext: "webm",
        mime: "video/webm",
        args: (i, o, opts) => [
            "-i", i,
            "-c:v", "libvpx",
            // vp8 crf range is 4-63 and it needs a max bitrate
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

// clip.final.MKV -> clip.final.mp4
export function replaceExtension(filename: string, ext: string): string {
    const dot = filename.lastIndexOf(".");
    const base = dot > 0 ? filename.slice(0, dot) : filename;
    return `${base}.${ext}`;
}
