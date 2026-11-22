import { ChangeDetectionStrategy, Component, inject, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { catchError, of } from 'rxjs';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { ComposerComponent } from '../features/composer.component';
import { FeedListComponent } from '../features/feed-list.component';
import { AvatarComponent } from '../shared/ui';

@Component({
  selector: 'app-home',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ComposerComponent, FeedListComponent, AvatarComponent, RouterLink],
  template: `
    <div class="layout">
      <main class="feed">
        <app-composer (created)="list()?.prepend($event)" />
        <app-feed-list />
      </main>

      <aside class="side">
        <div class="card hero">
          <h2>Bienvenue sur <span class="grad-text">Pulse</span></h2>
          <p>Le coin où l'on partage ses moments, en photos et en vidéos.</p>
          <ul>
            <li>📸 Publie tes plus belles photos</li>
            <li>🎬 Regarde et partage des vidéos</li>
            <li>❤️ Réagis et commente</li>
          </ul>
          @if (!auth.isLoggedIn()) {
            <button class="btn block" (click)="auth.joinOpen.set(true)">C'est parti</button>
          }
        </div>

        @if (members().length) {
          <div class="card members">
            <h3>Nouveaux membres</h3>
            @for (m of members(); track m.id) {
              <a [routerLink]="['/u', m.name]" class="member">
                <app-avatar [name]="m.name" [color]="m.color" [size]="36" />
                <span>{{ m.name }}</span>
              </a>
            }
          </div>
        }
      </aside>
    </div>
  `,
  styles: `
    .layout { display: grid; grid-template-columns: minmax(0, 620px) 300px; gap: 28px; justify-content: center; }
    .feed { display: grid; gap: 18px; align-content: start; min-width: 0; }
    .side { display: grid; gap: 18px; align-content: start; position: sticky; top: 92px; height: max-content; }
    .hero { padding: 22px; }
    .hero h2 { margin: 0 0 6px; font-size: 1.35rem; }
    .hero p { color: var(--muted); margin: 0 0 12px; }
    .hero ul { list-style: none; padding: 0; margin: 0 0 16px; display: grid; gap: 8px; }
    .members { padding: 18px; }
    .members h3 { margin: 0 0 10px; font-size: 1rem; }
    .member { display: flex; align-items: center; gap: 10px; padding: 7px 8px; border-radius: 12px; color: var(--text); text-decoration: none; font-weight: 600; }
    .member:hover { background: var(--glass-2); }
    @media (max-width: 960px) {
      .layout { grid-template-columns: minmax(0, 620px); }
      .side { display: none; }
    }
  `,
})
export default class HomePage {
  protected auth = inject(AuthService);
  protected list = viewChild(FeedListComponent);
  protected members = toSignal(inject(ApiService).members().pipe(catchError(() => of([]))), { initialValue: [] });
}
