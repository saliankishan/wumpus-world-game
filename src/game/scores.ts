import type { ScoreRow } from "./types";

const KEY = "wumpus-gilded-maw-v1";
const INITIALS = "wumpus-gilded-maw-initials";
const MUTE = "wumpus-muted";

export function loadScores(): ScoreRow[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ScoreRow[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((r) => r && typeof r.score === "number" && typeof r.name === "string")
      .map((r) => ({
        name: String(r.name).slice(0, 3).toUpperCase() || "YOU",
        score: Math.floor(r.score),
        depth: Math.max(1, Math.floor(r.depth || 1)),
        gold: Math.max(0, Math.floor(r.gold || 0)),
        kills: Math.max(0, Math.floor(r.kills || 0)),
        at: r.at || 0,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);
  } catch {
    return [];
  }
}

export function saveScore(row: ScoreRow): ScoreRow[] {
  const next = [...loadScores(), row].sort((a, b) => b.score - a.score).slice(0, 8);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* private mode */
  }
  return next;
}

export function qualifies(score: number, rows: ScoreRow[] = loadScores()) {
  if (score <= 0) return false;
  if (rows.length < 8) return true;
  return score > rows[rows.length - 1].score;
}

export function loadInitials() {
  try {
    const v = localStorage.getItem(INITIALS);
    if (v && /^[A-Z]{3}$/.test(v)) return v;
  } catch {
    /* ignore */
  }
  return "AAA";
}

export function saveInitials(name: string) {
  try {
    localStorage.setItem(INITIALS, name);
  } catch {
    /* ignore */
  }
}

export function loadMuted() {
  try {
    return localStorage.getItem(MUTE) === "1";
  } catch {
    return false;
  }
}

export function saveMuted(muted: boolean) {
  try {
    localStorage.setItem(MUTE, muted ? "1" : "0");
  } catch {
    /* ignore */
  }
}
