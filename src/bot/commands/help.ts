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
      '👋 <b>Привет! Я Зазывала (Tag Bot)</b> — сверхбыстрый бот для созыва участников группы!\n\n' +
      '🚀 <b>Что я умею:</b>\n' +
      '• <b>/all [текст]</b> — созвать всех участников чата\n' +
      '• <b>/admins [текст]</b> — созвать администраторов\n' +
      '• <b>/call &lt;список&gt;</b> — созвать группу по интересам (игры, отдел, дежурные)\n' +
      '• <b>/setme &lt;позывной&gt;</b> — задать себе никнейм или эмодзи для вызова\n' +
      '• <b>/out</b> и <b>/in</b> — отписаться или подписаться на уведомления\n' +
      '• <b>/settings</b> — настроить режим (обычный/скрытый), кулдаун и права\n\n' +
      '⚡ <i>Бот оптимизирован для Vercel Serverless с молниеносным откликом!</i>\n\n' +
      'Добавьте меня в вашу группу и выдайте права администратора, чтобы начать:';

    await client.sendMessage(chatId, text, {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: '➕ Добавить в группу',
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
    '👋 <b>Зазывала готов к работе в этом чате!</b>\n\n' +
      '• Чтобы созвать всех, напишите <code>/all [сообщение]</code>\n' +
      '• Чтобы созвать только админов: <code>/admins [сообщение]</code>\n' +
      '• Настройки чата: <code>/settings</code>\n' +
      '• Полный список команд: <code>/help</code>\n\n' +
      '💡 <i>Telegram Bot API не передает ботам список участников сразу. ' +
      'Бот автоматически запоминает участников, когда они общаются в чате!</i>'
  );
}

export async function handleHelpCommand(
  client: TelegramClient,
  message: TelegramMessage
): Promise<void> {
  const chatId = message.chat.id;

  const text =
    '📖 <b>Справка по командам Зазывалы:</b>\n\n' +
    '📢 <b>Вызов участников:</b>\n' +
    '• <code>/all [текст]</code> или <code>/tag</code> — созвать всех активных участников чата\n' +
    '• <code>/admins [текст]</code> — созвать всех администраторов\n' +
    '• <code>/call &lt;список&gt; [текст]</code> — созвать определенный список\n\n' +
    '👤 <b>Личные настройки:</b>\n' +
    '• <code>/setme &lt;позывной&gt;</code> — установить персональный позывной (например <code>/setme ⚡ Тор</code>)\n' +
    '• <code>/out</code> или <code>/optout</code> — исключить себя из вызовов /all (бот уважает ваш покой)\n' +
    '• <code>/in</code> или <code>/optin</code> — включить вызовы обратно\n' +
    '• <code>/me</code> — проверить свой профиль и позывной\n\n' +
    '📋 <b>Списки участников:</b>\n' +
    '• <code>/lists</code> — список всех созданных групп в чате\n' +
    '• <code>/create_list &lt;имя&gt;</code> — создать новый список\n' +
    '• <code>/add_to_list &lt;имя&gt;</code> — добавить пользователя (ответом на его сообщение)\n' +
    '• <code>/remove_from_list &lt;имя&gt;</code> — удалить пользователя из списка\n' +
    '• <code>/delete_list &lt;имя&gt;</code> — удалить список целиком\n\n' +
    '⚙️ <b>Управление группой (для админов):</b>\n' +
    '• <code>/settings</code> — интерактивное меню настроек (режим, кулдаун, права)\n' +
    '• <code>/stats</code> — статистика чата и базы бота\n\n' +
    '👻 <b>Режим «Скрытый» в /settings:</b>\n' +
    'При включении скрытого режима бот отправляет вызовы через невидимые zero-width ссылки. ' +
    'Участники получают push-уведомление с упоминанием, а в чате виден только ваш чистый текст!';

  await client.sendMessage(chatId, text);
}
