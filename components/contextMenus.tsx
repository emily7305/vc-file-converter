/*
 * vencord-file-converter
 * Copyright (c) 2026 emily7305
 * SPDX-License-Identifier: MIT
 */

import { NavContextMenuPatchCallback } from "@api/ContextMenu";
import { chooseFile } from "@utils/web";
import { Channel, Message } from "@vencord/discord-types";
import { Menu, SelectedChannelStore } from "@webpack/common";

import { detectMediaKind } from "../ffmpeg/presets";
import { openConvertModal } from "./ConvertModal";
import { ConvertIcon } from "./icons";

interface Attachment {
    id: string;
    filename: string;
    url: string;
    proxy_url?: string;
    content_type?: string;
    size: number;
}

function convertibleAttachments(message: Message): Attachment[] {
    return ((message.attachments ?? []) as unknown as Attachment[])
        .filter(a => detectMediaKind(a.filename, a.content_type));
}

function openForAttachment(a: Attachment, message: Message) {
    openConvertModal({
        type: "attachment",
        url: a.url,
        filename: a.filename,
        mime: a.content_type,
        size: a.size,
        // Converted files go to the channel you're looking at, which is usually where you right-clicked.
        channelId: SelectedChannelStore.getChannelId() ?? message.channel_id,
    });
}

/** Right-click a message → "Convert Media" (a submenu if it has several media attachments). */
export const messageContextMenuPatch: NavContextMenuPatchCallback = (children, props: { message?: Message; itemHref?: string; itemSrc?: string; }) => {
    const { message } = props;
    if (!message) return;

    const attachments = convertibleAttachments(message);
    if (!attachments.length) return;

    // If the user right-clicked a specific attachment, target just that one.
    const clicked = [props.itemHref, props.itemSrc].filter(Boolean) as string[];
    const target = attachments.find(a => clicked.some(url => url.includes(`/${a.id}/`)));
    const list = target ? [target] : attachments;

    children.push(
        <Menu.MenuSeparator />,
        list.length === 1
            ? (
                <Menu.MenuItem
                    id="vc-fconv-convert"
                    label="Convert Media"
                    icon={ConvertIcon}
                    action={() => openForAttachment(list[0], message)}
                />
            )
            : (
                <Menu.MenuItem id="vc-fconv-convert" label="Convert Media" icon={ConvertIcon}>
                    {list.map(a => (
                        <Menu.MenuItem
                            key={a.id}
                            id={`vc-fconv-convert-${a.id}`}
                            label={a.filename}
                            action={() => openForAttachment(a, message)}
                        />
                    ))}
                </Menu.MenuItem>
            )
    );
};

/** Right-click the "+" (upload) button → "Convert & Upload File…". Works even if the action-bar patch breaks. */
export const channelAttachMenuPatch: NavContextMenuPatchCallback = (children, props: { channel?: Channel; }) => {
    const { channel } = props;
    if (!channel) return;

    children.push(
        <Menu.MenuItem
            id="vc-fconv-convert-upload"
            label="Convert & Upload File…"
            icon={ConvertIcon}
            action={async () => {
                const file = await chooseFile("video/*,audio/*,image/gif,.mkv,.mov,.flac");
                if (file) openConvertModal({ type: "file", file, channelId: channel.id });
            }}
        />
    );
};
