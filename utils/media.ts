/*
 * vc-file-converter
 * Copyright (c) 2026 emily7305
 * SPDX-License-Identifier: MIT
 */

import type { Message } from "@vencord/discord-types";

import { detectMediaKind } from "../ffmpeg/presets";

export interface MediaItem {
    key: string;
    filename: string;
    /** where to download it from (always a discord host) */
    url: string;
    mime?: string;
    /** 0 if unknown (embeds) */
    size: number;
    /** bits of url that identify this item when it's right clicked */
    matchKeys: string[];
}

// discord's own cdn + media proxy. embeds from other sites get proxied through images-ext-N
const DISCORD_HOSTS = /^(cdn\.discordapp\.com|media\.discordapp\.net|images-ext-\d+\.discordapp\.net)$/;

function parse(url: string | undefined) {
    if (!url) return null;
    try {
        return new URL(url);
    } catch {
        return null;
    }
}

export function isDiscordMediaUrl(url: string | undefined) {
    const u = parse(url);
    return !!u && u.protocol === "https:" && DISCORD_HOSTS.test(u.hostname);
}

const EXT_FOR_MIME: Record<string, string> = {
    "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov", "image/gif": "gif",
};

function nameFromUrl(url: string, mime: string | undefined, fallbackExt: string) {
    let name = "";
    try {
        name = decodeURIComponent(new URL(url).pathname.split("/").pop() ?? "");
    } catch { }
    if (!name) name = "video";
    if (!/\.[a-z0-9]{2,5}$/i.test(name)) name += "." + (EXT_FOR_MIME[mime ?? ""] ?? fallbackExt);
    return name;
}

const pathOf = (url: string | undefined) => parse(url)?.pathname ?? "";

function fromMessage(message: Message, prefix: string): MediaItem[] {
    const items: MediaItem[] = [];

    for (const a of (message.attachments ?? []) as any[]) {
        if (!detectMediaKind(a.filename, a.content_type) || !isDiscordMediaUrl(a.url)) continue;
        items.push({
            key: `${prefix}a-${a.id}`,
            filename: a.filename,
            url: a.url,
            mime: a.content_type,
            size: a.size ?? 0,
            matchKeys: [`/${a.id}/`],
        });
    }

    (message.embeds ?? []).forEach((e, i) => {
        // videos (incl. tenor-style "gifv"), or a linked gif shown as an image
        const media = e.video ?? (e.image && /gif/i.test(`${e.image.contentType} ${pathOf(e.image.url)}`) ? e.image : undefined);
        if (!media) return;

        // youtube etc. are iframes with no proxied file, so they're skipped here
        const url = isDiscordMediaUrl(media.proxyURL) ? media.proxyURL! : isDiscordMediaUrl(media.url) ? media.url : null;
        if (!url) return;

        const filename = nameFromUrl(media.url, media.contentType, media === e.image ? "gif" : "mp4");
        if (!detectMediaKind(filename, media.contentType)) return;

        items.push({
            key: `${prefix}e-${i}`,
            filename,
            url,
            mime: media.contentType,
            size: 0,
            matchKeys: [pathOf(media.url), pathOf(media.proxyURL)].filter(Boolean),
        });
    });

    return items;
}

/** everything convertible in a message, including inside forwarded messages */
export function collectMedia(message: Message): MediaItem[] {
    const items = fromMessage(message, "");
    message.messageSnapshots?.forEach((s, i) => items.push(...fromMessage(s.message, `f${i}-`)));

    const seen = new Set<string>();
    return items.filter(it => !seen.has(it.url) && seen.add(it.url));
}

/** if one specific item was right clicked, just that one */
export function pickClicked(items: MediaItem[], clickedUrls: (string | undefined)[]): MediaItem[] {
    const clicked = clickedUrls.map(pathOf).filter(Boolean);
    const hit = items.find(it => it.matchKeys.some(k => clicked.some(c => c.includes(k))));
    return hit ? [hit] : items;
}
