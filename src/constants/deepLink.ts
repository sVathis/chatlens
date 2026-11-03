// Parameter names of the canonical deep-link URL:
// <app base>#conversationId=<Conversation.id>&messageId=<Message.id>
export const CONVERSATION_ID_PARAM = "conversationId";
export const MESSAGE_ID_PARAM = "messageId";

// Upper bound for a single identifier taken from the URL. Real Skype IDs are far shorter.
export const MAX_DEEP_LINK_ID_LENGTH = 1024;

// Older messages loaded beyond the target so it has context above it.
export const DEEP_LINK_CONTEXT_MESSAGES = 50;

// Consecutive animation frames the target must stay centred before navigation is complete.
export const DEEP_LINK_SETTLED_FRAMES = 3;
// Upper bound on frames spent converging on the target (about 2s at 60fps).
export const DEEP_LINK_MAX_SCROLL_FRAMES = 120;

export const COPY_FEEDBACK_DURATION = 1500;

export const TAB_BRIDGE_CHANNEL = "chatlens-deep-links-v1";

// Name of the tab report.html links open in (CHATLENS_WINDOW_NAME in
// tools/chatlens_links.py). The report keeps reusing that tab, so it is the one tab
// worth giving a copy of an export loaded in another tab.
export const REPORT_TAB_NAME = "chatlens";
// What reports made before the rename (as SkypeLens) name that tab; they keep working.
export const LEGACY_REPORT_TAB_NAME = "skypelens";
