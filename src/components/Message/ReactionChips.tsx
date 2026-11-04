import { Group, Text } from "@mantine/core";
import type { Reaction } from "../../model/chat";

/** The emoji sent in reaction to a message, with how many of each. */
export function ReactionChips({ reactions }: { reactions: Reaction[] }) {
  const summary = reactions.map(({ emoji, count }) => `${emoji} ${count}`).join(", ");
  return (
    <Group gap={6} justify="center" mt={8} data-reactions role="group" aria-label={`Reactions: ${summary}`}>
      {reactions.map(({ emoji, count }) => (
        <Text
          key={emoji}
          component="span"
          size="sm"
          px={8}
          py={2}
          title={`${emoji} × ${count}`}
          style={{
            borderRadius: 12,
            border: "1px solid light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-4))",
            background: "light-dark(var(--mantine-color-gray-0), var(--mantine-color-dark-7))",
          }}
        >
          {emoji}
          {count > 1 && (
            <Text component="span" size="xs" c="dimmed" ml={4}>
              {count}
            </Text>
          )}
        </Text>
      ))}
    </Group>
  );
}
