/*
 * vc-file-converter
 * Copyright (c) 2026 emily7305
 * SPDX-License-Identifier: MIT
 */

// @ffmpeg/ffmpeg's worker breaks when bundled by vencord (relative imports + import.meta.url),
// so this is a small copy of it that runs from a blob url. kept as a string so esbuild can't mess with it

export const WORKER_SOURCE = /* js */ `
"use strict";
let core = null;

async function importCore(coreURL) {
    try {
        importScripts(coreURL);
    } catch {
        // for custom urls that are only allowed in connect-src
        const res = await fetch(coreURL);
        if (!res.ok) throw new Error("Failed to fetch ffmpeg-core.js: HTTP " + res.status);
        (0, eval)(await res.text() + "\\n//# sourceURL=" + coreURL);
    }
    if (typeof self.createFFmpegCore !== "function")
        throw new Error("ffmpeg-core.js did not define createFFmpegCore");
}

async function load({ coreURL, wasmURL }) {
    if (core) return false;
    await importCore(coreURL);
    // ffmpeg-core reads the wasm url from the hash
    core = await self.createFFmpegCore({
        mainScriptUrlOrBlob: coreURL + "#" + btoa(JSON.stringify({ wasmURL, workerURL: "" })),
    });
    core.setLogger(data => self.postMessage({ type: "log", data }));
    core.setProgress(data => self.postMessage({ type: "progress", data }));
    return true;
}

const handlers = {
    load,
    exec({ args, timeout = -1 }) {
        core.setTimeout(timeout);
        core.exec(...args);
        const ret = core.ret;
        core.reset();
        return ret;
    },
    writeFile({ path, data }) { core.FS.writeFile(path, data); return true; },
    readFile({ path }) { return core.FS.readFile(path); },
    deleteFile({ path }) { core.FS.unlink(path); return true; },
};

self.onmessage = async ({ data: { id, type, data } }) => {
    try {
        if (!(type in handlers)) throw new Error("Unknown message type: " + type);
        if (type !== "load" && !core) throw new Error("ffmpeg-core is not loaded");
        const result = await handlers[type](data);
        const transfer = result instanceof Uint8Array ? [result.buffer] : [];
        self.postMessage({ id, type: "result", data: result }, transfer);
    } catch (e) {
        self.postMessage({ id, type: "error", data: String(e && e.message || e) });
    }
};
`;
