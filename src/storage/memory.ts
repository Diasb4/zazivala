import { StorageAdapter } from './adapter.js';
import { ChatSettings, CustomList, UserRecord, ChatStats } from '../types.js';
import { getConfig } from '../config.js';

export class MemoryStorage implements StorageAdapter {
  private users: Map<string, Map<number, UserRecord>> = new Map();
  private settings: Map<number, ChatSettings> = new Map();
  private lists: Map<number, Map<string, CustomList>> = new Map();

  private getUserMap(chatId: number): Map<number, UserRecord> {
    const key = String(chatId);
    let map = this.users.get(key);
    if (!map) {
      map = new Map();
      this.users.set(key, map);
    }
    return map;
  }

  private getListMap(chatId: number): Map<string, CustomList> {
    let map = this.lists.get(chatId);
    if (!map) {
      map = new Map();
      this.lists.set(chatId, map);
    }
    return map;
  }

  async upsertUser(chatId: number, user: UserRecord): Promise<void> {
    const map = this.getUserMap(chatId);
    const existing = map.get(user.id);
    map.set(user.id, {
      ...existing,
      ...user,
      callsign: user.callsign ?? existing?.callsign,
      opted_out: existing ? existing.opted_out : (user.opted_out ?? false),
      updated_at: Date.now(),
    });
  }

  async getUsers(
    chatId: number,
    options?: { includeOptedOut?: boolean }
  ): Promise<UserRecord[]> {
    const map = this.getUserMap(chatId);
    const all = Array.from(map.values());
    if (options?.includeOptedOut) {
      return all;
    }
    return all.filter((u) => !u.opted_out && !u.is_bot);
  }

  async getUser(chatId: number, userId: number): Promise<UserRecord | null> {
    const map = this.getUserMap(chatId);
    return map.get(userId) || null;
  }

  async removeUser(chatId: number, userId: number): Promise<void> {
    const map = this.getUserMap(chatId);
    map.delete(userId);
  }

  async setOptOut(
    chatId: number,
    userId: number,
    optedOut: boolean
  ): Promise<boolean> {
    const map = this.getUserMap(chatId);
    const user = map.get(userId);
    if (user) {
      user.opted_out = optedOut;
      user.updated_at = Date.now();
      return true;
    }
    // If not tracked yet, create a skeleton record
    map.set(userId, {
      id: userId,
      first_name: `User ${userId}`,
      opted_out: optedOut,
      updated_at: Date.now(),
    });
    return true;
  }

  async setUserCallsign(
    chatId: number,
    userId: number,
    callsign: string | null
  ): Promise<boolean> {
    const map = this.getUserMap(chatId);
    const user = map.get(userId);
    if (user) {
      user.callsign = callsign ? callsign.trim() : undefined;
      user.updated_at = Date.now();
      return true;
    }
    return false;
  }

  async getSettings(chatId: number): Promise<ChatSettings> {
    let s = this.settings.get(chatId);
    if (!s) {
      const config = getConfig();
      s = {
        cooldown_seconds: config.defaultCooldownSeconds,
        chunk_size: config.defaultChunkSize,
        tag_mode: config.defaultTagMode,
        permissions: config.defaultPermissions,
        delete_trigger: false,
        last_tag_timestamp: 0,
      };
      this.settings.set(chatId, s);
    }
    return { ...s };
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
    this.settings.set(chatId, updated);
    return updated;
  }

  async getCooldownRemaining(
    chatId: number,
    cooldownSeconds: number
  ): Promise<number> {
    if (cooldownSeconds <= 0) return 0;
    const settings = await this.getSettings(chatId);
    const now = Math.floor(Date.now() / 1000);
    const elapsed = now - settings.last_tag_timestamp;
    if (elapsed < cooldownSeconds) {
      return cooldownSeconds - elapsed;
    }
    return 0;
  }

  async setLastTagTimestamp(chatId: number): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    await this.updateSettings(chatId, { last_tag_timestamp: now });
  }

  async getLists(chatId: number): Promise<Record<string, CustomList>> {
    const map = this.getListMap(chatId);
    const result: Record<string, CustomList> = {};
    for (const [name, list] of map.entries()) {
      result[name] = list;
    }
    return result;
  }

  async getList(chatId: number, listName: string): Promise<CustomList | null> {
    const map = this.getListMap(chatId);
    return map.get(listName.toLowerCase()) || null;
  }

  async saveList(chatId: number, list: CustomList): Promise<void> {
    const map = this.getListMap(chatId);
    map.set(list.name.toLowerCase(), list);
  }

  async deleteList(chatId: number, listName: string): Promise<boolean> {
    const map = this.getListMap(chatId);
    return map.delete(listName.toLowerCase());
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
