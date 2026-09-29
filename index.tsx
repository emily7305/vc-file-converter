/*
 * vencord-file-converter
 * Copyright (c) 2026 emily7305
 * SPDX-License-Identifier: MIT
 *
 * Plugin entry point. Vencord/Equicord discover it as
 * src/userplugins/vencord-file-converter/index.tsx.
 */

import definePlugin from "@utils/types";

import { ConvertChatBarButton } from "./components/ChatBarButton";
import { channelAttachMenuPatch, messageContextMenuPatch } from "./components/contextMenus";
import { ConvertIcon } from "./components/icons";
import { UploadConvertButton } from "./components/UploadButton";
import { settings } from "./settings";
import managedStyle from "./styles.css?managed";
import { ffmpeg } from "./utils/converter";

// The Discord code patch below can't be undone at runtime, so the hover button checks this
// before rendering. Everything else (chat bar button, menus, styles) Vencord adds/removes live.
let running = false;

export default definePlugin({
    name: "FileConverter",
    description: "Convert, compress and transcode audio/video/GIF attachments locally with FFmpeg (WebAssembly), before sending or after receiving.",
    authors: [{ name: "emily7305", id: 0n }],
    tags: ["Media", "Utility"],
    settings,
    managedStyle,
    // Toggle on/off without restarting Discord. The patch only takes effect after a restart,
    // but it's an optional extra; the chat bar button and menus work immediately.
    requiresRestart: false,

    patches: [
        {
            // The hover action bar on pending uploads (spoiler / edit / remove).
            // Same anchor AnonymiseFileNames uses. Discord updates can break it; the chat bar button
            // and the "+" menu entry don't depend on it.
            find: "#{intl::ATTACHMENT_UTILITIES_SPOILER}",
            replacement: {
                match: /(?<=children:\[)(?=.{10,80}tooltip:.{0,100}#{intl::ATTACHMENT_UTILITIES_SPOILER})/,
                replace: "$self.renderUploadButton(arguments[0]),",
            },
        },
    ],

    // Reliable entry point: Vencord's own chat bar API, no Discord code patch involved.
    chatBarButton: {
        icon: ConvertIcon,
        render: ConvertChatBarButton,
    },

    contextMenus: {
        "message": messageContextMenuPatch,
        "channel-attach": channelAttachMenuPatch,
    },

    renderUploadButton(props: Parameters<typeof UploadConvertButton>[0]) {
        return running ? <UploadConvertButton {...props} /> : null;
    },

    start() {
        running = true;
    },

    stop() {
        running = false;
        // Free the worker and its (potentially multi-GB) WASM heap.
        ffmpeg.dispose();
    },
});
