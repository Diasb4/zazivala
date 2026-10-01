import { ChatSettings, CustomList, UserRecord, ChatStats } from '../types.js';

export interface StorageAdapter {
  /**
   * Insert or update user information in a chat
   */
  upsertUser(chatId: number, user: UserRecord): Promise<void>;

  /**
   * Get all registered users in a chat
   */
  getUsers(chatId: number, options?: { includeOptedOut?: boolean }): Promise<UserRecord[]>;

  /**
   * Get a single user's record in a chat
   */
  getUser(chatId: number, userId: number): Promise<UserRecord | null>;

  /**
   * Remove a user from a chat (e.g. left chat)
   */
  removeUser(chatId: number, userId: number): Promise<void>;

  /**
   * Set user opt-out preference for /all tags
   */
  setOptOut(chatId: number, userId: number, optedOut: boolean): Promise<boolean>;

  /**
   * Set user personal callsign / emoji
   */
  setUserCallsign(chatId: number, userId: number, callsign: string | null): Promise<boolean>;

  /**
   * Get chat settings (cooldown, chunk size, permissions, etc.)
   */
  getSettings(chatId: number): Promise<ChatSettings>;

  /**
   * Update chat settings
   */
  updateSettings(chatId: number, partial: Partial<ChatSettings>): Promise<ChatSettings>;

  /**
   * Check cooldown remaining in seconds (0 means not on cooldown)
   */
  getCooldownRemaining(chatId: number, cooldownSeconds: number): Promise<number>;

  /**
   * Record that a tag invocation just occurred
   */
  setLastTagTimestamp(chatId: number): Promise<void>;

  /**
   * Get all custom lists for a chat
   */
  getLists(chatId: number): Promise<Record<string, CustomList>>;

  /**
   * Get a specific custom list
   */
  getList(chatId: number, listName: string): Promise<CustomList | null>;

  /**
   * Save or update a custom list
   */
  saveList(chatId: number, list: CustomList): Promise<void>;

  /**
   * Delete a custom list
   */
  deleteList(chatId: number, listName: string): Promise<boolean>;

  /**
   * Get statistics for a chat
   */
  getStats(chatId: number): Promise<ChatStats>;
}
