import { Skia } from '@shopify/react-native-skia';
import type { SkPath } from '@shopify/react-native-skia';

// Bits of the scratch card's cover, outside React: flakes that jump off the
// finger, the shards the cover breaks into at the end and, for a high grade,
// a burst from behind it. Each frame moves them with gravity and draws them
// as one path per color.

export type Tone = 'pink' | 'stripe' | 'light';
export type Pieces = Record<Tone, SkPath | null>;

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Half the width and height. */
  w: number;
  h: number;
  angle: number;
  spin: number;
  life: number;
  tone: Tone;
};

const GRAVITY = 1400;
const TONES: Tone[] = ['pink', 'stripe', 'light'];

function random(min: number, max: number) {
  return min + Math.random() * (max - min);
}

export function createParticles(draw: (pieces: Pieces | null) => void) {
  let particles: Particle[] = [];
  let frame: number | null = null;
  let last = 0;

  const render = () => {
    if (!particles.length) {
      draw(null);
      return;
    }
    const builders = { pink: Skia.PathBuilder.Make(), stripe: Skia.PathBuilder.Make(), light: Skia.PathBuilder.Make() };
    for (const p of particles) {
      const cos = Math.cos(p.angle);
      const sin = Math.sin(p.angle);
      const corner = (dx: number, dy: number) => [p.x + dx * cos - dy * sin, p.y + dx * sin + dy * cos] as const;
      const builder = builders[p.tone];
      builder.moveTo(...corner(-p.w, -p.h));
      builder.lineTo(...corner(p.w, -p.h));
      builder.lineTo(...corner(p.w, p.h));
      builder.lineTo(...corner(-p.w, p.h));
      builder.close();
    }
    draw(Object.fromEntries(TONES.map(tone => [tone, builders[tone].build()])) as Pieces);
  };

  const step = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    particles = particles.filter(p => {
      p.vy += GRAVITY * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.angle += p.spin * dt;
      p.life -= dt;
      return p.life > 0;
    });
    render();
    frame = particles.length ? requestAnimationFrame(step) : null;
  };

  const run = () => {
    if (frame !== null) return;
    last = performance.now();
    frame = requestAnimationFrame(step);
  };

  return {
    /** A few flakes where the finger is, flying off the way it moves. */
    flakes(x: number, y: number, dx: number, dy: number) {
      const length = Math.hypot(dx, dy) || 1;
      for (let i = 0; i < 2; i += 1) {
        const size = random(1.5, 3.5);
        particles.push({
          x: x + random(-8, 8),
          y: y + random(-8, 8),
          vx: (dx / length) * random(60, 160) + random(-80, 80),
          vy: (dy / length) * random(60, 160) - random(120, 260),
          w: size,
          h: size * random(0.6, 1),
          angle: random(0, Math.PI),
          spin: random(-12, 12),
          life: random(0.5, 0.9),
          tone: Math.random() < 0.6 ? 'pink' : 'stripe',
        });
      }
      if (particles.length > 160) particles = particles.slice(-160);
      run();
    },
    /** The rest of the cover breaks into shards that fall away. */
    shatter(width: number, height: number) {
      const columns = 7;
      const rows = 3;
      const w = width / columns / 2;
      const h = height / rows / 2;
      for (let row = 0; row < rows; row += 1) {
        for (let column = 0; column < columns; column += 1) {
          const x = (column * 2 + 1) * w;
          const y = (row * 2 + 1) * h;
          particles.push({
            x,
            y,
            vx: (x - width / 2) * random(1.2, 2.4),
            vy: random(-420, -160),
            w: w * random(0.7, 1),
            h: h * random(0.7, 1),
            angle: random(-0.2, 0.2),
            spin: random(-6, 6),
            life: random(0.7, 1.1),
            tone: (row + column) % 2 ? 'pink' : 'stripe',
          });
        }
      }
      run();
    },
    /** For a high grade: a burst from behind the number. */
    burst(width: number, height: number) {
      for (let i = 0; i < 46; i += 1) {
        const angle = random(-Math.PI * 0.95, -Math.PI * 0.05);
        const speed = random(380, 820);
        const size = random(2.5, 5);
        particles.push({
          x: width / 2 + random(-30, 30),
          y: height / 2 + random(-10, 10),
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          w: size,
          h: size * random(0.4, 0.8),
          angle: random(0, Math.PI),
          spin: random(-14, 14),
          life: random(0.9, 1.5),
          tone: i % 3 === 0 ? 'light' : i % 3 === 1 ? 'pink' : 'stripe',
        });
      }
      run();
    },
    stop() {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
      particles = [];
    },
  };
}
