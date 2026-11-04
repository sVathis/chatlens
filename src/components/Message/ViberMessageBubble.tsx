import { Avatar, Box, Group, Paper, Stack, Text } from "@mantine/core";
import { avatarColor, initials } from "../../look/avatar";
import { viberLook as look } from "../../look";
import { MESSAGE_TEXT_STYLE } from "../../constants/messageBubble";
import { formatClockTime, formatMessageTime } from "../../utils/dateFormat";
import { highlightSearchMatch } from "../../utils/messageSearch";
import { AttachmentContent } from "./AttachmentContent";
import { CopyMessageLinkButton } from "./CopyMessageLinkButton";
import { MediaMessage } from "./MediaMessage";
import type { MessageBubbleProps } from "./MessageBubble";
import { ContactLine, ForwardedNote, LinkCard, LocationLine, QuoteBlock } from "./MessageParts";
import { ReactionChips } from "./ReactionChips";

const AVATAR_SIZE = 32;

/** Time (and "edited") at the bottom right of a bubble, like Viber's. */
function BubbleTime({ timestamp, edited }: { timestamp: string; edited?: boolean }) {
  return (
    <Text
      size="xs"
      mt={2}
      ta="right"
      opacity={0.65}
      data-bubble-time
      // The full date is on hover: the date pills only show the day
      title={formatMessageTime(timestamp).replace(/<\/?sup>/g, "")}
      style={{ lineHeight: 1.2, whiteSpace: "nowrap" }}
    >
      {edited && <span data-edited>edited · </span>}
      {formatClockTime(timestamp)}
    </Text>
  );
}

/** A date, a system message or a call: a small pill in the middle of the conversation. */
function CenterPill({
  children,
  copyLink,
  timestamp,
  html,
  prefix,
}: {
  children?: React.ReactNode;
  copyLink: React.ReactNode;
  timestamp?: string;
  html?: string;
  prefix?: string;
}) {
  return (
    <Box ta="center" py={10} px={16}>
      <Box
        pos="relative"
        display="inline-block"
        px={14}
        py={5}
        maw="80%"
        data-center-pill
        style={{
          borderRadius: 999,
          background: "light-dark(rgba(115, 96, 242, 0.1), rgba(255, 255, 255, 0.08))",
        }}
      >
        {html !== undefined ? (
          <Text
            size="xs"
            c="dimmed"
            fw={500}
            dangerouslySetInnerHTML={{ __html: `${prefix ?? ""}${html}` }}
          />
        ) : (
          children
        )}
        {copyLink}
      </Box>
      {timestamp && (
        <Text size="xs" c="dimmed" mt={2} opacity={0.7}>
          {formatClockTime(timestamp)}
        </Text>
      )}
    </Box>
  );
}

/**
 * A message the way Viber shows it: rounded bubbles (the owner's light purple on the
 * right), the time inside the bubble, and in group chats a coloured sender name and an
 * initials avatar beside the last message of each run.
 */
export function ViberMessageBubble({
  message,
  showSender,
  showTimestamp,
  isRoleSwapped = false,
  userDisplayName = "You",
  searchQuery = "",
  isHighlighted = false,
  isGroup = false,
  onCopyLink,
}: MessageBubbleProps) {
  const isOwner = message.isOwner;
  const name = isRoleSwapped && !isOwner ? userDisplayName : message.displayName;
  const highlighted = searchQuery
    ? highlightSearchMatch(message.content, searchQuery)
    : message.content;

  const copyLink = (placement: "start" | "end") =>
    onCopyLink ? (
      <CopyMessageLinkButton messageId={message.id} onCopy={onCopyLink} placement={placement} />
    ) : null;

  if (message.type === "system" || message.type === "notice") {
    return <CenterPill html={highlighted} copyLink={copyLink("end")} />;
  }
  if (message.type === "call") {
    return (
      <CenterPill
        html={highlighted}
        prefix={"\u{1F4DE} "}
        timestamp={showTimestamp ? message.timestamp : undefined}
        copyLink={copyLink("end")}
      />
    );
  }

  const isSticker = message.type === "media" && message.sticker === true;
  const showAvatarColumn = isGroup && !isOwner;
  const color = avatarColor(message.from);
  const sidePlacement = isOwner ? "start" : "end";

  const text = (
    <Text
      size="sm"
      c={isOwner ? look.ownText : look.otherText}
      style={MESSAGE_TEXT_STYLE}
      dangerouslySetInnerHTML={{ __html: highlighted }}
    />
  );
  const body =
    message.attachment?.key !== undefined ? (
      <AttachmentContent
        attachment={{ ...message.attachment, key: message.attachment.key }}
        fallback={text}
      />
    ) : (
      text
    );

  const caption = message.caption ? (
    <Text
      size="sm"
      mt={4}
      c={isOwner ? look.ownText : look.otherText}
      style={MESSAGE_TEXT_STYLE}
      dangerouslySetInnerHTML={{ __html: message.caption }}
    />
  ) : null;

  let content: React.ReactNode;
  if (message.type === "media" && message.mediaUrl) {
    content = (
      <Box pos="relative" maw="100%" data-viber-media>
        <MediaMessage
          mediaId={message.mediaUrl}
          messageId={message.id}
          isOwner={isOwner}
          sticker={isSticker}
        />
        {copyLink(sidePlacement)}
        {caption}
        <BubbleTimeForMedia show={showTimestamp} timestamp={message.timestamp} edited={message.edited} />
      </Box>
    );
  } else {
    // Rounded all round; the corner at the sender's side of the last bubble of a run
    // is square, like the tail of a speech bubble
    const tail = showTimestamp ? 4 : look.bubbleRadius;
    content = (
      <Paper
        px={12}
        py={7}
        data-viber-bubble
        bg={isOwner ? look.ownBubble : look.otherBubble}
        style={{
          maxWidth: "100%",
          width: "fit-content",
          position: "relative",
          color: isOwner ? look.ownText : look.otherText,
          borderRadius: look.bubbleRadius,
          ...(isOwner ? { borderBottomRightRadius: tail } : { borderBottomLeftRadius: tail }),
          boxShadow: "0 1px 1px rgba(0, 0, 0, 0.12)",
          ...(isHighlighted
            ? { outline: `2px solid ${look.accent}`, outlineOffset: "2px" }
            : {}),
        }}
      >
        {message.forwarded && <ForwardedNote />}
        {message.quote && <QuoteBlock quote={message.quote} />}
        {body}
        {message.link && <LinkCard link={message.link} />}
        {message.location && <LocationLine location={message.location} />}
        {message.contactCard && <ContactLine card={message.contactCard} />}
        {caption}
        <BubbleTime timestamp={message.timestamp} edited={message.edited} />
        {copyLink(sidePlacement)}
      </Paper>
    );
  }

  return (
    <Box w="100%" pt={showSender ? 10 : 2} pb={2} px={12}>
      <Group
        gap={8}
        wrap="nowrap"
        align="flex-end"
        justify={isOwner ? "flex-end" : "flex-start"}
      >
        {showAvatarColumn &&
          (showTimestamp ? (
            <Avatar
              size={AVATAR_SIZE}
              radius="xl"
              color="white"
              data-avatar
              styles={{ root: { background: color, flexShrink: 0 } }}
              aria-label={name ?? undefined}
            >
              {initials(name)}
            </Avatar>
          ) : (
            <Box w={AVATAR_SIZE} style={{ flexShrink: 0 }} aria-hidden />
          ))}
        <Stack
          gap={0}
          align={isOwner ? "flex-end" : "flex-start"}
          style={{ minWidth: 0, maxWidth: "min(70%, 560px)" }}
        >
          {!isOwner && showSender && isGroup && name && (
            <Text size="xs" fw={600} mb={3} ml={4} data-sender-name style={{ color }}>
              {name}
            </Text>
          )}
          {content}
          {message.reactions && (
            <ReactionChips reactions={message.reactions} align={isOwner ? "end" : "start"} />
          )}
        </Stack>
      </Group>
    </Box>
  );
}

/** The time under a photo, video or sticker, which have no bubble to hold it. */
function BubbleTimeForMedia({
  show,
  timestamp,
  edited,
}: {
  show: boolean;
  timestamp: string;
  edited?: boolean;
}) {
  if (!show) return null;
  return (
    <Box ta="right" c="dimmed">
      <BubbleTime timestamp={timestamp} edited={edited} />
    </Box>
  );
}
