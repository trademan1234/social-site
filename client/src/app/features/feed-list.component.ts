import { ChangeDetectionStrategy, Component, effect, inject, input, signal, untracked } from '@angular/core';
import { ApiService, FeedFilter, ToastService } from '../core/api.service';
import { Post } from '../core/models';
import { InViewDirective } from '../shared/ui';
import { PostCardComponent } from './post-card.component';

/** Liste de publications avec filtres et scroll infini (réutilisée sur l'accueil et les profils). */
@Component({
  selector: 'app-feed-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PostCardComponent, InViewDirective],
  template: `
    <nav class="tabs" role="tablist">
      @for (t of tabs; track t.id) {
        <button role="tab" [class.on]="filter() === t.id" [attr.aria-selected]="filter() === t.id" (click)="filter.set(t.id)">
          {{ t.label }}
        </button>
      }
    </nav>

    <div class="list">
      @for (p of posts(); track p.id) {
        <app-post-card [post]="p" (deleted)="remove($event)" />
      }

      @if (loading()) {
        @for (i of [1, 2]; track i) {
          <div class="card sk">
            <div class="sk-head"><div class="skeleton round"></div><div class="skeleton bar"></div></div>
            <div class="skeleton media"></div>
          </div>
        }
      } @else if (next()) {
        <div class="sentinel" (appInView)="load()"></div>
      } @else if (!posts().length) {
        <div class="card empty">
          <div class="big">🌌</div>
          <h3>Rien ici pour l'instant</h3>
          <p>Sois la première personne à publier quelque chose !</p>
        </div>
      } @else {
        <p class="end">Tu es à jour ✨</p>
      }
    </div>
  `,
  styles: `
    .tabs { display: flex; gap: 6px; padding: 6px; border-radius: 999px; background: var(--surface); border: 1px solid var(--line);
      backdrop-filter: blur(16px); margin-bottom: 16px; }
    .tabs button { flex: 1; border: 0; border-radius: 999px; padding: 9px 12px; background: transparent; color: var(--muted);
      font: 600 .92rem var(--font); cursor: pointer; transition: all .2s; }
    .tabs button:hover { color: var(--text); }
    .tabs button.on { background: var(--grad); color: #fff; box-shadow: 0 6px 20px rgba(160, 80, 255, .35); }
    .list { display: grid; gap: 18px; }
    .sentinel { height: 1px; }
    .sk { padding: 16px; }
    .sk-head { display: flex; gap: 12px; align-items: center; margin-bottom: 14px; }
    .round { width: 42px; height: 42px; border-radius: 50%; }
    .bar { height: 14px; width: 40%; border-radius: 8px; }
    .media { height: 280px; border-radius: 14px; }
    .empty { text-align: center; padding: 48px 20px; }
    .empty .big { font-size: 3rem; }
    .empty h3 { margin: 8px 0 4px; }
    .empty p, .end { color: var(--muted); margin: 0; }
    .end { text-align: center; padding: 12px 0 24px; }
  `,
})
export class FeedListComponent {
  author = input<string>();

  private api = inject(ApiService);
  private toast = inject(ToastService);

  protected tabs: { id: FeedFilter; label: string }[] = [
    { id: 'all', label: '✨ Tout' },
    { id: 'photo', label: '📸 Photos' },
    { id: 'video', label: '🎬 Vidéos' },
  ];
  protected filter = signal<FeedFilter>('all');
  protected posts = signal<Post[]>([]);
  protected next = signal<string | null>(null);
  protected loading = signal(false);
  private gen = 0;

  constructor() {
    // Recharge quand le filtre ou l'auteur change
    effect(() => {
      this.filter();
      this.author();
      untracked(() => this.reset());
    });
  }

  private reset() {
    this.gen++;
    this.posts.set([]);
    this.next.set(null);
    this.loading.set(false);
    this.load(true);
  }

  load(first = false) {
    if (this.loading() || (!first && !this.next())) return;
    const gen = this.gen;
    this.loading.set(true);
    this.api.feed({ type: this.filter(), author: this.author(), before: first ? null : this.next() }).subscribe({
      next: (page) => {
        if (gen !== this.gen) return;
        this.posts.update((list) => [...list, ...page.items]);
        this.next.set(page.next);
        this.loading.set(false);
      },
      error: (e) => {
        this.loading.set(false);
        this.toast.error(e, 'Impossible de charger le fil');
      },
    });
  }

  prepend(p: Post) {
    if (this.filter() === 'all' || this.filter() === p.type) this.posts.update((list) => [p, ...list]);
  }

  remove(id: string) {
    this.posts.update((list) => list.filter((p) => p.id !== id));
  }
}
