import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, viewChild } from '@angular/core';
import { ApiService, ToastService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { ProfileStats, User } from '../core/models';
import { ComposerComponent } from '../features/composer.component';
import { FeedListComponent } from '../features/feed-list.component';
import { AvatarComponent, TimeAgoPipe } from '../shared/ui';

@Component({
  selector: 'app-profile',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AvatarComponent, FeedListComponent, ComposerComponent, TimeAgoPipe],
  template: `
    @let u = user();
    <div class="wrap">
      @if (notFound()) {
        <div class="card empty"><div class="big">🔍</div><h2>Personne ne s'appelle « {{ name() }} »</h2></div>
      } @else if (u) {
        <section class="card head" [style.--c]="u.color">
          <div class="cover"></div>
          <div class="body">
            <app-avatar [name]="u.name" [color]="u.color" [size]="104" class="big-av" />
            <h1>{{ u.name }}</h1>
            <small>Membre depuis {{ u.createdAt | timeAgo }}</small>

            @if (editing()) {
              <form class="bio-form" (submit)="$event.preventDefault(); saveBio(bio.value)">
                <input #bio [value]="u.bio" maxlength="160" placeholder="Quelques mots sur toi…" />
                <button class="btn small">OK</button>
              </form>
            } @else {
              <p class="bio">{{ u.bio || (isMe() ? 'Ajoute une bio pour te présenter ✍️' : '') }}</p>
              @if (isMe()) {
                <button class="btn ghost small" (click)="editing.set(true)">Modifier la bio</button>
              }
            }

            @if (stats(); as s) {
              <div class="stats">
                <div><strong>{{ s.posts }}</strong><span>publications</span></div>
                <div><strong>{{ s.photos }}</strong><span>photos</span></div>
                <div><strong>{{ s.videos }}</strong><span>vidéos</span></div>
                <div><strong>{{ s.reactions }}</strong><span>réactions</span></div>
              </div>
            }
          </div>
        </section>

        @if (isMe()) {
          <app-composer (created)="list()?.prepend($event)" />
        }
        <app-feed-list [author]="u.name" />
      } @else {
        <div class="card skeleton" style="height: 320px"></div>
      }
    </div>
  `,
  styles: `
    .wrap { max-width: 680px; margin: 0 auto; display: grid; gap: 18px; }
    .head { padding: 0; overflow: hidden; text-align: center; }
    .cover { height: 140px; background: radial-gradient(circle at 20% 30%, var(--c), transparent 60%),
      radial-gradient(circle at 80% 70%, #7c5cff, transparent 55%), linear-gradient(135deg, #2a1f4f, #46204a); }
    .body { padding: 0 20px 22px; margin-top: -56px; display: grid; justify-items: center; gap: 6px; }
    .big-av { border: 5px solid var(--bg); box-shadow: var(--shadow); }
    h1 { margin: 6px 0 0; font-size: 1.7rem; }
    small { color: var(--muted); }
    .bio { margin: 6px 0; color: var(--muted); max-width: 460px; }
    .bio-form { display: flex; gap: 8px; width: min(100%, 420px); margin: 6px 0; }
    .bio-form input { flex: 1; }
    .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; width: 100%; margin-top: 14px; }
    .stats div { padding: 12px 6px; border-radius: 14px; background: var(--glass-2); display: grid; }
    .stats strong { font-size: 1.3rem; }
    .stats span { font-size: .78rem; color: var(--muted); }
    .empty { text-align: center; padding: 48px 20px; }
    .empty .big { font-size: 3rem; }
  `,
})
export default class ProfilePage {
  name = input.required<string>(); // lié au paramètre de route :name

  private api = inject(ApiService);
  private toast = inject(ToastService);
  private auth = inject(AuthService);

  protected user = signal<User | null>(null);
  protected stats = signal<ProfileStats | null>(null);
  protected notFound = signal(false);
  protected editing = signal(false);
  protected list = viewChild(FeedListComponent);
  protected isMe = computed(() => this.auth.user()?.id === this.user()?.id);

  constructor() {
    effect(() => {
      const name = this.name();
      this.user.set(null);
      this.notFound.set(false);
      this.api.profile(name).subscribe({
        next: ({ user, stats }) => {
          this.user.set(user);
          this.stats.set(stats);
        },
        error: () => this.notFound.set(true),
      });
    });
  }

  saveBio(bio: string) {
    this.auth.updateBio(bio).subscribe({
      next: ({ user }) => {
        this.user.set(user);
        this.editing.set(false);
      },
      error: (e) => this.toast.error(e),
    });
  }
}
