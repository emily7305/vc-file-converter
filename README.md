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

A [Vencord](https://vencord.dev) / [Equicord](https://equicord.org) plugin that converts and compresses audio, video and GIFs **right inside Discord**, before you send them or after you receive them. Everything happens on your computer. Your files are never uploaded anywhere.

## What it can do

- **Get the audio out of a video:** save it as MP3, FLAC or WAV
- **Turn MKV/MOV videos into MP4:** instant and with no quality loss (for most files; if it fails, use *Compress* instead)
- **Compress videos** so they're smaller to send
- **Turn GIFs into MP4 or WebM:** usually many times smaller

## How to use it

- **Before sending:** hover over a file waiting to be sent in the chat box and click the **Convert Media** icon. The file is swapped for the converted one.
- **From your computer:** right-click the **+** (upload) button and choose **Convert & Upload File…**
- **Files other people sent:** right-click the message and choose **Convert Media**, then save the result or re-send it.

## Installation

> [!WARNING]
> Reminder: installing a client mod goes against Discord's Terms of Service and **may get your account banned**. Continue only if you accept that risk.

Follow the official guide for your client mod:

- **Vencord:** [Installing custom plugins](https://docs.vencord.dev/installing/custom-plugins/)
- **Equicord:** [Installing custom plugins](https://docs.equicord.org/installing/custom-plugin/)

This repository is a folder plugin (it contains `index.tsx`), so it goes in `src/userplugins/` as a folder.

Once it's built, enable **FileConverter** in your plugin settings.

## Good to know

- **First use takes a moment:** the plugin downloads the converter (about 31 MB) the first time you convert something. After that it's saved and loads quickly.
- **Big videos are slow:** compressing a long HD video can take several minutes. Audio extraction and MKV/MOV → MP4 are fast.
- **Size limit:** files over 500 MB are skipped by default. You can change this in the plugin settings.
- **If the chat box button disappears** after a Discord update, the **+** menu option still works.
- **Made for desktop:** the Discord desktop app, Vesktop and Equibop. It may not work in Discord in a web browser.

## License

MIT © emily7305
