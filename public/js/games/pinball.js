/* ===== PINBALL ===== */
class PinballGame {
  constructor(canvas, config) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.socket = config.socket;
    this.matchId = config.matchId;
    this.onComplete = config.onComplete;
    this.onScoreUpdate = config.onScoreUpdate || (() => {});
    this.running = false;
    this.raf = null;
    this.W = 400; this.H = 650;
    this.score = 0;
    this.balls = 3;
    this.animT = 0;
    this.ball = { x: 340, y: 580, vx: 0, vy: 0, r: 10, inPlay: false };
    this.leftFlip = { x: 80, y: 600, angle: 0.4, active: false };
    this.rightFlip = { x: 320, y: 600, angle: Math.PI - 0.4, active: false };
    this.bumpers = [
      { x: 130, y: 200, r: 22, score: 100, flash: 0 },
      { x: 270, y: 180, r: 22, score: 100, flash: 0 },
      { x: 200, y: 140, r: 18, score: 150, flash: 0 },
      { x: 100, y: 300, r: 18, score: 75, flash: 0 },
      { x: 300, y: 300, r: 18, score: 75, flash: 0 }
    ];
    this.slingshots = [
      { x1: 70, y1: 470, x2: 140, y2: 540, score: 50, flash: 0 },
      { x1: 330, y1: 470, x2: 260, y2: 540, score: 50, flash: 0 }
    ];
    this.targets = [
      { x: 100, y: 100, w: 20, h: 10, score: 200, hit: false, flash: 0 },
      { x: 160, y: 80, w: 20, h: 10, score: 200, hit: false, flash: 0 },
      { x: 220, y: 70, w: 20, h: 10, score: 200, hit: false, flash: 0 },
      { x: 280, y: 80, w: 20, h: 10, score: 200, hit: false, flash: 0 }
    ];
    this.particles = [];
    this.comboCount = 0;
    this.launchPower = 0;
    this.isLaunching = false;
    this.scorePopups = [];
    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp = this._onKeyUp.bind(this);
    this._onTouchStart = this._onTouchStart.bind(this);
    this._onTouchEnd = this._onTouchEnd.bind(this);
  }

  start() {
    this.running = true;
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    this.canvas.addEventListener('touchstart', this._onTouchStart, { passive: false });
    this.canvas.addEventListener('touchend', this._onTouchEnd, { passive: false });
    this._buildMobileControls();
    this._launchBall();
    this.loop();
  }

  cleanup() {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    this.canvas.removeEventListener('touchstart', this._onTouchStart);
    this.canvas.removeEventListener('touchend', this._onTouchEnd);
    const mc = document.getElementById('mobile-controls');
    if (mc) { mc.innerHTML = ''; mc.className = 'mobile-controls'; }
  }

  _buildMobileControls() {
    const mc = document.getElementById('mobile-controls');
    mc.className = 'mobile-controls active';
    mc.style.cssText = 'display:flex;justify-content:space-between;align-items:flex-end;padding:10px;pointer-events:all;position:absolute;bottom:0;left:0;right:0;';
    mc.innerHTML = `
      <div class="ctrl-btn" id="pb-left" style="background:rgba(0,212,255,0.2);border-color:#00d4ff;width:80px">◀ LEFT</div>
      <div class="ctrl-btn" id="pb-right" style="background:rgba(255,107,157,0.2);border-color:#ff6b9d;width:80px">RIGHT ▶</div>
    `;
    const addHold = (id, flag) => {
      const el = document.getElementById(id);
      if (!el) return;
      const set = (v) => { if (flag === 'left') { this._leftDown = v; this.leftFlip.active = v; } else { this._rightDown = v; this.rightFlip.active = v; } };
      el.addEventListener('touchstart', e => { e.preventDefault(); set(true); }, { passive: false });
      el.addEventListener('touchend', e => { e.preventDefault(); set(false); }, { passive: false });
      el.addEventListener('mousedown', () => set(true)); el.addEventListener('mouseup', () => set(false));
    };
    addHold('pb-left', 'left'); addHold('pb-right', 'right');
  }

  _onKeyDown(e) {
    if (e.key === 'ArrowLeft' || e.key === 'z' || e.key === 'Z') this.leftFlip.active = true;
    if (e.key === 'ArrowRight' || e.key === '/' || e.key === 'x' || e.key === 'X') this.rightFlip.active = true;
  }
  _onKeyUp(e) {
    if (e.key === 'ArrowLeft' || e.key === 'z' || e.key === 'Z') this.leftFlip.active = false;
    if (e.key === 'ArrowRight' || e.key === '/' || e.key === 'x' || e.key === 'X') this.rightFlip.active = false;
  }
  _onTouchStart(e) {
    e.preventDefault();
    Array.from(e.touches).forEach(t => {
      if (t.clientX < this.canvas.getBoundingClientRect().left + this.W / 2) this.leftFlip.active = true;
      else this.rightFlip.active = true;
    });
  }
  _onTouchEnd(e) { e.preventDefault(); if (e.touches.length === 0) { this.leftFlip.active = false; this.rightFlip.active = false; } }

  _launchBall() {
    this.ball = { x: 360, y: 580, vx: 0, vy: -8 - Math.random() * 4, r: 10, inPlay: true };
  }

  loop() {
    if (!this.running) return;
    this.update();
    this.render();
    this.raf = requestAnimationFrame(() => this.loop());
  }

  update() {
    this.animT++;
    const ball = this.ball;
    if (!ball.inPlay) return;

    // Gravity
    ball.vy += 0.25;
    ball.x += ball.vx; ball.y += ball.vy;

    // Side walls
    if (ball.x - ball.r < 30) { ball.x = 30 + ball.r; ball.vx = Math.abs(ball.vx) * 0.8; }
    if (ball.x + ball.r > this.W - 30) { ball.x = this.W - 30 - ball.r; ball.vx = -Math.abs(ball.vx) * 0.8; }
    // Top wall
    if (ball.y - ball.r < 30) { ball.y = 30 + ball.r; ball.vy = Math.abs(ball.vy) * 0.8; }

    // Flipper physics
    this._checkFlipper(this.leftFlip, 1);
    this._checkFlipper(this.rightFlip, -1);

    // Bumpers
    for (const b of this.bumpers) {
      const dx = ball.x - b.x, dy = ball.y - b.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < b.r + ball.r) {
        const nx = dx / dist, ny = dy / dist;
        ball.x = b.x + nx * (b.r + ball.r + 1);
        ball.y = b.y + ny * (b.r + ball.r + 1);
        const speed = Math.sqrt(ball.vx ** 2 + ball.vy ** 2);
        ball.vx = nx * Math.max(speed, 6);
        ball.vy = ny * Math.max(speed, 6);
        this._addScore(b.score, b.x, b.y);
        b.flash = 12;
        this._spawnParticles(b.x, b.y, '#00d4ff');
      }
      if (b.flash > 0) b.flash--;
    }

    // Targets
    for (const t of this.targets) {
      if (!t.hit && ball.x > t.x && ball.x < t.x + t.w && ball.y > t.y && ball.y < t.y + t.h) {
        t.hit = true; t.flash = 20;
        ball.vy = Math.abs(ball.vy);
        this._addScore(t.score, t.x + t.w / 2, t.y);
        this._spawnParticles(t.x + t.w / 2, t.y, '#ffd700');
        if (this.targets.every(tg => tg.hit)) {
          this.targets.forEach(tg => { tg.hit = false; tg.flash = 0; });
          this._addScore(1000, this.W / 2, this.H / 3);
        }
      }
      if (t.flash > 0) t.flash--;
    }

    // Ball lost
    if (ball.y > this.H + 20) {
      ball.inPlay = false;
      this.balls--;
      if (this.balls <= 0) {
        setTimeout(() => { if (this.onComplete) this.onComplete(this.score); }, 1000);
      } else {
        setTimeout(() => this._launchBall(), 1500);
      }
    }

    // Popups
    this.scorePopups = this.scorePopups.filter(p => p.life > 0);
    this.scorePopups.forEach(p => { p.y -= 1; p.life -= 0.02; });
    this.particles = this.particles.filter(p => p.life > 0.01);
    this.particles.forEach(p => { p.x += p.vx; p.y += p.vy; p.vy += 0.1; p.life *= 0.9; });
  }

  _checkFlipper(flip, dir) {
    const ball = this.ball;
    const angle = flip.active ? (dir === 1 ? -0.6 : Math.PI + 0.6) : (dir === 1 ? 0.4 : Math.PI - 0.4);
    flip.angle += (angle - flip.angle) * 0.25;
    const len = 55;
    const ex = flip.x + Math.cos(flip.angle) * len;
    const ey = flip.y + Math.sin(flip.angle) * len;
    const dx = ball.x - flip.x, dy = ball.y - flip.y;
    const t = Math.max(0, Math.min(1, (dx * (ex - flip.x) + dy * (ey - flip.y)) / (len * len)));
    const cx = flip.x + t * (ex - flip.x), cy = flip.y + t * (ey - flip.y);
    const distX = ball.x - cx, distY = ball.y - cy;
    const dist = Math.sqrt(distX * distX + distY * distY);
    if (dist < ball.r + 6) {
      const nx = distX / dist, ny = distY / dist;
      ball.x = cx + nx * (ball.r + 7); ball.y = cy + ny * (ball.r + 7);
      if (flip.active) {
        const flipPower = 9 * dir;
        ball.vx = nx * Math.abs(flipPower) + flipPower * 0.2;
        ball.vy = ny * -9 - 3;
      } else {
        ball.vy = Math.min(ball.vy, 0) * -0.5;
      }
    }
  }

  _addScore(pts, x, y) {
    this.score += pts;
    this.onScoreUpdate(this.score, 0);
    this.scorePopups.push({ x, y, text: `+${pts}`, life: 1 });
  }

  _spawnParticles(x, y, color) {
    for (let i = 0; i < 8; i++) {
      const angle = Math.random() * Math.PI * 2;
      this.particles.push({ x, y, vx: Math.cos(angle) * 3, vy: Math.sin(angle) * 3 - 2, life: 1, color });
    }
  }

  render() {
    const { ctx, W, H, animT, ball, leftFlip, rightFlip, bumpers, targets, slingshots, score, balls, particles, scorePopups } = this;
    ctx.clearRect(0, 0, W, H);

    // Dark background
    ctx.fillStyle = '#0a0014'; ctx.fillRect(0, 0, W, H);

    // Side walls
    ctx.fillStyle = '#2a0050';
    ctx.fillRect(0, 0, 30, H); ctx.fillRect(W - 30, 0, 30, H);
    ctx.fillStyle = '#4a0080';
    ctx.fillRect(28, 0, 2, H); ctx.fillRect(W - 30, 0, 2, H);

    // Bumpers
    bumpers.forEach(b => {
      const glow = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r + 6);
      const col = b.flash > 0 ? '#ffffff' : '#00aaff';
      glow.addColorStop(0, col + '88'); glow.addColorStop(1, 'transparent');
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(b.x, b.y, b.r + 6, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fillStyle = b.flash > 0 ? '#fff' : '#0044cc'; ctx.fill();
      ctx.strokeStyle = b.flash > 0 ? '#ffd700' : '#00aaff'; ctx.lineWidth = 3; ctx.stroke();
      ctx.font = 'bold 10px Orbitron, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = b.flash > 0 ? '#000' : '#fff';
      ctx.fillText(b.score, b.x, b.y + 4);
    });

    // Targets
    targets.forEach(t => {
      ctx.fillStyle = t.hit ? '#333' : (t.flash > 0 ? '#ffd700' : '#ff4444');
      ctx.fillRect(t.x, t.y, t.w, t.h);
      ctx.strokeStyle = t.hit ? '#555' : '#ff6666'; ctx.lineWidth = 1; ctx.strokeRect(t.x, t.y, t.w, t.h);
    });
    ctx.font = '10px Exo 2, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.fillText('HIT ALL TARGETS: 1000pts', W / 2, 58);

    // Score popups
    scorePopups.forEach(p => {
      ctx.font = `bold ${Math.round(14 * (0.5 + p.life * 0.5))}px Orbitron, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillStyle = `rgba(255,215,0,${p.life})`; ctx.fillText(p.text, p.x, p.y);
    });

    // Particles
    particles.forEach(p => {
      ctx.beginPath(); ctx.arc(p.x, p.y, 3 * p.life, 0, Math.PI * 2);
      ctx.fillStyle = p.color + Math.round(p.life * 255).toString(16).padStart(2, '0'); ctx.fill();
    });

    // Flippers
    [leftFlip, rightFlip].forEach(f => {
      const len = 55;
      const ex = f.x + Math.cos(f.angle) * len, ey = f.y + Math.sin(f.angle) * len;
      ctx.strokeStyle = f.active ? '#00ffaa' : '#00aa77'; ctx.lineWidth = 14; ctx.lineCap = 'round';
      ctx.shadowColor = f.active ? '#00ffaa' : 'transparent'; ctx.shadowBlur = f.active ? 15 : 0;
      ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(ex, ey); ctx.stroke();
      ctx.shadowBlur = 0;
    });

    // Ball
    if (ball.inPlay) {
      const ballGlow = ctx.createRadialGradient(ball.x, ball.y, 0, ball.x, ball.y, ball.r * 2);
      ballGlow.addColorStop(0, 'rgba(255,200,50,0.4)'); ballGlow.addColorStop(1, 'transparent');
      ctx.fillStyle = ballGlow; ctx.beginPath(); ctx.arc(ball.x, ball.y, ball.r * 2, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
      const bGrad = ctx.createRadialGradient(ball.x - 2, ball.y - 2, 1, ball.x, ball.y, ball.r);
      bGrad.addColorStop(0, '#ffe080'); bGrad.addColorStop(1, '#cc8800');
      ctx.fillStyle = bGrad; ctx.fill();
    }

    // Drain zone indicator
    ctx.fillStyle = 'rgba(255,0,0,0.15)'; ctx.fillRect(30, H - 40, W - 60, 40);
    ctx.font = '10px Exo 2, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(255,0,0,0.4)';
    ctx.fillText('DRAIN', W / 2, H - 20);

    // Ball count dots
    for (let i = 0; i < 3; i++) {
      ctx.beginPath(); ctx.arc(W / 2 - 20 + i * 20, H - 60, 6, 0, Math.PI * 2);
      ctx.fillStyle = i < balls ? '#ffd700' : 'rgba(255,255,255,0.1)'; ctx.fill();
    }

    // HUD
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(0, 0, W, 35);
    ctx.textAlign = 'left'; ctx.font = 'bold 16px Orbitron, sans-serif'; ctx.fillStyle = '#ffd700';
    ctx.fillText(score.toLocaleString(), 8, 24);
    ctx.textAlign = 'right'; ctx.font = '12px Exo 2, sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillText(`Balls: ${balls}`, W - 8, 24);

    if (balls <= 0 && !ball.inPlay) {
      ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(0, 0, W, H);
      ctx.textAlign = 'center';
      ctx.font = 'bold 28px Orbitron, sans-serif'; ctx.fillStyle = '#ffd700';
      ctx.fillText('GAME OVER', W / 2, H / 2 - 20);
      ctx.font = '20px Exo 2, sans-serif'; ctx.fillStyle = '#00d4ff';
      ctx.fillText(score.toLocaleString() + ' pts', W / 2, H / 2 + 20);
    }
  }
}
