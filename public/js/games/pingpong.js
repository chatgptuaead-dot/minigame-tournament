/* ===== PING PONG ===== */
class PingPong {
  constructor(canvas, config) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.socket = config.socket;
    this.matchId = config.matchId;
    this.isPlayer1 = config.isPlayer1;
    this.playerId = config.playerId;
    this.onScoreUpdate = config.onScoreUpdate || (() => {});
    this.running = false;
    this.raf = null;
    this.W = 800; this.H = 500;
    this.PH = 100; this.PW = 15; this.BR = 10;
    this.state = {
      ball: { x: 400, y: 250, vx: 0, vy: 0 },
      p1y: 200, p2y: 200,
      score: { p1: 0, p2: 0 },
      bumper: null,
      speedLevel: 1
    };
    this.myPaddleY = 200;
    this.trail = [];
    this.bumperFlash = 0; // countdown timer for hit flash
    this._onPointerMove = this._onPointerMove.bind(this);
    this._onTouchMove = this._onTouchMove.bind(this);
  }

  start() {
    this.running = true;
    this.canvas.addEventListener('mousemove', this._onPointerMove);
    this.canvas.addEventListener('touchmove', this._onTouchMove, { passive: false });
    this.loop();
  }

  cleanup() {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.canvas.removeEventListener('mousemove', this._onPointerMove);
    this.canvas.removeEventListener('touchmove', this._onTouchMove);
  }

  _onPointerMove(e) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleY = this.H / rect.height;
    const y = (e.clientY - rect.top) * scaleY - this.PH / 2;
    this._sendPaddle(y);
  }

  _onTouchMove(e) {
    e.preventDefault();
    const t = e.touches[0];
    const rect = this.canvas.getBoundingClientRect();
    const scaleY = this.H / rect.height;
    const y = (t.clientY - rect.top) * scaleY - this.PH / 2;
    this._sendPaddle(y);
  }

  _sendPaddle(y) {
    const clamped = Math.max(0, Math.min(this.H - this.PH, y));
    this.myPaddleY = clamped;
    this.socket.emit('paddle-move', { matchId: this.matchId, y: clamped });
  }

  handlePingPongState(data) {
    this.trail.push({ x: data.ball.x, y: data.ball.y, t: Date.now() });
    if (this.trail.length > 8) this.trail.shift();
    if (data.bumper?.hit && !this.state.bumper?.hit) {
      this.bumperFlash = 8; // frames to flash
    }
    this.state = data;
    this.onScoreUpdate(data.score.p1, data.score.p2);
  }

  loop() {
    if (!this.running) return;
    this.render();
    this.raf = requestAnimationFrame(() => this.loop());
  }

  render() {
    const { ctx, W, H, PW, PH, BR, state } = this;
    ctx.clearRect(0, 0, W, H);

    // Background
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#0a0a1e');
    bg.addColorStop(1, '#0e0e28');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // Center line
    ctx.setLineDash([12, 12]);
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H);
    ctx.stroke(); ctx.setLineDash([]);

    // Center circle
    ctx.beginPath();
    ctx.arc(W / 2, H / 2, 50, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 2; ctx.stroke();

    // Bumper
    if (state.bumper) {
      this._drawBumper(state.bumper);
    }

    // Ball trail
    this.trail.forEach((pos, i) => {
      const alpha = (i / this.trail.length) * 0.35;
      const size = BR * (i / this.trail.length) * 0.9;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, Math.max(size, 1), 0, Math.PI * 2);
      ctx.fillStyle = `rgba(0,212,255,${alpha})`;
      ctx.fill();
    });

    // Ball glow
    const ballGlow = ctx.createRadialGradient(state.ball.x, state.ball.y, 0, state.ball.x, state.ball.y, BR * 3);
    ballGlow.addColorStop(0, 'rgba(0,212,255,0.3)');
    ballGlow.addColorStop(1, 'transparent');
    ctx.fillStyle = ballGlow;
    ctx.beginPath(); ctx.arc(state.ball.x, state.ball.y, BR * 3, 0, Math.PI * 2); ctx.fill();

    // Ball
    ctx.beginPath(); ctx.arc(state.ball.x, state.ball.y, BR, 0, Math.PI * 2);
    const ballGrad = ctx.createRadialGradient(state.ball.x - 3, state.ball.y - 3, 1, state.ball.x, state.ball.y, BR);
    ballGrad.addColorStop(0, '#ffffff');
    ballGrad.addColorStop(1, '#00d4ff');
    ctx.fillStyle = ballGrad; ctx.fill();

    // Paddles
    this._drawPaddle(40, state.p1y, PW, PH, this.isPlayer1 ? '#00d4ff' : '#ff6b9d');
    this._drawPaddle(W - 40 - PW, state.p2y, PW, PH, this.isPlayer1 ? '#ff6b9d' : '#00d4ff');

    // Scores
    ctx.font = 'bold 48px Orbitron, sans-serif';
    ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillText(state.score.p1, W / 4, 60);
    ctx.fillText(state.score.p2, (3 * W) / 4, 60);

    // Speed level indicator
    if (state.speedLevel && state.speedLevel > 1) {
      this._drawSpeedIndicator(state.speedLevel);
    }

    // Player labels
    ctx.font = 'bold 13px Exo 2, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(0,212,255,0.5)';
    ctx.fillText(this.isPlayer1 ? 'YOU' : 'OPP', 47, state.p1y - 8);
    ctx.fillStyle = 'rgba(255,107,157,0.5)';
    ctx.fillText(this.isPlayer1 ? 'OPP' : 'YOU', W - 47, state.p2y - 8);

    if (this.bumperFlash > 0) this.bumperFlash--;
  }

  _drawBumper(bumper) {
    const { ctx } = this;
    const { x, y, r } = bumper;
    const isFlashing = this.bumperFlash > 0;

    // Outer glow
    const glowRadius = r * 3;
    const glow = ctx.createRadialGradient(x, y, 0, x, y, glowRadius);
    glow.addColorStop(0, isFlashing ? 'rgba(255,200,0,0.6)' : 'rgba(255,120,0,0.25)');
    glow.addColorStop(1, 'transparent');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(x, y, glowRadius, 0, Math.PI * 2); ctx.fill();

    // Bumper body
    ctx.shadowColor = isFlashing ? '#ffdd00' : '#ff6b35';
    ctx.shadowBlur = isFlashing ? 30 : 12;
    const bodyGrad = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 1, x, y, r);
    bodyGrad.addColorStop(0, isFlashing ? '#ffe066' : '#ffcc44');
    bodyGrad.addColorStop(0.5, isFlashing ? '#ffaa00' : '#ff8800');
    bodyGrad.addColorStop(1, '#cc4400');
    ctx.fillStyle = bodyGrad;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();

    // Ring accent
    ctx.strokeStyle = isFlashing ? 'rgba(255,255,150,0.9)' : 'rgba(255,200,100,0.4)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, r - 3, 0, Math.PI * 2); ctx.stroke();

    ctx.shadowBlur = 0;

    // Lightning bolt icon
    ctx.font = `bold ${Math.round(r * 0.9)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = isFlashing ? '#fff' : 'rgba(255,255,255,0.9)';
    ctx.fillText('⚡', x, y + 1);
    ctx.textBaseline = 'alphabetic';
  }

  _drawSpeedIndicator(level) {
    const { ctx, W, H } = this;
    const colors = ['', '', '#aaffaa', '#ffdd44', '#ff9900', '#ff3300'];
    const labels = ['', '', 'FASTER', 'TURBO', 'BLAZING', '🔥 MAX'];
    const color = colors[level] || '#ff3300';
    const label = labels[level] || `SPD ${level}`;

    // Background pill
    const textWidth = 100;
    const px = W / 2 - textWidth / 2;
    const py = H - 28;
    ctx.save();
    ctx.globalAlpha = 0.75;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(px - 8, py - 14, textWidth + 16, 22, 11)
                  : ctx.rect(px - 8, py - 14, textWidth + 16, 22);
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.font = 'bold 12px Orbitron, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
    ctx.fillText(label, W / 2, py);
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  _drawPaddle(x, y, w, h, color) {
    const { ctx } = this;
    ctx.shadowColor = color;
    ctx.shadowBlur = 20;
    const grad = ctx.createLinearGradient(x, y, x + w, y + h);
    grad.addColorStop(0, color);
    grad.addColorStop(1, color + '88');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(x, y, w, h, 6) : ctx.rect(x, y, w, h);
    ctx.fill();
    ctx.shadowBlur = 0;
  }
}
