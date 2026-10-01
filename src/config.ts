export interface BotConfig {
  botToken: string;
  telegramSecretToken?: string;
  appUrl?: string;
  upstashRedisRestUrl?: string;
  upstashRedisRestToken?: string;
  defaultCooldownSeconds: number;
  defaultChunkSize: number;
  defaultPermissions: 'everyone' | 'admins';
  defaultTagMode: 'text' | 'hidden' | 'callsign';
}

export function getConfig(): BotConfig {
  const botToken = process.env.BOT_TOKEN || '';
  const upstashRedisRestUrl =
    process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const upstashRedisRestToken =
    process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

  return {
    botToken,
    telegramSecretToken: process.env.TELEGRAM_SECRET_TOKEN,
    appUrl: process.env.APP_URL?.replace(/\/+$/, ''),
    upstashRedisRestUrl,
    upstashRedisRestToken,
    defaultCooldownSeconds: parseInt(
      process.env.DEFAULT_COOLDOWN_SECONDS || '60',
      10
    ),
    defaultChunkSize: parseInt(process.env.DEFAULT_CHUNK_SIZE || '5', 10),
    defaultPermissions:
      process.env.DEFAULT_PERMISSIONS === 'admins' ? 'admins' : 'everyone',
    defaultTagMode:
      (process.env.DEFAULT_TAG_MODE as 'text' | 'hidden' | 'callsign') || 'hidden',
  };
}
