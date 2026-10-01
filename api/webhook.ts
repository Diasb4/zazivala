import type { VercelRequest, VercelResponse } from '@vercel/node';
import { waitUntil } from '@vercel/functions';
import { getConfig } from '../src/config.js';
import { TelegramClient } from '../src/telegram/client.js';
import { getStorage } from '../src/storage/index.js';
import { ZazyvalaBot } from '../src/bot/bot.js';
import { TelegramUpdate } from '../src/telegram/types.js';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  // Only accept POST requests from Telegram
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Only POST is accepted.' });
  }

  const config = getConfig();

  // Validate bot token
  if (!config.botToken) {
    console.error('Missing BOT_TOKEN in environment variables');
    return res.status(500).json({ error: 'BOT_TOKEN is not configured.' });
  }

  // Security check: Telegram Secret Token verification
  if (config.telegramSecretToken) {
    const receivedSecret = req.headers['x-telegram-bot-api-secret-token'];
    if (receivedSecret !== config.telegramSecretToken) {
      console.warn('Unauthorized webhook request: secret token mismatch');
      return res.status(401).json({ error: 'Unauthorized. Invalid secret token.' });
    }
  }

  const update = req.body as TelegramUpdate;
  if (!update || !update.update_id) {
    return res.status(400).json({ error: 'Bad request: invalid update payload.' });
  }

  try {
    const client = new TelegramClient(config.botToken);
    const storage = getStorage();
    const bot = new ZazyvalaBot(client, storage);

    const backgroundTasks: Promise<any>[] = [];
    const addBackgroundTask = (task: Promise<any>) => {
      backgroundTasks.push(task);
    };

    // Process update
    await bot.processUpdate(update, addBackgroundTask);

    // If there are background tasks (e.g. sending remaining batches of /all tags),
    // register them with Vercel's waitUntil so the response returns to Telegram immediately!
    if (backgroundTasks.length > 0) {
      waitUntil(
        Promise.all(backgroundTasks).catch((err) => {
          console.error('Error executing background tasks in waitUntil:', err);
        })
      );
    }

    // Immediately respond 200 OK to Telegram
    return res.status(200).json({ ok: true });
  } catch (err: any) {
    console.error('Unhandled error processing update:', err);
    // Even on error, return 200 to Telegram so it doesn't repeatedly retry failing updates
    return res.status(200).json({ ok: false, error: err.message });
  }
}
