import { Text, Paper, Box, Group, Stack } from "@mantine/core";
import { memo } from "react";
import { formatMessageTime } from "../../utils/dateFormat";
import type { ProcessedMessage } from "../../types/messages";
import { MediaMessage } from "./MediaMessage";
import {
  OWNER_COLOR,
  MESSAGE_BUBBLE_STYLE,
  MESSAGE_TEXT_STYLE,
} from "../../constants/messageBubble";
import { highlightSearchMatch } from "../../utils/messageSearch";
import { useLook } from "../../look";
import { ViberMessageBubble } from "./ViberMessageBubble";
import { CopyMessageLinkButton } from "./CopyMessageLinkButton";
import { ReactionChips } from "./ReactionChips";
import { AttachmentContent } from "./AttachmentContent";
import {
  ContactLine,
  ForwardedNote,
  LinkCard,
  LocationLine,
  QuoteBlock,
  TimeLine,
} from "./MessageParts";

export interface MessageBubbleProps {
  message: ProcessedMessage;
  showSender: boolean;
  showTimestamp: boolean;
  isRoleSwapped?: boolean;
  userDisplayName?: string;
  searchQuery?: string;
  isHighlighted?: boolean;
  /** A group or community: other people's messages get a sender name and an avatar (in looks that have them). */
  isGroup?: boolean;
  onCopyLink?: (messageId: string) => Promise<boolean>;
}

function DefaultMessageBubble({
  message,
  showSender,
  showTimestamp,
  isRoleSwapped = false,
  userDisplayName = "You",
  searchQuery = "",
  isHighlighted = false,
  onCopyLink,
}: MessageBubbleProps) {
  const shouldShowName = !message.isOwner && showSender;
  const displayName =
    isRoleSwapped && !message.isOwner ? userDisplayName : message.displayName;

  const highlightedContent = searchQuery
    ? highlightSearchMatch(message.content, searchQuery)
    : message.content;

  const copyLink = (placement: "start" | "end") =>
    onCopyLink ? (
      <CopyMessageLinkButton
        messageId={message.id}
        onCopy={onCopyLink}
        placement={placement}
      />
    ) : null;
  // Outside the bubble, on the side facing the middle of the conversation
  const sidePlacement = message.isOwner ? "start" : "end";

  if (message.type === "media" && message.mediaUrl) {
    return (
      <Box w="100%" pt={showSender ? 14 : 6} pb={6}>
        <Stack
          align={message.isOwner ? "flex-end" : "flex-start"}
          w="100%"
          px={16}
          gap={0}
        >
          {shouldShowName && displayName && (
            <Text size="xs" c="dimmed" mb={4} ml={4} fw={600}>
              {displayName}
            </Text>
          )}
          {message.forwarded && <ForwardedNote />}
          <Box pos="relative" maw="100%">
            <MediaMessage
              mediaId={message.mediaUrl}
              messageId={message.id}
              isOwner={message.isOwner}
            />
            {copyLink(sidePlacement)}
          </Box>
          {message.caption && (
            <Text
              size="sm"
              mt={4}
              ml={4}
              maw="70%"
              style={MESSAGE_TEXT_STYLE}
              dangerouslySetInnerHTML={{ __html: message.caption }}
            />
          )}
          {message.reactions && (
            <ReactionChips reactions={message.reactions} align={message.isOwner ? "end" : "start"} />
          )}
          {showTimestamp && (
            <TimeLine
              mt={2}
              edited={message.edited}
              timestampHtml={formatMessageTime(message.timestamp)}
            />
          )}
        </Stack>
      </Box>
    );
  }

  if (message.type === "system") {
    return (
      <Box ta="center" py={20} px={16}>
        <Box pos="relative" display="inline-block">
          <Text
            size="xs"
            c="dimmed"
            fw={500}
            opacity={0.7}
            dangerouslySetInnerHTML={{
              __html: highlightedContent,
            }}
          />
          {copyLink("end")}
        </Box>
      </Box>
    );
  }

  if (message.type === "call") {
    return (
      <Box ta="center" py={20} px={16}>
        <Paper
          px={16}
          py={8}
          radius="md"
          bg="light-dark(var(--mantine-color-gray-1), var(--mantine-color-dark-6))"
          style={{
            display: "inline-block",
            position: "relative",
            border:
              "1px solid light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-4))",
            boxShadow: "0 1px 2px rgba(0, 0, 0, 0.1)",
          }}
        >
          <Text
            size="sm"
            c="dimmed"
            fw={500}
            dangerouslySetInnerHTML={{
              __html: `📞 ${highlightedContent}`,
            }}
          />
          {copyLink("end")}
        </Paper>
        {message.reactions && <ReactionChips reactions={message.reactions} />}
        {showTimestamp && (
          <Text
            size="xs"
            c="dimmed"
            mt={8}
            style={{ opacity: 0.7 }}
            dangerouslySetInnerHTML={{
              __html: formatMessageTime(message.timestamp),
            }}
          />
        )}
      </Box>
    );
  }

  if (message.type === "notice") {
    return (
      <Box ta="center" py={20} px={16}>
        <Paper
          px={16}
          py={10}
          radius="md"
          bg="rgba(255, 193, 7, 0.1)"
          style={{
            display: "inline-block",
            position: "relative",
            border: "1px solid rgba(255, 193, 7, 0.3)",
            maxWidth: "80%",
            boxShadow: "0 1px 2px rgba(0, 0, 0, 0.1)",
          }}
        >
          <Group gap="xs" wrap="nowrap">
            <Text size="lg">ℹ️</Text>
            <Text
              size="sm"
              c="yellow.4"
              flex={1}
              dangerouslySetInnerHTML={{
                __html: highlightedContent,
              }}
            />
          </Group>
          {copyLink("end")}
        </Paper>
      </Box>
    );
  }

  const textColor = message.isOwner
    ? "white"
    : "light-dark(var(--mantine-color-gray-9), var(--mantine-color-gray-0))";
  const contentText = (
    <Text
      c={textColor}
      size="sm"
      style={MESSAGE_TEXT_STYLE}
      dangerouslySetInnerHTML={{
        __html: highlightedContent,
      }}
    />
  );
  // A voice message or file is played or downloaded when its file is in the export
  const bodyText =
    message.attachment?.key !== undefined ? (
      <AttachmentContent
        attachment={{ ...message.attachment, key: message.attachment.key }}
        fallback={contentText}
        color={message.isOwner ? "white" : undefined}
      />
    ) : (
      contentText
    );

  return (
    <Box w="100%" pt={showSender ? 10 : 3} pb={3}>
      <Stack
        align={message.isOwner ? "flex-end" : "flex-start"}
        w="100%"
        px={16}
        gap={0}
      >
        {shouldShowName && displayName && (
          <Text size="xs" c="dimmed" mb={6} ml={4} fw={600}>
            {displayName}
          </Text>
        )}
        <Paper
          px={16}
          py={8}
          radius="md"
          bg={
            message.isOwner
              ? OWNER_COLOR
              : "light-dark(var(--mantine-color-gray-2), var(--mantine-color-dark-5))"
          }
          style={{
            ...MESSAGE_BUBBLE_STYLE,
            ...(isHighlighted
              ? {
                  outline: "2px solid rgba(37, 99, 235, 0.6)",
                  outlineOffset: "2px",
                }
              : {}),
          }}
        >
          {message.forwarded && <ForwardedNote />}
          {message.quote && <QuoteBlock quote={message.quote} />}
          {bodyText}
          {message.link && <LinkCard link={message.link} />}
          {message.location && <LocationLine location={message.location} />}
          {message.contactCard && <ContactLine card={message.contactCard} />}
          {message.caption && (
            <Text
              c={textColor}
              size="sm"
              mt={4}
              style={MESSAGE_TEXT_STYLE}
              dangerouslySetInnerHTML={{ __html: message.caption }}
            />
          )}
          {copyLink(sidePlacement)}
        </Paper>
        {message.reactions && (
          <ReactionChips reactions={message.reactions} align={message.isOwner ? "end" : "start"} />
        )}
        {showTimestamp && (
          <TimeLine
            mt={3}
            edited={message.edited}
            timestampHtml={formatMessageTime(message.timestamp)}
          />
        )}
      </Stack>
    </Box>
  );
}

function MessageBubbleComponent(props: MessageBubbleProps) {
  const look = useLook();
  return look.id === "viber" ? (
    <ViberMessageBubble {...props} />
  ) : (
    <DefaultMessageBubble {...props} />
  );
}

export const MessageBubble = memo(MessageBubbleComponent);
