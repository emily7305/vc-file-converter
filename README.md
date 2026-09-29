# vencord-file-converter

> [!CAUTION]
> ## ⚠️ USE AT YOUR OWN RISK ⚠️
>
> **This is a Vencord/Equicord plugin. Client modifications like Vencord and Equicord go against [Discord's Terms of Service](https://discord.com/terms).**
>
> - Using this plugin, or any client mod, **could get your Discord account suspended or banned**.
> - This project is **not affiliated with, endorsed by, or supported by Discord, Vencord or Equicord**.
> - It is provided **as is, with no warranty** (see [LICENSE](LICENSE)). The author is **not responsible** for anything that happens to your account, your data or your files.
>
> **If you are not OK with that risk, do not install this.**

A [Vencord](https://vencord.dev) / [Equicord](https://equicord.org) userplugin that converts, compresses and transcodes audio, video and GIFs **inside Discord**, both before you send them and after you receive them. Everything runs locally with FFmpeg compiled to WebAssembly. Your files never leave your machine.

| Preset | What it does | FFmpeg flags (core) |
| --- | --- | --- |
| Extract audio → MP3 | Video/audio → high-quality VBR MP3 | `-vn -c:a libmp3lame -q:a 0` |
| Extract audio → FLAC | Lossless audio | `-vn -c:a flac` |
| Extract audio → WAV | Uncompressed PCM | `-vn -c:a pcm_s16le` |
| Remux → MP4 | MKV/MOV → MP4 with no re-encode (instant, 100% lossless) | `-map 0 -c copy -movflags +faststart` |
| Compress → MP4 (H.264) | Re-encode for size/compatibility | `-c:v libx264 -crf 20 -preset veryfast -pix_fmt yuv420p` + AAC |
| GIF → MP4 | Typically 5-20x smaller than the GIF | libx264, even-dimension scaling |
| GIF → WebM (VP8) | Alternative web-friendly output | `-c:v libvpx -crf 10 -b:v 4M` |

CRF and x264 speed are configurable in the plugin settings.

## Where the buttons are

1. **Upload bar.** Hover a pending attachment in the chat box and click the ⟳ **Convert Media** icon next to spoiler/remove. When the conversion finishes, the queued file is **replaced** with the converted one.
2. **"+" (upload) button → right-click → _Convert & Upload File…_.** Pick a file from disk, convert it, and it lands in the upload queue. This also works if a Discord update breaks the upload-bar patch.
3. **Message context menu → _Convert Media_.** Converts received attachments. If you right-clicked a specific attachment, only that one is converted; otherwise you get a submenu. The result is saved to disk, or added to your upload queue (see the *autoSendConverted* setting).

A progress bar shows a percentage when FFmpeg knows the input duration. For inputs where it doesn't (some GIFs and streamed WebMs), it shows how much media time has been processed instead. Closing the modal cancels the job.

## Installation

> [!WARNING]
> Reminder: installing a client mod goes against Discord's Terms of Service and **may get your account banned**. Continue only if you accept that risk.

Follow the official guide for your client mod:

- **Vencord:** [Installing custom plugins](https://docs.vencord.dev/installing/custom-plugins/)
- **Equicord:** [Installing custom plugins](https://docs.equicord.org/installing/custom-plugin/)

This repository is a folder plugin (it contains `index.tsx`), so it goes in `src/userplugins/` as a folder.

Once it's built, enable **FileConverter** in your plugin settings.

## How it works

On the first conversion, the plugin downloads `@ffmpeg/core@0.12.10` (single-threaded UMD build, about 31 MB of WASM; your browser caches it after that) from **jsDelivr**. That host is already on Vencord's and Equicord's built-in Content-Security-Policy allowlist, so no extra permissions are needed. FFmpeg runs in a Web Worker so Discord's UI stays responsive, and input and output live in FFmpeg's in-memory filesystem, which is cleared after every job.

If you'd rather self-host the core, set **coreBaseURL** in the plugin settings to a folder containing `ffmpeg-core.js` and `ffmpeg-core.wasm`. The first time, Vencord asks you to allow that host (connect-src only) and you then restart Discord.

### Project layout

```
index.tsx                  definePlugin entry: upload-bar patch, context menus, settings, cleanup on stop
settings.ts                definePluginSettings schema (default presets, CRF, x264 speed, size limit, core URL)
manifest.json              descriptive metadata for indexes/tooling (Vencord itself doesn't read it)
styles.css                 managed styles (only injected while the plugin is enabled)
ffmpeg/
  FFmpegService.ts         worker lifecycle, RPC, job queue, progress, abort, virtual-file cleanup
  workerSource.ts          dependency-free worker that hosts ffmpeg-core (loaded via a Blob URL)
  presets.ts               preset definitions + media detection (pure, unit-tested)
components/
  ConvertModal.tsx         preset picker → progress bar → replace / save / queue
  UploadButton.tsx         icon in the pending-upload action bar
  contextMenus.tsx         "message" and "channel-attach" context-menu patches
  icons.tsx
utils/converter.ts         glue: settings → service, CSP check, Discord upload-queue helpers
test/
  presets.test.mjs         unit tests (node --test)
  worker.e2e.mjs           runs every preset against real ffmpeg-core in headless Chromium
```

### Design notes (why it doesn't use `@ffmpeg/ffmpeg` or `tsup`)

- **No bundler of our own.** Vencord and Equicord compile userplugins from source with their own esbuild pipeline, which resolves the `@api` / `@utils` / `@webpack` aliases, the `$self` and `#{intl::…}` patch syntax, and `?managed` CSS. A pre-bundled `tsup`/`vite` output can't be loaded by either client, so this repo ships TypeScript sources plus a `tsconfig.json` that extends the host checkout's config.
- **No `@ffmpeg/ffmpeg` wrapper.** Its worker is an ES module with relative imports that is spawned via `new URL("./worker.js", import.meta.url)`, and neither works once it's inlined into Vencord's single bundle. `ffmpeg/workerSource.ts` is a small port of the same protocol that talks to `@ffmpeg/core` directly. It also means you don't have to `pnpm add` anything inside your Vencord checkout.
- **jsDelivr instead of unpkg,** because it's on the client's CSP allowlist for `script-src`, `worker-src` and `connect-src`.
- **Crash isolation.** If a job fails, the WASM heap can be left corrupted, so the worker is thrown away and reloaded (from the HTTP cache) after any failure or cancellation.

### Known limitations

- **Speed:** single-threaded WASM is about 10-20x slower than native FFmpeg. Remuxing and audio extraction are fast; H.264 re-encodes of long HD videos take a while (use `veryfast`/`ultrafast`).
- **Memory:** the file sits in memory about 3 times during a conversion, and WASM memory is capped at a few GB. Inputs above *maxInputSizeMB* (default 500) are refused.
- **VP9 is unavailable:** `libvpx-vp9` crashes in the single-threaded `@ffmpeg/core` 0.12 build, so WebM output uses VP8.
- **Remux → MP4** only works when the source codecs are MP4-compatible (for example H.264/AAC in MKV). Otherwise use *Compress*.
- The upload-bar button relies on a Discord code patch, which Discord updates can break. The **"+" menu** entry keeps working if it does.
- Only tested on the desktop client (Discord Desktop, Vesktop and Equibop builds). On the browser extension, whether jsDelivr is reachable depends on Discord's web CSP.

## Development

Work inside a Vencord/Equicord checkout (`src/userplugins/vencord-file-converter`), then:

```sh
npm install          # dev tools only: @ffmpeg/core (for e2e), esbuild, playwright-core
npm test             # preset unit tests (Node ≥ 22.18)
npm run test:e2e     # real conversions in headless Chromium (set CHROMIUM_PATH if Playwright's browser isn't installed)
npm run typecheck    # tsc against the host checkout
npm run lint         # host ESLint rules (license-header rule disabled; this repo is MIT)
```

Use `pnpm dev` (watch mode) in the host checkout while iterating.

## License

MIT © emily7305
