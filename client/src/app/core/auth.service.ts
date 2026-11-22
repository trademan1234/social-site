import { HttpClient, HttpInterceptorFn } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { tap } from 'rxjs';
import { User } from './models';

const TOKEN_KEY = 'pulse.token';
const USER_KEY = 'pulse.user';

function read<T>(key: string): T | null {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : null;
  } catch {
    return null;
  }
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);

  readonly token = signal<string | null>(read<string>(TOKEN_KEY));
  readonly user = signal<User | null>(read<User>(USER_KEY));
  readonly isLoggedIn = computed(() => !!this.token() && !!this.user());

  /** Ouvre/ferme la fenêtre d'inscription. */
  readonly joinOpen = signal(false);

  constructor() {
    // Vérifie que la session stockée est toujours valide
    if (this.token()) {
      this.http.get<{ user: User }>('/api/auth/me').subscribe({
        next: ({ user }) => this.setUser(user),
        error: (e) => e.status === 401 && this.logout(),
      });
    }
  }

  join(name: string, mode: 'register' | 'login') {
    return this.http.post<{ token: string; user: User }>(`/api/auth/${mode}`, { name }).pipe(
      tap(({ token, user }) => {
        localStorage.setItem(TOKEN_KEY, JSON.stringify(token));
        this.token.set(token);
        this.setUser(user);
        this.joinOpen.set(false);
      })
    );
  }

  updateBio(bio: string) {
    return this.http.patch<{ user: User }>('/api/auth/me', { bio }).pipe(tap(({ user }) => this.setUser(user)));
  }

  logout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    this.token.set(null);
    this.user.set(null);
  }

  /** Renvoie true si connecté ; sinon ouvre l'inscription. */
  requireLogin(): boolean {
    if (this.isLoggedIn()) return true;
    this.joinOpen.set(true);
    return false;
  }

  private setUser(user: User) {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    this.user.set(user);
  }
}

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const token = inject(AuthService).token();
  return next(token && req.url.startsWith('/api') ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req);
};
