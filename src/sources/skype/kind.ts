import type { ConversationKind } from "../../model/chat";
import type { ThreadProperties } from "./types";

/**
 * What a Skype conversation is, from the prefix of its ID: `8:` (an account, e.g.
 * `8:live:.cid.…`) and `4:` (a phone number) are a person, `19:` is a group thread, and
 * `28:` (a bot) and `48:` (system feeds) are not people. Other prefixes are left out
 * rather than guessed.
 */
export function skypeConversationKind(id: string): ConversationKind | undefined {
  if (id.startsWith("19:")) return "group";
  if (id.startsWith("8:") || id.startsWith("4:")) return "direct";
  if (id.startsWith("28:") || id.startsWith("48:")) return "service";
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
