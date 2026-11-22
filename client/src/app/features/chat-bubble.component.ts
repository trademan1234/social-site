import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { ToastService } from '../core/api.service';
import { MessagesService } from '../core/messages.service';
import { UserLite } from '../core/models';
import { AvatarComponent, TimeAgoPipe } from '../shared/ui';

const MOBILE = '(max-width: 560px)';

@Component({
  selector: 'app-chat-bubble',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AvatarComponent, TimeAgoPipe, RouterLink],
  template: `
    @if (msg.open()) {
      <section class="panel card" role="dialog" aria-label="Messages privés" (keydown.escape)="msg.close()">
        @if (msg.active(); as u) {
          <!-- Conversation -->
          <header>
            <button class="icon-btn" (click)="msg.backToList()" aria-label="Retour aux conversations">←</button>
            <a class="who" [routerLink]="['/u', u.name]" (click)="closeOnMobile()">
              <app-avatar [name]="u.name" [color]="u.color" [size]="34" />
              <strong>{{ u.name }}</strong>
            </a>
            <button class="icon-btn" (click)="msg.close()" aria-label="Fermer">✕</button>
          </header>

          <div class="thread" #thread>
            @if (msg.hasMore()) {
              <button class="older chip" (click)="msg.loadOlder()">Messages plus anciens</button>
            }
            @if (msg.loading()) {
              <p class="hint">Chargement…</p>
            } @else if (!msg.messages().length) {
              <p class="hint">Dis bonjour à {{ u.name }} 👋</p>
            }
            @for (m of msg.messages(); track m.id; let last = $last) {
              <div class="row" [class.mine]="m.fromMe">
                <div class="bubble">{{ m.text }}</div>
                <small>
                  {{ m.createdAt | timeAgo }}
                  @if (last && m.fromMe && m.read) { · Vu }
                </small>
              </div>
            }
          </div>

          <form class="composer" (submit)="$event.preventDefault(); send()">
            <textarea
              #box
              rows="1"
              maxlength="1000"
              placeholder="Écris un message…"
              aria-label="Message"
              [value]="draft()"
              (input)="draft.set(box.value); autosize(box)"
              (keydown.enter)="onEnter($event)"
            ></textarea>
            <button class="send" [disabled]="!draft().trim() || sending()" aria-label="Envoyer">➤</button>
          </form>
        } @else {
          <!-- Liste des conversations -->
          <header>
            <h2>Messages</h2>
            <button class="icon-btn" (click)="msg.close()" aria-label="Fermer">✕</button>
          </header>

          <div class="search">
            <input
              #q
              type="search"
              placeholder="🔍 Écrire à un membre…"
              aria-label="Rechercher un membre"
              autocomplete="off"
              [value]="query()"
              (input)="onSearch(q.value)"
            />
          </div>

          <div class="list">
            @if (query().trim()) {
              @for (u of results(); track u.id) {
                <button class="item" (click)="start(u)">
                  <app-avatar [name]="u.name" [color]="u.color" [size]="42" />
                  <span class="txt"><strong>{{ u.name }}</strong><span>Nouveau message</span></span>
                </button>
              } @empty {
                <p class="hint">{{ searching() ? 'Recherche…' : 'Aucun membre trouvé' }}</p>
              }
            } @else {
              @for (c of msg.conversations() ?? []; track c.user.id) {
                <button class="item" [class.unread]="c.unread" (click)="msg.openWith(c.user)">
                  <app-avatar [name]="c.user.name" [color]="c.user.color" [size]="42" />
                  <span class="txt">
                    <strong>{{ c.user.name }}</strong>
                    <span>{{ c.last.fromMe ? 'Toi : ' : '' }}{{ c.last.text }}</span>
                  </span>
                  <span class="meta">
                    <small>{{ c.last.createdAt | timeAgo }}</small>
                    @if (c.unread) { <b class="count">{{ c.unread }}</b> }
                  </span>
                </button>
              } @empty {
                <p class="hint">
                  {{ msg.conversations() === null ? 'Chargement…' : 'Aucune conversation. Cherche un membre ci-dessus pour lui écrire.' }}
                </p>
              }
            }
          </div>
        }
      </section>
    }

    <button
      class="fab"
      [class.hidden-mobile]="msg.open()"
      (click)="msg.toggle()"
      [attr.aria-label]="msg.open() ? 'Fermer les messages' : 'Ouvrir les messages' + (msg.unread() ? ' (' + msg.unread() + ' non lus)' : '')"
      [attr.aria-expanded]="msg.open()"
    >
      <span aria-hidden="true">{{ msg.open() ? '✕' : '💬' }}</span>
      @if (msg.unread() && !msg.open()) {
        <b class="badge" aria-hidden="true">{{ badge() }}</b>
      }
    </button>
  `,
  styles: `
    :host { position: fixed; right: 20px; bottom: 20px; z-index: 150; }

    .fab { position: relative; width: 60px; height: 60px; border-radius: 50%; border: 0; cursor: pointer; font-size: 1.6rem;
      display: grid; place-items: center; color: #fff; background: var(--grad); box-shadow: 0 10px 28px rgba(170, 80, 255, .5);
      transition: transform .15s; }
    .fab:hover { transform: scale(1.06); }
    .fab:active { transform: scale(.96); }
    .badge { position: absolute; top: -4px; right: -4px; min-width: 22px; height: 22px; padding: 0 6px; border-radius: 999px;
      background: #ff3b6b; color: #fff; font: 800 .75rem/22px var(--font); box-shadow: 0 0 0 3px var(--bg); }

    .panel { position: absolute; right: 0; bottom: 74px; width: 370px; height: min(560px, calc(100dvh - 120px));
      display: flex; flex-direction: column; overflow: hidden; background: var(--surface-solid); box-shadow: var(--shadow);
      animation: pop .2s cubic-bezier(.2, .9, .3, 1.2); transform-origin: bottom right; }
    @keyframes pop { from { opacity: 0; transform: translateY(12px) scale(.96) } }

    header { display: flex; align-items: center; gap: 8px; padding: 10px 10px 10px 16px; border-bottom: 1px solid var(--line); flex: none; }
    header h2 { flex: 1; margin: 0; font-size: 1.15rem; }
    .who { flex: 1; min-width: 0; display: flex; align-items: center; gap: 10px; color: var(--text); text-decoration: none; }
    .who strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

    .search { padding: 10px 12px; flex: none; }
    .list { flex: 1; overflow-y: auto; padding: 0 6px 8px; overscroll-behavior: contain; }
    .item { width: 100%; display: flex; align-items: center; gap: 12px; padding: 10px; border: 0; border-radius: 14px;
      background: none; color: var(--text); font: inherit; text-align: left; cursor: pointer; }
    .item:hover { background: var(--glass-2); }
    .txt { flex: 1; min-width: 0; display: grid; }
    .txt span { color: var(--muted); font-size: .88rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .item.unread .txt span { color: var(--text); font-weight: 600; }
    .meta { display: grid; justify-items: end; gap: 4px; flex: none; }
    .meta small { color: var(--muted); font-size: .72rem; }
    .count { min-width: 20px; height: 20px; padding: 0 6px; border-radius: 999px; background: var(--accent-2); color: #fff;
      font: 800 .72rem/20px var(--font); text-align: center; }

    .thread { flex: 1; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 6px; overscroll-behavior: contain; }
    .older { align-self: center; margin-bottom: 6px; font-size: .8rem; padding: 6px 12px; color: var(--text); }
    .row { display: grid; justify-items: start; max-width: 82%; }
    .row.mine { align-self: flex-end; justify-items: end; }
    .bubble { padding: 9px 13px; border-radius: 18px 18px 18px 6px; background: var(--glass-2); border: 1px solid var(--line);
      white-space: pre-wrap; overflow-wrap: anywhere; }
    .mine .bubble { border-radius: 18px 18px 6px 18px; background: var(--grad); border-color: transparent; color: #fff; }
    .row small { color: var(--muted); font-size: .7rem; margin: 2px 6px 0; }
    .hint { color: var(--muted); text-align: center; margin: 24px 12px; font-size: .92rem; }

    .composer { display: flex; align-items: flex-end; gap: 8px; padding: 10px 12px; border-top: 1px solid var(--line); flex: none; }
    textarea { resize: none; max-height: 120px; line-height: 1.4; border-radius: 20px; padding: 9px 14px; }
    .send { flex: none; width: 42px; height: 42px; border-radius: 50%; border: 0; cursor: pointer; color: #fff; font-size: 1.05rem;
      background: var(--grad); }
    .send:disabled { opacity: .4; cursor: not-allowed; }

    /* Mobile : plein écran, la bulle se cache quand le panneau est ouvert */
    @media (max-width: 560px) {
      :host { right: 14px; bottom: calc(14px + env(safe-area-inset-bottom)); }
      .fab { width: 56px; height: 56px; }
      .fab.hidden-mobile { display: none; }
      .panel { position: fixed; inset: 0; width: 100%; height: 100dvh; border-radius: 0; border: 0;
        padding: env(safe-area-inset-top) 0 env(safe-area-inset-bottom); animation-name: slide; }
      @keyframes slide { from { transform: translateY(30px); opacity: 0 } }
      input, textarea { font-size: 16px; } /* évite le zoom automatique sur iOS */
    }
  `,
})
export class ChatBubbleComponent {
  protected msg = inject(MessagesService);
  private toast = inject(ToastService);

  protected draft = signal('');
  protected sending = signal(false);
  protected query = signal('');
  protected results = signal<UserLite[]>([]);
  protected searching = signal(false);
  protected badge = computed(() => (this.msg.unread() > 99 ? '99+' : String(this.msg.unread())));

  private thread = viewChild<ElementRef<HTMLElement>>('thread');
  private box = viewChild<ElementRef<HTMLTextAreaElement>>('box');
  private searchTimer?: ReturnType<typeof setTimeout>;
  private shown = { first: '', last: '', count: 0 };

  constructor() {
    // Défilement : en bas à l'ouverture et à chaque nouveau message (si on y était déjà) ;
    // position conservée quand on charge les messages plus anciens.
    effect(() => {
      const list = this.msg.messages();
      const el = this.thread()?.nativeElement;
      untracked(() => {
        if (!el) return;
        const first = list[0]?.id ?? '';
        const last = list.at(-1)?.id ?? '';
        const prev = this.shown;
        this.shown = { first, last, count: list.length };
        const olderLoaded = prev.last === last && prev.first !== first && prev.count > 0;
        const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
        const opened = prev.count === 0;
        const mineAdded = list.at(-1)?.fromMe && prev.last !== last;
        const before = el.scrollHeight;
        requestAnimationFrame(() => {
          if (olderLoaded) el.scrollTop += el.scrollHeight - before;
          else if (opened || nearBottom || mineAdded) el.scrollTop = el.scrollHeight;
        });
      });
    });

    // Focus sur le champ quand une conversation s'ouvre (pas sur mobile : évite d'ouvrir le clavier d'office)
    effect(() => {
      const box = this.box()?.nativeElement;
      if (box && !matchMedia(MOBILE).matches) requestAnimationFrame(() => box.focus());
    });

    // Mobile : bloque le défilement de la page derrière le panneau plein écran
    effect(() => {
      document.body.style.overflow = this.msg.open() && matchMedia(MOBILE).matches ? 'hidden' : '';
    });
    inject(DestroyRef).onDestroy(() => {
      document.body.style.overflow = '';
      clearTimeout(this.searchTimer);
    });
  }

  protected onSearch(value: string) {
    this.query.set(value);
    clearTimeout(this.searchTimer);
    const q = value.trim();
    if (!q) return this.results.set([]);
    this.searching.set(true);
    this.searchTimer = setTimeout(() => {
      this.msg.searchUsers(q).subscribe({
        next: (users) => {
          if (this.query().trim() !== q) return;
          this.results.set(users);
          this.searching.set(false);
        },
        error: () => this.searching.set(false),
      });
    }, 250);
  }

  protected start(u: UserLite) {
    this.query.set('');
    this.results.set([]);
    this.draft.set('');
    this.shown = { first: '', last: '', count: 0 };
    this.msg.openWith(u);
  }

  protected onEnter(e: Event) {
    const k = e as KeyboardEvent;
    if (k.shiftKey || k.isComposing) return; // Maj+Entrée = retour à la ligne
    e.preventDefault();
    this.send();
  }

  protected send() {
    const text = this.draft().trim();
    if (!text || this.sending()) return;
    this.sending.set(true);
    this.msg.send(text).subscribe({
      next: (m) => {
        this.msg.appendMine(m);
        this.draft.set('');
        this.sending.set(false);
        const box = this.box()?.nativeElement;
        if (box) {
          box.value = '';
          this.autosize(box);
        }
      },
      error: (e) => {
        this.sending.set(false);
        this.toast.error(e, 'Message non envoyé');
      },
    });
  }

  protected autosize(el: HTMLTextAreaElement) {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  }

  protected closeOnMobile() {
    if (matchMedia(MOBILE).matches) this.msg.close();
  }
}
