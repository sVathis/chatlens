import { Text } from "@mantine/core";
import { useEffect, useState } from "react";
import { useSource } from "../../hooks/useSource";
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

  return (
    <a href={url} download={attachment.name} style={{ color: color ?? "inherit" }}>
      <Text component="span" size="sm">
        {"\u{1F4CE}"} {attachment.name ?? "Download file"}
      </Text>
    </a>
  );
}
