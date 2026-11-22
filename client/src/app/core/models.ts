export type ReactionType = 'like' | 'love' | 'haha' | 'wow' | 'fire' | 'sad';

export const REACTIONS: { type: ReactionType; emoji: string; label: string }[] = [
  { type: 'like', emoji: '👍', label: "J'aime" },
  { type: 'love', emoji: '❤️', label: 'Adore' },
  { type: 'haha', emoji: '😂', label: 'Haha' },
  { type: 'wow', emoji: '😮', label: 'Wow' },
  { type: 'fire', emoji: '🔥', label: 'Feu' },
  { type: 'sad', emoji: '😢', label: 'Triste' },
];

export const REACTION_MAP = Object.fromEntries(REACTIONS.map((r) => [r.type, r])) as Record<
  ReactionType,
  (typeof REACTIONS)[number]
>;

export interface UserLite {
  id: string;
  name: string;
  color: string;
}

export interface User extends UserLite {
  bio: string;
  createdAt: string;
}

export interface Media {
  url: string;
  thumb?: string;
  width?: number;
  height?: number;
  mime: string;
}

export interface Post {
  id: string;
  type: 'photo' | 'video';
  media: Media;
  caption: string;
  createdAt: string;
  commentCount: number;
  reactions: Partial<Record<ReactionType, number>>;
  reactionTotal: number;
  myReaction: ReactionType | null;
  author: UserLite;
}

export interface Comment {
  id: string;
  text: string;
  createdAt: string;
  author: UserLite;
}

export interface Page<T> {
  items: T[];
  next: string | null;
}

export interface ChatMessage {
  id: string;
  text: string;
  fromMe: boolean;
  read: boolean;
  createdAt: string;
}

export interface Conversation {
  user: UserLite;
  last: ChatMessage;
  unread: number;
}

export interface ProfileStats {
  posts: number;
  photos: number;
  videos: number;
  reactions: number;
}
