import { TelegramClient } from '../../telegram/client.js';
import { TelegramMessage } from '../../telegram/types.js';
import { StorageAdapter } from '../../storage/adapter.js';
import { escapeHtml } from '../../telegram/helpers.js';

export async function handleSetMeCommand(
  client: TelegramClient,
  storage: StorageAdapter,
  message: TelegramMessage,
  argsText: string
): Promise<void> {
  const chatId = message.chat.id;
  const user = message.from;

  if (!user) return;

  const isGroup = message.chat.type === 'group' || message.chat.type === 'supergroup';
  if (!isGroup) {
    await client.sendMessage(
      chatId,
      'Команду <b>/setme</b> нужно использовать в группе, где вы хотите установить позывной.'
    );
    return;
  }

  const callsign = argsText.trim();
  if (!callsign) {
    const existing = await storage.getUser(chatId, user.id);
    const current = existing?.callsign
      ? `Текущий позывной: <b>${escapeHtml(existing.callsign)}</b>`
      : 'Позывной не установлен.';

    await client.sendMessage(
      chatId,
      `${current}\n\n` +
        'Установить: <code>/setme &lt;позывной&gt;</code>\n' +
        'Сбросить: <code>/setme -</code>'
    );
    return;
  }

  if (callsign === '-' || callsign.toLowerCase() === 'reset' || callsign.toLowerCase() === 'сброс') {
    await storage.setUserCallsign(chatId, user.id, null);
    await client.sendMessage(chatId, 'Позывной сброшен.');
    return;
  }

  if (callsign.length > 32) {
    await client.sendMessage(
      chatId,
      'Позывной слишком длинный (максимум 32 символа).'
    );
    return;
  }

  // Ensure user is in storage
  await storage.upsertUser(chatId, {
    id: user.id,
    first_name: user.first_name,
    last_name: user.last_name,
    username: user.username,
    opted_out: false,
    updated_at: Date.now(),
  });

  await storage.setUserCallsign(chatId, user.id, callsign);
  await client.sendMessage(
    chatId,
    `Позывной установлен: <b>${escapeHtml(callsign)}</b>`
  );
}

export async function handleOptOutCommand(
  client: TelegramClient,
  storage: StorageAdapter,
  message: TelegramMessage
): Promise<void> {
  const chatId = message.chat.id;
  const user = message.from;
  if (!user) return;

  const isGroup = message.chat.type === 'group' || message.chat.type === 'supergroup';
  if (!isGroup) {
    await client.sendMessage(chatId, 'Используйте эту команду в группе.');
    return;
  }

  await storage.setOptOut(chatId, user.id, true);
  await client.sendMessage(
    chatId,
    `Уведомления /all отключены для ${escapeHtml(user.first_name)}. Включить: /in`
  );
}

export async function handleOptInCommand(
  client: TelegramClient,
  storage: StorageAdapter,
  message: TelegramMessage
): Promise<void> {
  const chatId = message.chat.id;
  const user = message.from;
  if (!user) return;

  const isGroup = message.chat.type === 'group' || message.chat.type === 'supergroup';
  if (!isGroup) {
    await client.sendMessage(chatId, 'Используйте эту команду в группе.');
    return;
  }

  await storage.upsertUser(chatId, {
    id: user.id,
    first_name: user.first_name,
    last_name: user.last_name,
    username: user.username,
    opted_out: false,
    updated_at: Date.now(),
  });
  await storage.setOptOut(chatId, user.id, false);

  await client.sendMessage(
    chatId,
    `Уведомления /all включены для ${escapeHtml(user.first_name)}.`
  );
}

export async function handleMeCommand(
  client: TelegramClient,
  storage: StorageAdapter,
  message: TelegramMessage
): Promise<void> {
  const chatId = message.chat.id;
  const user = message.from;
  if (!user) return;

  const isGroup = message.chat.type === 'group' || message.chat.type === 'supergroup';
  if (!isGroup) {
    await client.sendMessage(chatId, 'Используйте эту команду в группе.');
    return;
  }

  const record = await storage.getUser(chatId, user.id);
  const callsign = record?.callsign ? `<b>${escapeHtml(record.callsign)}</b>` : 'не установлен';
  const status = record?.opted_out ? 'Отключены' : 'Включены';

  await client.sendMessage(
    chatId,
    '<b>Профиль:</b>\n' +
      `• Имя: <b>${escapeHtml(user.first_name)}</b>\n` +
      `• ID: <code>${user.id}</code>\n` +
      `• Позывной: ${callsign}\n` +
      `• Уведомления: <b>${status}</b>`
  );
}
