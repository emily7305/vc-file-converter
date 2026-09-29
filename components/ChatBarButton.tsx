/*
 * vc-file-converter
 * Copyright (c) 2026 emily7305
 * SPDX-License-Identifier: MIT
 */

import { ChatBarButton, ChatBarButtonFactory } from "@api/ChatButtons";
import { ContextMenuApi, FluxDispatcher, Menu, UploadAttachmentStore, useStateFromStores } from "@webpack/common";

import { getPendingMediaUploads } from "../utils/converter";
import { openConvertModal } from "./ConvertModal";
import { ConvertIcon } from "./icons";

export const ConvertChatBarButton: ChatBarButtonFactory = ({ isAnyChat, type, channel }) => {
    // returning an array here re-renders forever, so use a string
    const uploadIds = useStateFromStores([UploadAttachmentStore], () =>
        getPendingMediaUploads(channel.id).map(u => u.id).join(","));

    if (!isAnyChat || !type?.attachments || !uploadIds) return null;
    const uploads = getPendingMediaUploads(channel.id);

    return (
        <ChatBarButton
            tooltip="Convert Media"
            onClick={e => {
                if (uploads.length === 1) return openConvertModal({ type: "upload", upload: uploads[0] });

                // more than one file, ask which
                ContextMenuApi.openContextMenu(e, () => (
                    <Menu.Menu
                        navId="vc-fconv-pick-upload"
                        onClose={() => FluxDispatcher.dispatch({ type: "CONTEXT_MENU_CLOSE" })}
                        aria-label="Choose a file to convert"
                    >
                        {uploads.map(upload => (
                            <Menu.MenuItem
                                key={upload.id}
                                id={`vc-fconv-pick-${upload.id}`}
                                label={upload.filename}
                                action={() => openConvertModal({ type: "upload", upload })}
                            />
                        ))}
                    </Menu.Menu>
                ));
            }}
        >
            <ConvertIcon />
        </ChatBarButton>
    );
};
