import { TelegramClient } from '../../telegram/client.js';
import { TelegramMessage } from '../../telegram/types.js';
import { StorageAdapter } from '../../storage/adapter.js';
import { CustomList, UserRecord } from '../../types.js';
import { chunkArray, escapeHtml, formatBatchMentions, sleep } from '../../telegram/helpers.js';

export async function handleListsCommand(
  client: TelegramClient,
  storage: StorageAdapter,
  message: TelegramMessage
): Promise<void> {
  const chatId = message.chat.id;
  const isGroup = message.chat.type === 'group' || message.chat.type === 'supergroup';

  if (!isGroup) {
    await client.sendMessage(chatId, '❌ Команда работает только в группах.');
    return;
  }

  const lists = await storage.getLists(chatId);
  const listNames = Object.keys(lists);

  if (listNames.length === 0) {
    await client.sendMessage(
      chatId,
      '📋 <b>В этом чате пока нет пользовательских списков.</b>\n\n' +
        'Вы можете создать список участников, например для игр, работы или дежурств:\n' +
        '<code>/create_list dota Команда по Доте</code>\n\n' +
        'Затем созвать участников командой:\n' +
        '<code>/call dota Го катать!</code>'
    );
    return;
  }

  let text = '📋 <b>Пользовательские списки чата:</b>\n\n';
  for (const name of listNames) {
    const list = lists[name];
    const desc = list.description ? ` — <i>${escapeHtml(list.description)}</i>` : '';
    text += `• <b>${escapeHtml(name)}</b> (${list.member_ids.length} уч.)${desc}\n`;
    text += `  👉 Вызов: <code>/call ${escapeHtml(name)}</code>\n`;
  }

  text +=
    '\n<i>Управление:</i>\n' +
    '• <code>/create_list &lt;имя&gt; [описание]</code>\n' +
    '• <code>/add_to_list &lt;имя&gt;</code> (ответом на сообщение пользователя)\n' +
    '• <code>/remove_from_list &lt;имя&gt;</code>\n' +
    '• <code>/delete_list &lt;имя&gt;</code>';

  await client.sendMessage(chatId, text);
}

export async function handleCreateListCommand(
  client: TelegramClient,
  storage: StorageAdapter,
  message: TelegramMessage,
  argsText: string
): Promise<void> {
  const chatId = message.chat.id;
  const sender = message.from;
  if (!sender) return;

  const parts = argsText.trim().split(/\s+/);
  const rawName = parts[0]?.toLowerCase().replace(/^#/, '');

  if (!rawName) {
    await client.sendMessage(
      chatId,
      'ℹ️ Укажите название списка:\n' +
        '<code>/create_list dota Команда по Доте</code>'
    );
    return;
  }

  if (rawName.length > 32 || !/^[a-zA-Z0-9а-яА-ЯёЁ_-]+$/.test(rawName)) {
    await client.sendMessage(
      chatId,
      '❌ Имя списка должно содержать только буквы, цифры, дефис или подчеркивание (макс. 32 символа).'
    );
    return;
  }

  const existing = await storage.getList(chatId, rawName);
  if (existing) {
    await client.sendMessage(
      chatId,
      `⚠️ Список <b>${escapeHtml(rawName)}</b> уже существует.`
    );
    return;
  }

  const description = parts.slice(1).join(' ').trim() || undefined;

  const newList: CustomList = {
    name: rawName,
    description,
    created_by: sender.id,
    created_at: Date.now(),
    member_ids: [sender.id], // Creator added by default
  };

  await storage.saveList(chatId, newList);

  await client.sendMessage(
    chatId,
    `✅ Список <b>${escapeHtml(rawName)}</b> создан!\n\n` +
      `Вы добавлены в этот список. Чтобы добавить других участников, ответьте на их сообщение командой:\n` +
      `<code>/add_to_list ${escapeHtml(rawName)}</code>\n\n` +
      `Чтобы созвать список:\n` +
      `<code>/call ${escapeHtml(rawName)} [сообщение]</code>`
  );
}

export async function handleAddToListCommand(
  client: TelegramClient,
  storage: StorageAdapter,
  message: TelegramMessage,
  argsText: string
): Promise<void> {
  const chatId = message.chat.id;
  const parts = argsText.trim().split(/\s+/);
  const listName = parts[0]?.toLowerCase();

  if (!listName) {
    await client.sendMessage(
      chatId,
      'ℹ️ Укажите название списка:\n<code>/add_to_list &lt;имя_списка&gt;</code>'
    );
    return;
  }

  const list = await storage.getList(chatId, listName);
  if (!list) {
    await client.sendMessage(
      chatId,
      `❌ Список <b>${escapeHtml(listName)}</b> не найден.`
    );
    return;
  }

  // Determine target user
  let targetUser = message.reply_to_message?.from;
  if (!targetUser) {
    // If not a reply, add the caller themselves
    targetUser = message.from;
  }

  if (!targetUser) return;

  if (list.member_ids.includes(targetUser.id)) {
    await client.sendMessage(
      chatId,
      `ℹ️ Пользователь <b>${escapeHtml(targetUser.first_name)}</b> уже есть в списке <b>${escapeHtml(listName)}</b>.`
    );
    return;
  }

  // Upsert user into storage
  await storage.upsertUser(chatId, {
    id: targetUser.id,
    first_name: targetUser.first_name,
    last_name: targetUser.last_name,
    username: targetUser.username,
    opted_out: false,
    updated_at: Date.now(),
  });

  list.member_ids.push(targetUser.id);
  await storage.saveList(chatId, list);

  await client.sendMessage(
    chatId,
    `✅ Пользователь <b>${escapeHtml(targetUser.first_name)}</b> добавлен в список <b>${escapeHtml(listName)}</b>! (всего: ${list.member_ids.length})`
  );
}

export async function handleRemoveFromListCommand(
  client: TelegramClient,
  storage: StorageAdapter,
  message: TelegramMessage,
  argsText: string
): Promise<void> {
  const chatId = message.chat.id;
  const parts = argsText.trim().split(/\s+/);
  const listName = parts[0]?.toLowerCase();

  if (!listName) {
    await client.sendMessage(
      chatId,
      'ℹ️ Укажите название списка:\n<code>/remove_from_list &lt;имя_списка&gt;</code>'
    );
    return;
  }

  const list = await storage.getList(chatId, listName);
  if (!list) {
    await client.sendMessage(
      chatId,
      `❌ Список <b>${escapeHtml(listName)}</b> не найден.`
    );
    return;
  }

  let targetUser = message.reply_to_message?.from || message.from;
  if (!targetUser) return;

  const idx = list.member_ids.indexOf(targetUser.id);
  if (idx === -1) {
    await client.sendMessage(
      chatId,
      `ℹ️ Пользователя <b>${escapeHtml(targetUser.first_name)}</b> нет в списке <b>${escapeHtml(listName)}</b>.`
    );
    return;
  }

  list.member_ids.splice(idx, 1);
  await storage.saveList(chatId, list);

  await client.sendMessage(
    chatId,
    `✅ Пользователь <b>${escapeHtml(targetUser.first_name)}</b> удален из списка <b>${escapeHtml(listName)}</b>.`
  );
}

export async function handleDeleteListCommand(
  client: TelegramClient,
  storage: StorageAdapter,
  message: TelegramMessage,
  argsText: string
): Promise<void> {
  const chatId = message.chat.id;
  const listName = argsText.trim().toLowerCase();
  const sender = message.from;
  if (!sender) return;

  if (!listName) {
    await client.sendMessage(
      chatId,
      'ℹ️ Укажите название списка для удаления:\n<code>/delete_list &lt;имя_списка&gt;</code>'
    );
    return;
  }

  const list = await storage.getList(chatId, listName);
  if (!list) {
    await client.sendMessage(
      chatId,
      `❌ Список <b>${escapeHtml(listName)}</b> не найден.`
    );
    return;
  }

  // Check permissions: creator or chat admin
  let isAllowed = list.created_by === sender.id;
  if (!isAllowed) {
    try {
      const member = await client.getChatMember(chatId, sender.id);
      isAllowed = member.status === 'creator' || member.status === 'administrator';
    } catch {
      isAllowed = false;
    }
  }

  if (!isAllowed) {
    await client.sendMessage(
      chatId,
      '🔒 Удалить список может только его создатель или администратор чата.'
    );
    return;
  }

  await storage.deleteList(chatId, listName);
  await client.sendMessage(
    chatId,
    `🗑️ Список <b>${escapeHtml(listName)}</b> успешно удален.`
  );
}

export async function handleCallListCommand(
  client: TelegramClient,
  storage: StorageAdapter,
  message: TelegramMessage,
  argsText: string,
  addBackgroundTask?: (promise: Promise<any>) => void
): Promise<void> {
  const chatId = message.chat.id;
  const parts = argsText.trim().split(/\s+/);
  const listName = parts[0]?.toLowerCase();
  const customMessage = parts.slice(1).join(' ').trim();

  if (!listName) {
    await client.sendMessage(
      chatId,
      'ℹ️ Укажите имя списка для вызова:\n<code>/call &lt;имя_списка&gt; [сообщение]</code>'
    );
    return;
  }

  const list = await storage.getList(chatId, listName);
  if (!list) {
    await client.sendMessage(
      chatId,
      `❌ Список <b>${escapeHtml(listName)}</b> не найден. Посмотреть список: /lists`
    );
    return;
  }

  if (list.member_ids.length === 0) {
    await client.sendMessage(
      chatId,
      `ℹ️ В списке <b>${escapeHtml(listName)}</b> нет участников.`
    );
    return;
  }

  // Fetch users for list members
  const users: UserRecord[] = [];
  for (const uid of list.member_ids) {
    const u = await storage.getUser(chatId, uid);
    if (u) {
      users.push(u);
    } else {
      users.push({
        id: uid,
        first_name: `Участник ${uid}`,
        opted_out: false,
        updated_at: Date.now(),
      });
    }
  }

  const settings = await storage.getSettings(chatId);
  const chunkSize = settings.chunk_size || 5;
  const chunks = chunkArray(users, chunkSize);

  const prefix = customMessage
    ? `📋 [${escapeHtml(list.name)}] <b>${escapeHtml(customMessage)}</b>`
    : `📋 Вызов списка <b>${escapeHtml(list.name)}</b>!`;

  const firstText = formatBatchMentions(chunks[0], settings.tag_mode, prefix);
  await client.sendMessage(chatId, firstText);

  if (chunks.length > 1) {
    const sendRemaining = async () => {
      for (let i = 1; i < chunks.length; i++) {
        await sleep(1000);
        const text = formatBatchMentions(chunks[i], settings.tag_mode);
        try {
          await client.sendMessage(chatId, text);
        } catch (err) {
          console.error(`Error tagging list batch ${i}:`, err);
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
