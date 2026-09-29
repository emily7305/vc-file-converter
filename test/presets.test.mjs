// Pure unit tests for the preset layer. Run with `npm test` (Node >= 22.18 strips TS types natively).
import assert from "node:assert/strict";
import { test } from "node:test";

import {
    DEFAULT_PRESET_OPTIONS,
    detectMediaKind,
    getPreset,
    PRESETS,
    presetsFor,
    replaceExtension,
} from "../ffmpeg/presets.ts";
import { explainFailure, stripBanner } from "../ffmpeg/errors.ts";

test("detectMediaKind prefers MIME, falls back to extension", () => {
    assert.equal(detectMediaKind("a.gif", "image/gif"), "gif");
    assert.equal(detectMediaKind("clip.MKV"), "video");
    assert.equal(detectMediaKind("clip.bin", "video/mp4"), "video");
    assert.equal(detectMediaKind("song.flac"), "audio");
    assert.equal(detectMediaKind("photo.png", "image/png"), null);
    assert.equal(detectMediaKind("README"), null);
});

test("replaceExtension", () => {
    assert.equal(replaceExtension("clip.final.MKV", "mp4"), "clip.final.mp4");
    assert.equal(replaceExtension("noext", "mp3"), "noext.mp3");
    assert.equal(replaceExtension(".hidden", "mp4"), ".hidden.mp4");
});

test("preset ids are unique and every kind has presets", () => {
    assert.equal(new Set(PRESETS.map(p => p.id)).size, PRESETS.length);
    for (const kind of ["video", "audio", "gif"]) assert.ok(presetsFor(kind).length > 0, kind);
});

test("presets take input first and output last", () => {
    for (const p of PRESETS) {
        const args = p.args("in_0.x", "out_0.y", DEFAULT_PRESET_OPTIONS);
        assert.deepEqual(args.slice(0, 2), ["-i", "in_0.x"], p.id);
        assert.equal(args.at(-1), "out_0.y", p.id);
        assert.ok(args.every(a => typeof a === "string"), p.id);
    }
});

test("requested quality flags are present", () => {
    const argsOf = id => getPreset(id).args("i", "o", { crf: 18, compressCrf: 30, x264Preset: "medium" });
    assert.deepEqual(argsOf("mp3").slice(2, 7), ["-vn", "-c:a", "libmp3lame", "-q:a", "0"]);
    assert.ok(argsOf("remux-mp4").join(" ").includes("-c copy"));
    const h264 = argsOf("h264").join(" ");
    assert.ok(h264.includes("-c:v libx264") && h264.includes("-crf 18") && h264.includes("-preset medium"));
});

test("compress preset targets size, not fidelity", () => {
    const p = getPreset("compress");
    assert.equal(p.mustShrink, true);
    const args = p.args("i", "o", { ...DEFAULT_PRESET_OPTIONS, compressCrf: 30 }).join(" ");
    assert.ok(args.includes("-crf 30") && args.includes("-b:a 128k") && args.includes("1080"));
    assert.ok(!getPreset("h264").mustShrink);
});

test("explainFailure maps common ffmpeg errors to plain English", () => {
    assert.match(explainFailure(["Output #0, mp3, to 'out.mp3':", "Output file #0 does not contain any stream"]), /no audio track/);
    assert.match(explainFailure(["Could not find tag for codec vp8 in stream #0, codec not currently supported in container"]), /Compress or Re-encode/);
    assert.match(explainFailure(["in_0.mp4: Invalid data found when processing input"]), /valid media file/);
    assert.equal(explainFailure(["something unexpected"]), null);
});

test("stripBanner drops the version banner", () => {
    assert.deepEqual(stripBanner(["ffmpeg version 5.1.4", "  configuration: ...", "Input #0, gif, from 'in.gif':", "err"]),
        ["Input #0, gif, from 'in.gif':", "err"]);
    assert.deepEqual(stripBanner(["only", "lines"]), ["only", "lines"]);
});
