/*
 * vencord-file-converter
 * Copyright (c) 2026 emily7305
 * SPDX-License-Identifier: MIT
 *
 * Owns the ffmpeg-core Web Worker: lazy loading, a tiny RPC layer, a job queue
 * (the WASM instance has a single virtual FS and can run one command at a
 * time), progress reporting and cleanup of virtual files.
 *
 * Deliberately free of Vencord imports so it can be bundled standalone for the
 * browser test in test/worker.e2e.mjs.
 */

import { DEFAULT_PRESET_OPTIONS, extensionOf, Preset, PresetOptions, replaceExtension } from "./presets";
import { WORKER_SOURCE } from "./workerSource";

export const FFMPEG_CORE_VERSION = "0.12.10";
/** cdn.jsdelivr.net is on Vencord's built-in CSP allowlist (connect-src, script-src, worker-src). */
export const DEFAULT_CORE_BASE_URL = `https://cdn.jsdelivr.net/npm/@ffmpeg/core@${FFMPEG_CORE_VERSION}/dist/umd`;

export interface FFmpegServiceConfig {
    /** Directory containing ffmpeg-core.js and ffmpeg-core.wasm (UMD, single-threaded build). */
    coreBaseURL?: string;
    onLog?(line: string): void;
}

export interface ConvertProgress {
    /** 0..1, or null while ffmpeg can't estimate it yet (e.g. unknown duration). */
    ratio: number | null;
    /** Media timestamp processed so far, in seconds. */
    seconds: number;
}

export interface ConvertOptions {
    presetOptions?: Partial<PresetOptions>;
    onProgress?(p: ConvertProgress): void;
    signal?: AbortSignal;
}

export class ConversionError extends Error {
    constructor(message: string, readonly logTail: string[] = []) {
        super(message);
        this.name = "ConversionError";
    }
}

export class AbortError extends Error {
    constructor() {
        super("Conversion cancelled");
        this.name = "AbortError";
    }
}

type Pending = { resolve(v: any): void; reject(e: Error): void; };
type WorkerMessage =
    | { id: number; type: "result"; data: unknown; }
    | { id: number; type: "error"; data: string; }
    | { type: "log"; data: { type: string; message: string; }; }
    | { type: "progress"; data: { progress: number; time: number; }; };

const LOG_TAIL = 25;

export class FFmpegService {
    private worker: Worker | null = null;
    private loading: Promise<void> | null = null;
    private nextId = 0;
    private pending = new Map<number, Pending>();
    private queue: Promise<unknown> = Promise.resolve();
    private jobCounter = 0;

    // Per-job listeners, set while a job is running.
    private progressListener: ((p: ConvertProgress) => void) | null = null;
    private logTail: string[] = [];

    constructor(private config: FFmpegServiceConfig = {}) { }

    get isLoaded() {
        return this.worker !== null && this.loading === null;
    }

    setCoreBaseURL(url: string | undefined) {
        if ((url || undefined) === this.config.coreBaseURL) return;
        this.config.coreBaseURL = url || undefined;
        this.dispose(); // next load picks up the new URL
    }

    /** Spawn the worker and load ffmpeg-core (~31 MB wasm, cached by the browser after the first fetch). */
    load(): Promise<void> {
        if (this.worker && !this.loading) return Promise.resolve();
        return this.loading ??= this.spawn().finally(() => { this.loading = null; });
    }

    private async spawn() {
        const base = (this.config.coreBaseURL || DEFAULT_CORE_BASE_URL).replace(/\/+$/, "");
        const workerURL = URL.createObjectURL(new Blob([WORKER_SOURCE], { type: "text/javascript" }));
        const worker = new Worker(workerURL, { name: "vc-file-converter-ffmpeg" });
        // Revoking right away is fine: the worker script is fetched synchronously on construction.
        URL.revokeObjectURL(workerURL);

        worker.onmessage = ({ data }: MessageEvent<WorkerMessage>) => this.onMessage(data);
        worker.onerror = e => {
            e.preventDefault();
            this.failAll(new ConversionError(`FFmpeg worker crashed: ${e.message || "unknown error"}`, this.logTail));
            this.dispose();
        };
        this.worker = worker;

        try {
            await this.call("load", {
                coreURL: `${base}/ffmpeg-core.js`,
                wasmURL: `${base}/ffmpeg-core.wasm`,
            });
        } catch (e) {
            this.dispose();
            throw e;
        }
    }

    private onMessage(msg: WorkerMessage) {
        switch (msg.type) {
            case "log":
                this.logTail.push(msg.data.message);
                if (this.logTail.length > LOG_TAIL) this.logTail.shift();
                this.config.onLog?.(msg.data.message);
                return;
            case "progress": {
                // ffmpeg-core reports progress from the parsed input duration, which can be
                // negative or > 1 when the duration is unknown (common with GIFs / live WebM).
                const { progress, time } = msg.data;
                const ratio = Number.isFinite(progress) && progress >= 0 && progress <= 1 ? progress : null;
                this.progressListener?.({ ratio, seconds: Math.max(0, time / 1e6) });
                return;
            }
            case "result":
            case "error": {
                const p = this.pending.get(msg.id);
                if (!p) return;
                this.pending.delete(msg.id);
                if (msg.type === "result") p.resolve(msg.data);
                else p.reject(new ConversionError(msg.data, [...this.logTail]));
            }
        }
    }

    private call<T = unknown>(type: string, data: unknown, transfer: Transferable[] = []): Promise<T> {
        const { worker } = this;
        if (!worker) return Promise.reject(new ConversionError("FFmpeg is not loaded"));
        const id = this.nextId++;
        return new Promise<T>((resolve, reject) => {
            this.pending.set(id, { resolve, reject });
            worker.postMessage({ id, type, data }, transfer);
        });
    }

    private failAll(err: Error) {
        for (const p of this.pending.values()) p.reject(err);
        this.pending.clear();
    }

    // ---- Thin wrappers around the virtual FS / exec ----

    writeFile(path: string, data: Uint8Array) {
        return this.call<boolean>("writeFile", { path, data }, [data.buffer]);
    }

    readFile(path: string) {
        return this.call<Uint8Array>("readFile", { path });
    }

    deleteFile(path: string) {
        return this.call<boolean>("deleteFile", { path });
    }

    /** Runs ffmpeg with the given args, returns its exit code. */
    exec(args: string[], timeout = -1) {
        return this.call<number>("exec", { args, timeout });
    }

    // ---- High-level API ----

    /**
     * Convert a file with a preset. Jobs are serialised; a queued job whose
     * signal is aborted is skipped. Aborting a *running* job terminates the
     * worker (the only way to interrupt synchronous WASM), so the next job pays
     * the load cost again.
     */
    convert(input: Blob, filename: string, preset: Preset, opts: ConvertOptions = {}): Promise<File> {
        const job = this.queue.then(() => this.runJob(input, filename, preset, opts));
        this.queue = job.catch(() => { });
        return job;
    }

    private async runJob(input: Blob, filename: string, preset: Preset, { presetOptions, onProgress, signal }: ConvertOptions) {
        if (signal?.aborted) throw new AbortError();

        const onAbort = () => {
            this.failAll(new AbortError());
            this.dispose();
        };
        signal?.addEventListener("abort", onAbort, { once: true });

        const n = this.jobCounter++;
        // Never pass user file names to ffmpeg: spaces/unicode/leading dashes can break arg parsing.
        const inPath = `in_${n}.${extensionOf(filename) || "bin"}`;
        const outPath = `out_${n}.${preset.ext}`;

        try {
            await this.load();
            if (signal?.aborted) throw new AbortError();

            this.logTail = [];
            this.progressListener = onProgress ?? null;
            onProgress?.({ ratio: 0, seconds: 0 });

            await this.writeFile(inPath, new Uint8Array(await input.arrayBuffer()));
            const args = preset.args(inPath, outPath, { ...DEFAULT_PRESET_OPTIONS, ...presetOptions });
            const code = await this.exec(args);
            if (code !== 0)
                throw new ConversionError(`ffmpeg exited with code ${code}`, [...this.logTail]);

            const out = await this.readFile(outPath);
            onProgress?.({ ratio: 1, seconds: 0 });
            return new File([out as BlobPart], replaceExtension(filename, preset.ext), { type: preset.mime });
        } catch (e) {
            // A failed exec can leave the WASM heap corrupted (later calls die with "memory access out
            // of bounds"), so never reuse an instance after a failure. Reloading hits the HTTP cache.
            this.dispose();
            throw e;
        } finally {
            signal?.removeEventListener("abort", onAbort);
            this.progressListener = null;
            // Free the (potentially huge) virtual files. Ignore failures: the output may not exist,
            // and after an abort the worker (and its whole heap) is already gone.
            if (this.worker) {
                await Promise.allSettled([this.deleteFile(inPath), this.deleteFile(outPath)]);
            }
        }
    }

    /** Terminate the worker and free all WASM memory. Safe to call at any time. */
    dispose() {
        this.worker?.terminate();
        this.worker = null;
        this.loading = null;
        this.failAll(new ConversionError("FFmpeg worker was terminated"));
    }
}
