import { Stack, UnstyledButton, Text, Group, Badge } from "@mantine/core";
import { memo, useMemo, useState } from "react";
import { IconChevronDown, IconChevronRight } from "@tabler/icons-react";
import {
  useConversations,
  useSelectedConversationId,
  useExportData,
} from "../../store/messageStore";
import { useOpenConversation } from "../../hooks/useDeepLinkNavigation";
import { useSource } from "../../hooks/useSource";
import { conversationLabel } from "../../utils/conversationLabel";
import { formatRelativeTime } from "../../utils/dateFormat";
import type { ChatConversation } from "../../model/chat";
import type { SourceAdapter } from "../../sources/types";

interface ConversationListProps {
	searchQuery: string;
}

const ConversationItem = memo(function ConversationItem({
	conversation,
	isSelected,
	ownerId,
	source,
	onSelect,
}: {
	conversation: ChatConversation;
	isSelected: boolean;
	ownerId: string;
	source: SourceAdapter;
	onSelect: (id: string) => void;
}) {
	const messageCount = conversation.messages.length;
	const preview = source.preview(conversation.messages, ownerId);
	const label = conversationLabel(conversation);
	const handleClick = () => onSelect(conversation.id);

	const displayName = source.displayName(conversation.title) || source.displayName(conversation.id) || conversation.id;

	return (
		<UnstyledButton
			onClick={handleClick}
			data-conversation-id={conversation.id}
			px="md"
			py="sm"
			bg={isSelected ? "light-dark(var(--mantine-color-blue-0), var(--mantine-color-dark-6))" : undefined}
			style={{
				borderRadius: "var(--mantine-radius-md)",
				transition: "background-color 150ms ease",
				borderLeft: isSelected ? "3px solid #0078d4" : "3px solid transparent",
			}}
			styles={{
				root: {
					"&:hover": {
						backgroundColor: isSelected
							? "light-dark(var(--mantine-color-blue-0), var(--mantine-color-dark-6))"
							: "light-dark(var(--mantine-color-gray-0), var(--mantine-color-dark-5))",
					},
				},
			}}
		>
			<Stack gap="xs">
				<Group justify="space-between" wrap="nowrap" gap="xs">
					<Group gap="xs" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
						<Text 
							c={isSelected ? "light-dark(var(--mantine-color-gray-9), var(--mantine-color-gray-0))" : "light-dark(var(--mantine-color-gray-7), var(--mantine-color-gray-3))"} 
							fw={isSelected ? 600 : 500}
							lineClamp={1}
							size="sm"
							// The name is cut to one line, so the full text is on hover
							title={displayName}
						>
							{displayName}
						</Text>
						<Badge
							size="sm"
							variant="light"
							color="gray"
							style={{ flexShrink: 0 }}
						>
							{messageCount}
						</Badge>
					</Group>
					{conversation.lastActivity && (
						<Text
							size="xs"
							c="dimmed"
							style={{ whiteSpace: "nowrap", flexShrink: 0 }}
							dangerouslySetInnerHTML={{
								__html: formatRelativeTime(conversation.lastActivity),
							}}
						/>
					)}
				</Group>
				{label && (
					<Text size="xs" c="dimmed" fw={500} data-conversation-label>
						{label}
					</Text>
				)}
				{preview && (
					<Text size="xs" c="dimmed" lineClamp={2}>
						{preview}
					</Text>
				)}
			</Stack>
		</UnstyledButton>
	);
});

/**
 * One row that stands for the conversations that hold nothing but emoji (such as the
 * threads Skype keeps for reactions sent during a call), so there is not one entry for
 * each of them. It opens to list them.
 */
function EmojiOnlyRow({
	count,
	shownOnCalls,
	isOpen,
	onToggle,
}: {
	count: number;
	shownOnCalls: number;
	isOpen: boolean;
	onToggle: () => void;
}) {
	return (
		<UnstyledButton
			onClick={onToggle}
			aria-expanded={isOpen}
			data-emoji-only-row
			px="md"
			py="sm"
			style={{ borderRadius: "var(--mantine-radius-md)" }}
		>
			<Group gap="xs" wrap="nowrap" align="flex-start">
				{isOpen ? <IconChevronDown size={16} /> : <IconChevronRight size={16} />}
				<Stack gap={2}>
					<Text size="sm" fw={500} c="dimmed">
						Emoji-only threads · {count}
					</Text>
					{shownOnCalls > 0 && (
						<Text size="xs" c="dimmed">
							{shownOnCalls} of them shown as reactions on calls
						</Text>
					)}
				</Stack>
			</Group>
		</UnstyledButton>
	);
}

export function ConversationList({ searchQuery }: ConversationListProps) {
	const conversations = useConversations();
	const openConversation = useOpenConversation();
	const selectedConversationId = useSelectedConversationId();
	const exportData = useExportData();
	const source = useSource();
	const [emojiOnlyOpen, setEmojiOnlyOpen] = useState(false);

	const filteredConversations = useMemo(() => {
		if (!searchQuery.trim()) return conversations;

		const query = searchQuery.toLowerCase().trim();
		return conversations.filter((c) => {
			const name = c.title || c.id;
			return name.toLowerCase().includes(query);
		});
	}, [conversations, searchQuery]);

	const { regular, emojiOnly } = useMemo(
		() => ({
			regular: filteredConversations.filter((c) => !c.emojiOnly),
			emojiOnly: filteredConversations.filter((c) => c.emojiOnly),
		}),
		[filteredConversations],
	);

	if (filteredConversations.length === 0) {
		return (
			<Text c="dimmed" ta="center" mt="xl">
				No conversations found
			</Text>
		);
	}

	// Nothing stays out of reach: a search, or a selected conversation in the group (say,
	// from a link), opens it
	const isOpen =
		emojiOnlyOpen ||
		searchQuery.trim() !== "" ||
		emojiOnly.some((c) => c.id === selectedConversationId);

	const entry = (conversation: ChatConversation) => (
		<ConversationItem
			key={conversation.id}
			conversation={conversation}
			isSelected={conversation.id === selectedConversationId}
			ownerId={exportData?.ownerId || ""}
			source={source}
			onSelect={openConversation}
		/>
	);

	return (
		<Stack gap="xs">
			{regular.map(entry)}
			{emojiOnly.length > 0 && (
				<>
					<EmojiOnlyRow
						count={emojiOnly.length}
						shownOnCalls={emojiOnly.filter((c) => c.shownOn).length}
						isOpen={isOpen}
						onToggle={() => setEmojiOnlyOpen((open) => !open)}
					/>
					{isOpen && emojiOnly.map(entry)}
				</>
			)}
		</Stack>
	);
}
