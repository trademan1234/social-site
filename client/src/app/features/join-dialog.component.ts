import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, inject, signal, viewChild } from '@angular/core';
import { AuthService } from '../core/auth.service';

@Component({
  selector: 'app-join-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="backdrop" (click)="auth.joinOpen.set(false)"></div>
    <div class="card dialog" role="dialog" aria-modal="true" aria-labelledby="join-title" (keydown.escape)="auth.joinOpen.set(false)">
      <div class="logo-big">✦</div>
      <h2 id="join-title">{{ mode() === 'register' ? 'Rejoins Pulse' : 'Bon retour !' }}</h2>
      <p class="sub">
        {{ mode() === 'register' ? 'Choisis simplement un pseudo. Pas d’email, pas de mot de passe.' : 'Entre ton pseudo pour te reconnecter.' }}
      </p>

      <div class="switch">
        <button [class.on]="mode() === 'register'" (click)="setMode('register')">S'inscrire</button>
        <button [class.on]="mode() === 'login'" (click)="setMode('login')">Se connecter</button>
      </div>

      <form (submit)="$event.preventDefault(); submit()">
        <input #nameInput [value]="name()" (input)="name.set(nameInput.value)" maxlength="24" placeholder="Ton pseudo"
          autocomplete="nickname" aria-label="Pseudo" />
        @if (error()) {
          <p class="err">{{ error() }}</p>
        }
        <button class="btn block" [disabled]="busy() || name().trim().length < 2">
          {{ busy() ? '…' : mode() === 'register' ? 'Créer mon compte' : 'Me connecter' }}
        </button>
      </form>
    </div>
  `,
  styles: `
    :host { position: fixed; inset: 0; z-index: 200; display: grid; place-items: center; padding: 16px; }
    .backdrop { position: absolute; inset: 0; background: rgba(5, 5, 14, .7); backdrop-filter: blur(6px); animation: fade .2s; }
    .dialog { position: relative; width: min(100%, 400px); padding: 28px 24px 24px; text-align: center; animation: rise .25s cubic-bezier(.2, .9, .3, 1.2); }
    .logo-big { width: 64px; height: 64px; margin: 0 auto 10px; border-radius: 20px; display: grid; place-items: center; font-size: 2rem; color: #fff;
      background: var(--grad); box-shadow: 0 10px 30px rgba(160, 80, 255, .45); }
    h2 { margin: 0; font-size: 1.5rem; }
    .sub { color: var(--muted); margin: 6px 0 18px; }
    .switch { display: flex; padding: 4px; border-radius: 999px; background: var(--glass-2); margin-bottom: 16px; }
    .switch button { flex: 1; border: 0; padding: 8px; border-radius: 999px; background: none; color: var(--muted); font: 600 .9rem var(--font); cursor: pointer; }
    .switch button.on { background: var(--surface-solid); color: var(--text); box-shadow: 0 2px 10px rgba(0,0,0,.3); }
    form { display: grid; gap: 12px; }
    input { text-align: center; font-size: 1.1rem; padding: 14px; }
    .err { color: #ff7b9c; margin: 0; font-size: .9rem; }
    @keyframes fade { from { opacity: 0 } }
    @keyframes rise { from { opacity: 0; transform: translateY(20px) scale(.96) } }
  `,
})
export class JoinDialogComponent {
  protected auth = inject(AuthService);
  protected mode = signal<'register' | 'login'>('register');
  protected name = signal('');
  protected error = signal('');
  protected busy = signal(false);
  private input = viewChild<ElementRef<HTMLInputElement>>('nameInput');

  constructor() {
    afterNextRender(() => this.input()?.nativeElement.focus());
  }

  setMode(m: 'register' | 'login') {
    this.mode.set(m);
    this.error.set('');
  }

  submit() {
    this.busy.set(true);
    this.error.set('');
    this.auth.join(this.name().trim(), this.mode()).subscribe({
      next: () => this.busy.set(false),
      error: (e) => {
        this.busy.set(false);
        this.error.set(e?.error?.error || 'Erreur de connexion au serveur');
        if (e.status === 404) this.mode.set('register');
      },
    });
  }
}
