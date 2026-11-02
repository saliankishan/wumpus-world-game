import { angleOf, vec } from "./dirs";
import { easeOut, roman } from "./format";
import type { Cell, Dir, Game, Wump } from "./types";

function hash(x: number, y: number, n: number) {
  let h = Math.imul(x + n * 17 + 0x9e3779b9, 0x85ebca6b) ^ Math.imul(y + 0xc2b2ae35, 0x27d4eb2d);
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  const rad = Math.min(r, w / 2, h / 2);
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

function mix(light: number, warm: number, rgb: [number, number, number]) {
  const w = warm * 0.45;
  const r = rgb[0] * light * (1 + w * 0.55);
  const g = rgb[1] * light * (1 + w * 0.18);
  const b = rgb[2] * light * (1 - w * 0.2);
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

const STONE: [number, number, number][] = [
  [92, 74, 60],
  [78, 63, 52],
  [104, 84, 66],
  [70, 62, 54],
  [86, 70, 54],
];

export function renderFrame(
  ctx: CanvasRenderingContext2D,
  game: Game,
  cssW: number,
  cssH: number,
  dpr: number,
) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);
  if (cssW < 8 || cssH < 8) return;

  const bg = ctx.createLinearGradient(0, 0, 0, cssH);
  bg.addColorStop(0, "#14100e");
  bg.addColorStop(0.5, "#0c0908");
  bg.addColorStop(1, "#070605");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, cssW, cssH);

  const menuPeek = game.phase === "menu" && window.innerWidth < 960;
  const top = menuPeek ? 8 : game.phase === "menu" ? 18 : 56;
  const bot = menuPeek ? 8 : 18;
  const availW = Math.max(20, cssW - 20);
  const availH = Math.max(20, cssH - top - bot);
  const cell = Math.max(20, Math.min(86, Math.floor(Math.min(availW / game.w, availH / game.h))));
  const gridW = cell * game.w;
  const gridH = cell * game.h;
  const ox = Math.floor((cssW - gridW) / 2);
  const oy = menuPeek ? 8 : top + Math.max(0, Math.floor((availH - gridH) / 2));
  game.view = { ox, oy, cell, cols: game.w, rows: game.h };

  const mag = game.shake;
  const sx = mag > 0.35 ? (Math.random() - 0.5) * mag * 2 : 0;
  const sy = mag > 0.35 ? (Math.random() - 0.5) * mag * 2 : 0;
  ctx.save();
  ctx.translate(sx, sy);

  const pp = playerDisplay(game);
  const flicker = 0.94 + Math.sin(game.time * 9.5) * 0.03 + Math.sin(game.time * 23) * 0.015;

  drawCavern(ctx, ox, oy, gridW, gridH, cell, game);

  for (let y = 0; y < game.h; y++) {
    for (let x = 0; x < game.w; x++) {
      const c = game.cells[y * game.w + x]!;
      const light = tileLight(pp.x, pp.y, x, y, c, x === 0 || y === 0 || x === game.w - 1 || y === game.h - 1);
      drawTile(ctx, game, c, x, y, ox, oy, cell, light * flicker, game.time);
    }
  }

  drawHazards(ctx, game, ox, oy, cell, pp.x, pp.y);
  drawWumps(ctx, game, ox, oy, cell, pp.x, pp.y);
  drawAim(ctx, game, ox, oy, cell, pp.x, pp.y);
  drawPlayer(ctx, game, ox, oy, cell, pp.x, pp.y);
  drawArrow(ctx, game, ox, oy, cell, pp.x, pp.y);
  drawParticles(ctx, game, ox, oy, cell);
  drawShocks(ctx, game, ox, oy, cell);
  drawFloaters(ctx, game, ox, oy, cell);
  drawBanner(ctx, game, cssW, cssH);

  const vig = ctx.createRadialGradient(
    cssW / 2,
    cssH / 2,
    Math.min(cssW, cssH) * 0.28,
    cssW / 2,
    cssH / 2,
    Math.max(cssW, cssH) * 0.72,
  );
  vig.addColorStop(0, "rgba(0,0,0,0)");
  vig.addColorStop(1, "rgba(0,0,0,0.55)");
  ctx.fillStyle = vig;
  ctx.fillRect(sx ? -20 : 0, sy ? -20 : 0, cssW + 40, cssH + 40);

  if (game.percepts.stench && (game.phase === "playing" || game.phase === "dying")) {
    const pulse = 0.16 + Math.sin(game.time * 9) * 0.07;
    ctx.fillStyle = `rgba(150, 18, 32, ${pulse})`;
    ctx.fillRect(0, 0, cssW, cssH);
  }

  if (game.flashA > 0.01) {
    ctx.globalAlpha = Math.min(1, game.flashA);
    ctx.fillStyle = game.flashColor;
    ctx.fillRect(-30, -30, cssW + 60, cssH + 60);
    ctx.globalAlpha = 1;
  }

  ctx.restore();
}

function playerDisplay(game: Game) {
  const t = easeOut(game.moveT);
  let x = game.fromX + (game.px - game.fromX) * t;
  let y = game.fromY + (game.py - game.fromY) * t;
  if (game.bumpT > 0) {
    const v = vec(game.facing);
    const k = Math.sin((1 - game.bumpT / 0.16) * Math.PI) * 0.14;
    x += v.x * k;
    y += v.y * k;
  }
  return { x, y };
}

function tileLight(px: number, py: number, x: number, y: number, c: Cell, border: boolean) {
  const d = Math.hypot(x - px, y - py);
  let L = c.seen ? 0.16 : 0.045;
  if (d < 0.55) L = 1;
  else if (d < 1.2) L = 0.74;
  else if (d < 1.75) L = 0.4;
  if (border) L = Math.max(L, 0.28);
  if (!c.seen && !border && d >= 1.75) L = 0.035;
  return L;
}

function drawCavern(
  ctx: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  gridW: number,
  gridH: number,
  cell: number,
  game: Game,
) {
  ctx.save();
  ctx.fillStyle = "#050403";
  roundRect(ctx, ox - 8, oy - 8, gridW + 16, gridH + 16, 18);
  ctx.fill();
  ctx.strokeStyle = "rgba(198, 161, 90, 0.28)";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  for (let i = 0; i < 8; i++) {
    const hx = ox + hash(i, game.seed, 3) * gridW;
    const hy = oy - 6;
    ctx.fillStyle = "rgba(40, 30, 24, 0.85)";
    ctx.beginPath();
    ctx.moveTo(hx, hy);
    ctx.lineTo(hx + cell * 0.18, hy + cell * 0.28);
    ctx.lineTo(hx - cell * 0.12, hy + cell * 0.22);
    ctx.fill();
  }
  ctx.restore();
}

function drawTile(
  ctx: CanvasRenderingContext2D,
  game: Game,
  c: Cell,
  x: number,
  y: number,
  ox: number,
  oy: number,
  cell: number,
  light: number,
  time: number,
) {
  const gap = c.wall ? 1 : Math.max(2, cell * 0.065);
  const x0 = ox + x * cell + gap / 2;
  const y0 = oy + y * cell + gap / 2;
  const s = cell - gap;
  const reveal = c.seen ? 0.72 + 0.28 * easeOut(c.reveal) : 1;
  ctx.save();
  const cx = x0 + s / 2;
  const cy = y0 + s / 2;
  ctx.translate(cx, cy);
  ctx.scale(reveal, reveal);
  ctx.translate(-cx, -cy);

  if (c.wall) {
    const g = ctx.createLinearGradient(x0, y0, x0, y0 + s);
    g.addColorStop(0, mix(Math.min(1, light * 1.15), 0.2, [68, 54, 44]));
    g.addColorStop(1, mix(light * 0.75, 0, [28, 22, 18]));
    ctx.fillStyle = g;
    roundRect(ctx, x0, y0, s, s, 5);
    ctx.fill();
    ctx.strokeStyle = `rgba(0,0,0,${0.35 + (1 - light) * 0.2})`;
    ctx.stroke();
    if (light > 0.2) {
      ctx.fillStyle = `rgba(255,220,170,${0.05 * light})`;
      ctx.fillRect(x0 + 2, y0 + 2, s - 4, 3);
    }
    ctx.restore();
    return;
  }

  if (!c.seen && light < 0.08) {
    ctx.fillStyle = "rgba(255,255,255,0.025)";
    roundRect(ctx, x0, y0, s, s, 6);
    ctx.fill();
    ctx.restore();
    return;
  }

  const warm = Math.max(0, 1 - Math.hypot(x - game.px, y - game.py) / 2.1);
  const base = STONE[c.variant % STONE.length]!;
  ctx.fillStyle = mix(light, warm, base);
  roundRect(ctx, x0, y0, s, s, 7);
  ctx.fill();

  if (light > 0.12) {
    ctx.fillStyle = `rgba(255, 236, 206, ${0.07 * light})`;
    roundRect(ctx, x0 + 1, y0 + 1, s - 2, s * 0.22, 6);
    ctx.fill();
    for (let i = 0; i < 4; i++) {
      const px = x0 + 6 + hash(x, y, i + 1) * (s - 12);
      const py = y0 + 6 + hash(y, x, i + 4) * (s - 12);
      const pr = 1 + hash(x + i, y, 9) * 2.2;
      ctx.fillStyle = `rgba(20, 12, 8, ${0.18 * light})`;
      ctx.beginPath();
      ctx.arc(px, py, pr, 0, Math.PI * 2);
      ctx.fill();
    }
    if (c.moss) {
      ctx.fillStyle = `rgba(64, 140, 96, ${0.45 * light})`;
      ctx.beginPath();
      ctx.ellipse(x0 + s * 0.22, y0 + s * 0.72, s * 0.12, s * 0.06, -0.4, 0, Math.PI * 2);
      ctx.fill();
    }
    if (c.vein) {
      ctx.strokeStyle = `rgba(232, 184, 78, ${0.55 * light})`;
      ctx.lineWidth = Math.max(1, cell * 0.035);
      ctx.beginPath();
      ctx.moveTo(x0 + s * 0.15, y0 + s * 0.7);
      ctx.lineTo(x0 + s * 0.42, y0 + s * 0.48);
      ctx.lineTo(x0 + s * 0.7, y0 + s * 0.62);
      ctx.stroke();
    }
  }

  if (c.pit && (c.seen || light > 0.22)) drawPit(ctx, cx, cy, s, light, time, x + y);
  if (c.gold && (c.seen || light > 0.25)) drawGold(ctx, cx, cy, s, light, time, x);
  if (x === game.startX && y === game.startY) drawRope(ctx, x0, y0, s, light, time, game.px === x && game.py === y);

  const firstGold = game.steps === 0 && c.gold && (game.phase === "menu" || game.phase === "playing");
  if (firstGold) {
    const pulse = 0.35 + Math.sin(time * 5) * 0.25;
    ctx.strokeStyle = `rgba(255, 214, 120, ${pulse})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, s * 0.34 + Math.sin(time * 5) * 2, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();
}

function drawPit(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  s: number,
  light: number,
  time: number,
  salt: number,
) {
  ctx.save();
  ctx.globalAlpha = Math.max(0.45, light);
  ctx.fillStyle = "#120e0c";
  ctx.beginPath();
  ctx.ellipse(x, y + 1, s * 0.32, s * 0.24, 0, 0, Math.PI * 2);
  ctx.fill();
  const g = ctx.createRadialGradient(x, y, 2, x, y, s * 0.28);
  g.addColorStop(0, "#000206");
  g.addColorStop(0.62, "#07141c");
  g.addColorStop(1, "#163246");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(x, y + 2, s * 0.26, s * 0.18, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = (0.28 + Math.sin(time * 2 + salt) * 0.08) * Math.max(0.5, light);
  ctx.fillStyle = "#b7e6ff";
  ctx.beginPath();
  ctx.ellipse(x, y - s * 0.02 + Math.sin(time + salt) * 1.5, s * 0.14, s * 0.045, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawGold(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  s: number,
  light: number,
  time: number,
  salt: number,
) {
  const bob = Math.sin(time * 3.4 + salt) * s * 0.035;
  ctx.save();
  ctx.translate(x, y + bob);
  ctx.globalAlpha = Math.max(0.55, light);
  const glow = ctx.createRadialGradient(0, 0, 2, 0, 0, s * 0.28);
  glow.addColorStop(0, `rgba(255, 214, 110, ${0.45 * light})`);
  glow.addColorStop(1, "rgba(255, 180, 40, 0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, 0, s * 0.28, 0, Math.PI * 2);
  ctx.fill();
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = i === 1 ? "#ffe7ad" : "#e2a63a";
    ctx.beginPath();
    ctx.ellipse((i - 1) * s * 0.075, s * 0.05 - i * 2.4, s * 0.09, s * 0.042, 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(120, 72, 16, 0.45)";
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  const spark = (Math.sin(time * 7 + salt) + 1) / 2;
  ctx.globalAlpha = 0.25 + spark * 0.75;
  ctx.fillStyle = "#fffaf0";
  ctx.fillRect(-1, -s * 0.16, 2, 7);
  ctx.fillRect(-4, -s * 0.14, 8, 2);
  ctx.restore();
}

function drawRope(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  s: number,
  light: number,
  time: number,
  here: boolean,
) {
  const sway = Math.sin(time * 1.6) * 2.2;
  ctx.save();
  ctx.globalAlpha = Math.max(0.55, light);
  ctx.strokeStyle = here ? "#f0d7a2" : "#c4a574";
  ctx.lineWidth = Math.max(2, s * 0.045);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x + s * 0.5, y + 2);
  ctx.quadraticCurveTo(x + s * 0.5 + sway, y + s * 0.35, x + s * 0.5 + sway * 0.4, y + s * 0.62);
  ctx.stroke();
  ctx.fillStyle = "#d7b56a";
  ctx.beginPath();
  ctx.ellipse(x + s * 0.5 + sway * 0.35, y + s * 0.68, s * 0.1, s * 0.045, 0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(90, 60, 20, 0.7)";
  ctx.stroke();
  if (s > 34) {
    ctx.fillStyle = here ? "#ffe7b8" : "rgba(240, 214, 170, 0.8)";
    ctx.font = `700 ${Math.max(8, s * 0.13)}px Cinzel, Palatino, serif`;
    ctx.textAlign = "center";
    ctx.fillText("ROPE", x + s * 0.5, y + s * 0.9);
  }
  ctx.restore();
}

function drawHazards(
  ctx: CanvasRenderingContext2D,
  game: Game,
  ox: number,
  oy: number,
  cell: number,
  px: number,
  py: number,
) {
  if (game.phase === "menu") return;
  const dirs = [
    { x: 0, y: -1, nx: 0, ny: -1 },
    { x: 1, y: 0, nx: 1, ny: 0 },
    { x: 0, y: 1, nx: 0, ny: 1 },
    { x: -1, y: 0, nx: -1, ny: 0 },
  ];
  for (const d of dirs) {
    const x = game.px + d.x;
    const y = game.py + d.y;
    if (x < 0 || y < 0 || x >= game.w || y >= game.h) continue;
    const c = game.cells[y * game.w + x]!;
    const cx = ox + (px + 0.5) * cell;
    const cy = oy + (py + 0.5) * cell;
    if (c.pit) {
      drawWisps(ctx, cx, cy, d.nx, d.ny, cell, "#9fd8ff", game.time, 0);
    }
    if (game.wumps.some((w) => w.alive && w.x === x && w.y === y)) {
      drawWisps(ctx, cx, cy, d.nx, d.ny, cell, "#c6f5a2", game.time, 1.7);
    }
  }
}

function drawWisps(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  nx: number,
  ny: number,
  cell: number,
  color: string,
  time: number,
  phase: number,
) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.6;
  ctx.lineCap = "round";
  for (let i = 0; i < 3; i++) {
    const wob = Math.sin(time * 5 + phase + i) * 3;
    const along = cell * (0.18 + i * 0.07);
    const side = (i - 1) * cell * 0.08 + wob;
    const x1 = cx + nx * along + -ny * side;
    const y1 = cy + ny * along + nx * side;
    const x2 = cx + nx * (along + cell * 0.1) + -ny * side;
    const y2 = cy + ny * (along + cell * 0.1) + nx * side;
    ctx.globalAlpha = 0.35 + 0.25 * Math.sin(time * 6 + i);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawWumps(
  ctx: CanvasRenderingContext2D,
  game: Game,
  ox: number,
  oy: number,
  cell: number,
  px: number,
  py: number,
) {
  for (const w of game.wumps) {
    const t = easeOut(w.moveT);
    const x = w.fromX + (w.x - w.fromX) * t;
    const y = w.fromY + (w.y - w.fromY) * t;
    const dist = Math.hypot(x - px, y - py);
    const seen = game.cells[w.y * game.w + w.x]?.seen;
    const light = dist < 0.6 ? 1 : dist < 1.25 ? 0.74 : dist < 1.8 ? 0.38 : seen ? 0.16 : 0;
    const sx = ox + (x + 0.5) * cell;
    const sy = oy + (y + 0.5) * cell;
    if (!w.alive) {
      if (seen || light > 0.12) drawCorpse(ctx, sx, sy, cell, w.stuck, light);
      continue;
    }
    const glinting = game.glint > 0.04 && w.awake;
    if (light >= 0.32 || dist < 1.15) drawBeast(ctx, sx, sy, cell, game.time, w, Math.max(light, glinting ? game.glint : 0), dist < 1.05 && w.awake);
    else if (glinting || (w.awake && dist < 2.45)) drawEyes(ctx, sx, sy, cell, game.time, glinting ? Math.max(0.45, game.glint) : 0.85);
  }
}

function drawEyes(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  cell: number,
  time: number,
  power: number,
) {
  const blink = Math.sin(time * 1.7) > 0.92 ? 0.15 : 1;
  const glow = (0.55 + Math.sin(time * 8) * 0.3) * power * blink;
  ctx.save();
  for (const dx of [-0.1, 0.1]) {
    const ex = x + dx * cell;
    const ey = y - cell * 0.06;
    const g = ctx.createRadialGradient(ex, ey, 1, ex, ey, cell * 0.16);
    g.addColorStop(0, `rgba(255, 60, 70, ${0.9 * glow})`);
    g.addColorStop(1, "rgba(255, 20, 30, 0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(ex, ey, cell * 0.16, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = `rgba(255, 236, 220, ${glow})`;
    ctx.beginPath();
    ctx.ellipse(ex, ey, cell * 0.035, cell * 0.05, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawBeast(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  cell: number,
  time: number,
  w: Wump,
  light: number,
  bang: boolean,
) {
  const s = cell * 0.96;
  const breathe = 1 + Math.sin(time * (w.awake ? 7.5 : 2.2) + w.id) * 0.045;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(breathe, breathe * 0.92);
  ctx.globalAlpha = Math.max(0.4, Math.min(1, light + 0.25));
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.beginPath();
  ctx.ellipse(0, s * 0.22, s * 0.34, s * 0.12, 0, 0, Math.PI * 2);
  ctx.fill();
  const body = ctx.createRadialGradient(-s * 0.08, -s * 0.08, s * 0.05, 0, 0, s * 0.46);
  body.addColorStop(0, "#4a2c34");
  body.addColorStop(0.45, "#1a1014");
  body.addColorStop(1, "#070506");
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(0, -s * 0.4);
  ctx.bezierCurveTo(s * 0.42, -s * 0.36, s * 0.5, s * 0.08, s * 0.26, s * 0.3);
  ctx.bezierCurveTo(s * 0.12, s * 0.46, -s * 0.16, s * 0.48, -s * 0.32, s * 0.26);
  ctx.bezierCurveTo(-s * 0.52, 0.02 * s, -s * 0.4, -s * 0.38, 0, -s * 0.4);
  ctx.fill();
  ctx.fillStyle = "#e6d3a4";
  ctx.beginPath();
  ctx.moveTo(-s * 0.08, s * 0.08);
  ctx.lineTo(-s * 0.18, s * 0.28);
  ctx.lineTo(-s * 0.02, s * 0.14);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(s * 0.1, s * 0.08);
  ctx.lineTo(s * 0.22, s * 0.3);
  ctx.lineTo(s * 0.04, s * 0.14);
  ctx.fill();
  drawEyes(ctx, 0, -s * 0.02, s, time, w.awake ? 1 : 0.45);
  if (!w.awake) {
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = "#d9cbb8";
    ctx.font = `700 ${Math.max(10, s * 0.16)}px Outfit, system-ui, sans-serif`;
    ctx.textAlign = "center";
    if (Math.sin(time * 2 + w.id) > 0.35) ctx.fillText("z", s * 0.28, -s * 0.32);
  }
  if (bang) {
    const pulse = 0.55 + Math.sin(time * 12) * 0.45;
    ctx.globalAlpha = pulse;
    ctx.strokeStyle = "#ff4454";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, s * 0.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "#ffd0d4";
    ctx.font = `800 ${Math.max(12, s * 0.22)}px Cinzel, serif`;
    ctx.textAlign = "center";
    ctx.fillText("!", 0, -s * 0.5);
  }
  ctx.restore();
}

function drawCorpse(ctx: CanvasRenderingContext2D, x: number, y: number, cell: number, stuck: boolean, light: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.globalAlpha = Math.max(0.35, light);
  ctx.fillStyle = "#2a2422";
  ctx.beginPath();
  ctx.ellipse(0, cell * 0.06, cell * 0.28, cell * 0.16, -0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#e6d3a4";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-cell * 0.08, -cell * 0.02);
  ctx.lineTo(-cell * 0.02, cell * 0.05);
  ctx.moveTo(-cell * 0.02, -cell * 0.02);
  ctx.lineTo(-cell * 0.08, cell * 0.05);
  ctx.moveTo(cell * 0.06, -cell * 0.03);
  ctx.lineTo(cell * 0.12, cell * 0.04);
  ctx.moveTo(cell * 0.12, -cell * 0.03);
  ctx.lineTo(cell * 0.06, cell * 0.04);
  ctx.stroke();
  if (stuck) {
    ctx.strokeStyle = "#e7c27a";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cell * 0.02, cell * 0.12);
    ctx.lineTo(cell * 0.2, cell * 0.28);
    ctx.stroke();
  }
  ctx.restore();
}

function drawAim(
  ctx: CanvasRenderingContext2D,
  game: Game,
  ox: number,
  oy: number,
  cell: number,
  px: number,
  py: number,
) {
  const hover = game.hover;
  if (!hover || game.phase !== "playing") return;
  const dx = hover.x - game.px;
  const dy = hover.y - game.py;
  const straight = dx === 0 || dy === 0;
  const adj = Math.abs(dx) + Math.abs(dy) === 1;
  if (!straight && !adj) return;
  const dir: Dir = dx === 0 ? (dy > 0 ? "S" : "N") : Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? "E" : "W") : dy > 0 ? "S" : "N";
  const v = vec(dir);
  ctx.save();
  ctx.strokeStyle = adj ? "rgba(240, 210, 150, 0.7)" : "rgba(255, 120, 90, 0.75)";
  ctx.setLineDash(adj ? [] : [5, 6]);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(ox + (px + 0.5) * cell, oy + (py + 0.5) * cell);
  const tx = adj ? hover.x : game.px + v.x * 1.2;
  const ty = adj ? hover.y : game.py + v.y * 1.2;
  ctx.lineTo(ox + (tx + 0.5) * cell, oy + (ty + 0.5) * cell);
  ctx.stroke();
  ctx.restore();
  const hx = ox + hover.x * cell + 3;
  const hy = oy + hover.y * cell + 3;
  const hs = cell - 6;
  ctx.strokeStyle = adj ? "rgba(240, 206, 130, 0.9)" : "rgba(255, 96, 78, 0.9)";
  ctx.lineWidth = 2;
  ctx.strokeRect(hx, hy, hs, hs);
}

function drawPlayer(
  ctx: CanvasRenderingContext2D,
  game: Game,
  ox: number,
  oy: number,
  cell: number,
  px: number,
  py: number,
) {
  let fall = 0;
  if (game.death === "pit") fall = Math.min(1, game.deathT / 0.62);
  const x = ox + (px + 0.5) * cell;
  const y = oy + (py + 0.5) * cell + fall * cell * 0.28;
  const s = cell * 0.72 * (1 - fall * 0.75);
  const bob = game.moveT < 1 ? Math.sin(easeOut(game.moveT) * Math.PI) * -cell * 0.06 : Math.sin(game.time * 2) * 0.6;

  ctx.save();
  ctx.translate(x, y + bob);
  ctx.globalAlpha = 1 - fall * 0.85;

  const ang = angleOf(game.facing);
  ctx.save();
  ctx.rotate(ang);
  const beam = ctx.createLinearGradient(0, 0, cell * 1.35, 0);
  beam.addColorStop(0, "rgba(255, 196, 110, 0.22)");
  beam.addColorStop(1, "rgba(255, 180, 70, 0)");
  ctx.fillStyle = beam;
  ctx.beginPath();
  ctx.moveTo(s * 0.1, 0);
  ctx.lineTo(cell * 1.25, -cell * 0.34);
  ctx.lineTo(cell * 1.25, cell * 0.34);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  const glow = ctx.createRadialGradient(0, 0, 2, 0, 0, cell * 1.55);
  glow.addColorStop(0, "rgba(255, 186, 90, 0.22)");
  glow.addColorStop(1, "rgba(255, 170, 60, 0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, 0, cell * 1.55, 0, Math.PI * 2);
  ctx.fill();

  if (game.pulseT > 0) {
    ctx.globalAlpha = game.pulseT;
    ctx.strokeStyle = "rgba(255, 220, 160, 0.8)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, cell * (0.3 + (1 - game.pulseT) * 0.8), 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1 - fall * 0.85;
  }

  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath();
  ctx.ellipse(0, s * 0.34, s * 0.28, s * 0.1, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#17656e";
  ctx.beginPath();
  ctx.ellipse(0, s * 0.05, s * 0.3, s * 0.34, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#0e4248";
  ctx.beginPath();
  ctx.arc(0, -s * 0.16, s * 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#f0c7a4";
  ctx.beginPath();
  ctx.arc(0, -s * 0.14, s * 0.1, 0, Math.PI * 2);
  ctx.fill();

  const v = vec(game.facing);
  const lx = v.x * s * 0.42;
  const ly = v.y * s * 0.42;
  const lamp = ctx.createRadialGradient(lx, ly, 1, lx, ly, s * 0.22);
  lamp.addColorStop(0, "#fff4d2");
  lamp.addColorStop(0.45, "#f0b84a");
  lamp.addColorStop(1, "rgba(240, 160, 40, 0)");
  ctx.fillStyle = lamp;
  ctx.beginPath();
  ctx.arc(lx, ly, s * 0.22, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffe7a8";
  ctx.beginPath();
  ctx.arc(lx, ly, s * 0.07, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.rotate(ang);
  ctx.fillStyle = "rgba(255, 228, 170, 0.95)";
  ctx.beginPath();
  ctx.moveTo(s * 0.62, 0);
  ctx.lineTo(s * 0.4, -s * 0.12);
  ctx.lineTo(s * 0.4, s * 0.12);
  ctx.fill();
  ctx.restore();

  if (game.steps === 0 && game.goldFloor === 0 && (game.phase === "playing" || game.phase === "menu")) {
    const pulse = 0.45 + Math.sin(game.time * 6) * 0.35;
    ctx.globalAlpha = pulse;
    ctx.fillStyle = "#ffe7a8";
    ctx.beginPath();
    ctx.moveTo(0, s * 1.05);
    ctx.lineTo(-9, s * 0.72);
    ctx.lineTo(9, s * 0.72);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function drawArrow(
  ctx: CanvasRenderingContext2D,
  game: Game,
  ox: number,
  oy: number,
  cell: number,
  px: number,
  py: number,
) {
  const arrow = game.arrow;
  if (!arrow || !arrow.cells.length) return;
  const i = Math.min(arrow.index, arrow.cells.length - 1);
  const to = arrow.cells[i]!;
  const from = arrow.index === 0 ? { x: px, y: py } : arrow.cells[arrow.index - 1]!;
  const t = arrow.index >= arrow.cells.length ? 1 : arrow.t;
  const x = from.x + (to.x - from.x) * t;
  const y = from.y + (to.y - from.y) * t;
  const sx = ox + (x + 0.5) * cell;
  const sy = oy + (y + 0.5) * cell;
  ctx.save();
  ctx.translate(sx, sy);
  ctx.rotate(angleOf(arrow.dir));
  ctx.fillStyle = "rgba(255, 220, 150, 0.35)";
  ctx.fillRect(-cell * 0.28, -2, cell * 0.22, 4);
  ctx.fillStyle = "#f2d48a";
  ctx.fillRect(-cell * 0.08, -1.5, cell * 0.16, 3);
  ctx.beginPath();
  ctx.moveTo(cell * 0.16, 0);
  ctx.lineTo(cell * 0.02, -5);
  ctx.lineTo(cell * 0.02, 5);
  ctx.fill();
  ctx.fillStyle = "#efe6d6";
  ctx.fillRect(-cell * 0.12, -4, 3, 8);
  ctx.restore();
}

function drawParticles(ctx: CanvasRenderingContext2D, game: Game, ox: number, oy: number, cell: number) {
  for (const p of game.particles) {
    const x = ox + p.x * cell;
    const y = oy + p.y * cell;
    const a = Math.max(0, p.life / p.max);
    ctx.globalAlpha = a;
    if (p.kind === 5) {
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - p.vx * cell * 0.08, y - p.vy * cell * 0.08);
      ctx.stroke();
    } else {
      ctx.fillStyle = p.color;
      ctx.beginPath();
      const rad = Math.max(1.1, p.size * cell);
      if (p.kind === 3) ctx.ellipse(x, y, rad * 1.3, rad * 0.7, 0.4, 0, Math.PI * 2);
      else ctx.arc(x, y, rad, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

function drawShocks(ctx: CanvasRenderingContext2D, game: Game, ox: number, oy: number, cell: number) {
  for (const s of game.shocks) {
    const k = 1 - s.life / s.max;
    ctx.globalAlpha = s.life / s.max;
    ctx.strokeStyle = s.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(ox + s.x * cell, oy + s.y * cell, cell * (0.2 + k * 1.3), 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function drawFloaters(ctx: CanvasRenderingContext2D, game: Game, ox: number, oy: number, cell: number) {
  ctx.textAlign = "center";
  ctx.font = `750 ${Math.max(13, cell * 0.28)}px Outfit, system-ui, sans-serif`;
  for (const f of game.floaters) {
    const a = Math.max(0, f.life / f.max);
    ctx.globalAlpha = a;
    const x = ox + f.x * cell;
    const y = oy + f.y * cell;
    ctx.lineWidth = 4;
    ctx.strokeStyle = "rgba(0,0,0,0.65)";
    ctx.strokeText(f.text, x, y);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, x, y);
  }
  ctx.globalAlpha = 1;
}

function drawBanner(ctx: CanvasRenderingContext2D, game: Game, cssW: number, cssH: number) {
  if (game.banner <= 0 || game.phase !== "playing") return;
  const a = Math.min(1, game.banner) * Math.min(1, game.banner / 0.35);
  ctx.save();
  ctx.globalAlpha = a;
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(8,6,5,0.45)";
  ctx.fillRect(cssW / 2 - 150, cssH * 0.18 - 36, 300, 78);
  ctx.fillStyle = "#f6e7c8";
  ctx.font = `700 ${Math.max(28, Math.min(54, cssW * 0.06))}px Cinzel, Palatino, serif`;
  ctx.fillText(`DEPTH ${roman(game.depth)}`, cssW / 2, cssH * 0.18);
  ctx.font = `500 13px Outfit, system-ui, sans-serif`;
  ctx.fillStyle = "#e7c98a";
  ctx.fillText(game.depth >= 4 ? "IT IS ALREADY AWAKE" : "THE GILDED MAW", cssW / 2, cssH * 0.18 + 22);
  ctx.restore();
}
