import { HttpClient } from '@angular/common/http';
import { DestroyRef, Injectable, effect, inject, signal } from '@angular/core';
import { AuthService } from './auth.service';
import { ChatMessage, Conversation, UserLite } from './models';

const enc = encodeURIComponent;

/**
 * Messagerie privée.
 * Rafraîchissement par interrogation périodique, adaptée à ce qui est affiché :
 * conversation ouverte ~3 s, liste ouverte ~8 s, bulle fermée ~25 s, rien quand l'onglet est masqué.
 */
@Injectable({ providedIn: 'root' })
export class MessagesService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);

  readonly open = signal(false);
  readonly unread = signal(0);
  readonly conversations = signal<Conversation[] | null>(null);
  /** Interlocuteur de la conversation affichée (null = liste). */
  readonly active = signal<UserLite | null>(null);
  readonly messages = signal<ChatMessage[]>([]);
  readonly hasMore = signal(false);
  readonly loading = signal(false);

  private timer?: ReturnType<typeof setTimeout>;
  private tick = 0;

  constructor() {
    effect(() => {
      if (this.auth.isLoggedIn()) this.schedule(0);
      else this.reset();
    });
    const onVisible = () => !document.hidden && this.auth.isLoggedIn() && this.schedule(0);
    document.addEventListener('visibilitychange', onVisible);
    inject(DestroyRef).onDestroy(() => {
      document.removeEventListener('visibilitychange', onVisible);
      clearTimeout(this.timer);
    });
  }

  toggle() {
    this.open.update((o) => !o);
    if (this.open()) this.schedule(0);
  }

  close() {
    this.open.set(false);
  }

  openWith(user: UserLite) {
    this.open.set(true);
    this.active.set(user);
    this.messages.set([]);
    this.hasMore.set(false);
    this.loading.set(true);
    this.http.get<{ user: UserLite; items: ChatMessage[]; hasMore: boolean }>(`/api/messages/with/${enc(user.name)}`).subscribe({
      next: (r) => {
        if (this.active()?.name !== user.name) return;
        this.active.set(r.user);
        this.messages.set(r.items);
        this.hasMore.set(r.hasMore);
        this.loading.set(false);
        this.refreshCounts();
      },
      error: () => this.loading.set(false),
    });
  }

  backToList() {
    this.active.set(null);
    this.messages.set([]);
    this.schedule(0);
  }

  loadOlder() {
    const u = this.active();
    const first = this.messages()[0];
    if (!u || !first) return;
    this.http
      .get<{ items: ChatMessage[]; hasMore: boolean }>(`/api/messages/with/${enc(u.name)}`, { params: { before: first.id } })
      .subscribe((r) => {
        if (this.active()?.name !== u.name) return;
        this.messages.update((m) => [...r.items, ...m]);
        this.hasMore.set(r.hasMore);
      });
  }

  send(text: string) {
    const u = this.active();
    if (!u) throw new Error('Aucune conversation ouverte');
    return this.http.post<ChatMessage>(`/api/messages/with/${enc(u.name)}`, { text });
  }

  /** Ajoute un message envoyé sans attendre le prochain rafraîchissement. */
  appendMine(m: ChatMessage) {
    this.messages.update((list) => (list.some((x) => x.id === m.id) ? list : [...list, m]));
  }

  searchUsers(q: string) {
    return this.http.get<UserLite[]>('/api/users/search', { params: { q } });
  }

  // ---------- rafraîchissement ----------

  private schedule(delay: number) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.poll(), delay);
  }

  private poll() {
    if (!this.auth.isLoggedIn()) return;
    const next = () => this.schedule(this.active() && this.open() ? 3000 : this.open() ? 8000 : 25000);
    if (document.hidden) return; // reprend sur "visibilitychange"
    this.tick++;
    const u = this.active();
    if (this.open() && u) {
      const last = this.messages().at(-1);
      if (!last && this.loading()) return next();
      const params: Record<string, string> = last ? { after: last.id } : {};
      this.http.get<{ items: ChatMessage[] }>(`/api/messages/with/${enc(u.name)}`, { params }).subscribe({
        next: (r) => {
          if (this.active()?.name === u.name && r.items.length) {
            const known = new Set(this.messages().map((m) => m.id));
            this.messages.update((m) => [...m, ...r.items.filter((x) => !known.has(x.id))]);
          }
          if (this.tick % 5 === 0) this.refreshCounts();
          next();
        },
        error: next,
      });
    } else if (this.open()) {
      this.refreshCounts(next);
    } else {
      this.http.get<{ count: number }>('/api/messages/unread').subscribe({
        next: (r) => {
          this.unread.set(r.count);
          next();
        },
        error: next,
      });
    }
  }

  private refreshCounts(done?: () => void) {
    this.http.get<Conversation[]>('/api/messages/conversations').subscribe({
      next: (list) => {
        this.conversations.set(list);
        this.unread.set(list.reduce((s, c) => s + c.unread, 0));
        done?.();
      },
      error: () => done?.(),
    });
  }

  private reset() {
    clearTimeout(this.timer);
    this.open.set(false);
    this.active.set(null);
    this.messages.set([]);
    this.conversations.set(null);
    this.unread.set(0);
  }
}
