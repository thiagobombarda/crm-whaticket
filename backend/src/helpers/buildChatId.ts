/**
 * Builds the channel-specific chat ID for a contact.
 * - WhatsApp: "number@c.us" or "number@g.us"
 * - Instagram: raw Instagram user PK string (e.g. "ig_123456789")
 */
export function buildChatId(
  channel: string,
  number: string,
  isGroup: boolean
): string {
  if (channel === "instagram" || channel === "whatsapp_cloud") return number;
  return `${number}@${isGroup ? "g" : "c"}.us`;
}
