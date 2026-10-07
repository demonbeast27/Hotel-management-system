/**
 * Adapted from ReactBits (reactbits.dev / 21st.dev) Particles Component
 * License: MIT
 *
 * Ported to Vanilla JavaScript:
 * - Standalone initialization: window.Particles.init(containerSelector, config)
 * - Interactive particle constellation with cursor physics
 * - High-DPI canvas rendering
 * - Automatic pause via IntersectionObserver when off-screen for 60fps performance
 * - Full prefers-reduced-motion compliance
 * - Complete teardown and re-initialization cleanup
 */

'use strict';

(function () {
  // ── Default Configuration ───────────────────────────────────────────────────
  const DEFAULT_CONFIG = {
    particleCount: 65,
    minRadius: 1.5,
    maxRadius: 3.2,
    speed: 0.55,
    connectDistance: 115,
    lineColor: 'rgba(197, 160, 89, 0.20)', // Subtle luxury gold accent
    particleColors: [
      'rgba(202, 138, 4, 0.85)',   // Gold
      'rgba(161, 98, 7, 0.80)',    // Deep gold
      'rgba(59, 130, 246, 0.75)',  // Royal blue
      'rgba(96, 165, 250, 0.65)',  // Soft sky
      'rgba(255, 255, 255, 0.80)'  // White sparkle
    ],
    lineWidth: 0.8,
    interactive: true,
    interactiveRadius: 120,
    interactiveForce: 0.04
  };

  // ── Internal Component State ───────────────────────────────────────────────
  let state = {
    container: null,
    canvas: null,
    ctx: null,
    config: null,
    particles: [],
    mouse: { x: null, y: null },
    animationId: null,
    observer: null,
    motionMedia: null,
    isPaused: false,
    reducedMotion: false,
    boundResize: null,
    boundMouseMove: null,
    boundMouseLeave: null,
    boundMotionChange: null
  };

  // ── Particle Class ─────────────────────────────────────────────────────────
  class Particle {
    constructor(w, h, config) {
      this.reset(w, h, config);
    }

    reset(w, h, config) {
      this.x = Math.random() * w;
      this.y = Math.random() * h;
      this.radius = config.minRadius + Math.random() * (config.maxRadius - config.minRadius);
      this.color = config.particleColors[Math.floor(Math.random() * config.particleColors.length)];

      const angle = Math.random() * Math.PI * 2;
      const velocity = (config.speed * (0.6 + Math.random() * 0.8));
      this.vx = Math.cos(angle) * velocity;
      this.vy = Math.sin(angle) * velocity;
    }

    update(w, h, mouse, config, reducedMotion) {
      if (reducedMotion) return;

      this.x += this.vx;
      this.y += this.vy;

      // Wrap-around bounds with gentle margin
      if (this.x < -10) this.x = w + 10;
      else if (this.x > w + 10) this.x = -10;

      if (this.y < -10) this.y = h + 10;
      else if (this.y > h + 10) this.y = -10;

      // Mouse interactivity (subtle push away)
      if (config.interactive && mouse.x !== null && mouse.y !== null) {
        const dx = this.x - mouse.x;
        const dy = this.y - mouse.y;
        const dist = Math.hypot(dx, dy);

        if (dist < config.interactiveRadius && dist > 0) {
          const force = (1 - dist / config.interactiveRadius) * config.interactiveForce;
          this.x += (dx / dist) * force * 15;
          this.y += (dy / dist) * force * 15;
        }
      }
    }

    draw(ctx) {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
      ctx.fillStyle = this.color;
      ctx.fill();
    }
  }

  // ── Canvas Sizing with DPR Support ──────────────────────────────────────────
  function resizeCanvas() {
    if (!state.container || !state.canvas || !state.ctx) return;

    const rect = state.container.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const width = Math.max(rect.width, 320);
    const height = Math.max(rect.height, 200);

    state.canvas.width = width * dpr;
    state.canvas.height = height * dpr;
    state.canvas.style.width = `${width}px`;
    state.canvas.style.height = `${height}px`;

    state.ctx.setTransform(1, 0, 0, 1, 0, 0);
    state.ctx.scale(dpr, dpr);

    // Dynamic particle count adjustment for small screens
    const screenScale = Math.max(0.45, Math.min(1, width / 1200));
    const targetCount = Math.round(state.config.particleCount * screenScale);

    if (state.particles.length !== targetCount) {
      state.particles = [];
      for (let i = 0; i < targetCount; i++) {
        state.particles.push(new Particle(width, height, state.config));
      }
    }
  }

  // ── Render Loop ────────────────────────────────────────────────────────────
  function render() {
    if (!state.ctx || !state.canvas || state.isPaused) return;

    const rect = state.container.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;

    state.ctx.clearRect(0, 0, w, h);

    const particles = state.particles;
    const count = particles.length;
    const connectDist = state.config.connectDistance;

    // 1. Draw connecting lines
    for (let i = 0; i < count; i++) {
      const p1 = particles[i];
      for (let j = i + 1; j < count; j++) {
        const p2 = particles[j];
        const dx = p1.x - p2.x;
        const dy = p1.y - p2.y;
        const dist = Math.hypot(dx, dy);

        if (dist < connectDist) {
          const alpha = (1 - dist / connectDist) * 0.45;
          state.ctx.beginPath();
          state.ctx.moveTo(p1.x, p1.y);
          state.ctx.lineTo(p2.x, p2.y);
          state.ctx.strokeStyle = state.config.lineColor.replace(/[\d.]+\)$/, `${alpha.toFixed(3)})`);
          state.ctx.lineWidth = state.config.lineWidth;
          state.ctx.stroke();
        }
      }
    }

    // 2. Update & draw particles
    for (let i = 0; i < count; i++) {
      const p = particles[i];
      p.update(w, h, state.mouse, state.config, state.reducedMotion);
      p.draw(state.ctx);
    }

    if (!state.reducedMotion) {
      state.animationId = requestAnimationFrame(render);
    }
  }

  // ── Teardown / Cleanup ──────────────────────────────────────────────────────
  function destroy() {
    if (state.animationId) {
      cancelAnimationFrame(state.animationId);
      state.animationId = null;
    }

    if (state.observer) {
      state.observer.disconnect();
      state.observer = null;
    }

    if (state.boundResize) {
      window.removeEventListener('resize', state.boundResize);
      state.boundResize = null;
    }

    if (state.boundMouseMove && state.container) {
      state.container.removeEventListener('mousemove', state.boundMouseMove);
      state.boundMouseMove = null;
    }

    if (state.boundMouseLeave && state.container) {
      state.container.removeEventListener('mouseleave', state.boundMouseLeave);
      state.boundMouseLeave = null;
    }

    if (state.motionMedia && state.boundMotionChange) {
      state.motionMedia.removeEventListener('change', state.boundMotionChange);
      state.boundMotionChange = null;
    }

    if (state.canvas && state.canvas.parentNode) {
      state.canvas.remove();
    }

    state.canvas = null;
    state.ctx = null;
    state.container = null;
    state.particles = [];
  }

  // ── Initialization ─────────────────────────────────────────────────────────
  function init(containerSelector = '#particles-container', userConfig = {}) {
    destroy();

    const container = typeof containerSelector === 'string'
      ? document.querySelector(containerSelector)
      : containerSelector;

    if (!container) {
      console.warn(`[Particles] Container "${containerSelector}" not found.`);
      return;
    }

    state.container = container;
    state.config = Object.assign({}, DEFAULT_CONFIG, userConfig);

    // Create canvas
    const canvas = document.createElement('canvas');
    canvas.className = 'particles-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    container.appendChild(canvas);

    state.canvas = canvas;
    state.ctx = canvas.getContext('2d');

    // Motion preference detection
    state.motionMedia = window.matchMedia('(prefers-reduced-motion: reduce)');
    state.reducedMotion = state.motionMedia.matches;

    state.boundMotionChange = (e) => {
      state.reducedMotion = e.matches;
      if (state.reducedMotion) {
        if (state.animationId) cancelAnimationFrame(state.animationId);
        render(); // render static frame once
      } else {
        render();
      }
    };
    state.motionMedia.addEventListener('change', state.boundMotionChange);

    // Initial resize & particle creation
    resizeCanvas();

    // Event listeners
    state.boundResize = () => resizeCanvas();
    window.addEventListener('resize', state.boundResize);

    state.boundMouseMove = (e) => {
      const rect = state.container.getBoundingClientRect();
      state.mouse.x = e.clientX - rect.left;
      state.mouse.y = e.clientY - rect.top;
    };
    state.container.addEventListener('mousemove', state.boundMouseMove);

    state.boundMouseLeave = () => {
      state.mouse.x = null;
      state.mouse.y = null;
    };
    state.container.addEventListener('mouseleave', state.boundMouseLeave);

    // IntersectionObserver for 60fps performance optimization
    state.observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          if (state.isPaused) {
            state.isPaused = false;
            if (!state.reducedMotion) {
              render();
            }
          }
        } else {
          state.isPaused = true;
          if (state.animationId) {
            cancelAnimationFrame(state.animationId);
            state.animationId = null;
          }
        }
      });
    }, { threshold: 0.05 });

    state.observer.observe(state.container);

    // Initial render
    state.isPaused = false;
    render();
  }

  // Expose global API
  window.Particles = {
    init,
    destroy
  };

  // Auto-init on DOMContentLoaded if default element exists
  document.addEventListener('DOMContentLoaded', () => {
    if (document.querySelector('#particles-container')) {
      window.Particles.init('#particles-container');
    }
  });
})();
