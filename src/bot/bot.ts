import { TelegramClient } from '../telegram/client.js';
import { TelegramMessage, TelegramUpdate } from '../telegram/types.js';
import { StorageAdapter } from '../storage/adapter.js';
import { handleAllCommand } from './commands/all.js';
import { handleAdminsCommand } from './commands/admins.js';
import {
  handleMeCommand,
  handleOptInCommand,
  handleOptOutCommand,
  handleSetMeCommand,
} from './commands/user.js';
import {
  handleAddToListCommand,
  handleCallListCommand,
  handleCreateListCommand,
  handleDeleteListCommand,
  handleListsCommand,
  handleRemoveFromListCommand,
} from './commands/lists.js';
import {
  handleSettingsCallback,
  handleSettingsCommand,
} from './commands/settings.js';
import { handleStatsCommand } from './commands/stats.js';
import { handleHelpCommand, handleStartCommand } from './commands/help.js';

export class ZazyvalaBot {
  constructor(
    private readonly client: TelegramClient,
    private readonly storage: StorageAdapter
  ) { }

  /**
   * Process an incoming Telegram update
   */
  async processUpdate(
    update: TelegramUpdate,
    addBackgroundTask?: (promise: Promise<any>) => void
  ): Promise<void> {
    // 1. Handle Callback Queries (inline button clicks)
    if (update.callback_query) {
      const q = update.callback_query;
      if (q.data?.startsWith('cfg:')) {
        await handleSettingsCallback(this.client, this.storage, q);
      }
      return;
    }

    // 2. Handle Bot Added to Group (my_chat_member event)
    if (update.my_chat_member) {
      const ev = update.my_chat_member;
      const isGroup =
        ev.chat.type === 'group' || ev.chat.type === 'supergroup';
      const isJoined =
        (ev.new_chat_member.status === 'member' ||
          ev.new_chat_member.status === 'administrator') &&
        (ev.old_chat_member.status === 'left' ||
          ev.old_chat_member.status === 'kicked');

      if (isGroup && isJoined) {
        await this.sendGroupWelcome(ev.chat.id);
      }
      return;
    }

    // 3. Handle Chat Member Updates (any user joined, left, kicked, etc.)
    if (update.chat_member) {
      const ev = update.chat_member;
      const isGroup = ev.chat.type === 'group' || ev.chat.type === 'supergroup';
      if (isGroup && !ev.new_chat_member.user.is_bot) {
        const status = ev.new_chat_member.status;
        if (status === 'member' || status === 'administrator' || status === 'restricted') {
          await this.storage.upsertUser(ev.chat.id, {
            id: ev.new_chat_member.user.id,
            first_name: ev.new_chat_member.user.first_name,
            last_name: ev.new_chat_member.user.last_name,
            username: ev.new_chat_member.user.username,
            opted_out: false,
            updated_at: Date.now(),
          });
        } else if (status === 'left' || status === 'kicked') {
          await this.storage.removeUser(ev.chat.id, ev.new_chat_member.user.id);
        }
      }
      return;
    }

    // 4. Handle Messages
    const message: TelegramMessage | undefined =
      update.message || update.edited_message;
    if (!message) return;

    const chatId = message.chat.id;
    const isGroup =
      message.chat.type === 'group' || message.chat.type === 'supergroup';

    // If bot was added via new_chat_members in group
    if (isGroup && message.new_chat_members && message.new_chat_members.length > 0) {
      const botAdded = message.new_chat_members.some((m) => m.is_bot);
      if (botAdded) {
        // Send welcoming message with commands
        await this.sendGroupWelcome(chatId);
      }
    }

    // Passive Activity Tracking for Group Chats
    if (isGroup) {
      this.trackActivity(chatId, message, addBackgroundTask);
    }

    const text = (message.text || message.caption || '').trim();
    if (!text) return;

    // Parse command
    const { command, args } = this.parseCommand(text);
    if (!command) return;

    // Dispatch Command
    switch (command) {
      case 'all':
      case 'tag':
      case 'everyone':
      case 'созыв':
        await handleAllCommand(
          this.client,
          this.storage,
          message,
          args,
          addBackgroundTask
        );
        break;

      case 'admins':
      case 'admin':
      case 'админы':
        await handleAdminsCommand(
          this.client,
          this.storage,
          message,
          args,
          addBackgroundTask
        );
        break;

      case 'setme':
      case 'callsign':
      case 'позывной':
        await handleSetMeCommand(this.client, this.storage, message, args);
        break;

      case 'out':
      case 'optout':
      case 'leave':
      case 'отписаться':
        await handleOptOutCommand(this.client, this.storage, message);
        break;

      case 'in':
      case 'optin':
      case 'join':
      case 'подписаться':
        await handleOptInCommand(this.client, this.storage, message);
        break;

      case 'me':
      case 'профиль':
        await handleMeCommand(this.client, this.storage, message);
        break;

      case 'lists':
      case 'списки':
        await handleListsCommand(this.client, this.storage, message);
        break;

      case 'create_list':
      case 'createlist':
        await handleCreateListCommand(this.client, this.storage, message, args);
        break;

      case 'add_to_list':
      case 'addtolist':
        await handleAddToListCommand(this.client, this.storage, message, args);
        break;

      case 'remove_from_list':
      case 'removefromlist':
        await handleRemoveFromListCommand(
          this.client,
          this.storage,
          message,
          args
        );
        break;

      case 'delete_list':
      case 'deletelist':
        await handleDeleteListCommand(this.client, this.storage, message, args);
        break;

      case 'call':
      case 'tag_list':
        await handleCallListCommand(
          this.client,
          this.storage,
          message,
          args,
          addBackgroundTask
        );
        break;

      case 'settings':
      case 'config':
      case 'настройки':
        await handleSettingsCommand(this.client, this.storage, message);
        break;

      case 'stats':
      case 'info':
      case 'стата':
        await handleStatsCommand(this.client, this.storage, message);
        break;

      case 'start':
        await handleStartCommand(this.client, message);
        break;

      case 'help':
      case 'помощь':
        await handleHelpCommand(this.client, message);
        break;

      default:
        break;
    }
  }

  /**
   * Tracks user interaction passively
   */
  private trackActivity(
    chatId: number,
    message: TelegramMessage,
    addBackgroundTask?: (promise: Promise<any>) => void
  ): void {
    const doTrack = async () => {
      // 1. Regular sender
      if (message.from && !message.from.is_bot) {
        await this.storage.upsertUser(chatId, {
          id: message.from.id,
          first_name: message.from.first_name,
          last_name: message.from.last_name,
          username: message.from.username,
          opted_out: false,
          updated_at: Date.now(),
        });
      }

      // 2. New chat members
      if (message.new_chat_members && message.new_chat_members.length > 0) {
        for (const m of message.new_chat_members) {
          if (!m.is_bot) {
            await this.storage.upsertUser(chatId, {
              id: m.id,
              first_name: m.first_name,
              last_name: m.last_name,
              username: m.username,
              opted_out: false,
              updated_at: Date.now(),
            });
          }
        }
      }

      // 3. Member left
      if (message.left_chat_member) {
        await this.storage.removeUser(chatId, message.left_chat_member.id);
      }
    };

    if (addBackgroundTask) {
      addBackgroundTask(doTrack().catch((err) => console.error('Tracking error:', err)));
    } else {
      doTrack().catch((err) => console.error('Tracking error:', err));
    }
  }

  /**
   * Parses commands from text (supports /cmd, /cmd@bot, @all, @everyone, @admin)
   */
  private parseCommand(text: string): { command: string | null; args: string } {
    // Check @all, @everyone, @admin
    if (/^@all(\s|$)/i.test(text)) {
      return { command: 'all', args: text.replace(/^@all\s*/i, '') };
    }
    if (/^@everyone(\s|$)/i.test(text)) {
      return { command: 'all', args: text.replace(/^@everyone\s*/i, '') };
    }
    if (/^@admin(\s|$)/i.test(text)) {
      return { command: 'admins', args: text.replace(/^@admin\s*/i, '') };
    }

    if (!text.startsWith('/')) {
      return { command: null, args: '' };
    }

    const firstSpace = text.indexOf(' ');
    const cmdPart = firstSpace === -1 ? text : text.substring(0, firstSpace);
    const args = firstSpace === -1 ? '' : text.substring(firstSpace + 1).trim();

    // Remove leading slash and optional @bot_username
    const cleanCmd = cmdPart.substring(1).split('@')[0].toLowerCase();

    return { command: cleanCmd, args };
  }

  /**
   * Sends introductory greeting and commands menu when bot joins a group
   */
  async sendGroupWelcome(chatId: number): Promise<void> {
    const text =
      '<b>Бот Зазывала подключен.</b>\n\n' +
      'Команды:\n' +
      '• <code>/all [сообщение]</code> — созвать всех участников\n' +
      '• <code>/admins [сообщение]</code> — созвать администраторов\n' +
      '• <code>/setme &lt;позывной&gt;</code> — задать личный позывной\n' +
      '• <code>/out</code> и <code>/in</code> — отключить/включить вызовы /all\n' +
      '• <code>/settings</code> — настройки чата\n' +
      '• <code>/help</code> — полная справка\n\n' +
      '<i>Участники автоматически добавляются в базу при отправке сообщений в чат.</i>';

    try {
      await this.client.sendMessage(chatId, text);
    } catch (err) {
      console.error('Failed to send group welcome:', err);
    }
  }
}

