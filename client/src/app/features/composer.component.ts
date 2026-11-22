import { HttpEventType } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnDestroy, inject, output, signal } from '@angular/core';
import { ApiService, ToastService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { Post } from '../core/models';
import { AvatarComponent } from '../shared/ui';

@Component({
  selector: 'app-composer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AvatarComponent],
  template: `
    @if (auth.user(); as me) {
      <div class="card composer" [class.drag]="dragging()"
        (dragover)="$event.preventDefault(); dragging.set(true)"
        (dragleave)="dragging.set(false)"
        (drop)="onDrop($event)">
        <div class="row">
          <app-avatar [name]="me.name" [color]="me.color" [size]="44" />
          <textarea #cap rows="2" maxlength="500" [value]="caption()" (input)="caption.set(cap.value)"
            [placeholder]="'Quoi de neuf, ' + me.name + ' ?'"></textarea>
        </div>

        @if (preview(); as pv) {
          <div class="preview">
            @if (kind() === 'photo') {
              <img [src]="pv" alt="Aperçu" />
            } @else {
              <video [src]="pv" muted controls playsinline (loadedmetadata)="onVideoMeta($event)"></video>
            }
            <button class="icon-btn close" (click)="clear()" aria-label="Retirer le média">✕</button>
          </div>
        }

        @if (progress() !== null) {
          <div class="progress"><span [style.width.%]="progress()"></span></div>
        }

        <div class="bar">
          <label class="chip">
            <input type="file" accept="image/*" hidden (change)="onPick($event)" /> 📸 Photo
          </label>
          <label class="chip">
            <input type="file" accept="video/mp4,video/webm,video/quicktime" hidden (change)="onPick($event)" /> 🎬 Vidéo
          </label>
          <span class="spacer"></span>
          <button class="btn" [disabled]="!file() || progress() !== null" (click)="publish()">
            {{ progress() !== null ? 'Envoi… ' + progress() + '%' : 'Publier' }}
          </button>
        </div>
      </div>
    } @else {
      <div class="card cta">
        <div>
          <h2>Rejoins la communauté ✨</h2>
          <p>Partage tes photos, tes vidéos et réagis aux publications. Juste un pseudo, c'est tout.</p>
        </div>
        <button class="btn" (click)="auth.joinOpen.set(true)">Créer mon compte</button>
      </div>
    }
  `,
  styles: `
    .composer { padding: 16px; transition: box-shadow .2s, border-color .2s; }
    .composer.drag { border-color: var(--accent-2); box-shadow: 0 0 0 4px rgba(255, 92, 170, .2); }
    .row { display: flex; gap: 12px; align-items: flex-start; }
    textarea { flex: 1; resize: none; min-height: 48px; background: transparent; border: 0; font-size: 1.05rem; padding: 10px 0; }
    textarea:focus { outline: none; box-shadow: none; }
    .preview { position: relative; margin-top: 12px; border-radius: 16px; overflow: hidden; background: #000; }
    .preview img, .preview video { width: 100%; max-height: 420px; object-fit: contain; display: block; }
    .close { position: absolute; top: 10px; right: 10px; background: rgba(0,0,0,.6); }
    .progress { height: 6px; border-radius: 6px; background: var(--glass-2); margin-top: 12px; overflow: hidden; }
    .progress span { display: block; height: 100%; background: var(--grad); transition: width .2s; }
    .bar { display: flex; align-items: center; gap: 8px; margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--line); flex-wrap: wrap; }
    .spacer { flex: 1; }
    .cta { padding: 22px; display: flex; gap: 16px; align-items: center; justify-content: space-between; flex-wrap: wrap;
      background: linear-gradient(135deg, rgba(124, 92, 255, .25), rgba(255, 92, 170, .18)), var(--surface); }
    .cta h2 { margin: 0 0 4px; font-size: 1.25rem; }
    .cta p { margin: 0; color: var(--muted); }
  `,
})
export class ComposerComponent implements OnDestroy {
  created = output<Post>();

  protected auth = inject(AuthService);
  private api = inject(ApiService);
  private toast = inject(ToastService);

  protected caption = signal('');
  protected file = signal<File | null>(null);
  protected kind = signal<'photo' | 'video'>('photo');
  protected preview = signal<string | null>(null);
  protected progress = signal<number | null>(null);
  protected dragging = signal(false);
  private dims: { width?: number; height?: number } = {};

  onPick(e: Event) {
    const input = e.target as HTMLInputElement;
    if (input.files?.[0]) this.setFile(input.files[0]);
    input.value = '';
  }

  onDrop(e: DragEvent) {
    e.preventDefault();
    this.dragging.set(false);
    const f = e.dataTransfer?.files?.[0];
    if (f) this.setFile(f);
  }

  onVideoMeta(e: Event) {
    const v = e.target as HTMLVideoElement;
    this.dims = { width: v.videoWidth, height: v.videoHeight };
  }

  private setFile(f: File) {
    const isImg = f.type.startsWith('image/');
    if (!isImg && !f.type.startsWith('video/')) return this.toast.show('Choisis une image ou une vidéo', 'err');
    if (f.size > 100 * 1024 * 1024) return this.toast.show('Fichier trop lourd (100 Mo max)', 'err');
    this.clear();
    this.file.set(f);
    this.kind.set(isImg ? 'photo' : 'video');
    this.preview.set(URL.createObjectURL(f));
  }

  clear() {
    const pv = this.preview();
    if (pv) URL.revokeObjectURL(pv);
    this.preview.set(null);
    this.file.set(null);
    this.dims = {};
  }

  publish() {
    const f = this.file();
    if (!f) return;
    const fd = new FormData();
    fd.append('caption', this.caption());
    if (this.dims.width) fd.append('width', String(this.dims.width));
    if (this.dims.height) fd.append('height', String(this.dims.height));
    fd.append('media', f);
    this.progress.set(0);
    this.api.createPost(fd).subscribe({
      next: (ev) => {
        if (ev.type === HttpEventType.UploadProgress && ev.total) this.progress.set(Math.round((ev.loaded / ev.total) * 100));
        if (ev.type === HttpEventType.Response && ev.body) {
          this.created.emit(ev.body);
          this.caption.set('');
          this.clear();
          this.progress.set(null);
          this.toast.show('Publié ! 🎉');
        }
      },
      error: (e) => {
        this.progress.set(null);
        this.toast.error(e, "L'envoi a échoué");
      },
    });
  }

  ngOnDestroy() {
    this.clear();
  }
}
