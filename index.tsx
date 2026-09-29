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

    // Uses Vencord's chat bar API rather than patching Discord's code, so it survives Discord
    // updates and the plugin can be switched on/off without restarting.
    chatBarButton: {
        icon: ConvertIcon,
        render: ConvertChatBarButton,
    },

    contextMenus: {
        "message": messageContextMenuPatch,
        "channel-attach": channelAttachMenuPatch,
    },

    stop() {
        // Free the worker and its (potentially multi-GB) WASM heap.
        ffmpeg.dispose();
    },
});
