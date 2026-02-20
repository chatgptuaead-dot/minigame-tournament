/* ===== CAR RACING ===== */
class RacingGame {
  constructor(canvas, config) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.socket = config.socket;
    this.matchId = config.matchId;
    this.isPlayer1 = config.isPlayer1;
    this.onComplete = config.onComplete;
    this.onScoreUpdate = config.onScoreUpdate || (() => {});
    this.running = false;
    this.raf = null;
    this.W = 400; this.H = 650;
    this.LAPS = 3;
    this.animT = 0;
    this.car = { x: 200, y: 540, angle: -Math.PI / 2, vx: 0, vy: 0, speed: 0, lap: 0, checkpoint: 0, finished: false };
    this.track = this._buildTrack();
    this.keys = {};
    this.tiltX = 0;
    this.particles = [];
    this.done = false;
    this.oppCar = null;       // opponent position received via relay
    this.relayTick = 0;
    this._onKey = this._onKey.bind(this);
    this._onKeyUp = this._onKeyUp.bind(this);
    this._onTilt = this._onTilt.bind(this);
    this._leftHeld = false; this._rightHeld = false; this._accelHeld = false; this._brakeHeld = false;
  }

  _buildTrack() {
    // Track as a series of waypoints (checkpoints)
    const pts = [
      { x: 200, y: 500 }, // start
      { x: 200, y: 200 },
      { x: 100, y: 100 },
      { x: 320, y: 60 },
      { x: 360, y: 200 },
      { x: 280, y: 300 },
      { x: 360, y: 400 },
      { x: 320, y: 540 },
    ];
    return { points: pts, width: 50 };
  }

  start() {
    this.running = true;
    window.addEventListener('keydown', this._onKey);
    window.addEventListener('keyup', this._onKeyUp);
    if (window.DeviceOrientationEvent) window.addEventListener('deviceorientation', this._onTilt);
    this._buildMobileControls();
    this.loop();
  }

  cleanup() {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    window.removeEventListener('keydown', this._onKey);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('deviceorientation', this._onTilt);
    const mc = document.getElementById('mobile-controls');
    if (mc) { mc.innerHTML = ''; mc.className = 'mobile-controls'; }
  }

  _onKey(e) { this.keys[e.key] = true; }
  _onKeyUp(e) { this.keys[e.key] = false; }
  _onTilt(e) { this.tiltX = Math.max(-30, Math.min(30, e.gamma || 0)); }

  _buildMobileControls() {
    const mc = document.getElementById('mobile-controls');
    mc.className = 'mobile-controls active';
    mc.style.cssText = 'display:flex;justify-content:space-between;align-items:flex-end;padding:10px;pointer-events:all;position:absolute;bottom:0;left:0;right:0;';
    mc.innerHTML = `
      <div style="display:flex;gap:10px">
        <div class="ctrl-btn" id="rc-left">◀</div>
        <div class="ctrl-btn" id="rc-right">▶</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px;align-items:flex-end">
        <div class="ctrl-btn" id="rc-accel" style="background:rgba(0,212,255,0.2);border-color:#00d4ff">▲</div>
        <div class="ctrl-btn" id="rc-brake" style="background:rgba(255,100,0,0.2);border-color:#ff6b35">▼</div>
      </div>
    `;
    const addHold = (id, onStart, onEnd) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('touchstart', e => { e.preventDefault(); onStart(); }, { passive: false });
      el.addEventListener('touchend', e => { e.preventDefault(); onEnd(); }, { passive: false });
      el.addEventListener('mousedown', onStart); el.addEventListener('mouseup', onEnd);
    };
    addHold('rc-left', () => this._leftHeld = true, () => this._leftHeld = false);
    addHold('rc-right', () => this._rightHeld = true, () => this._rightHeld = false);
    addHold('rc-accel', () => this._accelHeld = true, () => this._accelHeld = false);
    addHold('rc-brake', () => this._brakeHeld = true, () => this._brakeHeld = false);
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
    const car = this.car;
    const track = this.track;
    const leftKey = this.keys['ArrowLeft'] || this.keys['a'] || this.keys['A'] || this._leftHeld || this.tiltX < -8;
    const rightKey = this.keys['ArrowRight'] || this.keys['d'] || this.keys['D'] || this._rightHeld || this.tiltX > 8;
    const accelKey = this.keys['ArrowUp'] || this.keys['w'] || this.keys['W'] || this._accelHeld;
    const brakeKey = this.keys['ArrowDown'] || this.keys['s'] || this.keys['S'] || this._brakeHeld;
    const MAX_SPEED = 5, ACCEL = 0.15, TURN = 0.06, FRICTION = 0.95;

    if (accelKey) car.speed = Math.min(car.speed + ACCEL, MAX_SPEED);
    else if (brakeKey) car.speed = Math.max(car.speed - ACCEL * 2, -MAX_SPEED * 0.4);
    else car.speed *= FRICTION;

    const tiltFactor = Math.abs(this.tiltX) > 8 ? this.tiltX / 30 : 0;
    if (leftKey) car.angle -= TURN * (1 + Math.abs(tiltFactor));
    if (rightKey) car.angle += TURN * (1 + Math.abs(tiltFactor));

    car.x += Math.cos(car.angle) * car.speed;
    car.y += Math.sin(car.angle) * car.speed;

    // Check on track
    const onTrack = this._isOnTrack(car.x, car.y);
    if (!onTrack) {
      car.speed *= 0.7;
      this._spawnGravel(car.x, car.y);
    }

    // Checkpoint detection
    const next = track.points[(car.checkpoint + 1) % track.points.length];
    const cpDx = car.x - next.x, cpDy = car.y - next.y;
    const cpDist = Math.sqrt(cpDx * cpDx + cpDy * cpDy);
    if (cpDist < 40) {
      car.checkpoint = (car.checkpoint + 1) % track.points.length;
      if (car.checkpoint === 0) {
        car.lap++;
        this.onScoreUpdate(car.lap, this.LAPS);
        if (car.lap >= this.LAPS) {
          this.done = true;
          car.finished = true;
          if (this.onComplete) this.onComplete(car.lap);
        }
      }
    }

    this.particles = this.particles.filter(p => p.life > 0.01);
    this.particles.forEach(p => { p.x += p.vx; p.y += p.vy; p.life *= 0.88; });

    // Broadcast my car position to opponent every 3 frames
    this.relayTick++;
    if (this.relayTick % 3 === 0) {
      this.socket.emit('game-relay', {
        matchId: this.matchId,
        data: { x: car.x, y: car.y, angle: car.angle, lap: car.lap, speed: car.speed, finished: car.finished }
      });
    }
  }

  handleRelay(data) {
    this.oppCar = data;
  }

  _isOnTrack(x, y) {
    const pts = this.track.points;
    const hw = this.track.width / 2;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const dx = b.x - a.x, dy = b.y - a.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (len * len)));
      const cx = a.x + t * dx - x, cy = a.y + t * dy - y;
      if (Math.sqrt(cx * cx + cy * cy) < hw + 10) return true;
    }
    return false;
  }

  _spawnGravel(x, y) {
    if (Math.random() < 0.3) {
      const angle = Math.random() * Math.PI * 2;
      this.particles.push({ x, y, vx: Math.cos(angle) * 2, vy: Math.sin(angle) * 2, life: 1, color: '#8B6914' });
    }
  }

  render() {
    const { ctx, W, H, animT, car, track, done, particles } = this;
    ctx.clearRect(0, 0, W, H);

    // Grass background
    ctx.fillStyle = '#1a4a0a'; ctx.fillRect(0, 0, W, H);

    // Track
    ctx.strokeStyle = '#4a4a4a'; ctx.lineWidth = track.width;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    const pts = track.points;
    ctx.moveTo(pts[0].x, pts[0].y);
    pts.forEach(p => ctx.lineTo(p.x, p.y));
    ctx.closePath(); ctx.stroke();

    // Track markings
    ctx.strokeStyle = '#5a5a5a'; ctx.lineWidth = track.width - 4;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    pts.forEach(p => ctx.lineTo(p.x, p.y));
    ctx.closePath(); ctx.stroke();

    // Center line
    ctx.setLineDash([12, 12]);
    ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    pts.forEach(p => ctx.lineTo(p.x, p.y));
    ctx.closePath(); ctx.stroke();
    ctx.setLineDash([]);

    // Checkpoints
    pts.forEach((p, i) => {
      const reached = car.checkpoint > i || (car.checkpoint === 0 && car.lap > 0 && i === pts.length - 1);
      ctx.beginPath(); ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
      ctx.fillStyle = reached ? '#00ff88' : 'rgba(255,255,255,0.2)'; ctx.fill();
    });

    // Start/finish line
    const start = pts[0];
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 3;
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(start.x - 25, start.y); ctx.lineTo(start.x + 25, start.y); ctx.stroke();
    ctx.setLineDash([]);

    // Particles
    particles.forEach(p => {
      ctx.beginPath(); ctx.arc(p.x, p.y, 3 * p.life, 0, Math.PI * 2);
      ctx.fillStyle = p.color; ctx.globalAlpha = p.life; ctx.fill(); ctx.globalAlpha = 1;
    });

    // Car
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle + Math.PI / 2);

    // Car glow
    ctx.shadowColor = '#00d4ff'; ctx.shadowBlur = 10;
    // Car body
    ctx.fillStyle = this.isPlayer1 ? '#00aaff' : '#ff4444';
    const cw = 14, ch = 22;
    ctx.fillRect(-cw / 2, -ch / 2, cw, ch);
    // Windshield
    ctx.fillStyle = 'rgba(200,240,255,0.6)'; ctx.fillRect(-cw / 2 + 2, -ch / 2 + 2, cw - 4, ch * 0.35);
    // Wheels
    ctx.fillStyle = '#222';
    ctx.fillRect(-cw / 2 - 3, -ch / 2 + 2, 5, 7);
    ctx.fillRect(cw / 2 - 2, -ch / 2 + 2, 5, 7);
    ctx.fillRect(-cw / 2 - 3, ch / 2 - 9, 5, 7);
    ctx.fillRect(cw / 2 - 2, ch / 2 - 9, 5, 7);
    ctx.shadowBlur = 0;
    ctx.restore();

    // Opponent car
    if (this.oppCar) {
      const opp = this.oppCar;
      const oppColor = this.isPlayer1 ? '#ff4444' : '#00aaff';
      ctx.save();
      ctx.translate(opp.x, opp.y);
      ctx.rotate(opp.angle + Math.PI / 2);
      ctx.shadowColor = oppColor; ctx.shadowBlur = 12;
      const cw = 14, ch = 22;
      ctx.fillStyle = oppColor;
      ctx.fillRect(-cw / 2, -ch / 2, cw, ch);
      ctx.fillStyle = 'rgba(200,240,255,0.5)';
      ctx.fillRect(-cw / 2 + 2, -ch / 2 + 2, cw - 4, ch * 0.35);
      ctx.fillStyle = '#222';
      ctx.fillRect(-cw / 2 - 3, -ch / 2 + 2, 5, 7);
      ctx.fillRect(cw / 2 - 2,  -ch / 2 + 2, 5, 7);
      ctx.fillRect(-cw / 2 - 3,  ch / 2 - 9, 5, 7);
      ctx.fillRect(cw / 2 - 2,   ch / 2 - 9, 5, 7);
      ctx.shadowBlur = 0;
      ctx.restore();

      // Opponent lap label above their car
      ctx.save();
      ctx.font = 'bold 10px Exo 2, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = oppColor;
      ctx.fillText(`OPP L${opp.lap}`, opp.x, opp.y - 18);
      ctx.restore();
    }

    // Exhaust particles
    if (Math.abs(car.speed) > 1 && Math.random() < 0.5) {
      const ex = car.x - Math.cos(car.angle) * 12, ey = car.y - Math.sin(car.angle) * 12;
      this.particles.push({ x: ex, y: ey, vx: (Math.random() - 0.5) * 1, vy: (Math.random() - 0.5) * 1, life: 0.6, color: '#aaa' });
    }

    // HUD
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, W, 52);
    ctx.font = 'bold 18px Orbitron, sans-serif'; ctx.fillStyle = '#00d4ff'; ctx.textAlign = 'left';
    ctx.fillText(`LAP ${car.lap}/${this.LAPS}`, 12, 28);
    ctx.font = '12px Exo 2, sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillText(`Speed: ${Math.round(Math.abs(car.speed) * 30)} km/h`, 12, 46);
    if (this.oppCar) {
      const oppColor = this.isPlayer1 ? '#ff4444' : '#00aaff';
      ctx.font = 'bold 14px Orbitron, sans-serif'; ctx.fillStyle = oppColor; ctx.textAlign = 'right';
      ctx.fillText(`OPP L${this.oppCar.lap}/${this.LAPS}`, W - 12, 28);
    }

    // Lap progress bar
    ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.fillRect(0, 50, W, 4);
    ctx.fillStyle = '#00d4ff';
    const lapProgress = (car.checkpoint / track.points.length + car.lap) / this.LAPS;
    ctx.fillRect(0, 50, W * Math.min(1, lapProgress), 4);

    if (done) {
      ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(0, 0, W, H);
      ctx.textAlign = 'center';
      ctx.font = 'bold 30px Orbitron, sans-serif'; ctx.fillStyle = '#ffd700';
      ctx.fillText('FINISH!', W / 2, H / 2);
      ctx.font = '18px Exo 2, sans-serif'; ctx.fillStyle = '#00d4ff';
      ctx.fillText(`${this.LAPS} Laps Complete`, W / 2, H / 2 + 36);
    }
  }
}
