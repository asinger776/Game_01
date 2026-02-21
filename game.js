'use strict';

const VERSION = 'v1.0.2';

// ── Canvas Setup ────────────────────────────────────────────────────────────
const canvas = document.getElementById('gameCanvas');
const ctx    = canvas.getContext('2d');

let W = 0, H = 0, DPR = 1;

function resize() {
  DPR    = window.devicePixelRatio || 1;
  W      = window.innerWidth;
  H      = window.innerHeight;
  canvas.width  = W * DPR;
  canvas.height = H * DPR;
  canvas.style.width  = W + 'px';
  canvas.style.height = H + 'px';
  ctx.scale(DPR, DPR);

  // Reposition paddle on resize
  if (paddle) {
    paddle.x = W / 2 - paddle.w / 2;
    paddle.y = H - paddleBottomOffset;
  }
}
window.addEventListener('resize', resize);
resize();

// ── State ───────────────────────────────────────────────────────────────────
const STATES = { START: 0, PLAYING: 1, GAME_OVER: 2 };
let state = STATES.START;

let score     = 0;
let bestScore = parseInt(localStorage.getItem('bounceBest') || '0', 10);
let lives     = 3;
let combo     = 0;
let frameId   = null;
let lastTime  = 0;

// ── DOM refs ─────────────────────────────────────────────────────────────────
const startScreen    = document.getElementById('startScreen');
const gameOverScreen = document.getElementById('gameOverScreen');
const hudEl          = document.getElementById('hud');
const scoreDisplay   = document.getElementById('scoreDisplay');
const livesDisplay   = document.getElementById('livesDisplay');
const finalScoreEl   = document.getElementById('finalScore');
const bestScoreEl    = document.getElementById('bestScore');
document.getElementById('versionDisplay').textContent = VERSION;

function addButtonHandler(id, fn) {
  const el = document.getElementById(id);
  el.addEventListener('click', fn);
  el.addEventListener('touchend', function(e) { e.preventDefault(); fn(); });
}
addButtonHandler('startBtn', startGame);
addButtonHandler('restartBtn', startGame);

// ── Paddle ───────────────────────────────────────────────────────────────────
const paddleBottomOffset = 60;
const PADDLE_H = 14;

const paddle = {
  w: Math.min(120, W * 0.32),
  h: PADDLE_H,
  x: 0,
  y: 0,
  targetX: 0,
  color: '#7c3aed',
};

// ── Ball ─────────────────────────────────────────────────────────────────────
const BALL_RADIUS = 12;
const SPEED_BASE  = 320;  // px/s  (logical pixels)
const SPEED_MAX   = 600;

function makeBall() {
  const angle  = (-Math.PI / 2) + (Math.random() - 0.5) * (Math.PI / 3);
  const speed  = SPEED_BASE;
  return {
    x:  W / 2,
    y:  H / 2,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    r:  BALL_RADIUS,
    hue: Math.random() * 360,
    trail: [],
  };
}

let balls = [];

// ── Particles ─────────────────────────────────────────────────────────────────
let particles = [];

function burst(x, y, hue, count = 12) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const spd   = 60 + Math.random() * 180;
    particles.push({
      x, y,
      vx: Math.cos(angle) * spd,
      vy: Math.sin(angle) * spd,
      r:  2 + Math.random() * 3,
      life: 1,
      decay: 0.018 + Math.random() * 0.022,
      hue,
    });
  }
}

// ── Stars (background) ───────────────────────────────────────────────────────
const STAR_COUNT = 60;
let stars = [];

function buildStars() {
  stars = [];
  for (let i = 0; i < STAR_COUNT; i++) {
    stars.push({
      x:       Math.random() * W,
      y:       Math.random() * H,
      r:       0.5 + Math.random() * 1.5,
      opacity: 0.2 + Math.random() * 0.6,
      twinkle: Math.random() * Math.PI * 2,
    });
  }
}
buildStars();

// ── Touch / Mouse Input ───────────────────────────────────────────────────────
let touchX = null;

function handleTouchStart(e) {
  e.preventDefault();
  const t = e.changedTouches[0];
  touchX = t.clientX;
}
function handleTouchMove(e) {
  e.preventDefault();
  const t = e.changedTouches[0];
  touchX = t.clientX;
}
function handleTouchEnd(e) {
  e.preventDefault();
}

function handleMouseMove(e) {
  touchX = e.clientX;
}

canvas.addEventListener('touchstart',  handleTouchStart,  { passive: false });
canvas.addEventListener('touchmove',   handleTouchMove,   { passive: false });
canvas.addEventListener('touchend',    handleTouchEnd,    { passive: false });
canvas.addEventListener('mousemove',   handleMouseMove);

// ── Score flash ───────────────────────────────────────────────────────────────
let scoreFlashes = [];

function addScoreFlash(x, y, text) {
  scoreFlashes.push({ x, y, text, life: 1 });
}

// ── Update ────────────────────────────────────────────────────────────────────
function update(dt) {
  if (state !== STATES.PLAYING) return;

  // Clamp dt to avoid spiral of death after tab switch
  dt = Math.min(dt, 0.05);

  // ── Paddle ──
  if (touchX !== null) {
    paddle.targetX = touchX - paddle.w / 2;
  }
  // Clamp
  paddle.targetX = Math.max(0, Math.min(W - paddle.w, paddle.targetX));
  // Smooth
  paddle.x += (paddle.targetX - paddle.x) * Math.min(1, dt * 18);

  // ── Score creep ──
  score += dt * 5;
  scoreDisplay.textContent = Math.floor(score);

  // ── Stars twinkle ──
  for (const s of stars) {
    s.twinkle += dt * 1.2;
  }

  // ── Balls ──
  for (let i = balls.length - 1; i >= 0; i--) {
    const b = balls[i];

    // Trail
    b.trail.push({ x: b.x, y: b.y });
    if (b.trail.length > 8) b.trail.shift();

    // Move
    b.x += b.vx * dt;
    b.y += b.vy * dt;

    // Hue drift
    b.hue = (b.hue + dt * 60) % 360;

    // Wall collisions
    if (b.x - b.r < 0) {
      b.x = b.r;
      b.vx = Math.abs(b.vx);
      burst(b.x, b.y, b.hue, 6);
    } else if (b.x + b.r > W) {
      b.x = W - b.r;
      b.vx = -Math.abs(b.vx);
      burst(b.x, b.y, b.hue, 6);
    }

    // Ceiling
    if (b.y - b.r < 0) {
      b.y = b.r;
      b.vy = Math.abs(b.vy);
      burst(b.x, b.y, b.hue, 6);
    }

    // Paddle collision
    const paddleTop = paddle.y - paddle.h / 2;
    if (
      b.vy > 0 &&
      b.y + b.r >= paddleTop &&
      b.y + b.r <= paddleTop + paddle.h + 8 &&
      b.x >= paddle.x - 6 &&
      b.x <= paddle.x + paddle.w + 6
    ) {
      b.y = paddleTop - b.r;
      b.vy = -Math.abs(b.vy);

      // Deflect based on hit position
      const rel  = (b.x - paddle.x) / paddle.w; // 0..1
      const norm = rel - 0.5; // -0.5..0.5
      const spd  = Math.min(
        Math.hypot(b.vx, b.vy) + 18,
        SPEED_MAX
      );
      const exitAngle = -Math.PI / 2 + norm * (Math.PI * 0.7);
      b.vx = Math.cos(exitAngle) * spd;
      b.vy = Math.sin(exitAngle) * spd;

      combo++;
      const pts = 10 * combo;
      score += pts;
      addScoreFlash(b.x, paddleTop - 20, `+${pts}`);
      burst(b.x, paddleTop, b.hue, 14);
      vibrateLight();
    }

    // Ball lost (below screen)
    if (b.y - b.r > H + 20) {
      balls.splice(i, 1);
      burst(b.x, H - 10, 0, 16);
      combo = 0;
      lives--;
      updateLivesHUD();

      if (lives <= 0) {
        endGame();
        return;
      } else {
        // Respawn after brief delay
        setTimeout(() => {
          if (state === STATES.PLAYING) {
            balls.push(makeBall());
          }
        }, 600);
      }
    }
  }

  // ── Particles ──
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x    += p.vx * dt;
    p.y    += p.vy * dt;
    p.vy   += 200 * dt; // gravity
    p.life -= p.decay;
    if (p.life <= 0) particles.splice(i, 1);
  }

  // ── Score flashes ──
  for (let i = scoreFlashes.length - 1; i >= 0; i--) {
    const f = scoreFlashes[i];
    f.y   -= 80 * dt;
    f.life -= dt * 2;
    if (f.life <= 0) scoreFlashes.splice(i, 1);
  }
}

// ── Draw ─────────────────────────────────────────────────────────────────────
function draw(t) {
  ctx.clearRect(0, 0, W, H);

  // Background gradient
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#0f0f1a');
  bg.addColorStop(1, '#1a0f2e');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Stars
  for (const s of stars) {
    const alpha = s.opacity * (0.6 + 0.4 * Math.sin(s.twinkle));
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,255,255,${alpha})`;
    ctx.fill();
  }

  if (state === STATES.PLAYING || state === STATES.GAME_OVER) {
    drawPaddle();
    drawParticles();
    for (const b of balls) drawBall(b);
    drawScoreFlashes();
  }
}

function drawPaddle() {
  const cx = paddle.x + paddle.w / 2;
  const cy = paddle.y;
  const r  = paddle.h / 2;

  // Glow
  const glow = ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, paddle.w * 0.6);
  glow.addColorStop(0, 'rgba(124,58,237,0.35)');
  glow.addColorStop(1, 'rgba(124,58,237,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(paddle.x - 30, cy - 30, paddle.w + 60, 60);

  // Pill shape
  ctx.beginPath();
  ctx.roundRect(paddle.x, cy - r, paddle.w, paddle.h, r);
  const grad = ctx.createLinearGradient(paddle.x, cy - r, paddle.x, cy + r);
  grad.addColorStop(0, '#a78bfa');
  grad.addColorStop(1, '#6d28d9');
  ctx.fillStyle = grad;
  ctx.fill();

  // Shine
  ctx.beginPath();
  ctx.roundRect(paddle.x + 6, cy - r + 2, paddle.w - 12, r * 0.55, r * 0.4);
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fill();
}

function drawBall(b) {
  // Trail
  for (let i = 0; i < b.trail.length; i++) {
    const t = b.trail[i];
    const prog  = (i + 1) / b.trail.length;
    const alpha = prog * 0.35;
    const r     = b.r * prog * 0.7;
    ctx.beginPath();
    ctx.arc(t.x, t.y, r, 0, Math.PI * 2);
    ctx.fillStyle = `hsla(${b.hue},90%,65%,${alpha})`;
    ctx.fill();
  }

  // Glow
  const glow = ctx.createRadialGradient(b.x, b.y, b.r * 0.1, b.x, b.y, b.r * 2.5);
  glow.addColorStop(0, `hsla(${b.hue},100%,70%,0.5)`);
  glow.addColorStop(1, `hsla(${b.hue},100%,70%,0)`);
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(b.x, b.y, b.r * 2.5, 0, Math.PI * 2);
  ctx.fill();

  // Ball body
  const grad = ctx.createRadialGradient(
    b.x - b.r * 0.3, b.y - b.r * 0.3, b.r * 0.1,
    b.x, b.y, b.r
  );
  grad.addColorStop(0, `hsl(${b.hue},100%,88%)`);
  grad.addColorStop(0.5, `hsl(${b.hue},90%,62%)`);
  grad.addColorStop(1, `hsl(${b.hue},80%,38%)`);
  ctx.beginPath();
  ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();

  // Specular highlight
  ctx.beginPath();
  ctx.arc(b.x - b.r * 0.32, b.y - b.r * 0.32, b.r * 0.28, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.fill();
}

function drawParticles() {
  for (const p of particles) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r * p.life, 0, Math.PI * 2);
    ctx.fillStyle = `hsla(${p.hue},90%,65%,${p.life})`;
    ctx.fill();
  }
}

function drawScoreFlashes() {
  for (const f of scoreFlashes) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, f.life);
    ctx.font = 'bold 22px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';
    ctx.shadowColor = '#a78bfa';
    ctx.shadowBlur = 10;
    ctx.fillText(f.text, f.x, f.y);
    ctx.restore();
  }
}

// ── Game Loop ─────────────────────────────────────────────────────────────────
function loop(timestamp) {
  const dt = Math.min((timestamp - lastTime) / 1000, 0.05);
  lastTime = timestamp;
  update(dt);
  draw(timestamp);
  frameId = requestAnimationFrame(loop);
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────
function startGame() {
  score     = 0;
  lives     = 3;
  combo     = 0;
  balls     = [makeBall()];
  particles = [];
  scoreFlashes = [];
  touchX    = null;

  paddle.w  = Math.min(120, W * 0.32);
  paddle.x  = W / 2 - paddle.w / 2;
  paddle.y  = H - paddleBottomOffset;
  paddle.targetX = paddle.x;

  buildStars();
  updateLivesHUD();
  scoreDisplay.textContent = '0';

  startScreen.classList.remove('active');
  gameOverScreen.classList.remove('active');
  hudEl.classList.remove('hidden');

  state = STATES.PLAYING;

  if (frameId) cancelAnimationFrame(frameId);
  lastTime = performance.now();
  frameId  = requestAnimationFrame(loop);
}

function endGame() {
  state = STATES.GAME_OVER;
  const s = Math.floor(score);
  if (s > bestScore) {
    bestScore = s;
    localStorage.setItem('bounceBest', bestScore);
  }
  finalScoreEl.textContent = s;
  bestScoreEl.textContent  = bestScore;

  setTimeout(() => {
    gameOverScreen.classList.add('active');
    hudEl.classList.add('hidden');
  }, 600);
}

function updateLivesHUD() {
  const full  = '♥';
  const empty = '♡';
  livesDisplay.textContent = full.repeat(Math.max(0, lives)) + empty.repeat(Math.max(0, 3 - lives));
}

// ── Haptics ──────────────────────────────────────────────────────────────────
function vibrateLight() {
  if (navigator.vibrate) navigator.vibrate(10);
}

// ── Kick off background loop immediately ─────────────────────────────────────
lastTime = performance.now();
frameId  = requestAnimationFrame(loop);
