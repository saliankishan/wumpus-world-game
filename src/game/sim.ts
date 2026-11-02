import { sfx, setMuted, unlock } from "./audio";
import { DIRS, vec } from "./dirs";
import { generateFloor, mulberry32 } from "./generate";
import { loadMuted, loadScores, qualifies, saveInitials, saveMuted, saveScore } from "./scores";
import type { DeathType, Dir, Game, Particle, Snap, Wump } from "./types";

function newSeed() {
  return (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
}

function vibrate(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* ignore */
  }
}

function idx(game: Game, x: number, y: number) {
  return y * game.w + x;
}

function inBounds(game: Game, x: number, y: number) {
  return x >= 0 && y >= 0 && x < game.w && y < game.h;
}

function cellAt(game: Game, x: number, y: number) {
  return game.cells[idx(game, x, y)]!;
}

function livingAt(game: Game, x: number, y: number) {
  return game.wumps.find((w) => w.alive && w.x === x && w.y === y) ?? null;
}

function mark(game: Game) {
  game.uiDirty = true;
}

function pushParticle(game: Game, p: Particle) {
  game.particles.push(p);
  if (game.particles.length > 360) game.particles.splice(0, game.particles.length - 360);
}

function burst(
  game: Game,
  x: number,
  y: number,
  n: number,
  color: string,
  speed: number,
  kind: number,
  grav = 0.8,
) {
  const count = game.reduced ? Math.ceil(n * 0.45) : n;
  for (let i = 0; i < count; i++) {
    const a = game.rng() * Math.PI * 2;
    const s = speed * (0.35 + game.rng() * 0.85);
    pushParticle(game, {
      x: x + 0.5,
      y: y + 0.5,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s - speed * 0.25,
      life: 0.35 + game.rng() * 0.5,
      max: 0.85,
      size: 0.045 + game.rng() * 0.07,
      color,
      grav,
      drag: 0.9,
      kind,
    });
  }
}

function addFloater(game: Game, x: number, y: number, text: string, color: string) {
  game.floaters.push({
    x: x + 0.5,
    y: y + 0.42,
    vy: -0.55,
    text,
    color,
    life: 0.95,
    max: 0.95,
  });
  if (game.floaters.length > 16) game.floaters.splice(0, game.floaters.length - 16);
}

function addShock(game: Game, x: number, y: number, color: string) {
  game.shocks.push({ x: x + 0.5, y: y + 0.5, life: 0.42, max: 0.42, color });
}

function shake(game: Game, amount: number) {
  const mag = game.reduced ? amount * 0.35 : amount;
  game.shake = Math.max(game.shake, mag);
}

function flash(game: Game, color: string, a: number) {
  game.flashColor = color;
  game.flashA = Math.max(game.flashA, a);
}

export function createGame(opts?: { muted?: boolean; seed?: number }): Game {
  const seed = opts?.seed ?? newSeed();
  const rng = mulberry32(seed);
  const narrow = typeof window !== "undefined" && window.innerWidth < 760;
  const reduced =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
  const floor = generateFloor(1, rng, narrow);
  const muted = opts?.muted ?? loadMuted();
  setMuted(muted);
  const game: Game = {
    phase: "menu",
    seed,
    rng,
    narrow,
    reduced,
    depth: 1,
    w: floor.w,
    h: floor.h,
    cells: floor.cells,
    startX: floor.startX,
    startY: floor.startY,
    px: floor.startX,
    py: floor.startY,
    fromX: floor.startX,
    fromY: floor.startY,
    moveT: 1,
    facing: "S",
    wumps: floor.wumps,
    arrows: floor.arrows,
    arrowsMax: floor.arrows,
    score: 0,
    gold: 0,
    goldFloor: 0,
    goldLeft: floor.goldCount,
    kills: 0,
    killsFloor: 0,
    steps: 0,
    percepts: { stench: false, breeze: false, glitter: false, scream: false },
    message: "Lantern light finds a glint of gold just ahead.",
    extra: "",
    particles: [],
    floaters: [],
    shocks: [],
    shake: 0,
    flashA: 0,
    flashColor: "rgba(255,220,160,0.4)",
    arrow: null,
    death: null,
    deathT: 0,
    doom: null,
    keys: new Set(),
    touchDir: null,
    impulse: null,
    shootQueued: false,
    climbQueued: false,
    waitQueued: false,
    bumpT: 0,
    pulseT: 0,
    time: 0,
    hitStop: 0,
    uiDirty: true,
    muted,
    scores: loadScores(),
    qualifies: false,
    saved: false,
    victory: false,
    cause: "",
    lastBonus: 0,
    clean: false,
    bonusDetail: "",
    banner: 0,
    hint: "Gold glints one step south. Step in.",
    hover: null,
    view: { ox: 0, oy: 0, cell: 48, cols: floor.w, rows: floor.h },
    holdDir: null,
    holdT: 0,
    holdSteps: 0,
    heartT: 0.4,
    screamLinger: 0,
    stenchStreak: 0,
    spawnAcc: 0,
    celebrateT: 0,
    lastSavedAt: 0,
    glint: 0,
  };
  revealAround(game);
  refreshPercepts(game);
  compose(game);
  return game;
}

function overwrite(game: Game, next: Game) {
  (Object.keys(next) as (keyof Game)[]).forEach((k) => {
    (game as unknown as Record<string, unknown>)[k] = next[k] as unknown;
  });
}

export function startRun(game: Game) {
  if (game.phase !== "menu") return;
  unlock();
  game.phase = "playing";
  game.banner = 1.45;
  game.hint = "Gold glints one step south. Step in.";
  mark(game);
}

export function reshuffle(game: Game) {
  if (game.phase !== "menu") return;
  const next = createGame({ muted: game.muted, seed: newSeed() });
  next.scores = game.scores;
  overwrite(game, next);
  game.uiDirty = true;
}

export function restart(game: Game) {
  const next = createGame({ muted: game.muted, seed: newSeed() });
  next.phase = "playing";
  next.banner = 1.35;
  next.scores = loadScores();
  next.uiDirty = true;
  overwrite(game, next);
}

export function pause(game: Game) {
  if (game.phase !== "playing") return;
  game.phase = "paused";
  mark(game);
}

export function resume(game: Game) {
  if (game.phase !== "paused") return;
  game.phase = "playing";
  mark(game);
}

export function toggleMute(game: Game) {
  game.muted = !game.muted;
  setMuted(game.muted);
  saveMuted(game.muted);
  mark(game);
}

export function pressDir(game: Game, dir: Dir | null) {
  if (dir && dir !== game.touchDir && game.phase === "playing") game.impulse = dir;
  game.touchDir = dir;
}

export function queueMove(game: Game, dir: Dir) {
  if (game.phase !== "playing") return;
  game.impulse = dir;
}

export function requestShoot(game: Game, dir?: Dir) {
  if (game.phase !== "playing") return;
  if (dir) game.facing = dir;
  game.shootQueued = true;
}

export function requestClimb(game: Game) {
  if (game.phase !== "playing") return;
  game.climbQueued = true;
}

export function requestWait(game: Game) {
  if (game.phase !== "playing") return;
  game.waitQueued = true;
}

export function setHover(game: Game, x: number | null, y = 0) {
  if (x == null || x < 0 || y < 0 || x >= game.w || y >= game.h) game.hover = null;
  else game.hover = { x, y };
}

export function tapCell(game: Game, x: number, y: number) {
  if (game.phase !== "playing") return;
  if (!inBounds(game, x, y)) return;
  const dx = x - game.px;
  const dy = y - game.py;
  if (dx === 0 && dy === 0) {
    if (x === game.startX && y === game.startY) game.climbQueued = true;
    return;
  }
  const manhattan = Math.abs(dx) + Math.abs(dy);
  const straight = dx === 0 || dy === 0;
  const dir: Dir = dx === 0 ? (dy > 0 ? "S" : "N") : Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? "E" : "W") : dy > 0 ? "S" : "N";
  if (manhattan === 1) {
    if (livingAt(game, x, y)) {
      game.facing = dir;
      game.shootQueued = true;
      return;
    }
    if (cellAt(game, x, y).wall) {
      game.facing = dir;
      if (canAct(game)) bump(game);
      return;
    }
    game.impulse = dir;
    return;
  }
  if (straight && !cellAt(game, x, y).wall) {
    game.facing = dir;
    if (game.arrows > 0) game.shootQueued = true;
    else {
      game.extra = "You turn toward the dark. The quiver is empty.";
      compose(game);
      mark(game);
    }
  }
}

function canAct(game: Game) {
  return game.phase === "playing" && game.moveT >= 1 && !game.arrow && game.hitStop <= 0;
}

function revealAround(game: Game) {
  for (let y = game.py - 1; y <= game.py + 1; y++) {
    for (let x = game.px - 1; x <= game.px + 1; x++) {
      if (!inBounds(game, x, y)) continue;
      const c = cellAt(game, x, y);
      if (!c.seen) {
        c.seen = true;
        c.reveal = 0;
      }
    }
  }
}

function refreshPercepts(game: Game) {
  const stench = game.wumps.some(
    (w) => w.alive && Math.abs(w.x - game.px) + Math.abs(w.y - game.py) === 1,
  );
  let breeze = false;
  for (const d of DIRS) {
    const x = game.px + d.x;
    const y = game.py + d.y;
    if (inBounds(game, x, y) && cellAt(game, x, y).pit) breeze = true;
  }
  game.percepts = {
    stench,
    breeze,
    glitter: cellAt(game, game.px, game.py).gold,
    scream: game.screamLinger > 0,
  };
}

function compose(game: Game) {
  const bits: string[] = [];
  const p = game.percepts;
  if (p.scream) {
    const still = game.wumps.some((w) => w.alive);
    bits.push(still ? "A scream — but the cave is not empty." : "A terrible scream rips the dark, then falls away.");
  }
  if (p.stench) bits.push("A foul stench wrinkles your nose.");
  if (p.breeze) bits.push("A cold breeze sighs from a nearby shaft.");
  if (p.glitter) bits.push("Gold glitters under your boots.");
  if (game.extra) bits.push(game.extra);
  game.message = bits.join(" ") || "Dust, drip, and the soft tick of the lantern.";
  updateHint(game);
}

function updateHint(game: Game) {
  if (game.phase !== "playing" && game.phase !== "menu") {
    game.hint = "";
    return;
  }
  if (game.depth === 1 && game.steps === 0 && game.goldFloor === 0) {
    game.hint = "Gold glints one step south. Step in.";
  } else if (game.depth === 1 && game.goldFloor > 0 && game.steps < 5 && game.wumps.some((w) => w.alive && w.awake)) {
    game.hint = "It wakes. Red eyes mean fire — or run back to the rope.";
  } else if (game.px === game.startX && game.py === game.startY && (game.goldFloor > 0 || game.killsFloor > 0)) {
    game.hint = "The rope is here. Climb to bank the floor, or keep hunting.";
  } else if (game.percepts.stench) {
    game.hint = "Stench. The Wumpus is in an adjacent room. Do not step in.";
  } else if (game.percepts.breeze) {
    game.hint = "Breeze. A pit gapes beside you.";
  } else {
    game.hint = "";
  }
}

function wake(game: Game, reason = "Something vast uncoils in the dark.") {
  let woke = false;
  for (const w of game.wumps) {
    if (w.alive && !w.awake) {
      w.awake = true;
      woke = true;
    }
  }
  if (!woke) return false;
  sfx.roar();
  shake(game, 11);
  flash(game, "rgba(170, 20, 36, 0.42)", 0.36);
  addFloater(game, game.px, game.py - 0.15, "IT WAKES", "#ff6d78");
  game.glint = 1.25;
  game.extra = reason;
  vibrate([16, 36, 22]);
  return true;
}

function collectGold(game: Game) {
  const c = cellAt(game, game.px, game.py);
  if (!c.gold) return;
  c.gold = false;
  game.goldLeft = Math.max(0, game.goldLeft - 1);
  const pts = 300 * game.depth;
  game.score += pts;
  game.gold++;
  game.goldFloor++;
  sfx.gold();
  shake(game, 8);
  flash(game, "rgba(255, 206, 110, 0.48)", 0.3);
  burst(game, game.px, game.py, 26, "#ffd978", 2.4, 3, -0.35);
  burst(game, game.px, game.py, 10, "#fff6d8", 3.1, 1, 0.2);
  addShock(game, game.px, game.py, "#ffd978");
  addFloater(game, game.px, game.py - 0.05, `+${pts}`, "#ffe7a8");
  addFloater(game, game.px, game.py - 0.42, "GOLD", "#fff4d0");
  vibrate([12, 28, 16]);
  const woke = wake(game, "The coins were warm. Something felt you take them.");
  if (!woke) game.extra = "The coins are warm, as if recently held.";
}

function beginTurn(game: Game) {
  game.extra = "";
  if (game.screamLinger > 0) game.screamLinger--;
  if (game.screamLinger <= 0) game.percepts.scream = false;
}

function threaten(game: Game, allowAttack: boolean) {
  wumpusTurn(game, allowAttack);
  if (game.phase === "playing") {
    refreshPercepts(game);
    compose(game);
  }
  mark(game);
}

function bump(game: Game) {
  game.bumpT = 0.16;
  shake(game, 4);
  sfx.bump();
  game.extra = "Solid rock. The cave does not yield.";
  if (game.holdSteps > 1) {
    compose(game);
    mark(game);
    return;
  }
  const adjacent = game.wumps.some(
    (w) => w.alive && w.awake && Math.abs(w.x - game.px) + Math.abs(w.y - game.py) === 1,
  );
  threaten(game, adjacent);
}

function beginMove(game: Game, x: number, y: number, dir: Dir) {
  beginTurn(game);
  game.facing = dir;
  game.fromX = game.px;
  game.fromY = game.py;
  game.px = x;
  game.py = y;
  game.moveT = 0;
  game.steps++;
  game.doom = cellAt(game, x, y).pit ? "pit" : livingAt(game, x, y) ? "wumpus" : null;
  sfx.step();
  shake(game, 0.7);
  burst(game, game.fromX, game.fromY, 5, "#8a7564", 0.8, 0, 1.4);
}

function tryMove(game: Game, dir: Dir) {
  if (!canAct(game)) {
    game.impulse = dir;
    return;
  }
  game.facing = dir;
  const d = vec(dir);
  const x = game.px + d.x;
  const y = game.py + d.y;
  if (!inBounds(game, x, y) || cellAt(game, x, y).wall) {
    bump(game);
    return;
  }
  beginMove(game, x, y, dir);
}

function resolveArrival(game: Game) {
  revealAround(game);
  if (game.doom) {
    const kind = game.doom;
    game.doom = null;
    startDeath(game, kind);
    return;
  }
  collectGold(game);
  refreshPercepts(game);
  wumpusTurn(game, false);
  if (game.phase !== "playing") {
    compose(game);
    mark(game);
    return;
  }
  refreshPercepts(game);
  compose(game);
  mark(game);
}

function nextStep(game: Game, w: Wump) {
  const width = game.w;
  const start = w.y * width + w.x;
  const goal = game.py * width + game.px;
  const prev = new Map<number, number>();
  const q = [start];
  prev.set(start, -1);
  while (q.length) {
    const cur = q.shift()!;
    if (cur === goal) break;
    const x = cur % width;
    const y = Math.floor(cur / width);
    for (const d of DIRS) {
      const nx = x + d.x;
      const ny = y + d.y;
      if (!inBounds(game, nx, ny)) continue;
      const ni = ny * width + nx;
      if (prev.has(ni)) continue;
      const c = game.cells[ni]!;
      if (c.wall || c.pit) continue;
      if (game.wumps.some((o) => o.alive && o.id !== w.id && o.x === nx && o.y === ny)) continue;
      prev.set(ni, cur);
      q.push(ni);
    }
  }
  if (!prev.has(goal)) {
    const opts = DIRS.map((d) => ({ x: w.x + d.x, y: w.y + d.y })).filter((n) => {
      if (!inBounds(game, n.x, n.y)) return false;
      const c = cellAt(game, n.x, n.y);
      if (c.wall || c.pit) return false;
      if (game.wumps.some((o) => o.alive && o.id !== w.id && o.x === n.x && o.y === n.y)) return false;
      return true;
    });
    if (!opts.length || game.rng() > 0.55) return null;
    return opts[Math.floor(game.rng() * opts.length)]!;
  }
  let cur = goal;
  let parent = prev.get(cur)!;
  while (parent !== start && parent !== -1) {
    cur = parent;
    parent = prev.get(cur)!;
  }
  return { x: cur % width, y: Math.floor(cur / width) };
}

function wumpusTurn(game: Game, allowAttack: boolean) {
  const living = game.wumps.filter((w) => w.alive);
  if (!living.some((w) => w.awake)) {
    if (game.percepts.stench) game.stenchStreak++;
    else game.stenchStreak = 0;
    if (game.stenchStreak >= 3) wake(game, "You lingered in the stench. It is no longer asleep.");
    return;
  }
  game.stenchStreak = 0;
  const hunters = living
    .filter((w) => w.awake)
    .sort(
      (a, b) =>
        Math.abs(a.x - game.px) + Math.abs(a.y - game.py) - (Math.abs(b.x - game.px) + Math.abs(b.y - game.py)),
    );
  for (const w of hunters) {
    const dist = Math.abs(w.x - game.px) + Math.abs(w.y - game.py);
    if (dist === 1) {
      if (!allowAttack) {
        shake(game, 2.4);
        continue;
      }
      w.fromX = w.x;
      w.fromY = w.y;
      w.x = game.px;
      w.y = game.py;
      w.moveT = 0;
      w.lunging = true;
      startDeath(game, "wumpus");
      return;
    }
    const chance = game.depth <= 1 ? 0.72 : game.depth === 2 ? 0.86 : 0.97;
    if (game.rng() > chance) continue;
    const next = nextStep(game, w);
    if (!next || (next.x === w.x && next.y === w.y) || (next.x === game.px && next.y === game.py)) continue;
    w.fromX = w.x;
    w.fromY = w.y;
    w.x = next.x;
    w.y = next.y;
    w.moveT = 0;
    w.lunging = false;
  }
}

function tryShoot(game: Game) {
  if (!canAct(game)) return;
  if (game.arrows <= 0) {
    sfx.dry();
    shake(game, 3);
    game.extra = "The quiver is empty.";
    compose(game);
    mark(game);
    return;
  }
  beginTurn(game);
  game.arrows--;
  game.steps++;
  sfx.shoot();
  vibrate(8);
  shake(game, 3.5);
  const d = vec(game.facing);
  let x = game.px;
  let y = game.py;
  const cells: { x: number; y: number }[] = [];
  let hit: Wump | null = null;
  while (true) {
    const nx = x + d.x;
    const ny = y + d.y;
    if (!inBounds(game, nx, ny) || cellAt(game, nx, ny).wall) break;
    x = nx;
    y = ny;
    cells.push({ x, y });
    const w = livingAt(game, x, y);
    if (w) {
      hit = w;
      break;
    }
  }
  burst(game, game.px, game.py, 8, "#ffe0a0", 2.2, 1, 0.1);
  if (!hit) wake(game, "The shot rings. Something answers from the dark.");
  else {
    for (const w of game.wumps) {
      if (w.alive && w.id !== hit.id && !w.awake) w.awake = true;
    }
  }
  if (!cells.length) {
    sfx.clatter();
    game.extra = "The arrow sparks off rock an arm's length away.";
    shake(game, 4);
    wumpusTurn(game, true);
    refreshPercepts(game);
    compose(game);
    mark(game);
    return;
  }
  game.arrow = { cells, index: 0, t: 0, hitId: hit?.id ?? null, dir: game.facing };
  mark(game);
}

function finishArrow(game: Game) {
  const arrow = game.arrow;
  if (!arrow) return;
  game.arrow = null;
  if (arrow.hitId != null) {
    const w = game.wumps.find((wm) => wm.id === arrow.hitId && wm.alive);
    if (w) {
      w.alive = false;
      w.awake = false;
      w.stuck = true;
      w.lunging = false;
      const tile = cellAt(game, w.x, w.y);
      if (!tile.seen) {
        tile.seen = true;
        tile.reveal = 0;
      }
      const pts = 1000 * game.depth;
      game.score += pts;
      game.kills++;
      game.killsFloor++;
      game.screamLinger = 2;
      game.percepts.scream = true;
      const still = game.wumps.some((wm) => wm.alive);
      game.extra = still
        ? "A scream — but another breath remains in the dark."
        : "A terrible scream rips the dark, then falls away.";
      sfx.scream();
      shake(game, 16);
      flash(game, "rgba(255, 70, 64, 0.58)", 0.55);
      game.hitStop = game.reduced ? 0 : 0.07;
      burst(game, w.x, w.y, 36, "#c43648", 2.8, 4, 0.4);
      burst(game, w.x, w.y, 14, "#ffd2a8", 2.2, 1, -0.1);
      addShock(game, w.x, w.y, "#ff5a62");
      addFloater(game, w.x, w.y, `+${pts}`, "#ffd978");
      addFloater(game, w.x, w.y - 0.38, "SCREAM", "#ff7d88");
      vibrate([18, 30, 36]);
    }
  } else {
    sfx.clatter();
    const last = arrow.cells[arrow.cells.length - 1]!;
    burst(game, last.x, last.y, 12, "#f0e2c8", 2.4, 1, 0.6);
    addFloater(game, last.x, last.y, "CLATTER", "#e6d7c4");
    game.extra = "The arrow clatters somewhere in the stone.";
    shake(game, 4.5);
  }
  if (game.phase === "playing") {
    wumpusTurn(game, true);
    refreshPercepts(game);
    compose(game);
  }
  mark(game);
}

function tryWait(game: Game) {
  if (!canAct(game)) return;
  beginTurn(game);
  game.steps++;
  game.pulseT = 1;
  sfx.wait();
  game.extra = "You hold the lantern still and listen.";
  refreshPercepts(game);
  wumpusTurn(game, true);
  if (game.phase === "playing") {
    refreshPercepts(game);
    compose(game);
  }
  mark(game);
}

function tryClimb(game: Game) {
  if (!canAct(game)) return;
  if (game.px !== game.startX || game.py !== game.startY) {
    sfx.dry();
    shake(game, 2);
    game.extra = "The rope hangs at the entrance, not here.";
    const adjacent = game.wumps.some(
      (w) => w.alive && w.awake && Math.abs(w.x - game.px) + Math.abs(w.y - game.py) === 1,
    );
    if (adjacent) threaten(game, true);
    else {
      compose(game);
      mark(game);
    }
    return;
  }
  const allGold = game.goldLeft === 0;
  const allDead = game.wumps.every((w) => !w.alive);
  const clean = allGold && allDead;
  let bonus = 450 * game.depth + game.arrows * 150;
  const par = game.w + game.h + game.goldFloor * 3;
  bonus += Math.max(0, par - game.steps) * 16;
  if (clean) bonus += 500 * game.depth;
  if (game.goldFloor === 0 && game.killsFloor === 0) bonus = Math.floor(100 * game.depth);
  game.score += bonus;
  game.lastBonus = bonus;
  game.clean = clean;
  game.bonusDetail = clean
    ? "Escape, spare arrows, and a silent floor."
    : game.goldFloor === 0 && game.killsFloor === 0
      ? "A thin purse for getting out alive."
      : "The rope holds. The Maw keeps the rest.";
  game.phase = "floorclear";
  game.victory = false;
  sfx.climb();
  shake(game, 6);
  flash(game, "rgba(255, 214, 150, 0.4)", 0.32);
  addFloater(game, game.px, game.py, `+${bonus}`, "#fff1c4");
  burst(game, game.px, game.py, 18, "#ffd978", 2.2, 3, -0.5);
  mark(game);
}

function startDeath(game: Game, type: DeathType) {
  if (game.phase === "dying" || game.phase === "gameover") return;
  game.phase = "dying";
  game.death = type;
  game.deathT = 0;
  game.victory = false;
  game.cause =
    type === "pit"
      ? "The shaft takes you without ceremony."
      : "The Wumpus closes over you like a door.";
  shake(game, type === "pit" ? 18 : 24);
  flash(game, type === "pit" ? "rgba(120, 186, 255, 0.5)" : "rgba(255, 36, 48, 0.66)", 0.72);
  if (type === "pit") {
    sfx.pit();
    burst(game, game.px, game.py, 28, "#9fd4ff", 2.2, 5, -0.15);
  } else {
    sfx.devour();
    burst(game, game.px, game.py, 40, "#e23b4a", 3, 4, 0.2);
    const hunter = game.wumps.find((w) => w.alive && w.x === game.px && w.y === game.py);
    if (hunter) hunter.lunging = true;
  }
  vibrate(type === "pit" ? [30, 40, 90] : [50, 30, 110, 40, 70]);
  compose(game);
  mark(game);
}

function endRun(game: Game, victory: boolean, cause: string) {
  game.victory = victory;
  game.cause = cause;
  game.qualifies = qualifies(game.score, game.scores);
  game.saved = false;
  game.phase = "gameover";
  if (victory) game.celebrateT = 1.7;
  mark(game);
}

export function delve(game: Game) {
  if (game.phase !== "floorclear") return;
  const depth = game.depth + 1;
  const floor = generateFloor(depth, game.rng, game.narrow);
  game.depth = depth;
  game.w = floor.w;
  game.h = floor.h;
  game.cells = floor.cells;
  game.startX = floor.startX;
  game.startY = floor.startY;
  game.px = floor.startX;
  game.py = floor.startY;
  game.fromX = floor.startX;
  game.fromY = floor.startY;
  game.moveT = 1;
  game.facing = "S";
  game.wumps = floor.wumps;
  game.arrows = floor.arrows;
  game.arrowsMax = floor.arrows;
  game.goldFloor = 0;
  game.killsFloor = 0;
  game.goldLeft = floor.goldCount;
  game.steps = 0;
  game.arrow = null;
  game.death = null;
  game.doom = null;
  game.phase = "playing";
  game.banner = 1.55;
  game.extra = "";
  game.impulse = null;
  game.shootQueued = false;
  game.climbQueued = false;
  game.waitQueued = false;
  game.screamLinger = 0;
  game.stenchStreak = 0;
  game.hover = null;
  revealAround(game);
  refreshPercepts(game);
  game.extra = depth >= 4 ? "The dark is already moving." : "Deeper. The air is older here.";
  compose(game);
  game.hint = depth >= 4 ? "It is already awake." : "";
  sfx.descend();
  shake(game, 4);
  mark(game);
}

export function camp(game: Game) {
  if (game.phase === "playing") return;
  game.phase = "menu";
  game.banner = 0;
  game.hint = "Gold glints one step south. Step in.";
  mark(game);
}

export function retire(game: Game) {
  if (game.phase !== "floorclear" && game.phase !== "paused") return;
  endRun(
    game,
    game.gold > 0,
    game.gold > 0
      ? "You climb into the night, pockets heavy with gold."
      : "You flee the Maw with nothing but your pulse.",
  );
}

export function commitScore(game: Game, name: string) {
  if (game.saved || game.score <= 0) return game.scores;
  const clean = name.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3).padEnd(3, "A");
  const row = {
    name: clean,
    score: game.score,
    depth: game.depth,
    gold: game.gold,
    kills: game.kills,
    at: Date.now(),
  };
  game.scores = saveScore(row);
  saveInitials(clean);
  game.saved = true;
  game.qualifies = false;
  game.lastSavedAt = row.at;
  mark(game);
  return game.scores;
}

function readHeld(game: Game): Dir | null {
  if (game.touchDir) return game.touchDir;
  const k = game.keys;
  if (k.has("ArrowUp") || k.has("KeyW")) return "N";
  if (k.has("ArrowDown") || k.has("KeyS")) return "S";
  if (k.has("ArrowLeft") || k.has("KeyA")) return "W";
  if (k.has("ArrowRight") || k.has("KeyD")) return "E";
  return null;
}

function consumeInput(game: Game, dt: number) {
  if (game.shootQueued) {
    game.shootQueued = false;
    tryShoot(game);
    return;
  }
  if (game.climbQueued) {
    game.climbQueued = false;
    tryClimb(game);
    return;
  }
  if (game.waitQueued) {
    game.waitQueued = false;
    tryWait(game);
    return;
  }
  if (game.impulse) {
    const dir = game.impulse;
    game.impulse = null;
    game.holdDir = dir;
    game.holdT = 0;
    game.holdSteps = 1;
    tryMove(game, dir);
    return;
  }
  const dir = readHeld(game);
  if (!dir) {
    game.holdDir = null;
    game.holdT = 0;
    game.holdSteps = 0;
    return;
  }
  if (game.holdDir !== dir) {
    game.holdDir = dir;
    game.holdT = 0;
    game.holdSteps = 1;
    tryMove(game, dir);
    return;
  }
  game.holdT += dt;
  const delay = game.holdSteps <= 1 ? 0.2 : 0.145;
  if (game.holdT >= delay) {
    game.holdT = 0;
    game.holdSteps++;
    tryMove(game, dir);
  }
}

function advanceArrow(game: Game, dt: number) {
  const arrow = game.arrow;
  if (!arrow) return false;
  arrow.t += dt / 0.048;
  while (arrow.t >= 1) {
    arrow.t -= 1;
    arrow.index++;
    const cell = arrow.cells[Math.min(arrow.index, arrow.cells.length - 1)]!;
    burst(game, cell.x, cell.y, 3, "#ffe7b8", 1.4, 1, 0.2);
    if (arrow.index >= arrow.cells.length) return true;
  }
  return false;
}

function heartbeat(game: Game, dt: number) {
  const near = game.wumps.some((w) => w.alive && Math.abs(w.x - game.px) + Math.abs(w.y - game.py) === 1);
  if (!near) {
    game.heartT = 0.35;
    return;
  }
  game.heartT -= dt;
  if (game.heartT <= 0) {
    const hunting = game.wumps.some((w) => w.alive && w.awake && Math.abs(w.x - game.px) + Math.abs(w.y - game.py) === 1);
    sfx.heart();
    game.heartT = hunting ? 0.46 : 0.86;
    shake(game, hunting ? 1.8 : 0.8);
  }
}

function ambience(game: Game, dt: number) {
  if (game.phase === "paused") return;
  game.spawnAcc += dt;
  const rate = game.percepts.stench ? 0.07 : game.percepts.breeze ? 0.08 : 0.2;
  if (game.spawnAcc < rate) return;
  game.spawnAcc = 0;
  if (game.percepts.stench) {
    const w = game.wumps.find((wm) => wm.alive && Math.abs(wm.x - game.px) + Math.abs(wm.y - game.py) === 1);
    if (w) {
      pushParticle(game, {
        x: game.px + 0.5 + (w.x - game.px) * 0.38,
        y: game.py + 0.5 + (w.y - game.py) * 0.38,
        vx: (game.px - w.x) * 0.25 + (game.rng() - 0.5) * 0.15,
        vy: (game.py - w.y) * 0.25 - 0.2,
        life: 0.7,
        max: 0.7,
        size: 0.07,
        color: "#c6f5a4",
        grav: -0.35,
        drag: 0.98,
        kind: 2,
      });
    }
    return;
  }
  if (game.percepts.breeze) {
    for (const d of DIRS) {
      const x = game.px + d.x;
      const y = game.py + d.y;
      if (!inBounds(game, x, y) || !cellAt(game, x, y).pit) continue;
      pushParticle(game, {
        x: game.px + 0.5 + d.x * 0.4,
        y: game.py + 0.5 + d.y * 0.4,
        vx: -d.x * 1.3,
        vy: -d.y * 1.3,
        life: 0.45,
        max: 0.45,
        size: 0.04,
        color: "#b7e4ff",
        grav: 0,
        drag: 1,
        kind: 5,
      });
    }
    return;
  }
  if (game.rng() < 0.65 && game.phase !== "gameover") {
    pushParticle(game, {
      x: game.px + 0.2 + game.rng() * 0.6,
      y: game.py + 0.2 + game.rng() * 0.6,
      vx: (game.rng() - 0.5) * 0.15,
      vy: -0.12 - game.rng() * 0.15,
      life: 0.8,
      max: 0.8,
      size: 0.03,
      color: "rgba(255, 214, 150, 0.8)",
      grav: -0.05,
      drag: 1,
      kind: 0,
    });
  }
}

function decay(game: Game, dt: number, scale: number) {
  const k = dt * scale;
  game.shake *= Math.exp(-dt * 7.5);
  if (game.shake < 0.25) game.shake = 0;
  game.flashA = Math.max(0, game.flashA - dt * 1.35);
  if (game.bumpT > 0) game.bumpT = Math.max(0, game.bumpT - dt);
  if (game.pulseT > 0) game.pulseT = Math.max(0, game.pulseT - dt);
  if (game.banner > 0 && game.phase === "playing") game.banner = Math.max(0, game.banner - dt);
  for (const c of game.cells) {
    if (c.reveal < 1) c.reveal = Math.min(1, c.reveal + dt * 4.2);
  }
  for (const w of game.wumps) {
    if (w.moveT < 1) w.moveT = Math.min(1, w.moveT + dt / (w.lunging ? 0.1 : 0.14));
  }
  for (let i = game.particles.length - 1; i >= 0; i--) {
    const p = game.particles[i]!;
    p.life -= k;
    if (p.life <= 0) {
      game.particles.splice(i, 1);
      continue;
    }
    p.vy += p.grav * k;
    const drag = Math.pow(p.drag, k * 60);
    p.vx *= drag;
    p.vy *= drag;
    p.x += p.vx * k;
    p.y += p.vy * k;
  }
  for (let i = game.floaters.length - 1; i >= 0; i--) {
    const f = game.floaters[i]!;
    f.life -= dt;
    f.y += f.vy * dt;
    if (f.life <= 0) game.floaters.splice(i, 1);
  }
  for (let i = game.shocks.length - 1; i >= 0; i--) {
    const s = game.shocks[i]!;
    s.life -= dt;
    if (s.life <= 0) game.shocks.splice(i, 1);
  }
  if (game.celebrateT > 0) {
    game.celebrateT -= dt;
    if (game.rng() < 0.4) burst(game, game.px, game.py, 2, "#ffd978", 1.6, 3, -0.8);
  }
  if (game.glint > 0) game.glint = Math.max(0, game.glint - dt * 0.85);
}

export function update(game: Game, dt: number) {
  const step = Math.min(0.033, Math.max(0, dt));
  game.time += step;
  setMuted(game.muted);

  if (game.hitStop > 0 && game.phase === "playing") {
    game.hitStop -= step;
    decay(game, step, 0.22);
    return;
  }

  if (game.phase === "dying") {
    game.deathT += step;
    decay(game, step, 1);
    if (game.deathT >= 1.12) {
      endRun(game, false, game.cause);
    }
    return;
  }

  if (game.phase === "playing") {
    let arrived = false;
    if (game.moveT < 1) {
      game.moveT = Math.min(1, game.moveT + step / 0.086);
      if (game.moveT >= 1) arrived = true;
    }
    const arrowDone = advanceArrow(game, step);
    if (arrived) resolveArrival(game);
    if (arrowDone && game.arrow) finishArrow(game);
    if (canAct(game)) consumeInput(game, step);
    if (game.phase === "playing") heartbeat(game, step);
  }

  decay(game, step, 1);
  if (game.phase === "playing" || game.phase === "menu" || game.phase === "floorclear") ambience(game, step);
}

export function takeSnap(game: Game): Snap {
  const alive = game.wumps.filter((w) => w.alive);
  return {
    phase: game.phase,
    score: game.score,
    depth: game.depth,
    arrows: game.arrows,
    arrowsMax: game.arrowsMax,
    gold: game.gold,
    goldLeft: game.goldLeft,
    goldFloor: game.goldFloor,
    kills: game.kills,
    killsFloor: game.killsFloor,
    steps: game.steps,
    percepts: { ...game.percepts },
    message: game.message,
    cause: game.cause,
    victory: game.victory,
    muted: game.muted,
    scores: game.scores,
    qualifies: game.qualifies,
    saved: game.saved,
    onRope: game.px === game.startX && game.py === game.startY,
    facing: game.facing,
    hint: game.hint,
    clean: game.clean,
    lastBonus: game.lastBonus,
    bonusDetail: game.bonusDetail,
    seed: game.seed,
    wumpusAlive: alive.length,
    wumpusAwake: alive.some((w) => w.awake),
    lastSavedAt: game.lastSavedAt,
  };
}
