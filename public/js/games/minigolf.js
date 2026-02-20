/* ===== MINI GOLF ===== */
class MiniGolfGame {
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
    this.strokes = 0;
    this.holes = 0;
    this.maxHoles = 3;
    this.totalStrokes = 0;
    this.animT = 0;
    this.course = this._buildCourse(0);
    this.ball = { x: this.course.start.x, y: this.course.start.y, vx: 0, vy: 0, r: 8 };
    this.phase = 'aim'; // aim | rolling | sunk | done
    this.isDragging = false;
    this.dragEnd = { x: 0, y: 0 };
    this.particles = [];
    this.holeFlashT = 0;
    this._onDown = this._onDown.bind(this);
    this._onMove = this._onMove.bind(this);
    this._onUp = this._onUp.bind(this);
    this._onTouchEnd = this._onTouchEnd.bind(this);
  }

  _buildCourse(idx) {
    const courses = [
      {
        start: { x: 100, y: 250 },
        hole: { x: 680, y: 250, r: 16 },
        walls: [
          { x: 60, y: 200, w: 680, h: 20 },
          { x: 60, y: 280, w: 680, h: 20 },
          { x: 60, y: 200, w: 20, h: 100 },
          { x: 720, y: 200, w: 20, h: 100 },
          { x: 300, y: 220, w: 20, h: 40 },
          { x: 480, y: 240, w: 20, h: 40 }
        ],
        bumpers: [{ x: 400, y: 250, r: 18 }]
      },
      {
        start: { x: 100, y: 150 },
        hole: { x: 680, y: 380, r: 16 },
        walls: [
          { x: 60, y: 100, w: 700, h: 20 },
          { x: 60, y: 100, w: 20, h: 200 },
          { x: 300, y: 100, w: 20, h: 180 },
          { x: 300, y: 280, w: 160, h: 20 },
          { x: 460, y: 180, w: 20, h: 120 },
          { x: 460, y: 300, w: 300, h: 20 },
          { x: 740, y: 300, w: 20, h: 140 },
          { x: 60, y: 420, w: 700, h: 20 }
        ],
        bumpers: [{ x: 200, y: 200, r: 14 }, { x: 560, y: 350, r: 14 }]
      },
      {
        start: { x: 120, y: 250 },
        hole: { x: 660, y: 250, r: 16 },
        walls: [
          { x: 60, y: 120, w: 680, h: 20 },
          { x: 60, y: 360, w: 680, h: 20 },
          { x: 60, y: 120, w: 20, h: 260 },
          { x: 720, y: 120, w: 20, h: 260 },
          { x: 200, y: 140, w: 20, h: 100 },
          { x: 350, y: 260, w: 20, h: 100 },
          { x: 500, y: 140, w: 20, h: 100 }
        ],
        bumpers: [{ x: 300, y: 200, r: 16 }, { x: 500, y: 310, r: 16 }]
      }
    ];
    return courses[idx % courses.length];
  }

  start() {
    this.running = true;
    this.canvas.addEventListener('mousedown', this._onDown);
    this.canvas.addEventListener('mousemove', this._onMove);
    this.canvas.addEventListener('mouseup', this._onUp);
    this.canvas.addEventListener('touchstart', this._onDown, { passive: false });
    this.canvas.addEventListener('touchmove', this._onMove, { passive: false });
    this.canvas.addEventListener('touchend', this._onTouchEnd, { passive: false });
    this.loop();
  }

  cleanup() {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.canvas.removeEventListener('mousedown', this._onDown);
    this.canvas.removeEventListener('mousemove', this._onMove);
    this.canvas.removeEventListener('mouseup', this._onUp);
    this.canvas.removeEventListener('touchstart', this._onDown);
    this.canvas.removeEventListener('touchmove', this._onMove);
    this.canvas.removeEventListener('touchend', this._onTouchEnd);
  }

  _getPos(e) {
    const rect = this.canvas.getBoundingClientRect();
    const sx = this.W / rect.width, sy = this.H / rect.height;
    const src = e.touches ? e.touches[0] : e;
    return { x: (src.clientX - rect.left) * sx, y: (src.clientY - rect.top) * sy };
  }

  _onDown(e) { e.preventDefault(); if (this.phase !== 'aim') return; const p = this._getPos(e); this.isDragging = true; this.dragEnd = p; }
  _onMove(e) { e.preventDefault(); if (this.isDragging) this.dragEnd = this._getPos(e); }
  _onUp() { if (this.isDragging) { this.isDragging = false; this._hit(); } }
  _onTouchEnd(e) { e.preventDefault(); if (this.isDragging) { this.isDragging = false; this._hit(); } }

  _hit() {
    if (this.phase !== 'aim') return;
    const dx = this.ball.x - this.dragEnd.x;
    const dy = this.ball.y - this.dragEnd.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 5) return;
    const power = Math.min(dist / 80, 1);
    const speed = power * 12;
    this.ball.vx = (dx / dist) * speed;
    this.ball.vy = (dy / dist) * speed;
    this.strokes++;
    this.phase = 'rolling';
  }

  loop() {
    if (!this.running) return;
    this.update();
    this.render();
    this.raf = requestAnimationFrame(() => this.loop());
  }

  update() {
    this.animT++;
    if (this.phase === 'rolling') {
      // Physics
      this.ball.x += this.ball.vx; this.ball.y += this.ball.vy;
      this.ball.vx *= 0.97; this.ball.vy *= 0.97;

      // Wall collisions
      for (const w of this.course.walls) {
        const bx = this.ball.x, by = this.ball.y, br = this.ball.r;
        if (bx + br > w.x && bx - br < w.x + w.w && by + br > w.y && by - br < w.y + w.h) {
          // Find least overlap to resolve
          const overlapLeft = bx + br - w.x;
          const overlapRight = w.x + w.w - (bx - br);
          const overlapTop = by + br - w.y;
          const overlapBottom = w.y + w.h - (by - br);
          const minH = Math.min(overlapLeft, overlapRight);
          const minV = Math.min(overlapTop, overlapBottom);
          if (minH < minV) {
            this.ball.vx *= -0.7;
            this.ball.x += minH === overlapLeft ? -overlapLeft - 1 : overlapRight + 1;
          } else {
            this.ball.vy *= -0.7;
            this.ball.y += minV === overlapTop ? -overlapTop - 1 : overlapBottom + 1;
          }
        }
      }

      // Bumper collisions
      for (const b of this.course.bumpers) {
        const dx = this.ball.x - b.x, dy = this.ball.y - b.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < b.r + this.ball.r) {
          const nx = dx / dist, ny = dy / dist;
          const dot = this.ball.vx * nx + this.ball.vy * ny;
          this.ball.vx -= 2 * dot * nx * 1.2; this.ball.vy -= 2 * dot * ny * 1.2;
          this.ball.x = b.x + nx * (b.r + this.ball.r + 2);
          this.ball.y = b.y + ny * (b.r + this.ball.r + 2);
          this._spawnParticles(this.ball.x, this.ball.y, '#00d4ff');
        }
      }

      // Hole detection
      const hdx = this.ball.x - this.course.hole.x, hdy = this.ball.y - this.course.hole.y;
      const hdist = Math.sqrt(hdx * hdx + hdy * hdy);
      const speed = Math.sqrt(this.ball.vx ** 2 + this.ball.vy ** 2);
      if (hdist < this.course.hole.r && speed < 8) {
        this.phase = 'sunk';
        this.holeFlashT = 0;
        this._spawnParticles(this.course.hole.x, this.course.hole.y, '#ffd700');
        setTimeout(() => {
          this.holes++;
          this.totalStrokes += this.strokes;
          this.onScoreUpdate(this.totalStrokes, 0);
          if (this.holes >= this.maxHoles) {
            this.phase = 'done';
            if (this.onComplete) this.onComplete(this.totalStrokes);
          } else {
            this.course = this._buildCourse(this.holes);
            this.ball = { x: this.course.start.x, y: this.course.start.y, vx: 0, vy: 0, r: 8 };
            this.strokes = 0;
            this.phase = 'aim';
          }
        }, 1500);
      }

      // Stop when slow
      if (speed < 0.2) { this.ball.vx = 0; this.ball.vy = 0; this.phase = 'aim'; }
    }

    if (this.phase === 'sunk') this.holeFlashT++;
    this.particles = this.particles.filter(p => p.life > 0.01);
    this.particles.forEach(p => { p.x += p.vx; p.y += p.vy; p.vy += 0.1; p.life *= 0.92; });
  }

  _spawnParticles(x, y, color) {
    for (let i = 0; i < 14; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 4;
      this.particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 2, life: 1, color });
    }
  }

  render() {
    const { ctx, W, H, animT, ball, course, phase, isDragging, dragEnd, strokes, holes, maxHoles, totalStrokes, particles, holeFlashT } = this;

    // Grass background
    const grass = ctx.createLinearGradient(0, 0, 0, H);
    grass.addColorStop(0, '#1a4a0a'); grass.addColorStop(1, '#2a6a1a');
    ctx.fillStyle = grass; ctx.fillRect(0, 0, W, H);

    // Course fairway
    ctx.fillStyle = '#2a7a1a';
    ctx.fillRect(40, 80, W - 80, H - 160);

    // Walls
    course.walls.forEach(w => {
      ctx.fillStyle = '#5a3a1a';
      ctx.fillRect(w.x, w.y, w.w, w.h);
      // Wood grain detail
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      ctx.fillRect(w.x + 2, w.y + 2, w.w - 4, Math.min(4, w.h - 4));
    });

    // Bumpers
    course.bumpers.forEach(b => {
      const bumperGlow = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
      bumperGlow.addColorStop(0, '#00aaff'); bumperGlow.addColorStop(1, '#0044aa');
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fillStyle = bumperGlow; ctx.fill();
      ctx.strokeStyle = '#00d4ff'; ctx.lineWidth = 2; ctx.stroke();
      // Pulsing ring
      const pulse = 0.5 + 0.5 * Math.sin(animT * 0.1);
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r + pulse * 6, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(0,212,255,${0.3 * pulse})`; ctx.lineWidth = 2; ctx.stroke();
    });

    // Hole
    const h = course.hole;
    ctx.beginPath(); ctx.arc(h.x, h.y, h.r, 0, Math.PI * 2);
    ctx.fillStyle = '#000'; ctx.fill();
    // Hole ring
    ctx.beginPath(); ctx.arc(h.x, h.y, h.r, 0, Math.PI * 2);
    const holeAlpha = 0.5 + 0.5 * Math.sin(animT * 0.08);
    ctx.strokeStyle = `rgba(255,215,0,${holeAlpha})`; ctx.lineWidth = 3; ctx.stroke();
    // Flag
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(h.x, h.y - h.r); ctx.lineTo(h.x, h.y - h.r - 24); ctx.stroke();
    ctx.fillStyle = '#ff4d4d';
    ctx.beginPath(); ctx.moveTo(h.x, h.y - h.r - 24); ctx.lineTo(h.x + 12, h.y - h.r - 18); ctx.lineTo(h.x, h.y - h.r - 12); ctx.fill();

    // Aim guide
    if (phase === 'aim' && isDragging) {
      const dx = ball.x - dragEnd.x, dy = ball.y - dragEnd.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const power = Math.min(dist / 80, 1);
      // Draw dotted line
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = `rgba(255,255,100,${0.4 + power * 0.4})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(ball.x, ball.y);
      const endX = ball.x + (dx / dist) * Math.min(dist, 80) * power;
      const endY = ball.y + (dy / dist) * Math.min(dist, 80) * power;
      ctx.lineTo(endX * 2 - ball.x, endY * 2 - ball.y); ctx.stroke();
      ctx.setLineDash([]);
      // Power arc
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, 20 + power * 15, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255,200,0,${power * 0.5})`; ctx.lineWidth = 2; ctx.stroke();
    }

    // Ball shadow
    ctx.beginPath(); ctx.ellipse(ball.x + 2, ball.y + 4, ball.r - 2, 4, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fill();

    // Ball
    ctx.beginPath(); ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
    const ballGrad = ctx.createRadialGradient(ball.x - 2, ball.y - 2, 1, ball.x, ball.y, ball.r);
    ballGrad.addColorStop(0, '#fff'); ballGrad.addColorStop(1, '#ccc');
    ctx.fillStyle = ballGrad; ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.2)'; ctx.lineWidth = 1; ctx.stroke();

    // Particles
    particles.forEach(p => {
      ctx.beginPath(); ctx.arc(p.x, p.y, 3 * p.life, 0, Math.PI * 2);
      ctx.fillStyle = p.color + Math.round(p.life * 255).toString(16).padStart(2, '0'); ctx.fill();
    });

    // Sunk animation
    if (phase === 'sunk') {
      ctx.textAlign = 'center';
      ctx.font = 'bold 36px Orbitron, sans-serif'; ctx.fillStyle = '#ffd700';
      ctx.shadowColor = '#ffd700'; ctx.shadowBlur = 20;
      ctx.fillText('HOLE IN ONE!', W / 2, H / 2);
      ctx.shadowBlur = 0;
      const s = strokes > 3 ? `+${strokes - 3}` : strokes === 1 ? 'HOLE IN ONE!' : strokes <= 3 ? ['', 'ACE!', 'EAGLE!', 'BIRDIE!'][Math.min(strokes, 3)] : `${strokes} STROKES`;
      ctx.font = '22px Exo 2, sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.fillText(`${strokes} stroke${strokes !== 1 ? 's' : ''}`, W / 2, H / 2 + 36);
    }

    // HUD
    ctx.textAlign = 'left';
    ctx.font = 'bold 16px Orbitron, sans-serif'; ctx.fillStyle = '#00d4ff';
    ctx.fillText(`STROKES: ${strokes}`, 12, 30);
    ctx.font = '13px Exo 2, sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillText(`Hole ${holes + 1} / ${maxHoles}`, 12, 50);
    ctx.textAlign = 'right';
    ctx.font = 'bold 16px Orbitron, sans-serif'; ctx.fillStyle = '#ffd700';
    ctx.fillText(`TOTAL: ${totalStrokes + strokes}`, W - 12, 30);

    if (phase === 'aim') {
      ctx.textAlign = 'center'; ctx.font = '13px Exo 2, sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.fillText('Drag from ball to set direction & power', W / 2, H - 12);
    }

    if (phase === 'done') {
      ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(0, 0, W, H);
      ctx.textAlign = 'center';
      ctx.font = 'bold 36px Orbitron, sans-serif'; ctx.fillStyle = '#ffd700';
      ctx.fillText('ROUND COMPLETE!', W / 2, H / 2 - 20);
      ctx.font = '22px Exo 2, sans-serif'; ctx.fillStyle = '#00d4ff';
      ctx.fillText(`Total: ${totalStrokes} strokes`, W / 2, H / 2 + 24);
    }
  }
}
