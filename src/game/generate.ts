import { DIRS } from "./dirs";
import type { Cell, Wump } from "./types";

export interface Floor {
  w: number;
  h: number;
  cells: Cell[];
  startX: number;
  startY: number;
  wumps: Wump[];
  arrows: number;
  goldCount: number;
}

let wumpSeq = 1;

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function rand() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(arr: T[], rng: () => number) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j]!;
    arr[j] = tmp!;
  }
  return arr;
}

function makeCell(wall: boolean, rng: () => number): Cell {
  return {
    wall,
    pit: false,
    gold: false,
    seen: false,
    variant: Math.floor(rng() * 5),
    moss: rng() < 0.22,
    vein: rng() < 0.16,
    reveal: 1,
  };
}

function playSize(depth: number, narrow: boolean) {
  const cap = narrow ? 6 : 8;
  return Math.min(cap, 5 + Math.min(depth, 3));
}

function bfs(
  cells: Cell[],
  w: number,
  h: number,
  sx: number,
  sy: number,
  blocked?: Set<number>,
) {
  const seen = new Set<number>();
  const q: number[] = [];
  const start = sy * w + sx;
  seen.add(start);
  q.push(start);
  while (q.length) {
    const cur = q.shift()!;
    const x = cur % w;
    const y = Math.floor(cur / w);
    for (const d of DIRS) {
      const nx = x + d.x;
      const ny = y + d.y;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const ni = ny * w + nx;
      if (seen.has(ni)) continue;
      const c = cells[ni]!;
      if (c.wall || c.pit) continue;
      if (blocked?.has(ni)) continue;
      seen.add(ni);
      q.push(ni);
    }
  }
  return seen;
}

function spawnWump(x: number, y: number, awake: boolean): Wump {
  return {
    id: wumpSeq++,
    x,
    y,
    fromX: x,
    fromY: y,
    moveT: 1,
    alive: true,
    awake,
    lunging: false,
    stuck: false,
  };
}

export function generateFloor(depth: number, rng: () => number, narrow: boolean): Floor {
  for (let i = 0; i < 48; i++) {
    const floor = tryGenerate(depth, rng, narrow);
    if (floor) return floor;
  }
  return fallback(depth, narrow, rng);
}

function tryGenerate(depth: number, rng: () => number, narrow: boolean): Floor | null {
  const play = playSize(depth, narrow);
  const w = play + 2;
  const h = play + 2;
  const cells: Cell[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const border = x === 0 || y === 0 || x === w - 1 || y === h - 1;
      cells.push(makeCell(border, rng));
    }
  }
  const sx = Math.max(1, Math.ceil(play / 2));
  const sy = 1;
  const idx = (x: number, y: number) => y * w + x;
  const inside = (x: number, y: number) => x >= 1 && y >= 1 && x <= play && y <= play;

  const safe = new Set<number>([idx(sx, sy)]);
  for (const d of DIRS) {
    const x = sx + d.x;
    const y = sy + d.y;
    if (inside(x, y)) safe.add(idx(x, y));
  }

  const rockCount = depth < 3 ? 0 : Math.min(5, depth - 2);
  const rockCands: [number, number][] = [];
  for (let y = 1; y <= play; y++) {
    for (let x = 1; x <= play; x++) {
      if (!safe.has(idx(x, y))) rockCands.push([x, y]);
    }
  }
  shuffle(rockCands, rng);
  for (let i = 0; i < Math.min(rockCount, rockCands.length); i++) {
    const [x, y] = rockCands[i]!;
    cells[idx(x, y)]!.wall = true;
  }

  let exits = 0;
  for (const d of DIRS) {
    const x = sx + d.x;
    const y = sy + d.y;
    if (inside(x, y) && !cells[idx(x, y)]!.wall) exits++;
  }
  if (exits < 2) return null;

  const pitCount = Math.min(Math.floor(play * play * 0.22), depth === 1 ? 2 : 1 + depth);
  const hazard: [number, number][] = [];
  for (let y = 1; y <= play; y++) {
    for (let x = 1; x <= play; x++) {
      const i = idx(x, y);
      if (cells[i]!.wall || safe.has(i)) continue;
      hazard.push([x, y]);
    }
  }
  shuffle(hazard, rng);
  let pits = 0;
  for (const [x, y] of hazard) {
    if (pits >= pitCount) break;
    cells[idx(x, y)]!.pit = true;
    pits++;
  }
  if (pits < 1) return null;

  const reach = bfs(cells, w, h, sx, sy);
  let open = 0;
  for (const i of reach) {
    if (!cells[i]!.wall && !cells[i]!.pit) open++;
  }
  if (open < Math.max(8, Math.floor(play * play * 0.42))) return null;

  const wumpCount = depth >= 5 ? 2 : 1;
  const minDist = depth === 1 ? 4 : 3;
  const wumpCands: [number, number][] = [];
  for (const i of reach) {
    const x = i % w;
    const y = Math.floor(i / w);
    if (cells[i]!.wall || cells[i]!.pit || safe.has(i)) continue;
    if (Math.abs(x - sx) + Math.abs(y - sy) >= minDist) wumpCands.push([x, y]);
  }
  if (wumpCands.length < wumpCount) return null;
  shuffle(wumpCands, rng);
  const awake = depth >= 4;
  const wumps: Wump[] = [];
  for (let i = 0; i < wumpCount; i++) {
    const [x, y] = wumpCands[i]!;
    wumps.push(spawnWump(x, y, awake));
  }

  const blocked = new Set<number>(wumps.map((wm) => idx(wm.x, wm.y)));
  const safeReach = bfs(cells, w, h, sx, sy, blocked);

  if (depth === 1) {
    const gy = sy + 1;
    const gi = idx(sx, gy);
    if (!inside(sx, gy) || cells[gi]!.wall || cells[gi]!.pit) return null;
    cells[gi]!.gold = true;
  }

  const goldTarget = depth === 1 ? 2 : Math.min(4, 2 + Math.floor((depth - 1) / 2));
  const goldCands: { x: number; y: number; dist: number }[] = [];
  const pool = safeReach.size > 4 ? safeReach : reach;
  for (const i of pool) {
    const x = i % w;
    const y = Math.floor(i / w);
    const c = cells[i]!;
    if (c.wall || c.pit || c.gold) continue;
    if (x === sx && y === sy) continue;
    if (wumps.some((wm) => wm.x === x && wm.y === y)) continue;
    const dist = Math.abs(x - sx) + Math.abs(y - sy);
    if (depth > 1 && dist < 2) continue;
    if (depth === 1 && dist < 3) continue;
    goldCands.push({ x, y, dist });
  }
  goldCands.sort((a, b) => a.dist - b.dist || rng() - 0.5);
  const near = goldCands.filter((g) => g.dist <= 5);
  const pickFrom = near.length ? near : goldCands;
  if (pickFrom.length) {
    const choice = pickFrom[Math.floor(rng() * Math.min(3, pickFrom.length))]!;
    cells[idx(choice.x, choice.y)]!.gold = true;
  }
  const rest = shuffle(
    goldCands.filter((g) => !cells[idx(g.x, g.y)]!.gold),
    rng,
  );
  let goldCount = cells.filter((c) => c.gold).length;
  for (const g of rest) {
    if (goldCount >= goldTarget) break;
    cells[idx(g.x, g.y)]!.gold = true;
    goldCount++;
  }
  if (goldCount < 1) return null;
  if (depth === 1 && !cells[idx(sx, sy + 1)]!.gold) return null;

  const arrows = depth === 1 ? 1 : Math.min(3, wumpCount + 1);
  return { w, h, cells, startX: sx, startY: sy, wumps, arrows, goldCount };
}

function fallback(depth: number, narrow: boolean, rng: () => number): Floor {
  const play = narrow ? 6 : 6;
  const w = play + 2;
  const h = play + 2;
  const cells: Cell[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      cells.push(makeCell(x === 0 || y === 0 || x === w - 1 || y === h - 1, rng));
    }
  }
  const sx = 3;
  const sy = 1;
  const at = (x: number, y: number) => cells[y * w + x]!;
  at(sx, 2).gold = true;
  at(5, 4).gold = true;
  at(5, 5).pit = true;
  at(2, 4).pit = true;
  const wumps = [spawnWump(5, 2, depth >= 4)];
  if (depth >= 5) wumps.push(spawnWump(2, 5, true));
  return {
    w,
    h,
    cells,
    startX: sx,
    startY: sy,
    wumps,
    arrows: depth === 1 ? 1 : 2,
    goldCount: 2,
  };
}
