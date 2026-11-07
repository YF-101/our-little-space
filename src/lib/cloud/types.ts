export type CloudProfile = {
  id: string;
  nickname: string;
  avatar_id: string | null;
};
export type CloudMember = {
  space_id: string;
  user_id: string;
  active: boolean;
  joined_at: string;
};
export type CloudSpace = {
  id: string;
  owner_id: string;
  welcome: string;
  start_date: string;
  revision: number;
};
export type CloudMemory = {
  id: string;
  space_id: string;
  author_id: string;
  title: string;
  body: string;
  memory_date: string;
  created_at: string;
  updated_at: string;
};
export type CloudPhoto = {
  id: string;
  space_id: string;
  author_id: string;
  path: string;
  caption: string;
  kind: "gallery" | "avatar";
  created_at: string;
  src: string;
};
export type CloudComment = {
  id: string;
  space_id: string;
  memory_id: string;
  author_id: string;
  body: string;
  created_at: string;
};
export type CloudReaction = {
  space_id: string;
  memory_id: string;
  author_id: string;
  emoji: string;
};
export type CloudInvitation = {
  id: string;
  space_id: string;
  email: string;
  expires_at: string;
  revoked_at: string | null;
  accepted_by: string | null;
  created_at: string;
};
export type CloudSnapshot = {
  space: CloudSpace;
  members: CloudMember[];
  profiles: CloudProfile[];
  memories: CloudMemory[];
  photos: CloudPhoto[];
  links: { memory_id: string; photo_id: string }[];
  comments: CloudComment[];
  reactions: CloudReaction[];
  invitations: CloudInvitation[];
};
