import {
  Component,
  ViewChild,
  ElementRef,
  AfterViewInit,
  OnDestroy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { LanguageSelectComponent } from '../language-select/language-select.component';

// Firework particle after explosion
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  hue: number;
  life: number;
  maxLife: number;
  size: number;
  trail: { x: number; y: number }[];
}

// Rocket before explosion
interface Rocket {
  x: number;
  y: number;
  vx: number;
  vy: number;
  hue: number;
  trail: { x: number; y: number }[];
  targetY: number;
  exploded: boolean;
}

@Component({
  selector: 'app-landing',
  imports: [CommonModule, TranslatePipe, LanguageSelectComponent],
  templateUrl: './landing.component.html',
  styleUrl: './landing.component.scss',
})
export class LandingComponent implements AfterViewInit, OnDestroy {
  @ViewChild('fireworksCanvas') canvasRef!: ElementRef<HTMLCanvasElement>;

  private ctx: CanvasRenderingContext2D | null = null;
  private rockets: Rocket[] = [];
  private particles: Particle[] = [];
  private animationId: number | null = null;
  private audioContext: AudioContext | null = null;
  private nextLaunch = 0;
  private readonly launchInterval = 800;
  private readonly gravity = 0.22;
  private readonly particleCount = 80;

  /** Set to true to enable the firework canvas animation. */
  private readonly fireworksEnabled = false;

  constructor(private router: Router) {}

  ngAfterViewInit(): void {
    if (!this.fireworksEnabled) return;
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) return;
    this.ctx = canvas.getContext('2d');
    this.resizeCanvas();
    window.addEventListener('resize', this.resizeCanvasBound);
    this.nextLaunch = performance.now();
    this.tick();
  }

  ngOnDestroy(): void {
    window.removeEventListener('resize', this.resizeCanvasBound);
    if (this.animationId != null) {
      cancelAnimationFrame(this.animationId);
    }
    this.audioContext?.close();
  }

  private resizeCanvasBound = (): void => this.resizeCanvas();

  private resizeCanvas(): void {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas || !this.ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    this.ctx.scale(dpr, dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
  }

  private playExplosionSound(): void {
    try {
      if (!this.audioContext) {
        this.audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      }
      const ctx = this.audioContext;
      const now = ctx.currentTime;

      // Short noise burst for "bang"
      const bufferSize = ctx.sampleRate * 0.15;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.2));
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

      const lowpass = ctx.createBiquadFilter();
      lowpass.type = 'lowpass';
      lowpass.frequency.value = 800;

      noise.connect(lowpass);
      lowpass.connect(gain);
      gain.connect(ctx.destination);
      noise.start(now);
      noise.stop(now + 0.15);
    } catch {
      // ignore if audio not allowed
    }
  }

  private launchRocket(): void {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) return;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    const x = Math.random() * w * 0.6 + w * 0.2;
    const targetY = h * (0.2 + Math.random() * 0.35);
    const hue = Math.random() * 360; // full spectrum: red, gold, green, blue, purple
    const hue2 = (hue + 40 + Math.random() * 80) % 360;
    this.rockets.push({
      x,
      y: h,
      vx: (Math.random() - 0.5) * 2,
      vy: -14 - Math.random() * 6,
      hue: Math.random() > 0.5 ? hue : hue2,
      trail: [],
      targetY,
      exploded: false,
    });
  }

  private explode(rocket: Rocket): void {
    this.playExplosionSound();
    const count = this.particleCount;
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
      const speed = 4 + Math.random() * 10;
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed;
      const life = 60 + Math.floor(Math.random() * 40);
      const trail: { x: number; y: number }[] = [];
      this.particles.push({
        x: rocket.x,
        y: rocket.y,
        vx,
        vy,
        hue: rocket.hue + (Math.random() * 40 - 20),
        life: 0,
        maxLife: life,
        size: 1.5 + Math.random() * 1.5,
        trail,
      });
    }
    rocket.exploded = true;
  }

  private tick = (): void => {
    const canvas = this.canvasRef?.nativeElement;
    const ctx = this.ctx;
    if (!canvas || !ctx) {
      this.animationId = requestAnimationFrame(this.tick);
      return;
    }
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    const now = performance.now();

    if (now >= this.nextLaunch) {
      this.launchRocket();
      this.nextLaunch = now + this.launchInterval + (Math.random() - 0.5) * 400;
    }

    // Clear (transparent so hero background shows through)
    ctx.clearRect(0, 0, w, h);

    // Rockets
    for (const r of this.rockets) {
      if (r.exploded) continue;
      r.trail.push({ x: r.x, y: r.y });
      if (r.trail.length > 8) r.trail.shift();
      r.x += r.vx;
      r.y += r.vy;
      r.vy += 0.18;
      // Draw rocket trail (glow)
      ctx.strokeStyle = `hsla(${r.hue}, 100%, 60%, 0.6)`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < r.trail.length; i++) {
        const t = r.trail[i];
        if (i === 0) ctx.moveTo(t.x, t.y);
        else ctx.lineTo(t.x, t.y);
      }
      ctx.stroke();
      ctx.fillStyle = `hsl(${r.hue}, 100%, 70%)`;
      ctx.beginPath();
      ctx.arc(r.x, r.y, 2, 0, Math.PI * 2);
      ctx.fill();
      if (r.y <= r.targetY) this.explode(r);
    }
    this.rockets = this.rockets.filter((r) => !r.exploded);

    // Particles (with light glow)
    for (const p of this.particles) {
      p.trail.push({ x: p.x, y: p.y });
      if (p.trail.length > 12) p.trail.shift();
      p.x += p.vx;
      p.y += p.vy;
      p.vy += this.gravity;
      p.vx *= 0.98;
      p.vy *= 0.98;
      p.life++;
      const t = p.life / p.maxLife;
      const alpha = 1 - t;
      if (alpha <= 0) continue;

      // Glow / light effect
      const gradient = ctx.createRadialGradient(
        p.x, p.y, 0,
        p.x, p.y, 20
      );
      gradient.addColorStop(0, `hsla(${p.hue}, 100%, 70%, ${alpha * 0.5})`);
      gradient.addColorStop(0.4, `hsla(${p.hue}, 100%, 50%, ${alpha * 0.15})`);
      gradient.addColorStop(1, 'transparent');
      ctx.fillStyle = gradient;
      ctx.fillRect(p.x - 25, p.y - 25, 50, 50);

      // Trail
      ctx.strokeStyle = `hsla(${p.hue}, 100%, 65%, ${alpha * 0.6})`;
      ctx.lineWidth = p.size;
      ctx.beginPath();
      for (let i = 0; i < p.trail.length; i++) {
        const pt = p.trail[i];
        if (i === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      }
      ctx.stroke();
      ctx.fillStyle = `hsla(${p.hue}, 100%, 70%, ${alpha})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    this.particles = this.particles.filter((p) => p.life < p.maxLife);

    this.animationId = requestAnimationFrame(this.tick);
  };

  handleRegister(): void {
    this.router.navigate(['/register']);
  }

  handleSignin(): void {
    this.router.navigate(['/login']);
  }
}
