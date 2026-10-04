// npm test. bundles utils/media.ts with esbuild since it imports other ts files
import assert from "node:assert/strict";
import { test } from "node:test";

import { build } from "esbuild";

const out = await build({ entryPoints: [new URL("../utils/media.ts", import.meta.url).pathname], bundle: true, format: "esm", write: false, tsconfigRaw: {} });
const { collectMedia, pickClicked, isDiscordMediaUrl } = await import("data:text/javascript," + encodeURIComponent(out.outputFiles[0].text));

const cdn = (id, name) => `https://cdn.discordapp.com/attachments/1/${id}/${name}?ex=1&is=2&hm=3`;
const attachment = (id, filename, content_type) => ({ id, filename, content_type, url: cdn(id, filename), size: 1000 });
const msg = (extra = {}) => ({ channel_id: "1", attachments: [], embeds: [], messageSnapshots: [], ...extra });

test("only discord hosts count", () => {
    assert.ok(isDiscordMediaUrl("https://cdn.discordapp.com/a/b.mp4"));
    assert.ok(isDiscordMediaUrl("https://images-ext-1.discordapp.net/external/x/https/example.com/v.mp4"));
    assert.ok(!isDiscordMediaUrl("https://example.com/v.mp4"));
    assert.ok(!isDiscordMediaUrl("https://cdn.discordapp.com.evil.com/v.mp4"));
    assert.ok(!isDiscordMediaUrl("http://cdn.discordapp.com/v.mp4"));
});

test("attachments", () => {
    const items = collectMedia(msg({ attachments: [attachment("10", "a.mp4", "video/mp4"), attachment("11", "pic.png", "image/png")] }));
    assert.deepEqual(items.map(i => i.filename), ["a.mp4"]);
});

test("link embeds use the discord proxy url", () => {
    const items = collectMedia(msg({
        embeds: [
            // direct video link
            { type: "video", video: { url: "https://example.com/clips/cat.mp4", proxyURL: "https://images-ext-1.discordapp.net/external/abc/https/example.com/clips/cat.mp4", contentType: "video/mp4" } },
            // tenor style gifv, no extension in the name
            { type: "gifv", video: { url: "https://media.tenor.com/xyz/funny", proxyURL: "https://images-ext-2.discordapp.net/external/def/https/media.tenor.com/xyz/funny", contentType: "video/mp4" } },
            // youtube: iframe, no proxied file
            { type: "video", video: { url: "https://www.youtube.com/embed/abc" } },
            // linked gif
            { type: "image", image: { url: "https://example.com/dance.gif", proxyURL: "https://images-ext-1.discordapp.net/external/ghi/https/example.com/dance.gif", contentType: "image/gif" } },
            // normal png embed
            { type: "image", image: { url: "https://example.com/p.png", proxyURL: "https://images-ext-1.discordapp.net/external/jkl/https/example.com/p.png", contentType: "image/png" } },
        ],
    }));
    assert.deepEqual(items.map(i => i.filename), ["cat.mp4", "funny.mp4", "dance.gif"]);
    assert.ok(items.every(i => i.url.startsWith("https://images-ext-")));
});

test("forwarded messages", () => {
    const fwd = msg({ messageSnapshots: [{ message: msg({ attachments: [attachment("20", "fwd.mov", "video/quicktime")] }) }] });
    const items = collectMedia(fwd);
    assert.deepEqual(items.map(i => i.filename), ["fwd.mov"]);
});

test("right clicked item wins, otherwise everything", () => {
    const items = collectMedia(msg({ attachments: [attachment("30", "one.mp4", "video/mp4"), attachment("31", "two.mp4", "video/mp4")] }));
    assert.deepEqual(pickClicked(items, [cdn("31", "two.mp4")]).map(i => i.filename), ["two.mp4"]);
    assert.equal(pickClicked(items, [undefined]).length, 2);
});
