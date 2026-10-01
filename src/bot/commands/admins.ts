import { TelegramClient } from '../../telegram/client.js';
import { TelegramMessage } from '../../telegram/types.js';
import { StorageAdapter } from '../../storage/adapter.js';
import { UserRecord } from '../../types.js';
import { chunkArray, formatBatchMentions, sleep, escapeHtml, createMention } from '../../telegram/helpers.js';

export async function handleAdminsCommand(
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
      'Команда <b>/admins</b> работает только в группах.'
    );
    return;
  }

  let admins;
  try {
    admins = await client.getChatAdministrators(chatId);
  } catch (err: any) {
    await client.sendMessage(
      chatId,
      'Не удалось получить список администраторов. Убедитесь, что бот добавлен в группу и имеет права читать сообщения.'
    );
    return;
  }

  // Filter out bots
  const humanAdmins = admins.filter((a) => !a.user.is_bot);

  if (humanAdmins.length === 0) {
    await client.sendMessage(chatId, 'В этом чате нет активных администраторов-людей.');
    return;
  }

  // Convert to UserRecords and seed them into storage
  const adminRecords: UserRecord[] = humanAdmins.map((a) => ({
    id: a.user.id,
    first_name: a.user.first_name,
    last_name: a.user.last_name,
    username: a.user.username,
    opted_out: false,
    updated_at: Date.now(),
  }));

  // Background upsert to storage
  const seedAdmins = async () => {
    for (const record of adminRecords) {
      await storage.upsertUser(chatId, record);
    }
  };
  if (addBackgroundTask) {
    addBackgroundTask(seedAdmins());
  } else {
    seedAdmins().catch(() => {});
  }

  const settings = await storage.getSettings(chatId);
  const chunkSize = settings.chunk_size || 5;
  const chunks = chunkArray(adminRecords, chunkSize);

  const formatAdminBatch = (batch: UserRecord[], customMsg?: string, isFirst: boolean = true) => {
    if (settings.tag_mode === 'hidden') {
      const links = batch.map((u) => `<a href="tg://user?id=${u.id}">&#8203;</a>`).join('');
      if (isFirst) {
        const body = customMsg?.trim()
          ? escapeHtml(customMsg.trim())
          : 'Вызов администраторов';
        return `${body}${links}`;
      }
      return links ? `.${links}` : '.';
    }

    const mentions = batch.map((u) => createMention(u, settings.tag_mode)).join(', ');
    if (isFirst && customMsg?.trim()) {
      return `${escapeHtml(customMsg.trim())}\n\n${mentions}`;
    }
    return mentions;
  };

  const firstText = formatAdminBatch(chunks[0], argsText, true);
  await client.sendMessage(chatId, firstText);

  if (chunks.length > 1) {
    const sendRemaining = async () => {
      for (let i = 1; i < chunks.length; i++) {
        await sleep(1000);
        const text = formatAdminBatch(chunks[i], undefined, false);
        try {
          await client.sendMessage(chatId, text);
        } catch (err) {
          console.error(`Error tagging admin batch ${i}:`, err);
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
