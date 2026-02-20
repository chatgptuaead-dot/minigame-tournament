/* ===== ARCHERY ===== */
class ArcheryGame {
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
    this.arrows = 8;
    this.arrowsLeft = 8;
    this.totalScore = 0;
    this.crosshair = { x: 400, y: 250 };
    this.drift = { x: 0, y: 0 };
    this.shots = [];
    this.particles = [];
    this.animT = 0;
    this.phase = 'aiming'; // aiming | flying | done
    this.targetX = 620; this.targetY = 250; this.targetR = 80;
    this.windX = (Math.random() - 0.5) * 2;
    this.windY = (Math.random() - 0.5) * 1;
    this.isHolding = false;
    this.holdTime = 0;
    this.lastShot = null;
    this.gameOver = false;
    this._onMouseMove = this._onMouseMove.bind(this);
    this._onTouchMove = this._onTouchMove.bind(this);
    this._onPointerDown = this._onPointerDown.bind(this);
    this._onPointerUp = this._onPointerUp.bind(this);
    this._onTouchEnd = this._onTouchEnd.bind(this);
  }

  start() {
    this.running = true;
    this.canvas.addEventListener('mousemove', this._onMouseMove);
    this.canvas.addEventListener('touchmove', this._onTouchMove, { passive: false });
    this.canvas.addEventListener('mousedown', this._onPointerDown);
    this.canvas.addEventListener('mouseup', this._onPointerUp);
    this.canvas.addEventListener('touchstart', this._onPointerDown, { passive: false });
    this.canvas.addEventListener('touchend', this._onTouchEnd, { passive: false });
    this.loop();
  }

  cleanup() {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.canvas.removeEventListener('mousemove', this._onMouseMove);
    this.canvas.removeEventListener('touchmove', this._onTouchMove);
    this.canvas.removeEventListener('mousedown', this._onPointerDown);
    this.canvas.removeEventListener('mouseup', this._onPointerUp);
    this.canvas.removeEventListener('touchstart', this._onPointerDown);
    this.canvas.removeEventListener('touchend', this._onTouchEnd);
  }

  _getPos(e) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.W / rect.width, scaleY = this.H / rect.height;
    if (e.touches) return { x: (e.touches[0].clientX - rect.left) * scaleX, y: (e.touches[0].clientY - rect.top) * scaleY };
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  }

  _onMouseMove(e) { if (!this.isHolding) { const p = this._getPos(e); this.crosshair = p; } }
  _onTouchMove(e) { e.preventDefault(); if (!this.isHolding) { const p = this._getPos(e); this.crosshair = p; } }
  _onPointerDown(e) { if (e.preventDefault) e.preventDefault(); if (!this.gameOver && this.phase === 'aiming') { this.isHolding = true; this.holdTime = 0; } }
  _onPointerUp() { if (this.isHolding) { this.isHolding = false; this._shoot(); } }
  _onTouchEnd(e) { e.preventDefault(); if (this.isHolding) { this.isHolding = false; this._shoot(); } }

  _shoot() {
    if (this.arrowsLeft <= 0 || this.gameOver || this.phase !== 'aiming') return;
    this.arrowsLeft--;
    const power = Math.min(1, this.holdTime / 60);
    const cx = this.crosshair.x + this.drift.x;
    const cy = this.crosshair.y + this.drift.y;
    const dx = this.targetX - cx, dy = this.targetY - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const score = this._calcScore(dist);
    this.totalScore += score;
    this.shots.push({ x: cx, y: cy, score, alpha: 1 });
    this._spawnHitParticles(cx, cy, score);
    this.lastShot = { score, dist };
    this.onScoreUpdate(this.totalScore, 0);
    if (this.arrowsLeft === 0) { this.gameOver = true; setTimeout(() => { if (this.onComplete) this.onComplete(this.totalScore); }, 1500); }
  }

  _calcScore(dist) {
    if (dist <= this.targetR * 0.12) return 10;
    if (dist <= this.targetR * 0.3) return 8;
    if (dist <= this.targetR * 0.5) return 6;
    if (dist <= this.targetR * 0.7) return 4;
    if (dist <= this.targetR) return 2;
    return 0;
  }

  _spawnHitParticles(x, y, score) {
    const color = score >= 8 ? '#ffd700' : score >= 4 ? '#00d4ff' : '#ff6b9d';
    for (let i = 0; i < 12; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 4;
      this.particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 1, color });
    }
  }

  loop() {
    if (!this.running) return;
    this.update();
    this.render();
    this.raf = requestAnimationFrame(() => this.loop());
  }

  update() {
    this.animT++;
    if (this.isHolding) { this.holdTime = Math.min(this.holdTime + 1, 80); }
    // Crosshair drift (wobble when holding)
    if (!this.isHolding) {
      this.drift.x += (0 - this.drift.x) * 0.1;
      this.drift.y += (0 - this.drift.y) * 0.1;
    } else {
      this.drift.x += (Math.sin(this.animT * 0.12) * 3 - this.drift.x) * 0.05;
      this.drift.y += (Math.cos(this.animT * 0.09) * 3 - this.drift.y) * 0.05;
    }
    // Wind effect
    if (!this.isHolding && this.phase === 'aiming') {
      this.crosshair.x = Math.max(50, Math.min(this.W - 50, this.crosshair.x + this.windX * 0.15));
      this.crosshair.y = Math.max(50, Math.min(this.H - 50, this.crosshair.y + this.windY * 0.15));
    }
    // Update particles
    this.particles = this.particles.filter(p => p.life > 0.01);
    this.particles.forEach(p => { p.x += p.vx; p.y += p.vy; p.vx *= 0.92; p.vy *= 0.92; p.life *= 0.9; });
  }

  render() {
    const { ctx, W, H, animT, crosshair, drift, targetX, targetY, targetR, arrowsLeft, arrows, totalScore, shots, particles, isHolding, holdTime, lastShot, windX, windY, gameOver } = this;

    // Background: sky gradient
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#0a1628'); sky.addColorStop(1, '#1a2a1a');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);

    // Ground
    ctx.fillStyle = '#1a3a1a';
    ctx.fillRect(0, H * 0.7, W, H * 0.3);
    // Grass texture
    ctx.fillStyle = '#2a5a2a';
    ctx.fillRect(0, H * 0.7, W, 8);

    // Target stand
    ctx.fillStyle = '#5a3a1a';
    ctx.fillRect(targetX - 8, targetY + targetR, 16, H * 0.3 - targetY - targetR + H * 0.7);

    // Target rings
    const rings = [
      { r: targetR, color: '#f0d700' },
      { r: targetR * 0.7, color: '#e04040' },
      { r: targetR * 0.5, color: '#e04040' },
      { r: targetR * 0.3, color: '#202060' },
      { r: targetR * 0.12, color: '#202060' }
    ];
    rings.reverse().forEach(({ r, color }) => {
      ctx.beginPath(); ctx.arc(targetX, targetY, r, 0, Math.PI * 2);
      ctx.fillStyle = color; ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 1; ctx.stroke();
    });
    // Bullseye dot
    ctx.beginPath(); ctx.arc(targetX, targetY, 6, 0, Math.PI * 2);
    ctx.fillStyle = '#fff'; ctx.fill();

    // Previous shots
    shots.forEach(shot => {
      ctx.beginPath(); ctx.arc(shot.x, shot.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#8b4513'; ctx.fill();
      ctx.strokeStyle = '#5a2a00'; ctx.lineWidth = 1; ctx.stroke();
      // Score popup
      if (shot.score > 0) {
        ctx.font = 'bold 14px Orbitron, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = shot.score >= 8 ? '#ffd700' : shot.score >= 4 ? '#00d4ff' : '#fff';
        ctx.fillText(`+${shot.score}`, shot.x, shot.y - 12);
      }
    });

    // Particles
    particles.forEach(p => {
      ctx.beginPath(); ctx.arc(p.x, p.y, 3 * p.life, 0, Math.PI * 2);
      ctx.fillStyle = p.color + Math.round(p.life * 255).toString(16).padStart(2, '0');
      ctx.fill();
    });

    // Crosshair
    if (!gameOver) {
      const cx = crosshair.x + drift.x;
      const cy = crosshair.y + drift.y;
      const stability = isHolding ? Math.max(0, 1 - holdTime / 80) : 1;
      const chColor = isHolding ? `rgba(255,${Math.round(80 + 175 * (1 - stability))},0,0.9)` : 'rgba(255,255,255,0.8)';
      ctx.strokeStyle = chColor; ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(cx - 25, cy); ctx.lineTo(cx - 8, cy); ctx.moveTo(cx + 8, cy); ctx.lineTo(cx + 25, cy);
      ctx.moveTo(cx, cy - 25); ctx.lineTo(cx, cy - 8); ctx.moveTo(cx, cy + 8); ctx.lineTo(cx, cy + 25);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath(); ctx.arc(cx, cy, 6, 0, Math.PI * 2);
      ctx.strokeStyle = chColor; ctx.stroke();
      if (isHolding) {
        ctx.beginPath(); ctx.arc(cx, cy, 16 + (animT % 20), 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255,100,0,${0.5 - ((animT % 20) / 40)})`;
        ctx.lineWidth = 2; ctx.stroke();
      }
    }

    // HUD
    ctx.textAlign = 'left';
    ctx.font = 'bold 16px Orbitron, sans-serif';
    ctx.fillStyle = '#00d4ff'; ctx.fillText(`SCORE: ${totalScore}`, 16, 30);
    ctx.font = '14px Exo 2, sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillText(`Arrows: ${arrowsLeft}/${arrows}`, 16, 52);

    // Wind indicator
    ctx.textAlign = 'right';
    ctx.font = '13px Exo 2, sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillText('WIND', W - 16, 26);
    const windMag = Math.sqrt(windX * windX + windY * windY);
    const windAngle = Math.atan2(windY, windX);
    ctx.save(); ctx.translate(W - 16, 42); ctx.rotate(windAngle);
    ctx.strokeStyle = '#ffd700'; ctx.lineWidth = 2;
    const wl = windMag * 20;
    ctx.beginPath(); ctx.moveTo(-wl, 0); ctx.lineTo(wl, 0);
    ctx.moveTo(wl - 5, -4); ctx.lineTo(wl, 0); ctx.lineTo(wl - 5, 4);
    ctx.stroke(); ctx.restore();
    ctx.textAlign = 'right';
    ctx.font = '11px Exo 2, sans-serif'; ctx.fillStyle = 'rgba(255,215,0,0.7)';
    ctx.fillText(`${windMag.toFixed(1)} kt`, W - 16, 60);

    // Hold instruction
    if (!gameOver) {
      ctx.textAlign = 'center';
      ctx.font = '14px Exo 2, sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.fillText('Hold to aim • Release to shoot', W / 2, H - 12);
    }

    // Power bar
    if (isHolding) {
      const barW = 200, barH = 10;
      const bx = W / 2 - barW / 2, by = H - 40;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(bx, by, barW, barH);
      const pct = Math.min(1, holdTime / 80);
      const barColor = pct > 0.7 ? '#ff4d4d' : pct > 0.4 ? '#ffd700' : '#00d4ff';
      ctx.fillStyle = barColor;
      ctx.fillRect(bx, by, barW * pct, barH);
      ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.lineWidth = 1;
      ctx.strokeRect(bx, by, barW, barH);
      ctx.textAlign = 'center'; ctx.font = '11px Exo 2, sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillText('HOLD STEADY', W / 2, by - 4);
    }

    if (gameOver) {
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0, 0, W, H);
      ctx.textAlign = 'center';
      ctx.font = 'bold 36px Orbitron, sans-serif'; ctx.fillStyle = '#ffd700';
      ctx.fillText('COMPLETE!', W / 2, H / 2 - 20);
      ctx.font = '24px Exo 2, sans-serif'; ctx.fillStyle = '#00d4ff';
      ctx.fillText(`Final Score: ${totalScore} pts`, W / 2, H / 2 + 20);
    }
  }
}
