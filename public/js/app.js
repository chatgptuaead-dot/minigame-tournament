/* =============================================
   MULTIPLIER — Main Client App
   ============================================= */

const AVATARS = ['🦊','🐼','🦁','🐸','🐯','🦄','🐻','🐺','🦅','🐬','🦋','🐲','🐙','🦖','🐉','🦜'];
const GAME_NAMES = {
  pingpong: '🏓 PING PONG',
  reaction: '⚡ REACTION RACE',
  archery: '🏹 ARCHERY',
  penalty: '⚽ PENALTY SHOOTOUT',
  minigolf: '⛳ MINI GOLF',
  racing: '🚗 CAR RACING',
  pinball: '🎰 PINBALL',
  spaceblast: '🚀 SPACE BLAST'
};

const socket = io();
let state = {
  myId: null, myPlayer: null,
  roomCode: null, isHost: false,
  players: [],
  tournament: null,
  currentMatch: null,
  currentGame: null,
  eliminated: false,
  advancingPlayers: new Set()
};

// ===== Screen Management =====
const screens = {};
document.querySelectorAll('.screen').forEach(s => screens[s.id] = s);

function showScreen(id) {
  const target = screens[id];
  if (!target) return;
  Object.values(screens).forEach(s => {
    if (s === target) return;
    if (s.classList.contains('active')) {
      s.classList.add('exit');
      setTimeout(() => s.classList.remove('active', 'exit'), 400);
    }
  });
  target.classList.remove('exit');
  target.classList.add('active');
}

// ===== Toast =====
function showToast(msg, duration = 2500) {
  let t = document.querySelector('.toast');
  if (!t) { t = document.createElement('div'); t.className = 'toast'; document.body.appendChild(t); }
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), duration);
}

// ===== Stars background =====
function initStars() {
  const wrap = document.getElementById('stars');
  for (let i = 0; i < 60; i++) {
    const s = document.createElement('div');
    s.style.cssText = `position:absolute;width:${1+Math.random()*2}px;height:${1+Math.random()*2}px;background:rgba(255,255,255,${0.2+Math.random()*0.5});border-radius:50%;left:${Math.random()*100}%;top:${Math.random()*100}%;animation:pulse ${2+Math.random()*3}s ease-in-out infinite;animation-delay:${Math.random()*3}s`;
    wrap.appendChild(s);
  }
}

// ===== Avatar Grid =====
function buildAvatarGrid() {
  const grid = document.getElementById('avatar-grid');
  AVATARS.forEach((av, i) => {
    const el = document.createElement('div');
    el.className = 'avatar-option' + (i === 0 ? ' selected' : '');
    el.textContent = av;
    el.addEventListener('click', () => selectAvatar(av, el));
    grid.appendChild(el);
  });
}

let selectedAvatar = AVATARS[0];
function selectAvatar(av, el) {
  selectedAvatar = av;
  document.querySelectorAll('.avatar-option').forEach(e => e.classList.remove('selected'));
  el.classList.add('selected');
  document.getElementById('selected-avatar').textContent = av;
}

// ===== HOME SCREEN =====
document.getElementById('btn-create').addEventListener('click', () => { socket.emit('create-room'); });

document.getElementById('btn-join').addEventListener('click', () => {
  const code = document.getElementById('join-code').value.trim();
  if (!code) { showError('home', 'Enter a room code!'); return; }
  socket.emit('join-room', { code });
});

document.getElementById('join-code').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('btn-join').click();
});

// ===== AVATAR SCREEN =====
document.getElementById('btn-confirm-avatar').addEventListener('click', () => {
  const username = document.getElementById('username-input').value.trim();
  if (!username) { showError('avatar', 'Please enter your name!'); return; }
  if (username.length > 12) { showError('avatar', 'Name must be ≤12 characters'); return; }
  socket.emit('set-player-info', { username, avatar: selectedAvatar });
});

// ===== LOBBY SCREEN =====
document.getElementById('btn-ready').addEventListener('click', () => {
  socket.emit('player-ready');
  document.getElementById('btn-ready').disabled = true;
  document.getElementById('btn-ready').textContent = '✓ READY';
});

document.getElementById('btn-start-host').addEventListener('click', () => { socket.emit('request-start'); });
document.getElementById('btn-copy-code').addEventListener('click', () => {
  navigator.clipboard.writeText(state.roomCode).then(() => showToast('Code copied!'));
});
document.getElementById('btn-play-again').addEventListener('click', () => { location.reload(); });
document.getElementById('btn-add-bot').addEventListener('click', () => { socket.emit('add-bot'); });
document.getElementById('btn-remove-bot').addEventListener('click', () => { socket.emit('remove-bot'); });

function showError(screen, msg) {
  const el = document.getElementById(screen + '-error');
  if (el) { el.textContent = msg; setTimeout(() => { el.textContent = ''; }, 3000); }
}

// ===== LOBBY RENDER =====
function renderLobby() {
  const wrap = document.getElementById('lobby-players');
  wrap.innerHTML = '';
  state.players.forEach(p => {
    const card = document.createElement('div');
    card.className = 'lobby-player-card' + (p.ready ? ' ready' : '') + (p.isBot ? ' is-bot' : '');
    const badge = p.isBot
      ? '<div class="bot-badge">BOT</div>'
      : (p.ready ? '<div class="ready-badge">READY</div>' : '');
    card.innerHTML = `
      <div class="lobby-player-emoji">${p.avatar || '❓'}</div>
      <div class="lobby-player-name">${escHtml(p.username || 'Joining...')}</div>
      ${badge}
    `;
    wrap.appendChild(card);
  });
  const hint = document.getElementById('lobby-hint');
  const count = state.players.length;
  const botCount = state.players.filter(p => p.isBot).length;
  const humanCount = count - botCount;
  hint.textContent = `${humanCount} human${humanCount !== 1 ? 's' : ''}${botCount ? ` + ${botCount} bot${botCount !== 1 ? 's' : ''}` : ''} joined${count < 2 ? ' — need at least 2 total' : ''}`;
  if (state.isHost) {
    document.getElementById('btn-start-host').classList.toggle('hidden', count < 2);
    document.getElementById('bot-controls').classList.remove('hidden');
    document.getElementById('btn-add-bot').disabled = count >= 12;
    document.getElementById('btn-remove-bot').disabled = botCount === 0;
  }
}

// ===== TOURNAMENT BRACKET (Traditional Visual) =====
function renderBracket(bracket) {
  state.tournament = bracket;
  const container = document.getElementById('bracket-container');
  container.innerHTML = '';

  if (bracket.format === 'elimination') {
    renderEliminationBracket(bracket, container);
  } else {
    renderGroupsBracket(bracket, container);
  }
}

function renderEliminationBracket(bracket, container) {
  const numRounds = bracket.rounds.length;

  const outerWrap = document.createElement('div');
  outerWrap.className = 'trad-bracket-outer';

  const wrap = document.createElement('div');
  wrap.className = 'trad-bracket';
  wrap.id = 'trad-bracket-inner';

  bracket.rounds.forEach((round, ri) => {
    const col = document.createElement('div');
    col.className = 'trad-round';
    col.dataset.round = ri;

    // Round label
    const label = document.createElement('div');
    label.className = 'trad-round-label';
    if (numRounds === 1) label.textContent = bracket.rounds[0][0]?.bestOf ? `🏆 BEST OF ${bracket.rounds[0][0].bestOf}` : '🏆 FINAL';
    else if (ri === numRounds - 1) label.textContent = '🏆 FINAL';
    else if (ri === numRounds - 2 && numRounds > 2) label.textContent = 'SEMI-FINAL';
    else label.textContent = `ROUND ${ri + 1}`;
    col.appendChild(label);

    round.forEach(match => {
      const slot = document.createElement('div');
      slot.className = 'trad-slot';
      slot.appendChild(createMatchCard(match));
      col.appendChild(slot);
    });

    wrap.appendChild(col);
  });

  outerWrap.appendChild(wrap);
  container.appendChild(outerWrap);

  // Draw SVG connector lines after layout
  setTimeout(() => drawBracketLines(bracket, wrap, outerWrap), 550);
}

function drawBracketLines(bracket, wrap, container) {
  const existing = container.querySelector('#bracket-lines-svg');
  if (existing) existing.remove();

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.id = 'bracket-lines-svg';
  svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  svg.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;overflow:visible;z-index:1;';
  container.style.position = 'relative';
  container.appendChild(svg);

  const cRect = container.getBoundingClientRect();
  if (cRect.width === 0) return; // not visible yet

  bracket.rounds.forEach((round, ri) => {
    if (ri === 0) return;
    const prevRound = bracket.rounds[ri - 1];

    round.forEach((match, mi) => {
      const targetEl = document.getElementById(`match-${match.id}`);
      if (!targetEl) return;

      const src1Match = prevRound[mi * 2];
      const src2Match = prevRound[mi * 2 + 1];
      const src1El = src1Match ? document.getElementById(`match-${src1Match.id}`) : null;
      const src2El = src2Match ? document.getElementById(`match-${src2Match.id}`) : null;

      const targetRect = targetEl.getBoundingClientRect();
      const targetMidY = (targetRect.top + targetRect.bottom) / 2 - cRect.top;
      const targetX    = targetRect.left - cRect.left;

      const isActiveRound = match.state === 'active';
      const lineColor = isActiveRound ? 'rgba(0,212,255,0.5)' : 'rgba(255,255,255,0.18)';
      const lineWidth = isActiveRound ? '2' : '1.5';

      if (src1El && src2El) {
        const src1Rect = src1El.getBoundingClientRect();
        const src2Rect = src2El.getBoundingClientRect();
        const src1MidY = (src1Rect.top + src1Rect.bottom) / 2 - cRect.top;
        const src2MidY = (src2Rect.top + src2Rect.bottom) / 2 - cRect.top;
        const srcX = src1Rect.right - cRect.left;
        const midX = (srcX + targetX) / 2;

        // Draw: src1 stub → vertical bar → src2 stub, then → target
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d',
          `M ${srcX} ${src1MidY} H ${midX} V ${src2MidY} H ${srcX} M ${midX} ${targetMidY} H ${targetX}`
        );
        path.setAttribute('stroke', lineColor);
        path.setAttribute('stroke-width', lineWidth);
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke-linecap', 'round');
        svg.appendChild(path);

        // Dot at junction
        const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        dot.setAttribute('cx', midX);
        dot.setAttribute('cy', targetMidY);
        dot.setAttribute('r', '3');
        dot.setAttribute('fill', lineColor);
        svg.appendChild(dot);

      } else if (src1El || src2El) {
        // Bye — dashed line
        const srcEl = src1El || src2El;
        const srcRect = srcEl.getBoundingClientRect();
        const srcMidY = (srcRect.top + srcRect.bottom) / 2 - cRect.top;
        const srcX = srcRect.right - cRect.left;
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', srcX); line.setAttribute('y1', srcMidY);
        line.setAttribute('x2', targetX); line.setAttribute('y2', targetMidY);
        line.setAttribute('stroke', 'rgba(255,255,255,0.12)');
        line.setAttribute('stroke-width', '1');
        line.setAttribute('stroke-dasharray', '5,4');
        svg.appendChild(line);
      }
    });
  });
}

function createMatchCard(match) {
  const card = document.createElement('div');
  card.className = `bracket-match ${match.state}`;
  card.id = `match-${match.id}`;

  const p1 = match.p1 || { avatar: '?', username: 'TBD' };
  const p2 = match.p2 || { avatar: '?', username: 'TBD' };
  const p1win = match.winner?.id === match.p1?.id;
  const p2win = match.winner?.id === match.p2?.id;
  const p1adv = match.p1 && state.advancingPlayers.has(match.p1.id);
  const p2adv = match.p2 && state.advancingPlayers.has(match.p2.id);

  let seriesHtml = '';
  if (match.bestOf && match.seriesScore) {
    seriesHtml = `<div class="bracket-series">BO${match.bestOf} · ${match.seriesScore.p1}—${match.seriesScore.p2}</div>`;
  }

  card.innerHTML = `
    <div class="bracket-player ${p1win ? 'winner' : (match.winner && !p1win ? 'loser' : '')}${p1adv ? ' player-advancing' : ''}">
      <span class="bp-avatar">${p1.avatar || '?'}</span>
      <span class="bp-name">${escHtml(p1.username || 'TBD')}</span>
      ${p1win ? '<span class="bp-crown">👑</span>' : ''}
    </div>
    <div class="bracket-divider"></div>
    <div class="bracket-player ${p2win ? 'winner' : (match.winner && !p2win ? 'loser' : '')}${p2adv ? ' player-advancing' : ''}">
      <span class="bp-avatar">${p2.avatar || '?'}</span>
      <span class="bp-name">${escHtml(p2.username || 'TBD')}</span>
      ${p2win ? '<span class="bp-crown">👑</span>' : ''}
    </div>
    ${seriesHtml}
    ${match.game ? `<div class="bracket-game-tag">${GAME_NAMES[match.game] || match.game}</div>` : ''}
  `;
  return card;
}

function renderGroupsBracket(bracket, container) {
  if (bracket.currentRound === 0 && bracket.groupStandings) {
    const gWrap = document.createElement('div');
    gWrap.className = 'groups-container';
    Object.entries(bracket.groupStandings).forEach(([gNum, standings]) => {
      const table = document.createElement('div');
      table.className = 'group-table';
      table.innerHTML = `<div class="group-table-header">GROUP ${gNum}</div>`;
      standings.forEach(s => {
        const row = document.createElement('div');
        row.className = 'group-row';
        row.innerHTML = `<span class="emoji">${s.player.avatar}</span><span class="gname">${escHtml(s.player.username)}</span><span class="gstat" style="color:#00ff88">${s.wins}W</span><span class="gstat" style="color:#ff4d6d">${s.losses}L</span>`;
        table.appendChild(row);
      });
      gWrap.appendChild(table);
    });
    container.appendChild(gWrap);
  } else {
    const fakeElim = {
      format: 'elimination',
      rounds: bracket.rounds.slice(bracket.currentRound >= 1 ? 1 : 0),
      currentRound: 0
    };
    renderEliminationBracket(fakeElim, container);
  }
}

// ===== GAME MANAGEMENT =====
let gameInstance = null;

function startGame(matchData) {
  state.currentMatch = matchData;
  state.eliminated = false;
  const canvas = document.getElementById('game-canvas');
  const overlay = document.getElementById('game-overlay');
  overlay.innerHTML = '';
  overlay.className = 'game-overlay';
  document.getElementById('mobile-controls').innerHTML = '';
  document.getElementById('mobile-controls').className = 'mobile-controls';

  const myPlayer = state.myPlayer;
  const opponent = matchData.opponent;
  const isP1 = matchData.isPlayer1;
  const p1 = isP1 ? myPlayer : opponent;
  const p2 = isP1 ? opponent : myPlayer;

  document.getElementById('hud-p1').innerHTML = `<div class="hud-avatar">${p1?.avatar || '?'}</div><div class="hud-name">${escHtml(p1?.username || '')}</div><div class="hud-score" id="score-p1">0</div>`;
  document.getElementById('hud-p2').innerHTML = `<div class="hud-score" id="score-p2">0</div><div class="hud-name">${escHtml(p2?.username || '')}</div><div class="hud-avatar">${p2?.avatar || '?'}</div>`;
  document.getElementById('hud-game-name').textContent = GAME_NAMES[matchData.game] || matchData.game;

  showScreen('screen-game');

  if (gameInstance) { gameInstance.cleanup(); gameInstance = null; }
  resizeCanvas(canvas, matchData.game);

  // Show series info if this is a mid-series game
  if (matchData.bestOf && matchData.gameNum > 1 && matchData.seriesScore) {
    overlay.className = 'game-overlay active pregame-overlay';
    const mySeriesScore = isP1 ? matchData.seriesScore.p1 : matchData.seriesScore.p2;
    const oppSeriesScore = isP1 ? matchData.seriesScore.p2 : matchData.seriesScore.p1;
    overlay.innerHTML = `
      <div style="text-align:center">
        <div style="font-size:0.8rem;color:rgba(255,255,255,0.5);letter-spacing:3px;margin-bottom:12px">BEST OF ${matchData.bestOf} · GAME ${matchData.gameNum}</div>
        <div style="font-family:'Orbitron',sans-serif;font-size:2.5rem;font-weight:900;letter-spacing:4px;color:#ffd700">${mySeriesScore} — ${oppSeriesScore}</div>
        <div style="font-size:0.8rem;color:rgba(255,255,255,0.4);margin-top:10px">YOU · OPP</div>
      </div>
    `;
    setTimeout(() => {
      overlay.innerHTML = '';
      overlay.className = 'game-overlay';
      launchGame(canvas, matchData);
    }, 2200);
  } else {
    launchGame(canvas, matchData);
  }
}

function launchGame(canvas, matchData) {
  showCountdown(canvas, () => {
    const config = {
      socket, matchId: matchData.matchId,
      isPlayer1: matchData.isPlayer1,
      opponent: matchData.opponent,
      playerId: state.myId,
      onComplete: (score) => {
        socket.emit('submit-score', { matchId: matchData.matchId, score });
      },
      onScoreUpdate: (p1score, p2score) => {
        const s1el = document.getElementById('score-p1');
        const s2el = document.getElementById('score-p2');
        if (s1el) s1el.textContent = p1score;
        if (s2el) s2el.textContent = p2score;
      }
    };

    const gameClassByName = {
      pingpong:   typeof PingPong      !== 'undefined' ? PingPong      : null,
      reaction:   typeof ReactionGame  !== 'undefined' ? ReactionGame  : null,
      archery:    typeof ArcheryGame   !== 'undefined' ? ArcheryGame   : null,
      penalty:    typeof PenaltyGame   !== 'undefined' ? PenaltyGame   : null,
      minigolf:   typeof MiniGolfGame  !== 'undefined' ? MiniGolfGame  : null,
      racing:     typeof RacingGame    !== 'undefined' ? RacingGame    : null,
      pinball:    typeof PinballGame   !== 'undefined' ? PinballGame   : null,
      spaceblast: typeof SpaceBlast    !== 'undefined' ? SpaceBlast    : null
    };
    const GameClass = gameClassByName[matchData.game];
    if (GameClass) { gameInstance = new GameClass(canvas, config); gameInstance.start(); }
  });
}

function resizeCanvas(canvas, game) {
  const isVertical = ['pinball', 'racing'].includes(game);
  const wrap = document.getElementById('game-canvas-wrap');
  const ww = wrap.clientWidth;
  const wh = wrap.clientHeight;
  if (isVertical) {
    const aspect = 400 / 650;
    const h = Math.min(wh, 650);
    const w = h * aspect;
    canvas.width = 400; canvas.height = 650;
    canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
  } else {
    const aspect = 800 / 500;
    const w = Math.min(ww, 800);
    const h = w / aspect;
    canvas.width = 800; canvas.height = 500;
    canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
  }
}

function showCountdown(canvas, cb) {
  const overlay = document.getElementById('game-overlay');
  overlay.className = 'game-overlay active pregame-overlay';
  let count = 3;
  const tick = () => {
    overlay.innerHTML = `<div class="countdown-display">${count === 0 ? 'GO!' : count}</div>`;
    if (count === 0) {
      setTimeout(() => { overlay.className = 'game-overlay'; overlay.innerHTML = ''; cb(); }, 600);
      return;
    }
    count--;
    setTimeout(tick, 900);
  };
  tick();
}

// ===== SOCKET EVENTS =====
socket.on('connect', () => { state.myId = socket.id; });

socket.on('room-created', ({ code }) => {
  state.roomCode = code;
  state.isHost = true;
  document.getElementById('lobby-code').textContent = code;
  document.getElementById('lobby-hint').textContent = 'Share the room code!';
  showScreen('screen-avatar');
});

socket.on('room-joined', ({ code, isHost, players }) => {
  state.roomCode = code;
  state.isHost = isHost;
  state.players = players || [];
  document.getElementById('lobby-code').textContent = code;
  showScreen('screen-avatar');
});

socket.on('join-error', ({ message }) => { showError('home', message); });

socket.on('player-info-set', ({ player }) => {
  state.myPlayer = player;
  document.getElementById('lobby-code').textContent = state.roomCode;
  if (state.isHost) document.getElementById('btn-start-host').classList.remove('hidden');
  showScreen('screen-lobby');
  renderLobby();
});

socket.on('players-updated', ({ players }) => {
  state.players = players;
  renderLobby();
});

socket.on('player-left', () => { showToast('A player left the game'); });

socket.on('tournament-start', ({ bracket, players }) => {
  state.players = players;
  state.eliminated = false;
  state.advancingPlayers.clear();
  renderBracket(bracket);
  document.getElementById('tournament-title').textContent = 'TOURNAMENT';
  showScreen('screen-tournament');
  showRoundAnnouncement('TOURNAMENT BEGINS!', 'May the best player win!');
});

socket.on('round-start', ({ round, game, matches, bracket }) => {
  renderBracket(bracket);
  document.getElementById('current-game-badge').textContent = GAME_NAMES[game] || game;
  showScreen('screen-tournament');
  const myMatch = matches.find(m => m.p1?.id === state.myId || m.p2?.id === state.myId);
  if (!myMatch) {
    state.eliminated = true;
    setTimeout(() => showSpectatorScreen(matches), 2000);
  } else {
    showRoundAnnouncement(`ROUND ${round + 1}`, `Game: ${GAME_NAMES[game] || game}`);
  }
});

socket.on('match-start', (matchData) => {
  startGame(matchData);
});

socket.on('pingpong-state', ({ matchId, ball, p1y, p2y, score, bumper, speedLevel }) => {
  if (matchId !== state.currentMatch?.matchId) return;
  if (gameInstance?.handlePingPongState) {
    gameInstance.handlePingPongState({ ball, p1y, p2y, score, bumper, speedLevel });
  }
  const s1el = document.getElementById('score-p1');
  const s2el = document.getElementById('score-p2');
  if (s1el) s1el.textContent = score.p1;
  if (s2el) s2el.textContent = score.p2;
});

socket.on('reaction-prepare', ({ matchId, round, total }) => {
  if (matchId !== state.currentMatch?.matchId) return;
  if (gameInstance?.handleReactionPrepare) gameInstance.handleReactionPrepare({ round, total });
});

socket.on('reaction-go', ({ matchId }) => {
  if (matchId !== state.currentMatch?.matchId) return;
  if (gameInstance?.handleReactionGo) gameInstance.handleReactionGo();
});

socket.on('reaction-result', ({ matchId, round, t1, t2, scores, roundWinner }) => {
  if (matchId !== state.currentMatch?.matchId) return;
  if (gameInstance?.handleReactionResult) gameInstance.handleReactionResult({ round, t1, t2, scores, roundWinner });
});

socket.on('series-update', ({ matchId, seriesScore, lastWinner, lastScores, bestOf, gameNum, neededToWin }) => {
  if (matchId !== state.currentMatch?.matchId) return;
  if (gameInstance) { gameInstance.cleanup(); gameInstance = null; }
  const isWinner = lastWinner.id === state.myId;
  const isP1 = state.currentMatch?.isPlayer1;
  const myScore = isP1 ? seriesScore.p1 : seriesScore.p2;
  const oppScore = isP1 ? seriesScore.p2 : seriesScore.p1;
  const seriesOver = myScore >= neededToWin || oppScore >= neededToWin;

  const overlay = document.getElementById('game-overlay');
  overlay.className = 'game-overlay active';
  overlay.innerHTML = `
    <div style="text-align:center;padding:30px">
      <div style="font-size:3.5rem;margin-bottom:8px">${isWinner ? '✓' : '✗'}</div>
      <div style="font-family:'Orbitron',sans-serif;font-size:1.5rem;color:${isWinner ? '#00ff88' : '#ff4d6d'};margin-bottom:16px">
        ${isWinner ? 'GAME WON!' : `${escHtml(lastWinner.username)} took that one`}
      </div>
      <div style="font-family:'Orbitron',sans-serif;font-size:2rem;font-weight:900;color:#ffd700;letter-spacing:4px">
        ${myScore} — ${oppScore}
      </div>
      <div style="font-size:0.75rem;color:rgba(255,255,255,0.4);margin-top:6px;letter-spacing:2px">
        BEST OF ${bestOf} · GAME ${gameNum}
      </div>
      ${!seriesOver ? `<div style="color:rgba(255,255,255,0.5);font-size:0.85rem;margin-top:16px">Next game starting soon…</div>` : ''}
    </div>
  `;
});

socket.on('match-complete', ({ matchId, winner, scores }) => {
  if (matchId !== state.currentMatch?.matchId) return;
  if (gameInstance) { gameInstance.cleanup(); gameInstance = null; }
  const isWinner = winner.id === state.myId;
  showMatchResult(isWinner, winner, scores);
});

socket.on('round-complete', ({ round, winners, bracket, standings }) => {
  // Mark advancing players for animation
  state.advancingPlayers.clear();
  if (winners) winners.forEach(w => state.advancingPlayers.add(w.id));

  if (bracket) renderBracket(bracket);

  // Clear advancing markers after animation completes
  setTimeout(() => state.advancingPlayers.clear(), 3000);

  const iAmWinner = winners?.some(w => w.id === state.myId);
  if (!iAmWinner) state.eliminated = true;
  setTimeout(() => {
    showScreen('screen-tournament');
    showRoundAnnouncement(
      iAmWinner ? '⬆ YOU ADVANCE!' : '😔 ELIMINATED',
      iAmWinner ? 'Get ready for the next round!' : 'Watch the remaining action!'
    );
  }, 500);
});

socket.on('tournament-complete', ({ winner }) => {
  if (gameInstance) { gameInstance.cleanup(); gameInstance = null; }
  setTimeout(() => showWinner(winner), 1000);
});

socket.on('game-relay', ({ matchId, data, from }) => {
  if (gameInstance?.handleRelay) gameInstance.handleRelay(data, from);
});

// ===== UI HELPERS =====
function showRoundAnnouncement(title, sub) {
  const el = document.getElementById('round-announcement');
  el.innerHTML = `<h3>${title}</h3><p>${sub}</p>`;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 3200);
}

function showMatchResult(isWinner, winner, scores) {
  const overlay = document.getElementById('game-overlay');
  overlay.className = 'game-overlay active';
  const color = isWinner ? '#00ff88' : '#ff4d6d';
  const icon = isWinner ? '🏆' : '😔';
  const msg = isWinner ? 'YOU WIN!' : `${escHtml(winner.username)} wins!`;
  overlay.innerHTML = `
    <div style="text-align:center;padding:30px">
      <div style="font-size:4rem">${icon}</div>
      <div style="font-family:'Orbitron',sans-serif;font-size:1.8rem;color:${color};margin:12px 0">${msg}</div>
      <div style="color:rgba(255,255,255,0.5);font-size:0.9rem">${scores ? `Score: ${scores.p1} — ${scores.p2}` : ''}</div>
    </div>
  `;
}

function showSpectatorScreen(matches) {
  const wrap = document.getElementById('spectator-matches');
  wrap.innerHTML = '';
  if (!matches || matches.length === 0) {
    wrap.innerHTML = '<p style="color:rgba(255,255,255,0.4);text-align:center">Loading matches...</p>';
  } else {
    matches.forEach(m => {
      const card = document.createElement('div');
      card.className = 'spectator-match-card';
      card.innerHTML = `
        <div class="spectator-match-players">
          <div class="spectator-player"><div class="emoji">${m.p1?.avatar || '?'}</div><div class="name">${escHtml(m.p1?.username || '')}</div></div>
          <div class="spectator-vs">VS</div>
          <div class="spectator-player"><div class="emoji">${m.p2?.avatar || '?'}</div><div class="name">${escHtml(m.p2?.username || '')}</div></div>
        </div>
        <div class="spectator-score"><span id="spec-s1-${m.id}">0</span><span>—</span><span id="spec-s2-${m.id}">0</span></div>
        <div class="spectator-game">${GAME_NAMES[m.game] || ''}</div>
      `;
      wrap.appendChild(card);
    });
  }
  showScreen('screen-spectator');
}

function showWinner(winner) {
  document.getElementById('winner-avatar').textContent = winner.avatar || '🏆';
  document.getElementById('winner-name').textContent = winner.username || 'Champion';
  showScreen('screen-winner');
  launchConfetti();
}

function launchConfetti() {
  const wrap = document.getElementById('confetti-wrap');
  wrap.innerHTML = '';
  const colors = ['#00d4ff', '#7b2fff', '#ff6b9d', '#ffd700', '#00ff88', '#ff6b35'];
  for (let i = 0; i < 80; i++) {
    const p = document.createElement('div');
    p.className = 'confetti-piece';
    p.style.cssText = `
      left:${Math.random() * 100}%;
      background:${colors[Math.floor(Math.random() * colors.length)]};
      width:${6 + Math.random() * 8}px;height:${6 + Math.random() * 8}px;
      border-radius:${Math.random() > 0.5 ? '50%' : '2px'};
      animation:confetti-fall ${2 + Math.random() * 3}s ${Math.random() * 2}s linear both;
    `;
    wrap.appendChild(p);
  }
}

function escHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ===== INIT =====
initStars();
buildAvatarGrid();
showScreen('screen-home');
