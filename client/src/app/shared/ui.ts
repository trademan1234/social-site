import {
  ChangeDetectionStrategy,
  Component,
  Directive,
  ElementRef,
  OnDestroy,
  OnInit,
  Pipe,
  PipeTransform,
  computed,
  inject,
  input,
  output,
} from '@angular/core';

/** Avatar à initiales sur dégradé de couleur. */
@Component({
  selector: 'app-avatar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `{{ initials() }}`,
  host: {
    class: 'avatar',
    '[style.--c]': 'color()',
    '[style.width.px]': 'size()',
    '[style.height.px]': 'size()',
    '[style.font-size.px]': 'size() * 0.4',
    '[attr.aria-label]': 'name()',
    role: 'img',
  },
})
export class AvatarComponent {
  name = input.required<string>();
  color = input('#a29bfe');
  size = input(40);
  initials = computed(() =>
    this.name()
      .split(/[\s._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]!.toUpperCase())
      .join('')
  );
}

const rtf = new Intl.RelativeTimeFormat('fr', { numeric: 'auto' });
const STEPS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 31536000],
  ['month', 2592000],
  ['week', 604800],
  ['day', 86400],
  ['hour', 3600],
  ['minute', 60],
];

/** "il y a 5 minutes" */
@Pipe({ name: 'timeAgo' })
export class TimeAgoPipe implements PipeTransform {
  transform(date: string | Date): string {
    const s = (new Date(date).getTime() - Date.now()) / 1000;
    for (const [unit, sec] of STEPS) if (Math.abs(s) >= sec) return rtf.format(Math.round(s / sec), unit);
    return "à l'instant";
  }
}

/**
 * Vidéo optimisée : rien n'est téléchargé tant qu'elle n'approche pas de l'écran,
 * lecture automatique (muette) quand elle est bien visible, pause quand elle sort.
 */
@Directive({ selector: 'video[appSmartVideo]' })
export class SmartVideoDirective implements OnInit, OnDestroy {
  private el = inject<ElementRef<HTMLVideoElement>>(ElementRef).nativeElement;
  private io?: IntersectionObserver;

  ngOnInit() {
    this.el.muted = true;
    this.el.playsInline = true;
    this.io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting && this.el.preload === 'none') this.el.preload = 'metadata';
        if (e.intersectionRatio >= 0.6) this.el.play().catch(() => {});
        else if (!this.el.paused) this.el.pause();
      },
      { threshold: [0, 0.6], rootMargin: '300px 0px' }
    );
    this.io.observe(this.el);
  }

  ngOnDestroy() {
    this.io?.disconnect();
  }
}

/** Émet quand l'élément devient visible (scroll infini). */
@Directive({ selector: '[appInView]' })
export class InViewDirective implements OnInit, OnDestroy {
  appInView = output<void>();
  private el = inject(ElementRef).nativeElement as HTMLElement;
  private io?: IntersectionObserver;

  ngOnInit() {
    this.io = new IntersectionObserver(([e]) => e.isIntersecting && this.appInView.emit(), { rootMargin: '600px 0px' });
    this.io.observe(this.el);
  }

  ngOnDestroy() {
    this.io?.disconnect();
  }
}
