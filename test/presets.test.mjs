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
    const argsOf = id => getPreset(id).args("i", "o", { crf: 18, x264Preset: "medium" });
    assert.deepEqual(argsOf("mp3").slice(2, 7), ["-vn", "-c:a", "libmp3lame", "-q:a", "0"]);
    assert.ok(argsOf("remux-mp4").join(" ").includes("-c copy"));
    const h264 = argsOf("h264").join(" ");
    assert.ok(h264.includes("-c:v libx264") && h264.includes("-crf 18") && h264.includes("-preset medium"));
});
