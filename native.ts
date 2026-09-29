/*
 * vc-file-converter
 * Copyright (c) 2026 emily7305
 * SPDX-License-Identifier: MIT
 */

// fetching attachments from the renderer fails because of CORS, so it's done here instead.
// only discord's own cdn is allowed so this can't be used to fetch random urls
const ALLOWED_HOSTS = new Set(["cdn.discordapp.com", "media.discordapp.net"]);

export async function fetchAttachment(_: unknown, url: string, maxBytes: number): Promise<Uint8Array> {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || !ALLOWED_HOSTS.has(parsed.hostname))
        throw new Error(`Refusing to download from ${parsed.hostname}`);

    const res = await fetch(parsed);
    if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);

    const length = Number(res.headers.get("content-length"));
    if (maxBytes > 0 && length > maxBytes)
        throw new Error(`File is ${(length / 1048576).toFixed(0)} MB, over the size limit`);

    return new Uint8Array(await res.arrayBuffer());
}
