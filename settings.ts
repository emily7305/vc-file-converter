/*
 * vencord-file-converter
 * Copyright (c) 2026 emily7305
 * SPDX-License-Identifier: MIT
 */

import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";

import { PRESETS } from "./ffmpeg/presets";

export const settings = definePluginSettings({
    defaultVideoPreset: {
        type: OptionType.SELECT,
        description: "Preset pre-selected for videos",
        options: PRESETS.filter(p => p.accepts.includes("video")).map(p => ({
            label: p.label, value: p.id, default: p.id === "h264",
        })),
    },
    defaultAudioPreset: {
        type: OptionType.SELECT,
        description: "Preset pre-selected for audio files",
        options: PRESETS.filter(p => p.accepts.includes("audio")).map(p => ({
            label: p.label, value: p.id, default: p.id === "mp3",
        })),
    },
    defaultGifPreset: {
        type: OptionType.SELECT,
        description: "Preset pre-selected for GIFs",
        options: PRESETS.filter(p => p.accepts.includes("gif")).map(p => ({
            label: p.label, value: p.id, default: p.id === "gif-mp4",
        })),
    },
    crf: {
        type: OptionType.SLIDER,
        description: "H.264 quality (CRF). Lower = better quality & bigger files. 18-23 is visually near-lossless.",
        markers: [14, 17, 20, 23, 26, 29, 32],
        default: 20,
        stickToMarkers: false,
    },
    x264Preset: {
        type: OptionType.SELECT,
        description: "H.264 encoder speed. WASM is single-threaded, so slower presets can take minutes.",
        options: [
            { label: "ultrafast (biggest files)", value: "ultrafast" },
            { label: "veryfast (recommended)", value: "veryfast", default: true },
            { label: "medium", value: "medium" },
            { label: "slow (smallest files, very slow)", value: "slow" },
        ],
    },
    autoSendConverted: {
        type: OptionType.BOOLEAN,
        description: "When converting a received attachment, add the result to the current channel's upload queue instead of saving it to disk",
        default: false,
    },
    maxInputSizeMB: {
        type: OptionType.NUMBER,
        description: "Refuse inputs larger than this (MB). WASM memory is capped at a few GB and the file lives in memory ~3x during conversion.",
        default: 500,
    },
    coreBaseURL: {
        type: OptionType.STRING,
        description: "Advanced: URL of a directory hosting ffmpeg-core.js + ffmpeg-core.wasm (@ffmpeg/core UMD build). Leave empty for jsDelivr.",
        default: "",
        placeholder: "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd",
    },
});
