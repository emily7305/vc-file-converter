# vc-file-converter

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

A [Vencord](https://vencord.dev) / [Equicord](https://equicord.org) plugin for converting and compressing videos, audio and GIFs without leaving Discord. It uses FFmpeg (compiled to WebAssembly), so everything runs on your own computer and nothing gets uploaded anywhere.

## Features

- Extract audio from a video as MP3, FLAC or WAV
- Remux MKV/MOV to MP4 (instant, no quality loss, but only works if the video's codec is MP4-compatible. Use Compress otherwise)
- Compress videos before sending them. Anything bigger than 1080p gets scaled down, and if the result somehow ends up bigger it just keeps your original
- Video to GIF, with a size and fps setting
- GIF to MP4 or WebM, which is usually way smaller

## Usage

There are 3 ways to use it:

1. Drop a file into the chat box like normal and click the Convert Media button next to the emoji picker. The file gets replaced with the converted one.
2. Click the + button next to the chat box and pick "Convert a File"
3. Right-click a message with a video/audio file and pick "Convert Media". You can save the result or add it to your upload queue.

## Installation

> [!WARNING]
> Again, client mods are against Discord's ToS and **could get your account banned**. Only continue if you're fine with that.

Follow the custom plugin guide for whichever one you use:

- Vencord: https://docs.vencord.dev/installing/custom-plugins/
- Equicord: https://docs.equicord.org/installing/custom-plugin/

Clone this repo into `src/userplugins/`, rebuild, then turn on FileConverter in your plugin settings.

## Notes

- The first conversion downloads FFmpeg (~31 MB), after that it's cached.
- Compressing long HD videos is slow (can take a few minutes). Audio extraction and remuxing are quick.
- Files over 500 MB are skipped by default, you can change that in the settings.
- I've only tested it on the Discord desktop app with Vencord. Equicord, Vesktop and Equibop should work too. The browser version probably won't.

## License

[MIT](LICENSE)
