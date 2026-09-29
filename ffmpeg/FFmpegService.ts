/*
 * vencord-file-converter
 * Copyright (c) 2026 emily7305
 * SPDX-License-Identifier: MIT
 */

// no vencord imports in here so test/worker.e2e.mjs can bundle it on its own

import { explainFailure } from "./errors";
import { DEFAULT_PRESET_OPTIONS, extensionOf, Preset, PresetOptions, replaceExtension } from "./presets";
import { WORKER_SOURCE } from "./workerSource";

export const FFMPEG_CORE_VERSION = "0.12.10";
// jsdelivr is on vencord's csp allowlist
export const DEFAULT_CORE_BASE_URL = `https://cdn.jsdelivr.net/npm/@ffmpeg/core@${FFMPEG_CORE_VERSION}/dist/umd`;

export interface FFmpegServiceConfig {
    /** folder with ffmpeg-core.js + ffmpeg-core.wasm (umd build) */
    coreBaseURL?: string;
    onLog?(line: string): void;
}

export interface ConvertProgress {
    /** 0-1, null if the duration is unknown */
    ratio: number | null;
    /** seconds processed so far */
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

const LOG_TAIL = 60;

export class FFmpegService {
    private worker: Worker | null = null;
    private loading: Promise<void> | null = null;
    private nextId = 0;
    private pending = new Map<number, Pending>();
    private queue: Promise<unknown> = Promise.resolve();
    private jobCounter = 0;

    private progressListener: ((p: ConvertProgress) => void) | null = null;
    private logTail: string[] = [];

    constructor(private config: FFmpegServiceConfig = {}) { }

    get isLoaded() {
        return this.worker !== null && this.loading === null;
    }

    setCoreBaseURL(url: string | undefined) {
        if ((url || undefined) === this.config.coreBaseURL) return;
        this.config.coreBaseURL = url || undefined;
        this.dispose();
    }

    // ~31mb download the first time, cached after that
    load(): Promise<void> {
        if (this.worker && !this.loading) return Promise.resolve();
        return this.loading ??= this.spawn().finally(() => { this.loading = null; });
    }

    private async spawn() {
        const base = (this.config.coreBaseURL || DEFAULT_CORE_BASE_URL).replace(/\/+$/, "");
        const workerURL = URL.createObjectURL(new Blob([WORKER_SOURCE], { type: "text/javascript" }));
        const worker = new Worker(workerURL, { name: "vc-file-converter-ffmpeg" });
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
                // progress is garbage (<0 or >1) when ffmpeg doesn't know the duration, e.g. gifs
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

    writeFile(path: string, data: Uint8Array) {
        return this.call<boolean>("writeFile", { path, data }, [data.buffer]);
    }

    readFile(path: string) {
        return this.call<Uint8Array>("readFile", { path });
    }

    deleteFile(path: string) {
        return this.call<boolean>("deleteFile", { path });
    }

    exec(args: string[], timeout = -1) {
        return this.call<number>("exec", { args, timeout });
    }

    // one job at a time. cancelling a running job has to kill the worker since wasm can't be interrupted
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
        // don't give ffmpeg the real file names, weird characters break the args
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
                throw new ConversionError(explainFailure(this.logTail) ?? `ffmpeg exited with code ${code}`, [...this.logTail]);

            const out = await this.readFile(outPath);
            onProgress?.({ ratio: 1, seconds: 0 });
            return new File([out as BlobPart], replaceExtension(filename, preset.ext), { type: preset.mime });
        } catch (e) {
            // after a failure the wasm memory can be broken ("memory access out of bounds" on the
            // next run), so always start fresh
            this.dispose();
            throw e;
        } finally {
            signal?.removeEventListener("abort", onAbort);
            this.progressListener = null;
            // clean up the virtual files (might not exist, or the worker's already dead)
            if (this.worker) {
                await Promise.allSettled([this.deleteFile(inPath), this.deleteFile(outPath)]);
            }
        }
    }

    dispose() {
        this.worker?.terminate();
        this.worker = null;
        this.loading = null;
        this.failAll(new ConversionError("FFmpeg worker was terminated"));
    }
}
