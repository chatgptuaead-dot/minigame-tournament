/* ===== SPACE BLAST ===== */
class SpaceBlast {
  constructor(canvas, config) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.socket = config.socket;
    this.matchId = config.matchId;
    this.onComplete = config.onComplete;
    this.onScoreUpdate = config.onScoreUpdate || (() => {});
    this.running = false;
    this.raf = null;
    this.W = 800; this.H = 500;
    this.score = 0;
    this.lives = 3;
    this.level = 1;
    this.animT = 0;
    this.timeLeft = 60;
    this.lastSecond = Date.now();
    this.ship = { x: 400, y: 400, angle: -Math.PI / 2, vx: 0, vy: 0, r: 14, invincible: 0 };
    this.bullets = [];
    this.enemies = [];
    this.asteroids = [];
    this.stars = [];
    this.particles = [];
    this.powerups = [];
    this.lastShot = 0;
    this.keys = {};
    this.done = false;
    this.scorePopups = [];
    this._initStars();
    this._spawnWave();
    this._onKey = this._onKey.bind(this);
    this._onKeyUp = this._onKeyUp.bind(this);
    this._onTap = this._onTap.bind(this);
  }

  _initStars() {
    for (let i = 0; i < 80; i++) {
      this.stars.push({ x: Math.random() * this.W, y: Math.random() * this.H, r: Math.random() * 1.5, speed: 0.5 + Math.random() });
    }
  }

  _spawnWave() {
    for (let i = 0; i < 3 + this.level * 2; i++) {
      this.asteroids.push({
        x: Math.random() * this.W, y: -30 - Math.random() * 100,
        vx: (Math.random() - 0.5) * 2, vy: 1 + Math.random() * 2,
        r: 20 + Math.random() * 25, angle: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 0.04, hp: 2, flash: 0
      });
    }
    // Enemies
    if (this.level > 1) {
      for (let i = 0; i < this.level - 1; i++) {
        this.enemies.push({
          x: Math.random() * this.W, y: -30 - Math.random() * 60,
          vx: (Math.random() - 0.5) * 3, vy: 1.5 + Math.random(),
          r: 14, hp: 3, fireT: 0, flash: 0
        });
      }
    }
  }

  start() {
    this.running = true;
    window.addEventListener('keydown', this._onKey);
    window.addEventListener('keyup', this._onKeyUp);
    this.canvas.addEventListener('touchstart', this._onTap, { passive: false });
    this.canvas.addEventListener('click', this._onTap);
    this._buildMobileControls();
    this.loop();
  }

  cleanup() {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    window.removeEventListener('keydown', this._onKey);
    window.removeEventListener('keyup', this._onKeyUp);
    this.canvas.removeEventListener('touchstart', this._onTap);
    this.canvas.removeEventListener('click', this._onTap);
    const mc = document.getElementById('mobile-controls');
    if (mc) { mc.innerHTML = ''; mc.className = 'mobile-controls'; }
  }

  _onKey(e) { this.keys[e.key] = true; if (e.key === ' ') this._shoot(); }
  _onKeyUp(e) { this.keys[e.key] = false; }
  _onTap(e) { e.preventDefault(); this._shoot(); }

  _buildMobileControls() {
    const mc = document.getElementById('mobile-controls');
    mc.className = 'mobile-controls active';
    mc.style.cssText = 'display:flex;justify-content:space-between;align-items:flex-end;padding:10px;pointer-events:all;position:absolute;bottom:0;left:0;right:0;';
    mc.innerHTML = `
      <div style="display:grid;grid-template-columns:60px 60px 60px;grid-template-rows:60px 60px;gap:8px">
        <div></div>
        <div class="ctrl-btn" id="sb-up">▲</div>
        <div></div>
        <div class="ctrl-btn" id="sb-left">◀</div>
        <div class="ctrl-btn" id="sb-down">▼</div>
        <div class="ctrl-btn" id="sb-right">▶</div>
      </div>
      <div class="ctrl-btn" id="sb-fire" style="width:80px;height:80px;font-size:1.6rem;background:rgba(255,50,50,0.3);border-color:#ff4444">🔥</div>
    `;
    const addHold = (id, key) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('touchstart', e => { e.preventDefault(); this.keys[key] = true; if (key === 'Fire') this._shoot(); }, { passive: false });
      el.addEventListener('touchend', e => { e.preventDefault(); this.keys[key] = false; }, { passive: false });
    };
    addHold('sb-up', 'ArrowUp'); addHold('sb-down', 'ArrowDown');
    addHold('sb-left', 'ArrowLeft'); addHold('sb-right', 'ArrowRight');
    addHold('sb-fire', 'Fire');
  }

  _shoot() {
    if (this.done) return;
    const now = Date.now();
    if (now - this.lastShot < 250) return;
    this.lastShot = now;
    const { ship } = this;
    this.bullets.push({ x: ship.x, y: ship.y, vx: Math.cos(ship.angle) * 14, vy: Math.sin(ship.angle) * 14, life: 1 });
  }

  loop() {
    if (!this.running) return;
    this.update();
    this.render();
    this.raf = requestAnimationFrame(() => this.loop());
  }

  update() {
    this.animT++;
    if (this.done) return;

    // Timer
    const now = Date.now();
    if (now - this.lastSecond >= 1000) { this.timeLeft = Math.max(0, this.timeLeft - 1); this.lastSecond = now; }
    if (this.timeLeft <= 0) { this.done = true; if (this.onComplete) this.onComplete(this.score); return; }

    const ship = this.ship;
    const THRUST = 0.25, MAX_SPD = 8, TURN = 0.06;

    if (this.keys['ArrowLeft'] || this.keys['a']) ship.angle -= TURN;
    if (this.keys['ArrowRight'] || this.keys['d']) ship.angle += TURN;
    if (this.keys['ArrowUp'] || this.keys['w']) {
      ship.vx += Math.cos(ship.angle) * THRUST;
      ship.vy += Math.sin(ship.angle) * THRUST;
      this._spawnThrust(ship.x - Math.cos(ship.angle) * 16, ship.y - Math.sin(ship.angle) * 16);
    }
    if (this.keys['ArrowDown'] || this.keys['s']) { ship.vx *= 0.88; ship.vy *= 0.88; }

    ship.vx = Math.max(-MAX_SPD, Math.min(MAX_SPD, ship.vx)) * 0.98;
    ship.vy = Math.max(-MAX_SPD, Math.min(MAX_SPD, ship.vy)) * 0.98;
    ship.x = ((ship.x + ship.vx) + this.W) % this.W;
    ship.y = ((ship.y + ship.vy) + this.H) % this.H;
    if (ship.invincible > 0) ship.invincible--;

    // Bullets
    this.bullets = this.bullets.filter(b => b.life > 0 && b.x > -10 && b.x < this.W + 10 && b.y > -10 && b.y < this.H + 10);
    this.bullets.forEach(b => { b.x += b.vx; b.y += b.vy; b.life -= 0.02; });

    // Asteroids
    this.asteroids.forEach(a => {
      a.x += a.vx; a.y += a.vy; a.angle += a.rotSpeed;
      if (a.x < -50) a.x = this.W + 50; if (a.x > this.W + 50) a.x = -50;
      if (a.y > this.H + 60) { a.y = -50; a.x = Math.random() * this.W; }
      if (a.flash > 0) a.flash--;
    });

    // Enemies
    this.enemies.forEach(en => {
      en.x += en.vx; en.y += en.vy;
      if (en.x < 50 || en.x > this.W - 50) en.vx *= -1;
      if (en.y > this.H + 60) { en.y = -40; en.x = Math.random() * this.W; }
      en.fireT++;
      if (en.fireT > 90) {
        en.fireT = 0;
        const dx = ship.x - en.x, dy = ship.y - en.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        this.bullets.push({ x: en.x, y: en.y, vx: dx / dist * 5, vy: dy / dist * 5, life: 1, enemy: true });
      }
      if (en.flash > 0) en.flash--;
    });

    // Bullet-asteroid collisions
    for (let bi = this.bullets.length - 1; bi >= 0; bi--) {
      const b = this.bullets[bi];
      if (b.enemy) continue;
      for (let ai = this.asteroids.length - 1; ai >= 0; ai--) {
        const a = this.asteroids[ai];
        const dx = b.x - a.x, dy = b.y - a.y;
        if (Math.sqrt(dx * dx + dy * dy) < a.r) {
          a.hp--; a.flash = 8;
          if (a.hp <= 0) {
            const pts = Math.round(100 / a.r * 20);
            this._addScore(pts, a.x, a.y);
            this._explode(a.x, a.y, '#aaaaff');
            if (a.r > 22) {
              for (let i = 0; i < 2; i++) this.asteroids.push({ x: a.x, y: a.y, vx: (Math.random() - 0.5) * 3, vy: 1 + Math.random() * 2, r: a.r / 2, angle: 0, rotSpeed: (Math.random() - 0.5) * 0.08, hp: 1, flash: 0 });
            }
            this.asteroids.splice(ai, 1);
          }
          this.bullets.splice(bi, 1);
          break;
        }
      }
    }

    // Bullet-enemy collisions
    for (let bi = this.bullets.length - 1; bi >= 0; bi--) {
      const b = this.bullets[bi];
      if (b.enemy) continue;
      for (let ei = this.enemies.length - 1; ei >= 0; ei--) {
        const en = this.enemies[ei];
        const dx = b.x - en.x, dy = b.y - en.y;
        if (Math.sqrt(dx * dx + dy * dy) < en.r + 6) {
          en.hp--; en.flash = 10;
          if (en.hp <= 0) { this._addScore(300, en.x, en.y); this._explode(en.x, en.y, '#ff8844'); this.enemies.splice(ei, 1); }
          this.bullets.splice(bi, 1);
          break;
        }
      }
    }

    // Ship collision with asteroids/enemy bullets
    if (ship.invincible === 0) {
      for (const a of this.asteroids) {
        const dx = ship.x - a.x, dy = ship.y - a.y;
        if (Math.sqrt(dx * dx + dy * dy) < a.r + ship.r - 5) { this._hitShip(); break; }
      }
      for (const b of this.bullets) {
        if (!b.enemy) continue;
        const dx = ship.x - b.x, dy = ship.y - b.y;
        if (Math.sqrt(dx * dx + dy * dy) < ship.r) { this._hitShip(); break; }
      }
    }

    // Spawn more asteroids if cleared
    if (this.asteroids.length === 0 && this.enemies.length === 0) { this.level++; this._spawnWave(); }

    this.particles = this.particles.filter(p => p.life > 0.01);
    this.particles.forEach(p => { p.x += p.vx; p.y += p.vy; p.life *= 0.9; });
    this.scorePopups = this.scorePopups.filter(p => p.life > 0);
    this.scorePopups.forEach(p => { p.y -= 1; p.life -= 0.02; });
  }

  _hitShip() {
    this.lives--;
    this.ship.invincible = 120;
    this._explode(this.ship.x, this.ship.y, '#ff4444');
    if (this.lives <= 0) {
      this.done = true;
      setTimeout(() => { if (this.onComplete) this.onComplete(this.score); }, 1500);
    }
  }

  _addScore(pts, x, y) {
    this.score += pts;
    this.onScoreUpdate(this.score, 0);
    this.scorePopups.push({ x, y, text: `+${pts}`, life: 1 });
  }

  _explode(x, y, color) {
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2, s = 2 + Math.random() * 5;
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1, color });
    }
  }

  _spawnThrust(x, y) {
    this.particles.push({ x, y, vx: (Math.random() - 0.5) * 3, vy: (Math.random() - 0.5) * 3, life: 0.5, color: '#ff8800' });
  }

  render() {
    const { ctx, W, H, animT, ship, bullets, asteroids, enemies, stars, particles, scorePopups, score, lives, timeLeft, done } = this;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#030310'; ctx.fillRect(0, 0, W, H);

    // Stars
    stars.forEach(s => {
      s.x -= s.speed * 0.3; if (s.x < 0) s.x = W;
      const a = 0.3 + 0.3 * Math.sin(animT * 0.05 + s.x);
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${a})`; ctx.fill();
    });

    // Asteroids
    asteroids.forEach(a => {
      ctx.save(); ctx.translate(a.x, a.y); ctx.rotate(a.angle);
      ctx.beginPath();
      const sides = 7;
      for (let i = 0; i < sides; i++) {
        const ang = (i / sides) * Math.PI * 2;
        const r = a.r * (0.8 + Math.sin(i * 2.3) * 0.2);
        i === 0 ? ctx.moveTo(r * Math.cos(ang), r * Math.sin(ang)) : ctx.lineTo(r * Math.cos(ang), r * Math.sin(ang));
      }
      ctx.closePath();
      ctx.fillStyle = a.flash > 0 ? '#fff' : '#6a5a4a'; ctx.fill();
      ctx.strokeStyle = a.flash > 0 ? '#ffd700' : '#aaaaaa'; ctx.lineWidth = 2; ctx.stroke();
      ctx.restore();
    });

    // Enemies
    enemies.forEach(en => {
      ctx.save(); ctx.translate(en.x, en.y);
      ctx.fillStyle = en.flash > 0 ? '#fff' : '#cc4400';
      ctx.beginPath();
      ctx.moveTo(0, -en.r); ctx.lineTo(en.r, en.r); ctx.lineTo(-en.r, en.r);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#ff6600'; ctx.lineWidth = 2; ctx.stroke();
      ctx.restore();
    });

    // Bullets
    bullets.forEach(b => {
      ctx.beginPath(); ctx.arc(b.x, b.y, 3, 0, Math.PI * 2);
      ctx.fillStyle = b.enemy ? '#ff4444' : '#00ffff'; ctx.fill();
      if (!b.enemy) {
        ctx.shadowColor = '#00ffff'; ctx.shadowBlur = 6;
        ctx.fill(); ctx.shadowBlur = 0;
      }
    });

    // Particles
    particles.forEach(p => {
      ctx.beginPath(); ctx.arc(p.x, p.y, 3 * p.life, 0, Math.PI * 2);
      ctx.fillStyle = p.color + Math.round(p.life * 255).toString(16).padStart(2, '0'); ctx.fill();
    });

    // Ship
    if (ship.invincible === 0 || Math.floor(animT / 4) % 2 === 0) {
      ctx.save(); ctx.translate(ship.x, ship.y); ctx.rotate(ship.angle + Math.PI / 2);
      ctx.shadowColor = '#00d4ff'; ctx.shadowBlur = 12;
      ctx.fillStyle = '#00aaff';
      ctx.beginPath();
      ctx.moveTo(0, -ship.r); ctx.lineTo(-ship.r * 0.6, ship.r * 0.8); ctx.lineTo(0, ship.r * 0.4); ctx.lineTo(ship.r * 0.6, ship.r * 0.8);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(100,200,255,0.6)';
      ctx.beginPath(); ctx.moveTo(0, -ship.r + 4); ctx.lineTo(-ship.r * 0.3, ship.r * 0.2); ctx.lineTo(ship.r * 0.3, ship.r * 0.2); ctx.closePath(); ctx.fill();
      ctx.shadowBlur = 0; ctx.restore();
    }

    // Score popups
    scorePopups.forEach(p => {
      ctx.font = `bold 14px Orbitron, sans-serif`; ctx.textAlign = 'center';
      ctx.fillStyle = `rgba(255,215,0,${p.life})`; ctx.fillText(p.text, p.x, p.y);
    });

    // HUD
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(0, 0, W, 38);
    ctx.textAlign = 'left'; ctx.font = 'bold 18px Orbitron, sans-serif'; ctx.fillStyle = '#00d4ff';
    ctx.fillText(score.toLocaleString(), 12, 26);
    ctx.textAlign = 'center'; ctx.font = 'bold 18px Orbitron, sans-serif';
    const tc = timeLeft <= 10 ? '#ff4d4d' : '#ffd700';
    ctx.fillStyle = tc; ctx.fillText(`${timeLeft}s`, W / 2, 26);
    ctx.textAlign = 'right'; ctx.font = '16px Exo 2, sans-serif'; ctx.fillStyle = '#ff6b9d';
    ctx.fillText('❤️'.repeat(lives), W - 12, 26);
    ctx.textAlign = 'left'; ctx.font = '11px Exo 2, sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.fillText(`LV${this.level}`, 12, 38);

    if (done) {
      ctx.fillStyle = 'rgba(0,0,0,0.75)'; ctx.fillRect(0, 0, W, H);
      ctx.textAlign = 'center';
      ctx.font = 'bold 36px Orbitron, sans-serif'; ctx.fillStyle = '#00d4ff';
      ctx.fillText('TIME UP!', W / 2, H / 2 - 20);
      ctx.font = '22px Exo 2, sans-serif'; ctx.fillStyle = '#ffd700';
      ctx.fillText(`Score: ${score.toLocaleString()}`, W / 2, H / 2 + 24);
    }
  }
}
