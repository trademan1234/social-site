import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { ToastService } from './core/api.service';
import { AuthService } from './core/auth.service';
import { JoinDialogComponent } from './features/join-dialog.component';
import { AvatarComponent } from './shared/ui';

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, AvatarComponent, JoinDialogComponent],
  template: `
    <div class="bg-orbs" aria-hidden="true"><span></span><span></span><span></span></div>

    <header class="topbar">
      <div class="inner">
        <a routerLink="/" class="brand"><span class="mark">✦</span><span class="grad-text">Pulse</span></a>
        <span class="spacer"></span>
        @if (auth.user(); as me) {
          <div class="me">
            <button class="me-btn" (click)="menu.set(!menu())" [attr.aria-expanded]="menu()">
              <app-avatar [name]="me.name" [color]="me.color" [size]="36" />
              <span class="me-name">{{ me.name }}</span>
            </button>
            @if (menu()) {
              <div class="menu card" (click)="menu.set(false)">
                <a [routerLink]="['/u', me.name]">👤 Mon profil</a>
                <button (click)="auth.logout()">🚪 Se déconnecter</button>
              </div>
            }
          </div>
        } @else {
          <button class="btn ghost small" (click)="auth.joinOpen.set(true)">Se connecter</button>
          <button class="btn small" (click)="auth.joinOpen.set(true)">S'inscrire</button>
        }
      </div>
    </header>

    <div class="page"><router-outlet /></div>

    @if (auth.joinOpen()) {
      <app-join-dialog />
    }

    <div class="toasts" aria-live="polite">
      @for (t of toast.toasts(); track t.id) {
        <div class="toast" [class.err]="t.kind === 'err'">{{ t.text }}</div>
      }
    </div>
  `,
  styleUrl: './app.component.scss',
})
export class AppComponent {
  protected auth = inject(AuthService);
  protected toast = inject(ToastService);
  protected menu = signal(false);
}
