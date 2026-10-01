import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getConfig } from '../src/config.js';
import { TelegramClient } from '../src/telegram/client.js';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  const config = getConfig();

  if (!config.botToken) {
    return res.status(500).json({
      ok: false,
      error: 'BOT_TOKEN is not configured in environment variables.',
    });
  }

  const client = new TelegramClient(config.botToken);

  try {
    const action = (req.query.action as string) || (req.method === 'POST' ? 'set' : 'info');

    // 1. Get bot info
    const me = await client.getMe();

    // 2. Determine target webhook URL
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const computedAppUrl = config.appUrl || `${proto}://${host}`;
    const webhookUrl = `${computedAppUrl}/api/webhook`;

    if (action === 'set') {
      const success = await client.setWebhook(
        webhookUrl,
        config.telegramSecretToken
      );
      const info = await client.getWebhookInfo();

      return res.status(200).json({
        ok: true,
        message: 'Webhook successfully configured!',
        bot: {
          id: me.id,
          username: me.username,
          first_name: me.first_name,
        },
        webhook: {
          url: webhookUrl,
          has_secret_token: !!config.telegramSecretToken,
          info,
          success,
        },
      });
    }

    if (action === 'delete') {
      const success = await client.deleteWebhook(false);
      return res.status(200).json({
        ok: true,
        message: 'Webhook deleted.',
        success,
      });
    }

    // Default: Return current webhook info
    const info = await client.getWebhookInfo();
    return res.status(200).json({
      ok: true,
      bot: {
        id: me.id,
        username: me.username,
        first_name: me.first_name,
      },
      webhook_info: info,
      computed_webhook_url: webhookUrl,
      instructions:
        'To automatically register the webhook, visit this URL with ?action=set or send POST /api/setup',
    });
  } catch (err: any) {
    console.error('Setup endpoint error:', err);
    return res.status(500).json({
      ok: false,
      error: err.message,
    });
  }
}
