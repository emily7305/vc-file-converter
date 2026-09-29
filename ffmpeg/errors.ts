/*
 * vencord-file-converter
 * Copyright (c) 2026 emily7305
 * SPDX-License-Identifier: MIT
 */

// turn common ffmpeg errors into something readable

const EXPLANATIONS: [RegExp, string][] = [
    [
        /does not contain any stream|matches no streams/i,
        "This file has no audio track, so there's nothing to extract. (Videos made from GIFs never have sound.)",
    ],
    [
        /could not find tag for codec|not currently supported in container|not supported by the muxer/i,
        "This video's format can't be copied into an MP4 as-is. Use Compress or Re-encode instead.",
    ],
    [
        /invalid data found when processing input|moov atom not found|could not find codec parameters|end of file/i,
        "This doesn't look like a valid media file, or it's damaged.",
    ],
    [
        /cannot allocate memory|out of memory/i,
        "Ran out of memory. Try a smaller file.",
    ],
];

export function explainFailure(log: string[]): string | null {
    const text = log.join("\n");
    return EXPLANATIONS.find(([re]) => re.test(text))?.[1] ?? null;
}

// cut off the version/config spam at the start of the log
export function stripBanner(log: string[]): string[] {
    const start = log.findIndex(l => /^\s*Input #/.test(l));
    return start > 0 ? log.slice(start) : log;
}
