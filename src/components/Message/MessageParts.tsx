import { Box, Text } from "@mantine/core";
import type { ProcessedMessage } from "../../types/messages";

/** The "Forwarded" note above a message that was forwarded from elsewhere. */
export function ForwardedNote() {
  return (
    <Text size="xs" fs="italic" opacity={0.75} mb={2} data-forwarded>
      Forwarded
    </Text>
  );
}

/**
 * The message this one replies to, as a quote inside the bubble. Its text is plain text
 * (React escapes it), cut to a few lines.
 */
export function QuoteBlock({ quote }: { quote: NonNullable<ProcessedMessage["quote"]> }) {
  return (
    <Box
      data-quote
      data-quote-id={quote.messageId}
      mb={6}
      px={8}
      py={4}
      style={{
        borderLeft: "3px solid currentColor",
        borderRadius: 4,
        background: "rgba(127, 127, 127, 0.18)",
      }}
    >
      <Text size="xs" lineClamp={3} style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
        {quote.text}
      </Text>
    </Box>
  );
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/** A link with a preview: its title and site. Only web addresses get here (see sanitizeProcessedMessage). */
export function LinkCard({ link }: { link: NonNullable<ProcessedMessage["link"]> }) {
  return (
    <Box
      component="a"
      href={link.url}
      target="_blank"
      rel="noopener noreferrer"
      data-link-card
      mt={6}
      px={8}
      py={6}
      style={{
        display: "block",
        color: "inherit",
        textDecoration: "none",
        borderRadius: 6,
        background: "rgba(127, 127, 127, 0.18)",
      }}
    >
      {link.title && (
        <Text size="sm" fw={600} lineClamp={2}>
          {link.title}
        </Text>
      )}
      <Text size="xs" opacity={0.8} lineClamp={1}>
        {hostOf(link.url)}
      </Text>
    </Box>
  );
}

/** A location's coordinates. Shown as text only: no map link, so nothing leaves the page. */
export function LocationLine({ location }: { location: NonNullable<ProcessedMessage["location"]> }) {
  return (
    <Text size="xs" mt={4} data-location>
      {"\u{1F4CD}"} {location.lat.toFixed(5)}, {location.lon.toFixed(5)}
    </Text>
  );
}

/** The number on a shared contact card (its name is in the message text). */
export function ContactLine({ card }: { card: NonNullable<ProcessedMessage["contactCard"]> }) {
  return card.number ? (
    <Text size="xs" mt={2} data-contact-number>
      {card.number}
    </Text>
  ) : null;
}

/** The time under a message, with a note when the message was edited. */
export function TimeLine({
  timestampHtml,
  edited,
  mt,
}: {
  timestampHtml: string;
  edited?: boolean;
  mt: number;
}) {
  if (!edited) {
    return (
      <Text
        size="xs"
        c="dimmed"
        mt={mt}
        ml={4}
        style={{ opacity: 0.7 }}
        dangerouslySetInnerHTML={{ __html: timestampHtml }}
      />
    );
  }
  return (
    <Text size="xs" c="dimmed" mt={mt} ml={4} style={{ opacity: 0.7 }}>
      <span data-edited>edited · </span>
      <span dangerouslySetInnerHTML={{ __html: timestampHtml }} />
    </Text>
  );
}
