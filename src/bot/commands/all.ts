import { TelegramClient } from '../../telegram/client.js';
import { TelegramMessage } from '../../telegram/types.js';
import { StorageAdapter } from '../../storage/adapter.js';
import { chunkArray, formatBatchMentions, sleep } from '../../telegram/helpers.js';

export async function handleAllCommand(
  client: TelegramClient,
  storage: StorageAdapter,
  message: TelegramMessage,
  argsText: string,
  addBackgroundTask?: (promise: Promise<any>) => void
): Promise<void> {
  const chatId = message.chat.id;
  const isGroup = message.chat.type === 'group' || message.chat.type === 'supergroup';

  if (!isGroup) {
    await client.sendMessage(
      chatId,
      '❌ Команда <b>/all</b> работает только в группах и супергруппах!'
    );
    return;
  }

  const settings = await storage.getSettings(chatId);
  const senderId = message.from?.id;

  // Check if sender is admin
  let isAdmin = false;
  if (senderId) {
    try {
      const member = await client.getChatMember(chatId, senderId);
      isAdmin = member.status === 'creator' || member.status === 'administrator';
    } catch {
      isAdmin = false;
    }
  }

  // Check permissions
  if (settings.permissions === 'admins' && !isAdmin) {
    await client.sendMessage(
      chatId,
      '🔒 В этой группе вызывать участников могут только <b>администраторы</b>.'
    );
    return;
  }

  // Check cooldown (admins bypass cooldown)
  if (!isAdmin && settings.cooldown_seconds > 0) {
    const remaining = await storage.getCooldownRemaining(chatId, settings.cooldown_seconds);
    if (remaining > 0) {
      await client.sendMessage(
        chatId,
        `⏳ <b>Кулдаун!</b> Подождите еще <code>${remaining}</code> сек. перед следующим вызовом.`
      );
      return;
    }
  }

  // Fetch active users (opted-out are excluded)
  const users = await storage.getUsers(chatId, { includeOptedOut: false });

  if (users.length === 0) {
    await client.sendMessage(
      chatId,
      'ℹ️ <b>В базе бота пока нет участников этого чата.</b>\n\n' +
        'Telegram Bot API не отдает список участников сразу. ' +
        'Бот запоминает участников по мере их активности в чате (когда они пишут сообщения) ' +
        'или когда они вводят команду <code>/in</code>.\n\n' +
        '👉 <i>Вы можете использовать <code>/admins</code> прямо сейчас, чтобы созвать всех администраторов!</i>'
    );
    return;
  }

  // Update cooldown timestamp
  await storage.setLastTagTimestamp(chatId);

  // Chunk users into batches (default 5 users per message to guarantee push notifications)
  const chunkSize = settings.chunk_size || 5;
  const chunks = chunkArray(users, chunkSize);

  // Auto-delete trigger message if configured
  if (settings.delete_trigger && message.message_id) {
    client.deleteMessage(chatId, message.message_id).catch(() => {});
  }

  // Send the first batch immediately
  const firstText = formatBatchMentions(chunks[0], settings.tag_mode, argsText);
  await client.sendMessage(chatId, firstText);

  // If there are more batches, send them in the background (compatible with Vercel waitUntil)
  if (chunks.length > 1) {
    const sendRemaining = async () => {
      // Safety limit: on serverless, don't exceed 10 batches to prevent timeout
      const maxBatches = Math.min(chunks.length, 10);
      for (let i = 1; i < maxBatches; i++) {
        // 1-second delay to comply with Telegram chat rate limits (max 20 msgs/min)
        await sleep(1000);
        const text = formatBatchMentions(chunks[i], settings.tag_mode);
        try {
          await client.sendMessage(chatId, text);
        } catch (err) {
          console.error(`Error sending batch ${i}:`, err);
          break;
        }
      }
    };

    if (addBackgroundTask) {
      addBackgroundTask(sendRemaining());
    } else {
      await sendRemaining();
    }
  }
}
