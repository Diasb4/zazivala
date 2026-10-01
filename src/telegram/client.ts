import {
  TelegramChatMember,
  TelegramInlineKeyboardMarkup,
  TelegramMessage,
  TelegramUser,
  TelegramWebhookInfo,
} from './types.js';

export interface SendMessageOptions {
  parse_mode?: 'HTML' | 'Markdown' | 'MarkdownV2';
  disable_web_page_preview?: boolean;
  reply_to_message_id?: number;
  reply_markup?: TelegramInlineKeyboardMarkup;
}

export class TelegramClient {
  private readonly baseUrl: string;

  constructor(private readonly token: string) {
    if (!token) {
      throw new Error('Telegram BOT_TOKEN is required');
    }
    this.baseUrl = `https://api.telegram.org/bot${token}`;
  }

  /**
   * Universal fetch wrapper with automatic retry on 429 (Flood limit)
   */
  private async request<T>(method: string, payload?: Record<string, any>): Promise<T> {
    const url = `${this.baseUrl}/${method}`;
    const options: RequestInit = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: payload ? JSON.stringify(payload) : undefined,
    };

    let retries = 2;
    while (retries >= 0) {
      try {
        const response = await fetch(url, options);
        const data = (await response.json()) as {
          ok: boolean;
          result: T;
          description?: string;
          error_code?: number;
          parameters?: { retry_after?: number };
        };

        if (response.ok && data.ok) {
          return data.result;
        }

        // Handle Telegram 429 Too Many Requests
        if (response.status === 429 && data.parameters?.retry_after && retries > 0) {
          const waitTime = Math.min(data.parameters.retry_after, 3); // don't wait >3s on serverless
          await new Promise((r) => setTimeout(r, waitTime * 1000));
          retries--;
          continue;
        }

        throw new Error(
          `Telegram API error [${method}]: ${data.description || 'Unknown error'} (${data.error_code || response.status})`
        );
      } catch (err: any) {
        if (retries <= 0) throw err;
        retries--;
      }
    }

    throw new Error(`Telegram API request failed after retries: ${method}`);
  }

  async getMe(): Promise<TelegramUser> {
    return this.request<TelegramUser>('getMe');
  }

  async sendMessage(
    chatId: number | string,
    text: string,
    options?: SendMessageOptions
  ): Promise<TelegramMessage> {
    return this.request<TelegramMessage>('sendMessage', {
      chat_id: chatId,
      text,
      parse_mode: options?.parse_mode || 'HTML',
      disable_web_page_preview: options?.disable_web_page_preview ?? true,
      reply_to_message_id: options?.reply_to_message_id,
      reply_markup: options?.reply_markup,
    });
  }

  async editMessageText(
    chatId: number | string,
    messageId: number,
    text: string,
    options?: SendMessageOptions
  ): Promise<TelegramMessage | boolean> {
    return this.request<TelegramMessage | boolean>('editMessageText', {
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: options?.parse_mode || 'HTML',
      disable_web_page_preview: options?.disable_web_page_preview ?? true,
      reply_markup: options?.reply_markup,
    });
  }

  async answerCallbackQuery(
    callbackQueryId: string,
    text?: string,
    showAlert: boolean = false
  ): Promise<boolean> {
    return this.request<boolean>('answerCallbackQuery', {
      callback_query_id: callbackQueryId,
      text,
      show_alert: showAlert,
    });
  }

  async deleteMessage(chatId: number | string, messageId: number): Promise<boolean> {
    try {
      return await this.request<boolean>('deleteMessage', {
        chat_id: chatId,
        message_id: messageId,
      });
    } catch {
      return false; // Silently fail if message cannot be deleted
    }
  }

  async getChatAdministrators(chatId: number | string): Promise<TelegramChatMember[]> {
    return this.request<TelegramChatMember[]>('getChatAdministrators', {
      chat_id: chatId,
    });
  }

  async getChatMember(
    chatId: number | string,
    userId: number
  ): Promise<TelegramChatMember> {
    return this.request<TelegramChatMember>('getChatMember', {
      chat_id: chatId,
      user_id: userId,
    });
  }

  async setWebhook(
    url: string,
    secretToken?: string,
    allowedUpdates: string[] = ['message', 'callback_query', 'my_chat_member']
  ): Promise<boolean> {
    return this.request<boolean>('setWebhook', {
      url,
      secret_token: secretToken,
      allowed_updates: allowedUpdates,
      drop_pending_updates: false,
    });
  }

  async getWebhookInfo(): Promise<TelegramWebhookInfo> {
    return this.request<TelegramWebhookInfo>('getWebhookInfo');
  }

  async deleteWebhook(dropPendingUpdates: boolean = false): Promise<boolean> {
    return this.request<boolean>('deleteWebhook', {
      drop_pending_updates: dropPendingUpdates,
    });
  }
}
