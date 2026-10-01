import { StorageAdapter } from './adapter.js';
import { UpstashRedisStorage } from './upstash.js';
import { MemoryStorage } from './memory.js';
import { getConfig } from '../config.js';

let storageInstance: StorageAdapter | null = null;

export function getStorage(forceNew: boolean = false): StorageAdapter {
  if (storageInstance && !forceNew) {
    return storageInstance;
  }

  const config = getConfig();

  if (config.upstashRedisRestUrl && config.upstashRedisRestToken) {
    try {
      storageInstance = new UpstashRedisStorage();
      return storageInstance;
    } catch (err) {
      console.warn(
        'Failed to initialize UpstashRedisStorage, falling back to MemoryStorage:',
        err
      );
    }
  }

  // Fallback to in-memory storage (ideal for local testing and dev)
  storageInstance = new MemoryStorage();
  return storageInstance;
}

export function setStorageInstance(adapter: StorageAdapter): void {
  storageInstance = adapter;
}
