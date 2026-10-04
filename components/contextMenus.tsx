/*
 * vc-file-converter
 * Copyright (c) 2026 emily7305
 * SPDX-License-Identifier: MIT
 */

import { NavContextMenuPatchCallback } from "@api/ContextMenu";
import { chooseFile } from "@utils/web";
import { Channel, Message } from "@vencord/discord-types";
import { Menu, SelectedChannelStore } from "@webpack/common";

import { collectMedia, MediaItem, pickClicked } from "../utils/media";
import { openConvertModal } from "./ConvertModal";
import { ConvertIcon } from "./icons";

function openForItem(item: MediaItem, message: Message) {
    openConvertModal({
        type: "attachment",
        url: item.url,
        filename: item.filename,
        mime: item.mime,
        size: item.size,
        // usually the same channel anyway
        channelId: SelectedChannelStore.getChannelId() ?? message.channel_id,
    });
}

// attachments, link embeds and forwarded messages
export const messageContextMenuPatch: NavContextMenuPatchCallback = (children, props: { message?: Message; itemHref?: string; itemSrc?: string; }) => {
    const { message } = props;
    if (!message) return;

    const items = collectMedia(message);
    if (!items.length) return;

    const list = pickClicked(items, [props.itemHref, props.itemSrc]);

    children.push(
        <Menu.MenuSeparator />,
        list.length === 1
            ? (
                <Menu.MenuItem
                    id="vc-fconv-convert"
                    label="Convert Media"
                    leadingAccessory={{ type: "icon", icon: ConvertIcon }}
                    action={() => openForItem(list[0], message)}
                />
            )
            : (
                <Menu.MenuItem id="vc-fconv-convert" label="Convert Media" leadingAccessory={{ type: "icon", icon: ConvertIcon }}>
                    {list.map(item => (
                        <Menu.MenuItem
                            key={item.key}
                            id={`vc-fconv-convert-${item.key}`}
                            label={item.filename}
                            action={() => openForItem(item, message)}
                        />
                    ))}
                </Menu.MenuItem>
            )
    );
};

export const channelAttachMenuPatch: NavContextMenuPatchCallback = (children, props: { channel?: Channel; }) => {
    const { channel } = props;
    if (!channel) return;

    children.push(
        <Menu.MenuItem
            id="vc-fconv-convert-upload"
            label="Convert a File"
            leadingAccessory={{ type: "icon", icon: ConvertIcon }}
            action={async () => {
                const file = await chooseFile("video/*,audio/*,image/gif,.mkv,.mov,.flac");
                if (file) openConvertModal({ type: "file", file, channelId: channel.id });
            }}
        />
    );
};
