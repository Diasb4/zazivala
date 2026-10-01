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
      'Команда <b>/stats</b> работает только в группах.'
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
      ? `${stats.cooldown_remaining} сек.`
      : 'Готов к вызову';

  const text =
    '<b>Статистика чата:</b>\n\n' +
    `• Всего в базе: <b>${stats.total}</b>\n` +
    `• Активных: <b>${stats.active}</b>\n` +
    `• Отписались (/out): <b>${stats.opted_out}</b>\n` +
    `• Списков: <b>${stats.lists_count}</b>\n\n` +
    `• Режим: <b>${modeText}</b>\n` +
    `• Пачка: <code>${settings.chunk_size}</code>\n` +
    `• Кулдаун: <code>${settings.cooldown_seconds}с</code> (${cooldownText})`;

  await client.sendMessage(chatId, text);
}
