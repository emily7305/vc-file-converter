/*
 * vencord-file-converter
 * Copyright (c) 2026 emily7305
 * SPDX-License-Identifier: MIT
 *
 * Source of the Web Worker that hosts ffmpeg-core.
 *
 * Why not use @ffmpeg/ffmpeg's own worker? Its ESM worker does relative
 * imports (`./const.js`, `./errors.js`) and is spawned via
 * `new URL("./worker.js", import.meta.url)`. Neither survives being inlined into
 * Vencord's single IIFE bundle, and a cross-origin worker URL is not allowed.
 * This is a dependency-free port of the same protocol (~60 lines) that we spawn
 * from a Blob URL instead.
 *
 * It is a plain string (not a function we `.toString()`) so bundler
 * transforms such as esbuild's `keepNames` helpers can never leak references to
 * the outer bundle into the worker scope.
 */

export const WORKER_SOURCE = /* js */ `
"use strict";
let core = null;

async function importCore(coreURL) {
    try {
        // Works when the CDN host is allowed by script-src (Vencord allows cdn.jsdelivr.net).
        importScripts(coreURL);
    } catch {
        // Fallback for hosts that are only allowed by connect-src (the only kind of rule a plugin can
        // ask Vencord to add): fetch the script and evaluate it globally. Discord's CSP, as patched by
        // Vencord, includes 'unsafe-eval' (also needed to compile the wasm itself).
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
    // ffmpeg-core's locateFile() reads the wasm URL from base64 JSON in the hash.
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
