/*
 * vc-file-converter
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
            label: p.label, value: p.id, default: p.id === "compress",
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
    gifMaxSize: {
        type: OptionType.SELECT,
        description: "GIF size (longest side)",
        options: [
            { label: "Small (320 px)", value: 320 },
            { label: "Medium (480 px)", value: 480, default: true },
            { label: "Large (640 px)", value: 640 },
            { label: "Extra large (800 px)", value: 800 },
        ],
    },
    gifFps: {
        type: OptionType.SLIDER,
        description: "GIF fps. Higher is smoother but bigger",
        markers: [8, 10, 12, 15, 20, 25],
        default: 15,
        stickToMarkers: true,
    },
    compressCrf: {
        type: OptionType.SLIDER,
        description: "Compress strength (CRF). Higher = smaller but worse quality, 26-30 is usually fine",
        markers: [23, 26, 28, 30, 32, 35],
        default: 28,
        stickToMarkers: false,
    },
    crf: {
        type: OptionType.SLIDER,
        description: "CRF for the high quality preset. Lower = better quality but bigger",
        markers: [14, 17, 20, 23, 26, 29, 32],
        default: 20,
        stickToMarkers: false,
    },
    x264Preset: {
        type: OptionType.SELECT,
        description: "H.264 encoder speed. Slower ones take forever",
        options: [
            { label: "ultrafast (biggest files)", value: "ultrafast" },
            { label: "veryfast (recommended)", value: "veryfast", default: true },
            { label: "medium", value: "medium" },
            { label: "slow (smallest files, very slow)", value: "slow" },
        ],
    },
    autoSendConverted: {
        type: OptionType.BOOLEAN,
        description: "Put converted attachments straight into the chat box instead of asking to save them",
        default: false,
    },
    maxInputSizeMB: {
        type: OptionType.NUMBER,
        description: "Max file size in MB (big files can run out of memory)",
        default: 500,
    },
    coreBaseURL: {
        type: OptionType.STRING,
        description: "Custom URL for ffmpeg-core.js/.wasm. Leave empty to use jsDelivr",
        default: "",
        placeholder: "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd",
    },
});
