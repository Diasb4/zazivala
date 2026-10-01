import { Redis } from '@upstash/redis';
import { StorageAdapter } from './adapter.js';
import { ChatSettings, CustomList, UserRecord, ChatStats } from '../types.js';
import { getConfig } from '../config.js';

export class UpstashRedisStorage implements StorageAdapter {
  private redis: Redis;

  constructor(url?: string, token?: string) {
    const config = getConfig();
    const redisUrl = url || config.upstashRedisRestUrl;
    const redisToken = token || config.upstashRedisRestToken;

    if (!redisUrl || !redisToken) {
      throw new Error(
        'Upstash Redis URL and Token are required to initialize UpstashRedisStorage'
      );
    }

    this.redis = new Redis({
      url: redisUrl,
      token: redisToken,
    });
  }

  private keyMembers(chatId: number): string {
    return `zazyvala:chat:${chatId}:members`;
  }

  private keyUser(chatId: number, userId: number): string {
    return `zazyvala:chat:${chatId}:user:${userId}`;
  }

  private keySettings(chatId: number): string {
    return `zazyvala:chat:${chatId}:settings`;
  }

  private keyCooldown(chatId: number): string {
    return `zazyvala:chat:${chatId}:cooldown`;
  }

  private keyLists(chatId: number): string {
    return `zazyvala:chat:${chatId}:lists`;
  }

  async upsertUser(chatId: number, user: UserRecord): Promise<void> {
    const userKey = this.keyUser(chatId, user.id);
    const existing = (await this.redis.get<UserRecord>(userKey)) || null;

    const merged: UserRecord = {
      ...existing,
      ...user,
      callsign: user.callsign ?? existing?.callsign,
      opted_out: existing ? existing.opted_out : (user.opted_out ?? false),
      updated_at: Date.now(),
    };

    const pipe = this.redis.pipeline();
    pipe.sadd(this.keyMembers(chatId), user.id);
    pipe.set(userKey, merged);
    await pipe.exec();
  }

  async getUsers(
    chatId: number,
    options?: { includeOptedOut?: boolean }
  ): Promise<UserRecord[]> {
    const memberIds = await this.redis.smembers<number[]>(this.keyMembers(chatId));
    if (!memberIds || memberIds.length === 0) {
      return [];
    }

    // High performance batch retrieval in ONE single HTTP call via pipeline
    const pipe = this.redis.pipeline();
    for (const uid of memberIds) {
      pipe.get<UserRecord>(this.keyUser(chatId, uid));
    }

    const results = await pipe.exec<UserRecord[]>();
    const users: UserRecord[] = [];

    for (const u of results) {
      if (!u) continue;
      if (options?.includeOptedOut) {
        users.push(u);
      } else if (!u.opted_out && !u.is_bot) {
        users.push(u);
      }
    }

    return users;
  }

  async getUser(chatId: number, userId: number): Promise<UserRecord | null> {
    return await this.redis.get<UserRecord>(this.keyUser(chatId, userId));
  }

  async removeUser(chatId: number, userId: number): Promise<void> {
    const pipe = this.redis.pipeline();
    pipe.srem(this.keyMembers(chatId), userId);
    pipe.del(this.keyUser(chatId, userId));
    await pipe.exec();
  }

  async setOptOut(
    chatId: number,
    userId: number,
    optedOut: boolean
  ): Promise<boolean> {
    const userKey = this.keyUser(chatId, userId);
    const user = await this.redis.get<UserRecord>(userKey);
    if (user) {
      user.opted_out = optedOut;
      user.updated_at = Date.now();
      await this.redis.set(userKey, user);
      return true;
    }

    // If user not tracked yet, store placeholder
    const placeholder: UserRecord = {
      id: userId,
      first_name: `User ${userId}`,
      opted_out: optedOut,
      updated_at: Date.now(),
    };
    const pipe = this.redis.pipeline();
    pipe.sadd(this.keyMembers(chatId), userId);
    pipe.set(userKey, placeholder);
    await pipe.exec();
    return true;
  }

  async setUserCallsign(
    chatId: number,
    userId: number,
    callsign: string | null
  ): Promise<boolean> {
    const userKey = this.keyUser(chatId, userId);
    const user = await this.redis.get<UserRecord>(userKey);
    if (user) {
      user.callsign = callsign ? callsign.trim() : undefined;
      user.updated_at = Date.now();
      await this.redis.set(userKey, user);
      return true;
    }
    return false;
  }

  async getSettings(chatId: number): Promise<ChatSettings> {
    const settings = await this.redis.get<ChatSettings>(this.keySettings(chatId));
    if (settings) {
      return settings;
    }

    const config = getConfig();
    const defaultSettings: ChatSettings = {
      cooldown_seconds: config.defaultCooldownSeconds,
      chunk_size: config.defaultChunkSize,
      tag_mode: config.defaultTagMode,
      permissions: config.defaultPermissions,
      delete_trigger: false,
      last_tag_timestamp: 0,
    };
    await this.redis.set(this.keySettings(chatId), defaultSettings);
    return defaultSettings;
  }

  async updateSettings(
    chatId: number,
    partial: Partial<ChatSettings>
  ): Promise<ChatSettings> {
    const current = await this.getSettings(chatId);
    const updated: ChatSettings = {
      ...current,
      ...partial,
    };
    await this.redis.set(this.keySettings(chatId), updated);
    return updated;
  }

  async getCooldownRemaining(
    chatId: number,
    _cooldownSeconds: number
  ): Promise<number> {
    const ttl = await this.redis.ttl(this.keyCooldown(chatId));
    return ttl > 0 ? ttl : 0;
  }

  async setLastTagTimestamp(chatId: number): Promise<void> {
    const settings = await this.getSettings(chatId);
    const now = Math.floor(Date.now() / 1000);
    const pipe = this.redis.pipeline();
    pipe.set(
      this.keySettings(chatId),
      { ...settings, last_tag_timestamp: now }
    );
    if (settings.cooldown_seconds > 0) {
      pipe.set(this.keyCooldown(chatId), '1', {
        ex: settings.cooldown_seconds,
      });
    }
    await pipe.exec();
  }

  async getLists(chatId: number): Promise<Record<string, CustomList>> {
    const lists = await this.redis.hgetall<Record<string, CustomList>>(
      this.keyLists(chatId)
    );
    return lists || {};
  }

  async getList(chatId: number, listName: string): Promise<CustomList | null> {
    const list = await this.redis.hget<CustomList>(
      this.keyLists(chatId),
      listName.toLowerCase()
    );
    return list || null;
  }

  async saveList(chatId: number, list: CustomList): Promise<void> {
    await this.redis.hset(this.keyLists(chatId), {
      [list.name.toLowerCase()]: list,
    });
  }

  async deleteList(chatId: number, listName: string): Promise<boolean> {
    const deleted = await this.redis.hdel(
      this.keyLists(chatId),
      listName.toLowerCase()
    );
    return deleted > 0;
  }

  async getStats(chatId: number): Promise<ChatStats> {
    const users = await this.getUsers(chatId, { includeOptedOut: true });
    const settings = await this.getSettings(chatId);
    const cooldownRemaining = await this.getCooldownRemaining(
      chatId,
      settings.cooldown_seconds
    );
    const lists = await this.getLists(chatId);

    const total = users.length;
    const optedOut = users.filter((u) => u.opted_out).length;
    const active = total - optedOut;

    return {
      total,
      active,
      opted_out: optedOut,
      lists_count: Object.keys(lists).length,
      cooldown_remaining: cooldownRemaining,
    };
  }
}
