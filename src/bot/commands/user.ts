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
      'ℹ️ Команду <b>/setme</b> нужно использовать в группе, где вы хотите установить позывной.'
    );
    return;
  }

  const callsign = argsText.trim();
  if (!callsign) {
    const existing = await storage.getUser(chatId, user.id);
    const current = existing?.callsign
      ? `Ваш текущий позывной: <b>${escapeHtml(existing.callsign)}</b>\n\nЧтобы сбросить его, напишите: <code>/setme -</code>`
      : 'У вас пока не установлен позывной.';

    await client.sendMessage(
      chatId,
      `🎭 <b>Персональный позывной</b>\n\n${current}\n\n` +
        'Чтобы установить позывной, напишите:\n' +
        '<code>/setme ⚡ Зевс</code> или <code>/setme 🎮 ProGamer</code>\n\n' +
        '<i>Позывной будет отображаться вместо вашего имени при вызове через бота в режиме позывных!</i>'
    );
    return;
  }

  if (callsign === '-' || callsign.toLowerCase() === 'reset' || callsign.toLowerCase() === 'сброс') {
    await storage.setUserCallsign(chatId, user.id, null);
    await client.sendMessage(chatId, '✅ Ваш персональный позывной сброшен.');
    return;
  }

  if (callsign.length > 32) {
    await client.sendMessage(
      chatId,
      '❌ Позывной слишком длинный. Максимальная длина — 32 символа.'
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
    `✅ Ваш позывной успешно установлен: <b>${escapeHtml(callsign)}</b>`
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
    await client.sendMessage(chatId, 'ℹ️ Используйте эту команду в группе.');
    return;
  }

  await storage.setOptOut(chatId, user.id, true);
  await client.sendMessage(
    chatId,
    `🔕 <b>${escapeHtml(user.first_name)}</b>, вы успешно <b>отключили</b> уведомления от команды /all.\n\n` +
      'Вас больше не будут отмечать в общих сборах. Чтобы включить уведомления обратно, напишите <code>/in</code>.'
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
    await client.sendMessage(chatId, 'ℹ️ Используйте эту команду в группе.');
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
    `🔔 <b>${escapeHtml(user.first_name)}</b>, вы успешно <b>включили</b> уведомления от команды /all.\n\n` +
      'Теперь бот будет отмечать вас при общих вызовах.'
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
    await client.sendMessage(chatId, 'ℹ️ Используйте эту команду в группе.');
    return;
  }

  const record = await storage.getUser(chatId, user.id);
  const callsign = record?.callsign ? `<code>${escapeHtml(record.callsign)}</code>` : '<i>не установлен</i>';
  const status = record?.opted_out
    ? '🔕 <b>Отключены</b> (вас не тегают в /all)'
    : '🔔 <b>Включены</b> (вас тегают в /all)';

  await client.sendMessage(
    chatId,
    `👤 <b>Ваш профиль в этом чате:</b>\n\n` +
      `• Имя: <b>${escapeHtml(user.first_name)}</b>\n` +
      `• Telegram ID: <code>${user.id}</code>\n` +
      `• Позывной: ${callsign}\n` +
      `• Уведомления: ${status}\n\n` +
      `<i>Команды:</i>\n` +
      `• <code>/setme &lt;позывной&gt;</code> — задать позывной\n` +
      `• <code>/out</code> — отключить теги\n` +
      `• <code>/in</code> — включить теги`
  );
}
