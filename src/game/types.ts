export type Dir = "N" | "E" | "S" | "W";

export type Phase = "menu" | "playing" | "paused" | "dying" | "floorclear" | "gameover";

export type DeathType = "pit" | "wumpus";

export interface ScoreRow {
  name: string;
  score: number;
  depth: number;
  gold: number;
  kills: number;
  at: number;
}

export interface Cell {
  wall: boolean;
  pit: boolean;
  gold: boolean;
  seen: boolean;
  variant: number;
  moss: boolean;
  vein: boolean;
  reveal: number;
}

export interface Wump {
  id: number;
  x: number;
  y: number;
  fromX: number;
  fromY: number;
  moveT: number;
  alive: boolean;
  awake: boolean;
  lunging: boolean;
  stuck: boolean;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  grav: number;
  drag: number;
  /** 0 dust, 1 spark, 2 spore, 3 gold, 4 gore, 5 wind */
  kind: number;
}

export interface Floater {
  x: number;
  y: number;
  vy: number;
  text: string;
  color: string;
  life: number;
  max: number;
}

export interface Shock {
  x: number;
  y: number;
  life: number;
  max: number;
  color: string;
}

export interface ArrowAnim {
  cells: { x: number; y: number }[];
  index: number;
  t: number;
  hitId: number | null;
  dir: Dir;
}

export interface Percepts {
  stench: boolean;
  breeze: boolean;
  glitter: boolean;
  scream: boolean;
}

export interface View {
  ox: number;
  oy: number;
  cell: number;
  cols: number;
  rows: number;
}

export interface Game {
  phase: Phase;
  seed: number;
  rng: () => number;
  narrow: boolean;
  reduced: boolean;
  depth: number;
  w: number;
  h: number;
  cells: Cell[];
  startX: number;
  startY: number;
  px: number;
  py: number;
  fromX: number;
  fromY: number;
  moveT: number;
  facing: Dir;
  wumps: Wump[];
  arrows: number;
  arrowsMax: number;
  score: number;
  gold: number;
  goldFloor: number;
  goldLeft: number;
  kills: number;
  killsFloor: number;
  steps: number;
  percepts: Percepts;
  message: string;
  extra: string;
  particles: Particle[];
  floaters: Floater[];
  shocks: Shock[];
  shake: number;
  flashA: number;
  flashColor: string;
  arrow: ArrowAnim | null;
  death: DeathType | null;
  deathT: number;
  doom: DeathType | null;
  keys: Set<string>;
  touchDir: Dir | null;
  impulse: Dir | null;
  shootQueued: boolean;
  climbQueued: boolean;
  waitQueued: boolean;
  bumpT: number;
  pulseT: number;
  time: number;
  hitStop: number;
  uiDirty: boolean;
  muted: boolean;
  scores: ScoreRow[];
  qualifies: boolean;
  saved: boolean;
  victory: boolean;
  cause: string;
  lastBonus: number;
  clean: boolean;
  bonusDetail: string;
  banner: number;
  hint: string;
  hover: { x: number; y: number } | null;
  view: View;
  holdDir: Dir | null;
  holdT: number;
  holdSteps: number;
  heartT: number;
  screamLinger: number;
  stenchStreak: number;
  spawnAcc: number;
  celebrateT: number;
  lastSavedAt: number;
  glint: number;
}

export interface Snap {
  phase: Phase;
  score: number;
  depth: number;
  arrows: number;
  arrowsMax: number;
  gold: number;
  goldLeft: number;
  goldFloor: number;
  kills: number;
  killsFloor: number;
  steps: number;
  percepts: Percepts;
  message: string;
  cause: string;
  victory: boolean;
  muted: boolean;
  scores: ScoreRow[];
  qualifies: boolean;
  saved: boolean;
  onRope: boolean;
  facing: Dir;
  hint: string;
  clean: boolean;
  lastBonus: number;
  bonusDetail: string;
  seed: number;
  wumpusAlive: number;
  wumpusAwake: boolean;
  lastSavedAt: number;
}
