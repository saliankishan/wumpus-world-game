import type { Dir } from "./types";

export const DIRS: { dir: Dir; x: number; y: number }[] = [
  { dir: "N", x: 0, y: -1 },
  { dir: "E", x: 1, y: 0 },
  { dir: "S", x: 0, y: 1 },
  { dir: "W", x: -1, y: 0 },
];

export function vec(dir: Dir) {
  switch (dir) {
    case "N":
      return { x: 0, y: -1 };
    case "E":
      return { x: 1, y: 0 };
    case "S":
      return { x: 0, y: 1 };
    default:
      return { x: -1, y: 0 };
  }
}

export function dirFromDelta(dx: number, dy: number): Dir {
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? "E" : "W";
  return dy > 0 ? "S" : "N";
}

export function dirBetween(fx: number, fy: number, tx: number, ty: number): Dir {
  const dx = tx - fx;
  const dy = ty - fy;
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? "E" : "W";
  return dy > 0 ? "S" : "N";
}

export function angleOf(dir: Dir) {
  switch (dir) {
    case "E":
      return 0;
    case "S":
      return Math.PI / 2;
    case "W":
      return Math.PI;
    default:
      return -Math.PI / 2;
  }
}
