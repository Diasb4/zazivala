import { TelegramClient } from '../../telegram/client.js';
import { TelegramMessage } from '../../telegram/types.js';

export async function handleStartCommand(
  client: TelegramClient,
  message: TelegramMessage
): Promise<void> {
  const chatId = message.chat.id;
  const isPrivate = message.chat.type === 'private';

  if (isPrivate) {
    const me = await client.getMe().catch(() => null);
    const botUsername = me?.username || 'ZazyvalaBot';

    const text =
      'Бот для вызова участников группы.\n\n' +
      'Команды:\n' +
      '• /all [сообщение] - созвать всех\n' +
      '• /admins [сообщение] - созвать админов\n' +
      '• /call <список> - созвать список\n' +
      '• /setme <позывной> - задать позывной\n' +
      '• /out и /in - отключить/включить вызовы\n' +
      '• /settings - настройки\n\n' +
      'Добавьте бота в группу для начала работы:';

    await client.sendMessage(chatId, text, {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: 'Добавить в группу',
              url: `https://t.me/${botUsername}?startgroup=true`,
            },
          ],
        ],
      },
    });
    return;
  }

  await client.sendMessage(
    chatId,
    'Бот подключен.\n' +
      '• Вызов всех: /all [сообщение]\n' +
      '• Вызов админов: /admins [сообщение]\n' +
      '• Настройки: /settings\n' +
      '• Справка: /help'
  );
}

export async function handleHelpCommand(
  client: TelegramClient,
  message: TelegramMessage
): Promise<void> {
  const chatId = message.chat.id;

  const text =
    '<b>Команды бота:</b>\n\n' +
    'Вызов:\n' +
    '• <code>/all [сообщение]</code> - созвать всех участников\n' +
    '• <code>/admins [сообщение]</code> - созвать админов\n' +
    '• <code>/call &lt;список&gt;</code> - созвать список\n\n' +
    'Профиль:\n' +
    '• <code>/setme &lt;позывной&gt;</code> - задать позывной\n' +
    '• <code>/out</code> и <code>/in</code> - отключить/включить вызовы\n' +
    '• <code>/me</code> - статус профиля\n\n' +
    'Списки:\n' +
    '• <code>/lists</code> - просмотр списков\n' +
    '• <code>/create_list &lt;имя&gt;</code> - создать список\n' +
    '• <code>/add_to_list &lt;имя&gt;</code> - добавить в список\n' +
    '• <code>/remove_from_list &lt;имя&gt;</code> - удалить из списка\n' +
    '• <code>/delete_list &lt;имя&gt;</code> - удалить список\n\n' +
    'Управление:\n' +
    '• <code>/settings</code> - настройки (режим, кулдаун, права)\n' +
    '• <code>/stats</code> - статистика';

  await client.sendMessage(chatId, text);
}
