/* ===== PENALTY SHOOTOUT ===== */
class PenaltyGame {
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
    this.kicks = 5;
    this.myKick = 0; this.myGoals = 0;
    this.phase = 'aim'; // aim | flying | result | done
    this.aimX = 400; this.aimY = 180;
    this.ballX = 400; this.ballY = 420;
    this.ballVX = 0; this.ballVY = 0;
    this.ballR = 16;
    this.gkX = 400; this.gkY = 200; // goalkeeper
    this.gkVX = 0; this.gkTarget = 400;
    this.animT = 0;
    this.isDragging = false;
    this.dragStartX = 0; this.dragStartY = 0;
    this.particles = [];
    this.lastResult = null;
    this.goalW = 320; this.goalH = 120;
    this.goalLeft = (this.W - this.goalW) / 2;
    this.goalTop = 100;
    this._onDown = this._onDown.bind(this);
    this._onMove = this._onMove.bind(this);
    this._onUp = this._onUp.bind(this);
    this._onTouchEnd = this._onTouchEnd.bind(this);
  }

  start() {
    this.running = true;
    this._resetKick();
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
    ['mousedown','mousemove','mouseup'].forEach(ev => this.canvas.removeEventListener(ev, this['_on' + ev.replace('mouse','').charAt(0).toUpperCase() + ev.replace('mouse','').slice(1)]));
    this.canvas.removeEventListener('touchstart', this._onDown);
    this.canvas.removeEventListener('touchmove', this._onMove);
    this.canvas.removeEventListener('touchend', this._onTouchEnd);
  }

  _getPos(e) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.W / rect.width, scaleY = this.H / rect.height;
    const src = e.touches ? e.touches[0] : e;
    return { x: (src.clientX - rect.left) * scaleX, y: (src.clientY - rect.top) * scaleY };
  }

  _onDown(e) { e.preventDefault(); if (this.phase !== 'aim') return; const p = this._getPos(e); this.isDragging = true; this.dragStartX = p.x; this.dragStartY = p.y; }
  _onMove(e) { e.preventDefault(); if (this.isDragging) { const p = this._getPos(e); this.aimX = p.x; this.aimY = p.y; } }
  _onUp(e) { if (this.isDragging) { this.isDragging = false; this._kick(); } }
  _onTouchEnd(e) { e.preventDefault(); if (this.isDragging) { this.isDragging = false; this._kick(); } }

  _kick() {
    if (this.phase !== 'aim' || this.myKick >= this.kicks) return;
    this.myKick++;
    // Aim in goal area (clamp to goal region)
    const tx = Math.max(this.goalLeft + 20, Math.min(this.goalLeft + this.goalW - 20, this.aimX));
    const ty = Math.max(this.goalTop + 10, Math.min(this.goalTop + this.goalH - 10, this.aimY));
    const dx = tx - this.ballX, dy = ty - this.ballY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const speed = 14;
    this.ballVX = dx / dist * speed;
    this.ballVY = dy / dist * speed;
    // GK dives to random side
    this.gkTarget = this.goalLeft + (Math.random() > 0.3 ? (Math.random() * 0.4 + 0.6) * this.goalW : (Math.random() * 0.4) * this.goalW);
    this.phase = 'flying';
    this._targetX = tx; this._targetY = ty;
  }

  _resetKick() {
    this.ballX = 400; this.ballY = 420;
    this.ballVX = 0; this.ballVY = 0;
    this.gkX = 400; this.gkY = 200;
    this.gkTarget = 400;
    this.aimX = 400; this.aimY = 180;
    this.isDragging = false;
    this.phase = 'aim';
    this.lastResult = null;
  }

  loop() {
    if (!this.running) return;
    this.update();
    this.render();
    this.raf = requestAnimationFrame(() => this.loop());
  }

  update() {
    this.animT++;
    // GK movement
    const gkSpeed = 5;
    const diff = this.gkTarget - this.gkX;
    this.gkX += Math.sign(diff) * Math.min(Math.abs(diff), gkSpeed);
    // GK idle sway
    if (this.phase === 'aim') this.gkX = 400 + Math.sin(this.animT * 0.04) * 40;

    if (this.phase === 'flying') {
      this.ballX += this.ballVX; this.ballY += this.ballVY;
      this.ballVX *= 0.98; this.ballVY *= 0.98;
      // Check if ball reached goal area
      if (this.ballY <= this.goalTop + this.goalH) {
        // Check if GK caught it
        const inGoal = this.ballX >= this.goalLeft && this.ballX <= this.goalLeft + this.goalW && this.ballY >= this.goalTop;
        const gkCatch = Math.abs(this.ballX - this.gkX) < 40 && this.ballY <= this.goalTop + this.goalH;
        if (!inGoal) {
          this.lastResult = 'miss';
        } else if (gkCatch) {
          this.lastResult = 'saved';
          this._spawnParticles(this.gkX, this.goalTop + this.goalH / 2, '#ff6b9d');
        } else {
          this.lastResult = 'goal';
          this.myGoals++;
          this._spawnParticles(this.ballX, this.ballY, '#ffd700');
          this.onScoreUpdate(this.myGoals, 0);
        }
        this.phase = 'result';
        const next = this.myKick >= this.kicks ? 'done' : 'aim';
        setTimeout(() => {
          if (!this.running) return;
          if (next === 'done') { if (this.onComplete) this.onComplete(this.myGoals); this.phase = 'done'; }
          else { this._resetKick(); }
        }, 2000);
      }
    }

    this.particles = this.particles.filter(p => p.life > 0.01);
    this.particles.forEach(p => { p.x += p.vx; p.y += p.vy; p.vy += 0.15; p.life *= 0.9; });
  }

  _spawnParticles(x, y, color) {
    for (let i = 0; i < 20; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 3 + Math.random() * 5;
      this.particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 3, life: 1, color });
    }
  }

  render() {
    const { ctx, W, H, animT, ballX, ballY, ballR, gkX, gkY, goalLeft, goalTop, goalW, goalH, aimX, aimY, myKick, kicks, myGoals, phase, isDragging, lastResult, particles } = this;

    // Pitch
    const pitchGrad = ctx.createLinearGradient(0, 0, 0, H);
    pitchGrad.addColorStop(0, '#1a4a1a'); pitchGrad.addColorStop(1, '#246024');
    ctx.fillStyle = pitchGrad; ctx.fillRect(0, 0, W, H);

    // Stripes
    for (let i = 0; i < 8; i++) {
      if (i % 2 === 0) { ctx.fillStyle = 'rgba(0,0,0,0.05)'; ctx.fillRect(i * (W / 8), 0, W / 8, H); }
    }

    // Pitch lines
    ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 2;
    // Penalty area
    ctx.strokeRect(160, 60, 480, 280);
    // Goal area
    ctx.strokeRect(goalLeft - 20, goalTop - 10, goalW + 40, goalH + 40);
    // Center circle
    ctx.beginPath(); ctx.arc(W / 2, H * 0.8, 60, 0, Math.PI * 2); ctx.stroke();

    // Goal net
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fillRect(goalLeft - 5, goalTop - 40, goalW + 10, goalH + 40);
    ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.lineWidth = 1;
    // Net lines
    for (let x = goalLeft; x <= goalLeft + goalW; x += 24) { ctx.beginPath(); ctx.moveTo(x, goalTop - 40); ctx.lineTo(x, goalTop + goalH); ctx.stroke(); }
    for (let y = goalTop - 40; y <= goalTop + goalH; y += 16) { ctx.beginPath(); ctx.moveTo(goalLeft, y); ctx.lineTo(goalLeft + goalW, y); ctx.stroke(); }
    // Goal posts
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(goalLeft, goalTop + goalH); ctx.lineTo(goalLeft, goalTop - 40); ctx.lineTo(goalLeft + goalW, goalTop - 40); ctx.lineTo(goalLeft + goalW, goalTop + goalH);
    ctx.stroke();

    // Goalkeeper (simple box player)
    const gkW = 60, gkH = 80;
    ctx.fillStyle = '#ff6b35';
    const gkRect = { x: gkX - gkW / 2, y: goalTop + goalH / 2 - gkH / 2, w: gkW, h: gkH };
    ctx.fillRect(gkRect.x, gkRect.y, gkRect.w, gkRect.h);
    // GK body details
    ctx.fillStyle = '#fff'; ctx.fillRect(gkRect.x + 10, gkRect.y + 10, gkW - 20, 30);
    // GK head
    ctx.beginPath(); ctx.arc(gkX, gkRect.y, 18, 0, Math.PI * 2);
    ctx.fillStyle = '#f0c080'; ctx.fill();
    // GK gloves
    ctx.fillStyle = '#ffd700';
    ctx.fillRect(gkRect.x - 14, gkRect.y + 20, 14, 20);
    ctx.fillRect(gkRect.x + gkRect.w, gkRect.y + 20, 14, 20);

    // Aim guide (when aiming)
    if (phase === 'aim' && isDragging) {
      ctx.setLineDash([6, 6]);
      ctx.strokeStyle = 'rgba(255,255,100,0.5)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(ballX, ballY); ctx.lineTo(aimX, aimY); ctx.stroke();
      ctx.setLineDash([]);
      // Target marker
      ctx.beginPath(); ctx.arc(aimX, aimY, 10, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,0,0.5)'; ctx.fill();
      ctx.strokeStyle = '#ffd700'; ctx.lineWidth = 2; ctx.stroke();
    }

    // Ball shadow
    ctx.beginPath(); ctx.ellipse(ballX, ballY + ballR - 2, ballR, 4, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fill();

    // Ball
    ctx.beginPath(); ctx.arc(ballX, ballY, ballR, 0, Math.PI * 2);
    const ballGrad = ctx.createRadialGradient(ballX - 4, ballY - 4, 2, ballX, ballY, ballR);
    ballGrad.addColorStop(0, '#ffffff'); ballGrad.addColorStop(0.4, '#e0e0e0'); ballGrad.addColorStop(1, '#888');
    ctx.fillStyle = ballGrad; ctx.fill();
    // Ball pattern
    ctx.fillStyle = '#333';
    ctx.beginPath(); ctx.arc(ballX, ballY, 6, 0, Math.PI * 2); ctx.fill();

    // Particles
    particles.forEach(p => {
      ctx.beginPath(); ctx.arc(p.x, p.y, 4 * p.life, 0, Math.PI * 2);
      ctx.fillStyle = p.color + Math.round(p.life * 255).toString(16).padStart(2, '0'); ctx.fill();
    });

    // Result text
    if (phase === 'result' && lastResult) {
      ctx.textAlign = 'center';
      const colors = { goal: '#ffd700', saved: '#ff6b9d', miss: '#ff4d4d' };
      const texts = { goal: '⚽ GOAL!', saved: '🧤 SAVED!', miss: '❌ MISS!' };
      ctx.font = `bold 48px Orbitron, sans-serif`;
      ctx.fillStyle = colors[lastResult];
      ctx.shadowColor = colors[lastResult]; ctx.shadowBlur = 20;
      ctx.fillText(texts[lastResult], W / 2, H / 2);
      ctx.shadowBlur = 0;
    }

    // HUD
    ctx.textAlign = 'left';
    ctx.font = 'bold 18px Orbitron, sans-serif'; ctx.fillStyle = '#00d4ff';
    ctx.fillText(`⚽ ${myGoals}`, 16, 30);
    ctx.font = '13px Exo 2, sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillText(`Kick ${myKick}/${kicks}`, 16, 50);

    // Instructions
    if (phase === 'aim') {
      ctx.textAlign = 'center'; ctx.font = '14px Exo 2, sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillText('Drag to aim • Release to kick', W / 2, H - 16);
    }

    if (phase === 'done') {
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0, 0, W, H);
      ctx.textAlign = 'center';
      ctx.font = 'bold 36px Orbitron, sans-serif'; ctx.fillStyle = '#ffd700';
      ctx.fillText('FINISHED!', W / 2, H / 2 - 20);
      ctx.font = '24px Exo 2, sans-serif'; ctx.fillStyle = '#00d4ff';
      ctx.fillText(`${myGoals} / ${kicks} GOALS`, W / 2, H / 2 + 20);
    }
  }
}
