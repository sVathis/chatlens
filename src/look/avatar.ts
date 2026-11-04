const AVATAR_COLORS = [
  "#7360f2",
  "#d6537f",
  "#d98324",
  "#2f9e78",
  "#3b82c4",
  "#a54fc9",
  "#c84b45",
  "#5a8a2c",
] as const;

/** A colour for a person, the same every time, from their ID (never from what they wrote). */
export function avatarColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

/**
 * Up to two initials of a name: the first letters of its first and last words. Counts
 * whole characters, so an emoji or a letter outside the Basic Latin range isn't cut in two.
 */
export function initials(name: string | null | undefined): string {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const first = Array.from(words[0])[0];
  const last = words.length > 1 ? Array.from(words[words.length - 1])[0] : "";
  return (first + last).toLocaleUpperCase();
}
