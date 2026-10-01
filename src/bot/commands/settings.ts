import { TelegramClient } from '../../telegram/client.js';
import {
  TelegramCallbackQuery,
  TelegramInlineKeyboardMarkup,
  TelegramMessage,
} from '../../telegram/types.js';
import { StorageAdapter } from '../../storage/adapter.js';
import { ChatSettings, PermissionsMode, TagMode } from '../../types.js';

export function buildSettingsKeyboard(
  settings: ChatSettings
): TelegramInlineKeyboardMarkup {
  const modeLabels: Record<TagMode, string> = {
    text: '💬 Имена',
    hidden: '👻 Скрытый',
    callsign: '🎭 Позывные',
  };

  const permLabels: Record<PermissionsMode, string> = {
    everyone: '👥 Все',
    admins: '👮 Админы',
  };

  return {
    inline_keyboard: [
      [
        {
          text: `Режим: ${modeLabels[settings.tag_mode] || settings.tag_mode}`,
          callback_data: 'cfg:toggle_mode',
        },
      ],
      [
        {
          text: `Кулдаун: ${settings.cooldown_seconds}с`,
          callback_data: 'cfg:cycle_cooldown',
        },
        {
          text: `Пачка: ${settings.chunk_size} чел.`,
          callback_data: 'cfg:cycle_chunk',
        },
      ],
      [
        {
          text: `Доступ: ${permLabels[settings.permissions]}`,
          callback_data: 'cfg:toggle_perm',
        },
        {
          text: `Удалять команду: ${settings.delete_trigger ? '✅ Да' : '❌ Нет'}`,
          callback_data: 'cfg:toggle_delete',
        },
      ],
      [
        {
          text: '🔄 Обновить меню',
          callback_data: 'cfg:refresh',
        },
      ],
    ],
  };
}

export function formatSettingsText(settings: ChatSettings): string {
  const modeDesc =
    settings.tag_mode === 'text'
      ? '<b>Имена</b> (кликабельные ссылки на участников)'
      : settings.tag_mode === 'hidden'
      ? '<b>Скрытый</b> (упоминания через невидимые символы — чат остается чистым!)'
      : '<b>Позывные</b> (персональные позывные/эмодзи, установленные через /setme)';

  const permDesc =
    settings.permissions === 'admins'
      ? '<b>Только администраторы</b>'
      : '<b>Все участники чата</b>';

  return (
    '⚙️ <b>Настройки Зазывалы для этого чата:</b>\n\n' +
    `• <b>Режим вызова:</b> ${modeDesc}\n` +
    `• <b>Задержка (кулдаун):</b> <code>${settings.cooldown_seconds}</code> сек.\n` +
    `• <b>Участников в сообщении:</b> <code>${settings.chunk_size}</code>\n` +
    `• <b>Кто может вызывать:</b> ${permDesc}\n` +
    `• <b>Удалять команду /all:</b> ${settings.delete_trigger ? '<b>Включено</b>' : '<b>Выключено</b>'}\n\n` +
    '<i>Нажимайте на кнопки ниже для изменения параметров:</i>'
  );
}

export async function handleSettingsCommand(
  client: TelegramClient,
  storage: StorageAdapter,
  message: TelegramMessage
): Promise<void> {
  const chatId = message.chat.id;
  const isGroup = message.chat.type === 'group' || message.chat.type === 'supergroup';

  if (!isGroup) {
    await client.sendMessage(
      chatId,
      '❌ Команда <b>/settings</b> работает только в группах.'
    );
    return;
  }

  const sender = message.from;
  if (sender) {
    try {
      const member = await client.getChatMember(chatId, sender.id);
      const isAdmin = member.status === 'creator' || member.status === 'administrator';
      if (!isAdmin) {
        await client.sendMessage(
          chatId,
          '🔒 Только администраторы группы могут изменять настройки бота.'
        );
        return;
      }
    } catch {
      // ignore
    }
  }

  const settings = await storage.getSettings(chatId);
  const text = formatSettingsText(settings);
  const replyMarkup = buildSettingsKeyboard(settings);

  await client.sendMessage(chatId, text, { reply_markup: replyMarkup });
}

export async function handleSettingsCallback(
  client: TelegramClient,
  storage: StorageAdapter,
  query: TelegramCallbackQuery
): Promise<void> {
  const msg = query.message;
  if (!msg || !query.data) return;

  const chatId = msg.chat.id;
  const senderId = query.from.id;

  // Verify sender is admin
  try {
    const member = await client.getChatMember(chatId, senderId);
    const isAdmin = member.status === 'creator' || member.status === 'administrator';
    if (!isAdmin) {
      await client.answerCallbackQuery(
        query.id,
        '🔒 Только администраторы могут менять настройки!',
        true
      );
      return;
    }
  } catch {
    await client.answerCallbackQuery(query.id, 'Ошибка проверки прав.', true);
    return;
  }

  const current = await storage.getSettings(chatId);
  const action = query.data;
  let notification = 'Настройки обновлены';

  if (action === 'cfg:toggle_mode') {
    const modes: TagMode[] = ['text', 'hidden', 'callsign'];
    const nextIdx = (modes.indexOf(current.tag_mode) + 1) % modes.length;
    current.tag_mode = modes[nextIdx];
    notification = `Режим: ${current.tag_mode}`;
  } else if (action === 'cfg:cycle_cooldown') {
    const cooldowns = [0, 30, 60, 120, 300];
    const nextIdx = (cooldowns.indexOf(current.cooldown_seconds) + 1) % cooldowns.length;
    current.cooldown_seconds = cooldowns[nextIdx];
    notification = `Кулдаун: ${current.cooldown_seconds} сек.`;
  } else if (action === 'cfg:cycle_chunk') {
    const chunks = [1, 3, 5, 10];
    const nextIdx = (chunks.indexOf(current.chunk_size) + 1) % chunks.length;
    current.chunk_size = chunks[nextIdx];
    notification = `Размер пачки: ${current.chunk_size}`;
  } else if (action === 'cfg:toggle_perm') {
    current.permissions = current.permissions === 'everyone' ? 'admins' : 'everyone';
    notification = `Доступ: ${current.permissions === 'admins' ? 'Только админы' : 'Все'}`;
  } else if (action === 'cfg:toggle_delete') {
    current.delete_trigger = !current.delete_trigger;
    notification = `Удаление команды: ${current.delete_trigger ? 'Вкл' : 'Выкл'}`;
  } else if (action === 'cfg:refresh') {
    notification = 'Обновлено!';
  }

  await storage.updateSettings(chatId, current);

  const text = formatSettingsText(current);
  const keyboard = buildSettingsKeyboard(current);

  await Promise.all([
    client.answerCallbackQuery(query.id, notification),
    client.editMessageText(chatId, msg.message_id, text, {
      reply_markup: keyboard,
    }),
  ]);
}
