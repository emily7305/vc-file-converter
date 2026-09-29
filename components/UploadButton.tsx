/*
 * vencord-file-converter
 * Copyright (c) 2026 emily7305
 * SPDX-License-Identifier: MIT
 *
 * Button rendered in the hover action bar of each pending upload
 * (next to Discord's spoiler / edit / remove buttons).
 */

import ErrorBoundary from "@components/ErrorBoundary";
import { CloudUpload } from "@vencord/discord-types";
import { findByCodeLazy } from "@webpack";

import { detectMediaKind } from "../ffmpeg/presets";
import { openConvertModal } from "./ConvertModal";
import { ConvertIcon } from "./icons";

// Same lookup AnonymiseFileNames uses for Discord's attachment action bar icon.
const ActionBarIcon = findByCodeLazy("Children.map", "isValidElement", "dangerous:");

export interface UploadActionBarProps {
    upload: CloudUpload;
    draftType?: number;
    canEdit?: boolean;
}

export const UploadConvertButton = ErrorBoundary.wrap((props: UploadActionBarProps) => {
    const { upload, draftType } = props;
    if (props.canEdit === false || !upload?.item?.file) return null;
    if (!detectMediaKind(upload.filename, upload.mimeType)) return null;

    return (
        <ActionBarIcon
            tooltip="Convert Media"
            onClick={() => openConvertModal({ type: "upload", upload, draftType })}
        >
            <ConvertIcon />
        </ActionBarIcon>
    );
}, { noop: true });
