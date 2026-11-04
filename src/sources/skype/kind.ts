import type { ConversationKind } from "../../model/chat";
import type { ThreadProperties } from "./types";

/**
 * What a Skype conversation is, from its ID: `8:` (an account, e.g. `8:live:.cid.…`) and
 * `4:` (a phone number) are a person, and `28:` (a bot) and `48:` (system feeds) are not
 * people. A `19:` ID is a chat thread, and its ending says what kind: `@thread.…` (such as
 * `@thread.skype` and `@thread.v2`) is a group, while the Teams-style `@unq.gbl.spaces` and
 * `@oneToOne.skype` are a chat with one person. Anything else is left out rather than
 * guessed.
 */
export function skypeConversationKind(id: string): ConversationKind | undefined {
  const lower = id.toLowerCase();
  if (lower.startsWith("19:")) {
    if (lower.endsWith("@unq.gbl.spaces") || lower.endsWith("@onetoone.skype")) return "direct";
    if (lower.includes("@thread.")) return "group";
    return undefined;
  }
  if (lower.startsWith("8:") || lower.startsWith("4:")) return "direct";
  if (lower.startsWith("28:") || lower.startsWith("48:")) return "service";
  return undefined;
}

/**
 * How many people a group has, from its thread properties. Skype may write the number as
 * text, and some exports only list the members, so both are read; undefined when neither
 * says.
 */
export function skypeMemberCount(
  properties: ThreadProperties | null | undefined,
): number | undefined {
  if (!properties) return undefined;

  const counted = Number(properties.membercount);
  if (Number.isInteger(counted) && counted > 0) return counted;

  try {
    const members: unknown = JSON.parse(properties.members ?? "");
    if (Array.isArray(members) && members.length > 0) return members.length;
  } catch {
    // Not a list of members
  }
  return undefined;
}
