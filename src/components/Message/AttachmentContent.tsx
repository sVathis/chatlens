import { Box, Group, Text } from "@mantine/core";
import { IconFile } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { useSource } from "../../hooks/useSource";
import { useLook } from "../../look";
import { VoicePlayer } from "./VoicePlayer";
import { useMessageStore } from "../../store/messageStore";
import type { ProcessedMessage } from "../../types/messages";
import { revokeObjectUrl } from "../../utils/urlManager";

type Attachment = NonNullable<ProcessedMessage["attachment"]>;

/**
 * A voice message or a file from the export folder: an audio player, or a download link.
 * Shows `fallback` (the message's own text) until the file is ready, and when it isn't there.
 */
export function AttachmentContent({
  attachment,
  fallback,
  color,
}: {
  attachment: Attachment & { key: string };
  fallback: React.ReactNode;
  color?: string;
}) {
  const { exportData } = useMessageStore();
  const { media } = useSource();
  const look = useLook();
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let created: string | null = null;
    const files = exportData?.mediaFiles;
    if (!files) return;

    media
      .createUrl(attachment.key, files)
      .then((made) => {
        if (cancelled) {
          revokeObjectUrl(made, false);
          return;
        }
        created = made;
        setUrl(made);
      })
      .catch((error) => console.error("[AttachmentContent] Failed to open attachment:", error));

    return () => {
      cancelled = true;
      revokeObjectUrl(created, false);
      setUrl(null);
    };
  }, [attachment.key, exportData, media]);

  if (!url) return <>{fallback}</>;

  if (attachment.kind === "audio" && look.voicePlayer) {
    return <VoicePlayer url={url} durationMs={attachment.durationMs} accent={look.accent} />;
  }

  if (attachment.kind === "audio") {
    return (
      <audio
        controls
        preload="metadata"
        src={url}
        aria-label="Voice message"
        style={{ maxWidth: "100%", height: 36 }}
      />
    );
  }

  if (look.voicePlayer) {
    // A file card: the file icon in the accent colour, and the name
    return (
      <a
        href={url}
        download={attachment.name}
        data-file-card
        style={{ color: "inherit", textDecoration: "none" }}
      >
        <Group gap={10} wrap="nowrap">
          <Box
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: look.accent,
              color: "white",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <IconFile size={20} />
          </Box>
          <Text size="sm" fw={500} lineClamp={2} style={{ wordBreak: "break-word" }}>
            {attachment.name ?? "Download file"}
          </Text>
        </Group>
      </a>
    );
  }

  return (
    <a href={url} download={attachment.name} style={{ color: color ?? "inherit" }}>
      <Text component="span" size="sm">
        {"\u{1F4CE}"} {attachment.name ?? "Download file"}
      </Text>
    </a>
  );
}
