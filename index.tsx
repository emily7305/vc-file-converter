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

export default definePlugin({
    name: "FileConverter",
    description: "Convert, compress and transcode audio/video/GIF attachments locally with FFmpeg (WebAssembly), before sending or after receiving.",
    authors: [{ name: "emily7305", id: 0n }],
    tags: ["Media", "Utility"],
    settings,
    managedStyle,

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

    renderUploadButton: UploadConvertButton,

    stop() {
        // Free the worker and its (potentially multi-GB) WASM heap.
        ffmpeg.dispose();
    },
});
