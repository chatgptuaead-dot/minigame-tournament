const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.static(path.join(__dirname, 'public')));

const GAME_TYPES = ['pingpong', 'reaction', 'archery', 'penalty', 'minigolf', 'racing', 'pinball', 'spaceblast'];
const WIN_SCORE_PINGPONG = 5;
const BOT_NAMES = ['Robo-X', 'Byte', 'Circuit', 'Pixel', 'Glitch', 'Nano', 'Volt', 'Chip', 'Dash', 'Nova'];
const BOT_AVATARS = ['🤖', '👾', '🦾', '⚡', '💡', '🔮', '🎯', '🌀'];

function getBotScore(game) {
  const skill = 0.35 + Math.random() * 0.45;
  switch (game) {
    case 'archery':    return Math.round(20 + skill * 55);
    case 'penalty':    return Math.round(skill * 4.5);
    case 'minigolf':   return Math.round(5 + (1 - skill) * 9);
    case 'racing':     return 3;
    case 'pinball':    return Math.round(1200 + skill * 6000);
    case 'spaceblast': return Math.round(600 + skill * 2400);
    default:           return Math.round(skill * 100);
  }
}

// --- Utility ---
const genCode = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
};
const genId = () => Math.random().toString(36).substr(2, 9);
const shuffle = arr => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// --- Room storage ---
const rooms = {};
const playerRoom = {};

// --- Tournament bracket creation ---
function createBracket(players) {
  const shuffled = shuffle(players);
  const n = shuffled.length;
  if (n <= 8) return createEliminationBracket(shuffled);
  return createGroupStageBracket(shuffled);
}

function pickGame(usedGames = []) {
  const recent = usedGames.slice(-4);
  const pool = GAME_TYPES.filter(g => !recent.includes(g));
  const src = pool.length ? pool : GAME_TYPES;
  return src[Math.floor(Math.random() * src.length)];
}

function createEliminationBracket(players) {
  const n = players.length;
  let bracketSize = 2;
  while (bracketSize < n) bracketSize *= 2;
  const byes = bracketSize - n;
  const usedGames = [];

  const firstRound = [];
  let pi = 0;
  for (let i = 0; i < byes; i++) {
    firstRound.push({ id: genId(), p1: players[pi], p2: null, winner: players[pi], game: null, state: 'bye', scores: { p1: 0, p2: 0 } });
    pi++;
  }
  while (pi < players.length) {
    const game = pickGame(usedGames);
    usedGames.push(game);
    const match = { id: genId(), p1: players[pi], p2: players[pi + 1], winner: null, game, state: 'pending', scores: { p1: 0, p2: 0 } };
    // Best-of-3 for exactly 2-player rooms
    if (n === 2) {
      match.bestOf = 3;
      match.seriesScore = { p1: 0, p2: 0 };
    }
    firstRound.push(match);
    pi += 2;
  }

  const rounds = [firstRound];
  let prev = firstRound;
  while (prev.length > 1) {
    const next = [];
    for (let i = 0; i < prev.length; i += 2) {
      next.push({ id: genId(), p1: null, p2: null, winner: null, game: null, state: 'tbd', scores: { p1: 0, p2: 0 }, fromMatches: [prev[i]?.id, prev[i + 1]?.id] });
    }
    rounds.push(next);
    prev = next;
  }

  return { format: 'elimination', players, rounds, currentRound: 0, usedGames };
}

function createGroupStageBracket(players) {
  const n = players.length;
  const half = Math.ceil(n / 2);
  const g1 = players.slice(0, half);
  const g2 = players.slice(half);
  const usedGames = [];

  const groupMatches = (group, gNum) => {
    const ms = [];
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const game = pickGame(usedGames);
        usedGames.push(game);
        ms.push({ id: genId(), p1: group[i], p2: group[j], winner: null, game, state: 'pending', scores: { p1: 0, p2: 0 }, group: gNum });
      }
    }
    return ms;
  };

  const round0 = [...groupMatches(g1, 1), ...groupMatches(g2, 2)];
  const sf1 = { id: genId(), p1: null, p2: null, winner: null, game: null, state: 'tbd', scores: { p1: 0, p2: 0 } };
  const sf2 = { id: genId(), p1: null, p2: null, winner: null, game: null, state: 'tbd', scores: { p1: 0, p2: 0 } };
  const final = { id: genId(), p1: null, p2: null, winner: null, game: null, state: 'tbd', scores: { p1: 0, p2: 0 } };

  return {
    format: 'groups', players, rounds: [round0, [sf1, sf2], [final]],
    groups: { 1: g1, 2: g2 },
    groupStandings: {
      1: g1.map(p => ({ player: p, wins: 0, losses: 0 })),
      2: g2.map(p => ({ player: p, wins: 0, losses: 0 }))
    },
    currentRound: 0, usedGames
  };
}

function serializeTournament(t) {
  const p = ({ id, username, avatar }) => ({ id, username, avatar });
  return {
    format: t.format,
    currentRound: t.currentRound,
    rounds: t.rounds.map(round => round.map(m => ({
      id: m.id, state: m.state, game: m.game, scores: m.scores,
      bestOf: m.bestOf || null,
      seriesScore: m.seriesScore ? { ...m.seriesScore } : null,
      p1: m.p1 ? p(m.p1) : null,
      p2: m.p2 ? p(m.p2) : null,
      winner: m.winner ? p(m.winner) : null
    }))),
    groupStandings: t.groupStandings ? Object.fromEntries(
      Object.entries(t.groupStandings).map(([k, v]) => [k, v.map(s => ({ player: p(s.player), wins: s.wins, losses: s.losses }))])
    ) : null
  };
}

function findMatch(room, matchId) {
  for (const round of room.tournament.rounds) {
    const m = round.find(m => m.id === matchId);
    if (m) return m;
  }
  return null;
}

function startTournament(room) {
  room.state = 'tournament';
  room.tournament = createBracket(room.players);
  io.to(room.code).emit('tournament-start', {
    bracket: serializeTournament(room.tournament),
    players: room.players.map(({ id, username, avatar }) => ({ id, username, avatar }))
  });
  setTimeout(() => startRound(room), 4000);
}

function startRound(room) {
  const { tournament } = room;
  const round = tournament.rounds[tournament.currentRound];
  if (!round) return;

  const pending = round.filter(m => m.state === 'pending');
  if (pending.length === 0) {
    advanceTournament(room);
    return;
  }

  const game = pickGame(tournament.usedGames);
  pending.forEach(m => { m.game = game; m.state = 'active'; });
  tournament.usedGames.push(game);

  io.to(room.code).emit('round-start', {
    round: tournament.currentRound,
    game,
    matches: pending.map(m => ({ id: m.id, p1: { id: m.p1.id, username: m.p1.username, avatar: m.p1.avatar }, p2: { id: m.p2.id, username: m.p2.username, avatar: m.p2.avatar } })),
    bracket: serializeTournament(tournament)
  });

  for (const match of pending) {
    const p1s = io.sockets.sockets.get(match.p1.id);
    const p2s = io.sockets.sockets.get(match.p2.id);
    if (p1s) p1s.emit('match-start', { matchId: match.id, game, opponent: { id: match.p2.id, username: match.p2.username, avatar: match.p2.avatar }, isPlayer1: true, bestOf: match.bestOf || null, seriesScore: match.seriesScore || null, gameNum: 1 });
    if (p2s) p2s.emit('match-start', { matchId: match.id, game, opponent: { id: match.p1.id, username: match.p1.username, avatar: match.p1.avatar }, isPlayer1: false, bestOf: match.bestOf || null, seriesScore: match.seriesScore || null, gameNum: 1 });

    if (game === 'pingpong') startPingPongLoop(room, match);
    if (game === 'reaction') startReactionGame(room, match);
    if (match.p1?.isBot || match.p2?.isBot) handleBotMatch(room, match);
  }
}

function finishMatch(room, match, winner, scores) {
  if (match.state === 'complete') return;
  match.winner = winner;
  match.scores = scores;
  match.state = 'complete';
  if (match.gameLoop) { clearInterval(match.gameLoop); match.gameLoop = null; }

  io.to(room.code).emit('match-complete', {
    matchId: match.id,
    winner: { id: winner.id, username: winner.username, avatar: winner.avatar },
    scores
  });

  if (room.tournament.format === 'groups' && room.tournament.currentRound === 0 && match.group) {
    const standings = room.tournament.groupStandings[match.group];
    if (standings) {
      const ws = standings.find(s => s.player.id === winner.id);
      const ls = standings.find(s => s.player.id !== winner.id && (s.player.id === match.p1.id || s.player.id === match.p2.id));
      if (ws) ws.wins++;
      if (ls) ls.losses++;
    }
  }

  setTimeout(() => checkRoundComplete(room), 500);
}

// --- Handles end of each game (supports best-of-3 series) ---
function handleGameEnd(room, match, winner, scores) {
  if (match.gameEndHandled) return;
  match.gameEndHandled = true;

  // No series — just finish
  if (!match.bestOf) {
    return finishMatch(room, match, winner, scores);
  }

  // Series logic
  match.seriesScore = match.seriesScore || { p1: 0, p2: 0 };
  const isP1Win = winner.id === match.p1.id;
  if (isP1Win) match.seriesScore.p1++;
  else match.seriesScore.p2++;

  const needed = Math.ceil(match.bestOf / 2);
  const gameNum = match.seriesScore.p1 + match.seriesScore.p2;

  io.to(room.code).emit('series-update', {
    matchId: match.id,
    seriesScore: { ...match.seriesScore },
    lastWinner: { id: winner.id, username: winner.username, avatar: winner.avatar },
    lastScores: scores,
    bestOf: match.bestOf,
    gameNum,
    neededToWin: needed
  });

  if (match.seriesScore.p1 >= needed || match.seriesScore.p2 >= needed) {
    // Series decided — wait briefly then officially finish
    setTimeout(() => finishMatch(room, match, winner, scores), 2500);
  } else {
    // Start next game
    match.playerScores = {};
    match.reactionSignalTime = null;
    match.reactionResponses = {};
    if (match.gameLoop) { clearInterval(match.gameLoop); match.gameLoop = null; }

    const newGame = pickGame(room.tournament.usedGames);
    match.game = newGame;
    room.tournament.usedGames.push(newGame);
    const nextGameNum = gameNum + 1;
    match.seriesGameId = (match.seriesGameId || 0) + 1;

    setTimeout(() => {
      if (match.state !== 'active') return;
      match.gameEndHandled = false; // allow next game to complete

      const p1s = io.sockets.sockets.get(match.p1.id);
      const p2s = io.sockets.sockets.get(match.p2.id);
      if (p1s) p1s.emit('match-start', {
        matchId: match.id, game: newGame,
        opponent: { id: match.p2.id, username: match.p2.username, avatar: match.p2.avatar },
        isPlayer1: true, seriesScore: { ...match.seriesScore }, bestOf: match.bestOf, gameNum: nextGameNum
      });
      if (p2s) p2s.emit('match-start', {
        matchId: match.id, game: newGame,
        opponent: { id: match.p1.id, username: match.p1.username, avatar: match.p1.avatar },
        isPlayer1: false, seriesScore: { ...match.seriesScore }, bestOf: match.bestOf, gameNum: nextGameNum
      });

      if (newGame === 'pingpong') startPingPongLoop(room, match);
      if (newGame === 'reaction') startReactionGame(room, match);
      if (match.p1?.isBot || match.p2?.isBot) handleBotMatch(room, match);
    }, 5000);
  }
}

// --- Bot match automation ---
function handleBotMatch(room, match) {
  const game = match.game;
  if (game === 'pingpong' || game === 'reaction') return;

  const thisGameId = match.seriesGameId = (match.seriesGameId || 0) + 1;
  const bots = [match.p1, match.p2].filter(p => p?.isBot);

  bots.forEach(bot => {
    const opponent = match.p1.id === bot.id ? match.p2 : match.p1;
    const delay = 18000 + Math.random() * 32000;
    setTimeout(() => {
      if (match.seriesGameId !== thisGameId) return;
      if (match.state !== 'active' || match.gameEndHandled) return;
      const score = getBotScore(game);
      if (!match.playerScores) match.playerScores = {};
      match.playerScores[bot.id] = score;
      if (!opponent || match.playerScores[opponent.id] !== undefined) {
        const s1 = match.playerScores[match.p1.id];
        const s2 = match.playerScores[match.p2.id];
        if (s1 !== undefined && s2 !== undefined) {
          const winner = game === 'minigolf'
            ? (s1 <= s2 ? match.p1 : match.p2)
            : (s1 >= s2 ? match.p1 : match.p2);
          handleGameEnd(room, match, winner, { p1: s1, p2: s2 });
        }
      }
    }, delay);
  });

  // Safety net after 2.5 min
  setTimeout(() => {
    if (match.seriesGameId !== thisGameId) return;
    if (match.state !== 'active' || match.gameEndHandled) return;
    if (!match.playerScores) match.playerScores = {};
    const s1 = match.playerScores[match.p1.id] ?? (game === 'minigolf' ? 99 : 0);
    const s2 = match.playerScores[match.p2.id] ?? (game === 'minigolf' ? 99 : 0);
    const winner = game === 'minigolf'
      ? (s1 <= s2 ? match.p1 : match.p2)
      : (s1 >= s2 ? match.p1 : match.p2);
    handleGameEnd(room, match, winner, { p1: s1, p2: s2 });
  }, 150000);
}

function checkRoundComplete(room) {
  const { tournament } = room;
  const round = tournament.rounds[tournament.currentRound];
  if (!round) return;
  const pending = round.filter(m => m.state === 'pending' || m.state === 'active');
  if (pending.length === 0) advanceTournament(room);
}

function advanceTournament(room) {
  const { tournament } = room;
  const round = tournament.rounds[tournament.currentRound];
  const winners = round.map(m => m.winner).filter(Boolean);

  if (tournament.format === 'elimination') {
    tournament.currentRound++;
    const nextRound = tournament.rounds[tournament.currentRound];
    if (!nextRound) {
      room.state = 'gameover';
      io.to(room.code).emit('tournament-complete', { winner: { id: winners[0].id, username: winners[0].username, avatar: winners[0].avatar } });
      return;
    }
    let wi = 0;
    for (const m of nextRound) {
      m.p1 = winners[wi++] || null;
      m.p2 = winners[wi++] || null;
      if (m.p1 && m.p2) { m.state = 'pending'; m.game = pickGame(tournament.usedGames); }
      else if (m.p1) { m.state = 'bye'; m.winner = m.p1; }
    }
    io.to(room.code).emit('round-complete', { round: tournament.currentRound - 1, winners: winners.map(w => ({ id: w.id, username: w.username, avatar: w.avatar })), bracket: serializeTournament(tournament) });
    setTimeout(() => startRound(room), 5000);

  } else if (tournament.format === 'groups') {
    if (tournament.currentRound === 0) {
      const g1s = [...tournament.groupStandings[1]].sort((a, b) => b.wins - a.wins);
      const g2s = [...tournament.groupStandings[2]].sort((a, b) => b.wins - a.wins);
      const [sf1, sf2] = tournament.rounds[1];
      sf1.p1 = g1s[0].player; sf1.p2 = g2s[1].player; sf1.state = 'pending'; sf1.game = pickGame(tournament.usedGames);
      sf2.p1 = g2s[0].player; sf2.p2 = g1s[1].player; sf2.state = 'pending'; sf2.game = pickGame(tournament.usedGames);
      tournament.currentRound = 1;
      io.to(room.code).emit('round-complete', { round: 0, standings: serializeTournament(tournament).groupStandings, bracket: serializeTournament(tournament) });
      setTimeout(() => startRound(room), 5000);
    } else if (tournament.currentRound === 1) {
      const sfWinners = tournament.rounds[1].map(m => m.winner).filter(Boolean);
      const final = tournament.rounds[2][0];
      final.p1 = sfWinners[0]; final.p2 = sfWinners[1]; final.state = 'pending'; final.game = pickGame(tournament.usedGames);
      tournament.currentRound = 2;
      io.to(room.code).emit('round-complete', { round: 1, winners: sfWinners.map(w => ({ id: w.id, username: w.username, avatar: w.avatar })), bracket: serializeTournament(tournament) });
      setTimeout(() => startRound(room), 5000);
    } else {
      room.state = 'gameover';
      io.to(room.code).emit('tournament-complete', { winner: { id: winners[0].id, username: winners[0].username, avatar: winners[0].avatar } });
    }
  }
}

// --- Ping Pong Server Physics (with speed ramp + moving bumper) ---
function startPingPongLoop(room, match) {
  const W = 800, H = 500, PH = 100, PW = 15, BR = 10;
  const state = {
    ball: { x: W / 2, y: H / 2, vx: (Math.random() > 0.5 ? 1 : -1) * 6, vy: (Math.random() * 6 - 3) },
    p1y: H / 2 - PH / 2, p2y: H / 2 - PH / 2,
    score: { p1: 0, p2: 0 },
    active: true,
    speedLevel: 1,
    bumper: {
      x: W / 2, y: H / 2,
      r: 22,
      vx: 1.1 + Math.random() * 0.6,
      vy: 0.8 + Math.random() * 0.5,
      hit: false
    }
  };
  match.gameState = state;

  // Speed ramp — every 7 seconds increase level (caps at 5)
  const speedRamp = setInterval(() => {
    if (!state.active) { clearInterval(speedRamp); return; }
    if (state.speedLevel < 5) {
      state.speedLevel++;
      const spd = Math.sqrt(state.ball.vx ** 2 + state.ball.vy ** 2);
      if (spd > 0) {
        const boost = spd * 1.18;
        state.ball.vx = (state.ball.vx / spd) * boost;
        state.ball.vy = (state.ball.vy / spd) * boost;
      }
    }
  }, 7000);

  const loop = setInterval(() => {
    if (!state.active) { clearInterval(loop); clearInterval(speedRamp); return; }

    state.ball.x += state.ball.vx;
    state.ball.y += state.ball.vy;

    // Wall bounces
    if (state.ball.y - BR < 0)  { state.ball.y = BR;     state.ball.vy =  Math.abs(state.ball.vy); }
    if (state.ball.y + BR > H)  { state.ball.y = H - BR; state.ball.vy = -Math.abs(state.ball.vy); }

    // Move bumper (stays away from paddle zones)
    state.bumper.hit = false;
    state.bumper.x += state.bumper.vx;
    state.bumper.y += state.bumper.vy;
    const BX_MIN = 130, BX_MAX = W - 130;
    const BY_MIN = 40,  BY_MAX = H - 40;
    if (state.bumper.x - state.bumper.r < BX_MIN) { state.bumper.x = BX_MIN + state.bumper.r; state.bumper.vx =  Math.abs(state.bumper.vx); }
    if (state.bumper.x + state.bumper.r > BX_MAX) { state.bumper.x = BX_MAX - state.bumper.r; state.bumper.vx = -Math.abs(state.bumper.vx); }
    if (state.bumper.y - state.bumper.r < BY_MIN) { state.bumper.y = BY_MIN + state.bumper.r; state.bumper.vy =  Math.abs(state.bumper.vy); }
    if (state.bumper.y + state.bumper.r > BY_MAX) { state.bumper.y = BY_MAX - state.bumper.r; state.bumper.vy = -Math.abs(state.bumper.vy); }

    // Bumper collision
    const dx = state.ball.x - state.bumper.x;
    const dy = state.ball.y - state.bumper.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < BR + state.bumper.r && dist > 0) {
      const nx = dx / dist, ny = dy / dist;
      const spd = Math.sqrt(state.ball.vx ** 2 + state.ball.vy ** 2);
      const newSpd = Math.min(spd * 1.12, 20);
      state.ball.vx = nx * newSpd;
      state.ball.vy = ny * newSpd;
      // Push ball outside bumper
      state.ball.x = state.bumper.x + nx * (BR + state.bumper.r + 1);
      state.ball.y = state.bumper.y + ny * (BR + state.bumper.r + 1);
      state.bumper.hit = true;
    }

    // Bot paddle AI
    const BOT_SPD = 4.5 + state.speedLevel * 0.25;
    if (match.p1?.isBot) {
      const target = state.ball.y - PH / 2 + (Math.random() - 0.5) * 18;
      const diff = target - state.p1y;
      state.p1y = Math.max(0, Math.min(H - PH, state.p1y + Math.sign(diff) * Math.min(BOT_SPD, Math.abs(diff))));
    }
    if (match.p2?.isBot) {
      const target = state.ball.y - PH / 2 + (Math.random() - 0.5) * 18;
      const diff = target - state.p2y;
      state.p2y = Math.max(0, Math.min(H - PH, state.p2y + Math.sign(diff) * Math.min(BOT_SPD, Math.abs(diff))));
    }

    // Paddle collisions
    if (state.ball.vx < 0 && state.ball.x - BR <= 40 + PW && state.ball.x - BR >= 35 &&
        state.ball.y >= state.p1y && state.ball.y <= state.p1y + PH) {
      state.ball.vx = Math.min(Math.abs(state.ball.vx) * 1.05, 18);
      state.ball.vy = ((state.ball.y - (state.p1y + PH / 2)) / (PH / 2)) * 8;
    }
    if (state.ball.vx > 0 && state.ball.x + BR >= W - 40 - PW && state.ball.x + BR <= W - 35 &&
        state.ball.y >= state.p2y && state.ball.y <= state.p2y + PH) {
      state.ball.vx = -Math.min(Math.abs(state.ball.vx) * 1.05, 18);
      state.ball.vy = ((state.ball.y - (state.p2y + PH / 2)) / (PH / 2)) * 8;
    }

    // Scoring
    if (state.ball.x + BR < 0) { state.score.p2++; resetPingPongBall(state, W, H); }
    if (state.ball.x - BR > W) { state.score.p1++; resetPingPongBall(state, W, H); }

    const payload = { matchId: match.id, ball: state.ball, p1y: state.p1y, p2y: state.p2y, score: state.score, bumper: state.bumper, speedLevel: state.speedLevel };

    if (state.score.p1 >= WIN_SCORE_PINGPONG || state.score.p2 >= WIN_SCORE_PINGPONG) {
      state.active = false;
      clearInterval(loop);
      clearInterval(speedRamp);
      const winner = state.score.p1 >= WIN_SCORE_PINGPONG ? match.p1 : match.p2;
      io.to(room.code).emit('pingpong-state', payload);
      handleGameEnd(room, match, winner, state.score);
      return;
    }
    io.to(room.code).emit('pingpong-state', payload);
  }, 1000 / 30);
  match.gameLoop = loop;
}

function resetPingPongBall(state, W, H) {
  state.ball.x = W / 2;
  state.ball.y = H / 2;
  const speed = 6 + (state.speedLevel - 1) * 1.2;
  const angle = (Math.random() * 40 - 20) * Math.PI / 180;
  const dir = Math.random() > 0.5 ? 1 : -1;
  state.ball.vx = dir * speed * Math.cos(angle);
  state.ball.vy = speed * Math.sin(angle);
}

// --- Reaction Game ---
function startReactionGame(room, match) {
  const ROUNDS = 5;
  let round = 0;
  const scores = { p1: 0, p2: 0 };
  match.active = true;
  match.reactionSignalTime = null;
  match.reactionResponses = {};

  function doRound() {
    if (!match.active || round >= ROUNDS) {
      const winner = scores.p1 >= scores.p2 ? match.p1 : match.p2;
      handleGameEnd(room, match, winner, scores);
      return;
    }
    round++;
    match.reactionResponses = {};

    io.to(room.code).emit('reaction-prepare', { matchId: match.id, round, total: ROUNDS });

    const delay = 1800 + Math.random() * 3000;
    setTimeout(() => {
      if (!match.active) return;
      const signalTime = Date.now();
      match.reactionSignalTime = signalTime;
      io.to(room.code).emit('reaction-go', { matchId: match.id, signalTime });

      // Bot reacts automatically
      const botPlayer = [match.p1, match.p2].find(p => p?.isBot);
      if (botPlayer) {
        const botDelay = 200 + Math.random() * 400;
        setTimeout(() => {
          const t = Date.now() - match.reactionSignalTime;
          if (match.reactionResponses && match.reactionResponses[botPlayer.id] === undefined) {
            match.reactionResponses[botPlayer.id] = t;
          }
        }, botDelay);
      }

      setTimeout(() => {
        const t1 = match.reactionResponses[match.p1.id];
        const t2 = match.reactionResponses[match.p2.id];
        let rw = null;
        if (t1 !== undefined && t2 !== undefined) rw = t1 <= t2 ? 'p1' : 'p2';
        else if (t1 !== undefined) rw = 'p1';
        else if (t2 !== undefined) rw = 'p2';
        if (rw === 'p1') scores.p1++;
        if (rw === 'p2') scores.p2++;
        io.to(room.code).emit('reaction-result', { matchId: match.id, round, t1, t2, scores, roundWinner: rw });
        setTimeout(doRound, 2500);
      }, 3000);
    }, delay);
  }

  setTimeout(doRound, 2000);
}

// --- Socket Handlers ---
io.on('connection', socket => {
  console.log('Connected:', socket.id);

  socket.on('create-room', () => {
    let code;
    do { code = genCode(); } while (rooms[code]);
    rooms[code] = { code, host: socket.id, players: [], state: 'lobby', tournament: null };
    playerRoom[socket.id] = code;
    socket.join(code);
    socket.emit('room-created', { code });
  });

  socket.on('join-room', ({ code }) => {
    const c = code.toUpperCase().trim();
    const room = rooms[c];
    if (!room) { socket.emit('join-error', { message: 'Room not found! Check your code.' }); return; }
    if (room.state !== 'lobby') { socket.emit('join-error', { message: 'Game already in progress!' }); return; }
    if (room.players.length >= 12) { socket.emit('join-error', { message: 'Room is full (max 12 players)!' }); return; }
    playerRoom[socket.id] = c;
    socket.join(c);
    socket.emit('room-joined', { code: c, isHost: room.host === socket.id, players: room.players.map(({ id, username, avatar }) => ({ id, username, avatar })) });
  });

  socket.on('set-player-info', ({ username, avatar }) => {
    const room = rooms[playerRoom[socket.id]];
    if (!room) return;
    let p = room.players.find(p => p.id === socket.id);
    if (!p) { p = { id: socket.id, username, avatar, ready: false }; room.players.push(p); }
    else { p.username = username; p.avatar = avatar; }
    io.to(room.code).emit('players-updated', { players: room.players.map(({ id, username, avatar, ready, isBot }) => ({ id, username, avatar, ready, isBot })) });
    socket.emit('player-info-set', { player: { id: p.id, username: p.username, avatar: p.avatar } });
  });

  socket.on('player-ready', () => {
    const room = rooms[playerRoom[socket.id]];
    if (!room) return;
    const p = room.players.find(p => p.id === socket.id);
    if (p) p.ready = true;
    io.to(room.code).emit('players-updated', { players: room.players.map(({ id, username, avatar, ready, isBot }) => ({ id, username, avatar, ready, isBot })) });
    if (room.players.length >= 2 && room.players.every(p => p.ready)) startTournament(room);
  });

  socket.on('add-bot', () => {
    const room = rooms[playerRoom[socket.id]];
    if (!room || room.host !== socket.id || room.state !== 'lobby') return;
    if (room.players.length >= 12) { socket.emit('join-error', { message: 'Room is full (max 12 players)!' }); return; }
    const usedNames = room.players.filter(p => p.isBot).map(p => p.username);
    const name = BOT_NAMES.find(n => !usedNames.includes(n)) || `Bot ${room.players.filter(p => p.isBot).length + 1}`;
    const botCount = room.players.filter(p => p.isBot).length;
    room.players.push({
      id: 'bot_' + genId(), username: name,
      avatar: BOT_AVATARS[botCount % BOT_AVATARS.length],
      ready: true, isBot: true
    });
    io.to(room.code).emit('players-updated', { players: room.players.map(({ id, username, avatar, ready, isBot }) => ({ id, username, avatar, ready, isBot })) });
  });

  socket.on('remove-bot', () => {
    const room = rooms[playerRoom[socket.id]];
    if (!room || room.host !== socket.id || room.state !== 'lobby') return;
    const bots = room.players.filter(p => p.isBot);
    if (!bots.length) return;
    room.players = room.players.filter(p => p.id !== bots[bots.length - 1].id);
    io.to(room.code).emit('players-updated', { players: room.players.map(({ id, username, avatar, ready, isBot }) => ({ id, username, avatar, ready, isBot })) });
  });

  socket.on('request-start', () => {
    const room = rooms[playerRoom[socket.id]];
    if (!room || room.host !== socket.id) return;
    if (room.players.length >= 2) startTournament(room);
  });

  socket.on('paddle-move', ({ matchId, y }) => {
    const room = rooms[playerRoom[socket.id]];
    if (!room?.tournament) return;
    const match = findMatch(room, matchId);
    if (!match?.gameState) return;
    const clamped = Math.max(0, Math.min(400, y));
    if (match.p1.id === socket.id) match.gameState.p1y = clamped;
    else if (match.p2.id === socket.id) match.gameState.p2y = clamped;
  });

  socket.on('reaction-tap', ({ matchId }) => {
    const room = rooms[playerRoom[socket.id]];
    if (!room) return;
    const match = findMatch(room, matchId);
    if (!match?.reactionSignalTime) return;
    const t = Date.now() - match.reactionSignalTime;
    if (t > 0 && match.reactionResponses[socket.id] === undefined) {
      match.reactionResponses[socket.id] = t;
    }
  });

  socket.on('submit-score', ({ matchId, score }) => {
    const room = rooms[playerRoom[socket.id]];
    if (!room) return;
    const match = findMatch(room, matchId);
    if (!match || match.state !== 'active' || match.gameEndHandled) return;
    if (!match.playerScores) match.playerScores = {};
    match.playerScores[socket.id] = score;
    if (match.p1 && match.p2) {
      const s1 = match.playerScores[match.p1.id];
      const s2 = match.playerScores[match.p2.id];
      if (s1 !== undefined && s2 !== undefined) {
        let winner;
        if (match.game === 'minigolf') winner = s1 <= s2 ? match.p1 : match.p2;
        else winner = s1 >= s2 ? match.p1 : match.p2;
        handleGameEnd(room, match, winner, { p1: s1, p2: s2 });
      }
    }
  });

  socket.on('game-relay', ({ matchId, data }) => {
    const code = playerRoom[socket.id];
    if (code) socket.to(code).emit('game-relay', { matchId, data, from: socket.id });
  });

  socket.on('disconnect', () => {
    const code = playerRoom[socket.id];
    if (!code) return;
    const room = rooms[code];
    if (!room) return;
    room.players = room.players.filter(p => p.id !== socket.id);
    delete playerRoom[socket.id];
    if (room.players.length === 0) { delete rooms[code]; return; }
    if (room.host === socket.id) room.host = room.players[0].id;
    io.to(code).emit('players-updated', { players: room.players.map(({ id, username, avatar, ready, isBot }) => ({ id, username, avatar, ready, isBot })) });
    io.to(code).emit('player-left', { playerId: socket.id });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🎮 Multiplier Game running on http://localhost:${PORT}`));
