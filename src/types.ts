export type TagMode = 'text' | 'hidden' | 'callsign';
export type PermissionsMode = 'everyone' | 'admins';

export interface UserRecord {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  callsign?: string;
  opted_out: boolean;
  is_bot?: boolean;
  updated_at: number;
}

export interface ChatSettings {
  cooldown_seconds: number;
  chunk_size: number;
  tag_mode: TagMode;
  permissions: PermissionsMode;
  delete_trigger: boolean;
  last_tag_timestamp: number;
}

export interface CustomList {
  name: string;
  description?: string;
  created_by: number;
  created_at: number;
  member_ids: number[];
}

export interface ChatStats {
  total: number;
  active: number;
  opted_out: number;
  lists_count: number;
  cooldown_remaining: number;
}
