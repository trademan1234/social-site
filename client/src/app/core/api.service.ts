import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Comment, Page, Post, ProfileStats, ReactionType, User, UserLite } from './models';

export type FeedFilter = 'all' | 'photo' | 'video';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);

  feed(opts: { type?: FeedFilter; author?: string; before?: string | null; limit?: number }) {
    let params = new HttpParams().set('limit', opts.limit ?? 8);
    if (opts.type && opts.type !== 'all') params = params.set('type', opts.type);
    if (opts.author) params = params.set('author', opts.author);
    if (opts.before) params = params.set('before', opts.before);
    return this.http.get<Page<Post>>('/api/posts', { params });
  }

  createPost(data: FormData) {
    return this.http.post<Post>('/api/posts', data, { reportProgress: true, observe: 'events' });
  }

  deletePost(id: string) {
    return this.http.delete<void>(`/api/posts/${id}`);
  }

  react(id: string, type: ReactionType | null) {
    return this.http.post<Pick<Post, 'reactions' | 'reactionTotal' | 'myReaction'>>(`/api/posts/${id}/react`, { type });
  }

  comments(id: string) {
    return this.http.get<Comment[]>(`/api/posts/${id}/comments`);
  }

  addComment(id: string, text: string) {
    return this.http.post<Comment>(`/api/posts/${id}/comments`, { text });
  }

  profile(name: string) {
    return this.http.get<{ user: User; stats: ProfileStats }>(`/api/users/${encodeURIComponent(name)}`);
  }

  members() {
    return this.http.get<UserLite[]>('/api/users');
  }
}

/** Notifications éphémères. */
@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly toasts = signal<{ id: number; text: string; kind: 'ok' | 'err' }[]>([]);
  private seq = 0;

  show(text: string, kind: 'ok' | 'err' = 'ok') {
    const id = ++this.seq;
    this.toasts.update((t) => [...t, { id, text, kind }]);
    setTimeout(() => this.toasts.update((t) => t.filter((x) => x.id !== id)), 3200);
  }

  error(e: any, fallback = 'Oups, une erreur est survenue') {
    this.show(e?.error?.error || fallback, 'err');
  }
}
