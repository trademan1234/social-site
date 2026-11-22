import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService, ToastService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { Comment, Post, REACTION_MAP, REACTIONS, ReactionType } from '../core/models';
import { AvatarComponent, SmartVideoDirective, TimeAgoPipe } from '../shared/ui';

@Component({
  selector: 'app-post-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, AvatarComponent, TimeAgoPipe, SmartVideoDirective],
  template: `
    @let p = state();
    <article class="card post">
      <header class="post-head">
        <a [routerLink]="['/u', p.author.name]" class="who">
          <app-avatar [name]="p.author.name" [color]="p.author.color" [size]="42" />
          <span>
            <strong>{{ p.author.name }}</strong>
            <small>{{ p.createdAt | timeAgo }} · {{ p.type === 'video' ? '🎬 Vidéo' : '📸 Photo' }}</small>
          </span>
        </a>
        @if (isMine()) {
          <button class="icon-btn" title="Supprimer" (click)="remove()" aria-label="Supprimer la publication">🗑️</button>
        }
      </header>

      @if (p.caption) {
        <p class="caption">{{ p.caption }}</p>
      }

      <div
        class="media"
        [class.video]="p.type === 'video'"
        [style.aspect-ratio]="ratio()"
        (dblclick)="p.type === 'photo' && quickLove()"
      >
        @if (p.type === 'photo') {
          <img
            [src]="p.media.thumb || p.media.url"
            [attr.srcset]="p.media.thumb ? p.media.thumb + ' 640w, ' + p.media.url + ' 1600w' : null"
            sizes="(max-width: 680px) 100vw, 620px"
            [width]="p.media.width"
            [height]="p.media.height"
            [alt]="p.caption || 'Photo de ' + p.author.name"
            loading="lazy"
            decoding="async"
            (click)="lightbox.set(true)"
          />
        } @else {
          <video appSmartVideo [src]="p.media.url + '#t=0.1'" controls preload="none" loop></video>
        }
        @if (burst()) {
          <span class="burst">❤️</span>
        }
      </div>

      <div class="stats">
        @if (p.reactionTotal) {
          <span class="emojis">
            @for (t of topReactions(); track t) {
              <span>{{ emoji(t) }}</span>
            }
          </span>
          <span>{{ p.reactionTotal }}</span>
        }
        <span class="spacer"></span>
        @if (p.commentCount) {
          <button class="link" (click)="toggleComments()">{{ p.commentCount }} commentaire{{ p.commentCount > 1 ? 's' : '' }}</button>
        }
      </div>

      <div class="actions">
        <div class="react-wrap" (mouseenter)="openPicker()" (mouseleave)="closePicker()"
          (contextmenu)="$event.preventDefault(); picker.set(true)">
          <button class="action" [class.active]="p.myReaction" (click)="react(p.myReaction ? null : 'like')">
            <span class="e">{{ p.myReaction ? emoji(p.myReaction) : '👍' }}</span>
            {{ p.myReaction ? label(p.myReaction) : 'Réagir' }}
          </button>
          @if (picker()) {
            <div class="picker" role="menu">
              @for (r of reactions; track r.type) {
                <button [title]="r.label" [class.on]="p.myReaction === r.type" (click)="react(r.type)" role="menuitem">
                  {{ r.emoji }}
                </button>
              }
            </div>
          }
        </div>
        <button class="action" (click)="toggleComments()"><span class="e">💬</span> Commenter</button>
        <button class="action" (click)="share()"><span class="e">↗️</span> Partager</button>
      </div>

      @if (showComments()) {
        <section class="comments">
          @if (loadingComments()) {
            <div class="skeleton line"></div>
          }
          @for (c of comments(); track c.id) {
            <div class="comment">
              <app-avatar [name]="c.author.name" [color]="c.author.color" [size]="30" />
              <div class="bubble">
                <a [routerLink]="['/u', c.author.name]">{{ c.author.name }}</a>
                <p>{{ c.text }}</p>
                <small>{{ c.createdAt | timeAgo }}</small>
              </div>
            </div>
          }
          <form class="comment-form" (submit)="$event.preventDefault(); sendComment()">
            <input
              #box
              [value]="draft()"
              (input)="draft.set(box.value)"
              (focus)="auth.requireLogin()"
              maxlength="500"
              [placeholder]="auth.isLoggedIn() ? 'Écris un commentaire…' : 'Inscris-toi pour commenter'"
            />
            <button class="btn small" [disabled]="!draft().trim()">Envoyer</button>
          </form>
        </section>
      }
    </article>

    @if (lightbox()) {
      <div class="lightbox" (click)="lightbox.set(false)" role="dialog" aria-label="Photo en grand">
        <img [src]="p.media.url" [alt]="p.caption" />
      </div>
    }
  `,
  styleUrl: './post-card.component.scss',
})
export class PostCardComponent {
  post = input.required<Post>();
  deleted = output<string>();

  protected auth = inject(AuthService);
  private api = inject(ApiService);
  private toast = inject(ToastService);

  protected reactions = REACTIONS;
  protected state = linkedSignal(() => this.post());
  protected picker = signal(false);
  protected burst = signal(false);
  protected lightbox = signal(false);
  protected showComments = signal(false);
  protected loadingComments = signal(false);
  protected comments = signal<Comment[]>([]);
  protected draft = signal('');
  private pickerTimer?: ReturnType<typeof setTimeout>;

  protected isMine = computed(() => this.auth.user()?.id === this.state().author.id);
  protected ratio = computed(() => {
    const m = this.state().media;
    if (m.width && m.height) return `${m.width} / ${Math.max(m.height, m.width * 0.5)}`;
    return this.state().type === 'video' ? '16 / 9' : '4 / 3';
  });
  protected topReactions = computed(() =>
    (Object.entries(this.state().reactions) as [ReactionType, number][])
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([t]) => t)
  );

  protected emoji = (t: ReactionType) => REACTION_MAP[t].emoji;
  protected label = (t: ReactionType) => REACTION_MAP[t].label;

  openPicker() {
    clearTimeout(this.pickerTimer);
    this.pickerTimer = setTimeout(() => this.picker.set(true), 250);
  }
  closePicker() {
    clearTimeout(this.pickerTimer);
    this.pickerTimer = setTimeout(() => this.picker.set(false), 300);
  }

  react(type: ReactionType | null) {
    this.picker.set(false);
    if (!this.auth.requireLogin()) return;
    const before = this.state();
    // Mise à jour optimiste : l'UI réagit instantanément
    const reactions = { ...before.reactions };
    if (before.myReaction) reactions[before.myReaction] = (reactions[before.myReaction] || 1) - 1;
    const next = type === before.myReaction ? null : type;
    if (next) reactions[next] = (reactions[next] || 0) + 1;
    for (const k in reactions) if (!reactions[k as ReactionType]) delete reactions[k as ReactionType];
    const total = before.reactionTotal + (next ? 1 : 0) - (before.myReaction ? 1 : 0);
    this.state.set({ ...before, reactions, myReaction: next, reactionTotal: total });

    this.api.react(before.id, next).subscribe({
      next: (r) => this.state.update((s) => ({ ...s, ...r })),
      error: (e) => {
        this.state.set(before);
        this.toast.error(e);
      },
    });
  }

  quickLove() {
    if (!this.auth.requireLogin()) return;
    this.burst.set(true);
    setTimeout(() => this.burst.set(false), 800);
    if (this.state().myReaction !== 'love') this.react('love');
  }

  toggleComments() {
    this.showComments.update((v) => !v);
    if (this.showComments() && !this.comments().length && this.state().commentCount) {
      this.loadingComments.set(true);
      this.api.comments(this.state().id).subscribe({
        next: (c) => {
          this.comments.set(c);
          this.loadingComments.set(false);
        },
        error: () => this.loadingComments.set(false),
      });
    }
  }

  sendComment() {
    const text = this.draft().trim();
    if (!text || !this.auth.requireLogin()) return;
    this.api.addComment(this.state().id, text).subscribe({
      next: (c) => {
        this.comments.update((list) => [...list, c]);
        this.state.update((s) => ({ ...s, commentCount: s.commentCount + 1 }));
        this.draft.set('');
      },
      error: (e) => this.toast.error(e),
    });
  }

  async share() {
    const url = new URL(this.state().media.url, location.origin).href;
    try {
      if (navigator.share) await navigator.share({ title: 'Pulse', text: this.state().caption, url });
      else {
        await navigator.clipboard.writeText(url);
        this.toast.show('Lien copié 📋');
      }
    } catch {
      /* partage annulé */
    }
  }

  remove() {
    if (!confirm('Supprimer cette publication ?')) return;
    this.api.deletePost(this.state().id).subscribe({
      next: () => {
        this.deleted.emit(this.state().id);
        this.toast.show('Publication supprimée');
      },
      error: (e) => this.toast.error(e),
    });
  }
}
