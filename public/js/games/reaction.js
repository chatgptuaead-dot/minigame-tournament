/* ===== REACTION RACE ===== */
class ReactionGame {
  constructor(canvas, config) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.socket = config.socket;
    this.matchId = config.matchId;
    this.onScoreUpdate = config.onScoreUpdate || (() => {});
    this.running = false;
    this.raf = null;
    this.phase = 'waiting'; // waiting | prepare | ready | go | tapped | result
    this.round = 0; this.total = 5;
    this.scores = { p1: 0, p2: 0 };
    this.myReactionTime = null;
    this.oppReactionTime = null;
    this.roundWinner = null;
    this.bgColor = [8, 8, 24];
    this.targetColor = [8, 8, 24];
    this.animT = 0;
    this.flashAlpha = 0;
    this.W = 800; this.H = 500;
    this._handleClick = this._handleClick.bind(this);
    this._handleTouch = this._handleTouch.bind(this);
  }

  start() {
    this.running = true;
    this.phase = 'waiting';
    this.canvas.addEventListener('click', this._handleClick);
    this.canvas.addEventListener('touchstart', this._handleTouch, { passive: false });
    this.loop();
  }

  cleanup() {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.canvas.removeEventListener('click', this._handleClick);
    this.canvas.removeEventListener('touchstart', this._handleTouch);
  }

  _handleClick() { this._tap(); }
  _handleTouch(e) { e.preventDefault(); this._tap(); }

  _tap() {
    if (this.phase === 'go') {
      this.socket.emit('reaction-tap', { matchId: this.matchId });
      this.phase = 'tapped';
      this.flashAlpha = 1;
    } else if (this.phase === 'prepare' || this.phase === 'ready') {
      // Too early! Penalized
      this.phase = 'tapped';
      this.flashAlpha = 1;
    }
  }

  handleReactionPrepare({ round, total }) {
    this.round = round; this.total = total;
    this.phase = 'prepare';
    this.myReactionTime = null; this.oppReactionTime = null; this.roundWinner = null;
    this.targetColor = [8, 8, 24];
  }

  handleReactionGo() {
    this.phase = 'go';
    this.targetColor = [0, 80, 20];
    this.flashAlpha = 0.5;
  }

  handleReactionResult({ round, t1, t2, scores, roundWinner }) {
    this.scores = scores;
    this.roundWinner = roundWinner;
    this.myReactionTime = t1;
    this.oppReactionTime = t2;
    this.phase = 'result';
    this.onScoreUpdate(scores.p1, scores.p2);
    setTimeout(() => { if (this.running) this.phase = 'waiting'; }, 2000);
  }

  loop() {
    if (!this.running) return;
    this.animT++;
    this.update();
    this.render();
    this.raf = requestAnimationFrame(() => this.loop());
  }

  update() {
    // Smooth background color transition
    const [tr, tg, tb] = this.targetColor;
    this.bgColor[0] += (tr - this.bgColor[0]) * 0.08;
    this.bgColor[1] += (tg - this.bgColor[1]) * 0.08;
    this.bgColor[2] += (tb - this.bgColor[2]) * 0.08;
    if (this.flashAlpha > 0) this.flashAlpha *= 0.85;
  }

  render() {
    const { ctx, W, H, animT, phase, round, total, scores, myReactionTime, oppReactionTime, roundWinner, bgColor, flashAlpha } = this;
    const [r, g, b] = bgColor;

    // Background
    ctx.fillStyle = `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
    ctx.fillRect(0, 0, W, H);

    // Flash overlay
    if (flashAlpha > 0.01) {
      ctx.fillStyle = `rgba(0,255,100,${flashAlpha})`;
      ctx.fillRect(0, 0, W, H);
    }

    // Grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 60) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = 0; y < H; y += 60) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

    // Score display
    ctx.font = 'bold 20px Orbitron, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#00d4ff';
    ctx.fillText(`${scores.p1} — ${scores.p2}`, W / 2, 36);
    ctx.font = '13px Exo 2, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fillText(`ROUND ${round} / ${total}`, W / 2, 58);

    // Main content
    const cx = W / 2, cy = H / 2;

    if (phase === 'waiting') {
      ctx.font = 'bold 22px Exo 2, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillText('Get ready...', cx, cy);
      // Pulsing dots
      for (let i = 0; i < 3; i++) {
        const alpha = 0.5 + 0.5 * Math.sin(animT * 0.08 + i * 0.8);
        ctx.fillStyle = `rgba(0,212,255,${alpha})`;
        ctx.beginPath(); ctx.arc(cx - 20 + i * 20, cy + 30, 5, 0, Math.PI * 2); ctx.fill();
      }
    } else if (phase === 'prepare') {
      this._drawPulseCircle(cx, cy, '#ffd700');
      ctx.font = 'bold 24px Orbitron, sans-serif';
      ctx.fillStyle = '#ffd700';
      ctx.fillText('WAIT FOR IT...', cx, cy + 6);
      ctx.font = '16px Exo 2, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.fillText("Don't tap yet!", cx, cy + 36);
    } else if (phase === 'go') {
      // Big GO
      this._drawPulseCircle(cx, cy, '#00ff88');
      const scale = 1 + 0.03 * Math.sin(animT * 0.3);
      ctx.save(); ctx.translate(cx, cy); ctx.scale(scale, scale);
      ctx.font = `bold ${Math.round(100 * scale)}px Orbitron, sans-serif`;
      ctx.fillStyle = '#00ff88';
      ctx.shadowColor = '#00ff88'; ctx.shadowBlur = 40;
      ctx.fillText('TAP!', 0, 30);
      ctx.shadowBlur = 0; ctx.restore();
      ctx.font = '18px Exo 2, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillText('TAP NOW!', cx, cy + 80);
    } else if (phase === 'tapped') {
      ctx.font = 'bold 40px Orbitron, sans-serif';
      ctx.fillStyle = '#00d4ff';
      ctx.fillText('✓ TAPPED!', cx, cy);
      ctx.font = '16px Exo 2, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillText('Waiting for result...', cx, cy + 40);
    } else if (phase === 'result') {
      const iWon = roundWinner === (this.socket.id === this.matchId ? 'p1' : 'p1');
      ctx.font = 'bold 32px Orbitron, sans-serif';
      ctx.fillStyle = roundWinner ? (roundWinner === 'p1' ? '#00ff88' : '#ff6b9d') : '#ffd700';
      ctx.fillText(roundWinner ? (roundWinner === 'p1' ? '⚡ FASTER!' : '😔 TOO SLOW') : '🤝 TIE!', cx, cy - 20);
      if (myReactionTime) {
        ctx.font = '20px Exo 2, sans-serif';
        ctx.fillStyle = '#00d4ff';
        ctx.fillText(`Your time: ${myReactionTime}ms`, cx, cy + 20);
      }
      if (oppReactionTime) {
        ctx.font = '18px Exo 2, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.fillText(`Opponent: ${oppReactionTime}ms`, cx, cy + 50);
      }
    }

    // Instruction at bottom
    if (phase === 'go') {
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.font = '14px Exo 2, sans-serif';
      ctx.fillText('Tap or click anywhere!', cx, H - 20);
    }
  }

  _drawPulseCircle(cx, cy, color) {
    const { ctx, animT } = this;
    for (let i = 0; i < 3; i++) {
      const r = 80 + i * 40 + (animT * 1.5) % 40;
      const alpha = 0.3 - (i * 0.1) - ((animT * 1.5) % 40) / 200;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = `${color}${Math.max(0, Math.round(alpha * 255)).toString(16).padStart(2, '0')}`;
      ctx.lineWidth = 2; ctx.stroke();
    }
  }
}
