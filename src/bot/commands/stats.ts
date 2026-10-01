import { TelegramClient } from '../../telegram/client.js';
import { TelegramMessage } from '../../telegram/types.js';
import { StorageAdapter } from '../../storage/adapter.js';

export async function handleStatsCommand(
  client: TelegramClient,
  storage: StorageAdapter,
  message: TelegramMessage
): Promise<void> {
  const chatId = message.chat.id;
  const isGroup = message.chat.type === 'group' || message.chat.type === 'supergroup';

  if (!isGroup) {
    await client.sendMessage(
      chatId,
      '❌ Команда <b>/stats</b> работает только в группах.'
    );
    return;
  }

  const [stats, settings] = await Promise.all([
    storage.getStats(chatId),
    storage.getSettings(chatId),
  ]);

  const modeText =
    settings.tag_mode === 'text'
      ? 'Имена'
      : settings.tag_mode === 'hidden'
      ? 'Скрытый (zero-width)'
      : 'Позывные';

  const cooldownText =
    stats.cooldown_remaining > 0
      ? `⏳ <code>${stats.cooldown_remaining}</code> сек.`
      : '✅ Готов к вызову';

  const text =
    '📊 <b>Статистика чата:</b>\n\n' +
    `• 👥 <b>Всего участников в базе:</b> <code>${stats.total}</code>\n` +
    `• 🔔 <b>Активных (получают пинг):</b> <code>${stats.active}</code>\n` +
    `• 🔕 <b>Отписались (/out):</b> <code>${stats.opted_out}</code>\n` +
    `• 📋 <b>Списков чата:</b> <code>${stats.lists_count}</code>\n\n` +
    '⚙️ <b>Текущие настройки:</b>\n' +
    `• Режим: <b>${modeText}</b>\n` +
    `• Пачка: <code>${settings.chunk_size}</code> чел./сообщение\n` +
    `• Кулдаун: <code>${settings.cooldown_seconds}</code> сек. (${cooldownText})\n` +
    `• Доступ: <b>${settings.permissions === 'admins' ? 'Только админы' : 'Все'}</b>\n\n` +
    '<i>💡 Чтобы добавить новых участников в базу, им достаточно написать любое сообщение в чат!</i>';

  await client.sendMessage(chatId, text);
}
