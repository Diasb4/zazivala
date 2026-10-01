import { UserRecord, TagMode } from '../types.js';

/**
 * Escapes characters for Telegram HTML mode
 */
export function escapeHtml(text: string): string {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Creates a mention link for a user depending on the selected TagMode
 */
export function createMention(user: UserRecord, mode: TagMode): string {
  const userId = user.id;

  if (mode === 'hidden') {
    // Zero-width space inside link. Invisible to user, but triggers Telegram push notification!
    return `<a href="tg://user?id=${userId}">&#8203;</a>`;
  }

  if (mode === 'callsign' && user.callsign && user.callsign.trim()) {
    const callsign = escapeHtml(user.callsign.trim());
    return `<a href="tg://user?id=${userId}">${callsign}</a>`;
  }

  // Text mode
  let displayName = user.first_name || '';
  if (user.last_name) {
    displayName += ` ${user.last_name}`;
  }
  displayName = displayName.trim() || user.username || `User ${userId}`;

  return `<a href="tg://user?id=${userId}">${escapeHtml(displayName)}</a>`;
}

/**
 * Formats a batch of users into a mention text according to TagMode
 */
export function formatBatchMentions(
  users: UserRecord[],
  mode: TagMode,
  customMessage?: string
): string {
  if (users.length === 0) return '';

  if (mode === 'hidden') {
    const hiddenLinks = users
      .map((u) => `<a href="tg://user?id=${u.id}">&#8203;</a>`)
      .join('');
    const baseText = customMessage?.trim()
      ? escapeHtml(customMessage.trim())
      : 'Общий сбор';
    return `${baseText}${hiddenLinks}`;
  }

  const mentions = users.map((u) => createMention(u, mode)).join(', ');
  if (customMessage?.trim()) {
    return `${escapeHtml(customMessage.trim())}\n\n${mentions}`;
  }
  return mentions;
}

/**
 * Splits an array into chunks of given size
 */
export function chunkArray<T>(items: T[], size: number): T[][] {
  const safeSize = Math.max(1, size);
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += safeSize) {
    chunks.push(items.slice(i, i + safeSize));
  }
  return chunks;
}

/**
 * Asynchronous sleep helper
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
