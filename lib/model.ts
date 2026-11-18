export type User = {
  id: string;
  username: string;
  role: string;
  quota_bytes: number;
  disabled: number;
  can_manage_events: number;
  created_at: number;
};

export type Node = {
  id: string;
  owner: string;
  parent_id: string | null;
  name: string;
  kind: 'folder' | 'file';
  size: number;
  mime: string;
  etag: string;
  deleted_at: number | null;
  created_at: number;
  updated_at: number;
};

export type ClubEvent = {
  id: string;
  slug: string;
  title: string;
  description: string;
  owner: string;
  folder_id: string;
  recap_folder_id: string;
  poster_node_id: string | null;
  published: number;
  created_at: number;
  updated_at: number;
};
