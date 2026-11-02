import { useEffect, useRef, useState } from "react";
import explorerArt from "./assets/explorer.jpg";
import heroArt from "./assets/hero.jpg";
import wumpusArt from "./assets/wumpus.jpg";
import { sfx, unlock } from "./game/audio";
import { dirFromDelta } from "./game/dirs";
import { fmt, roman } from "./game/format";
import { renderFrame } from "./game/render";
import { loadInitials } from "./game/scores";
import {
  camp,
  commitScore,
  createGame,
  delve,
  pause,
  pressDir,
  requestClimb,
  requestShoot,
  requestWait,
  restart,
  resume,
  reshuffle,
  retire,
  setHover,
  startRun,
  takeSnap,
  tapCell,
  toggleMute,
  update,
} from "./game/sim";
import type { Dir, Game, Snap } from "./game/types";

function dirFromCode(code: string): Dir {
  if (code === "ArrowUp" || code === "KeyW") return "N";
  if (code === "ArrowDown" || code === "KeyS") return "S";
  if (code === "ArrowLeft" || code === "KeyA") return "W";
  return "E";
}

function isDirCode(code: string) {
  return ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "KeyW", "KeyA", "KeyS", "KeyD"].includes(code);
}

function MawMark() {
  return (
    <svg className="maw-mark" width="28" height="28" viewBox="0 0 64 64" aria-hidden>
      <circle cx="32" cy="32" r="30" fill="#1a100c" stroke="#c6a15a" strokeWidth="2" />
      <ellipse cx="32" cy="34" rx="16" ry="10" fill="#3a1218" />
      <ellipse cx="32" cy="34" rx="7" ry="8" fill="#ff2d3a" />
      <ellipse cx="32" cy="34" rx="3" ry="5" fill="#1a0508" />
      <circle cx="34" cy="31" r="1.6" fill="#fff" />
    </svg>
  );
}

function SoundIcon({ off }: { off: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
      <path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" />
      {off ? (
        <path d="M16 9l5 6M21 9l-5 6" stroke="currentColor" strokeWidth="2" fill="none" />
      ) : (
        <path d="M16.5 9.5a4 4 0 010 5" stroke="currentColor" strokeWidth="2" fill="none" />
      )}
    </svg>
  );
}

function Ledger({ rows, highlight }: { rows: Snap["scores"]; highlight?: number }) {
  if (!rows.length) return <p className="empty">No names yet. The Maw keeps no saints.</p>;
  return (
    <table className="ledger">
      <tbody>
        {rows.map((row, i) => (
          <tr key={`${row.at}-${row.name}-${i}`} className={row.at === highlight ? "hot" : ""}>
            <td className="rk">{i + 1}</td>
            <td className="nm">{row.name}</td>
            <td className="sc">{fmt(row.score)}</td>
            <td className="meta">
              D{row.depth} · {row.gold}g
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Rules() {
  return (
    <ul className="rules">
      <li>
        <i className="pip" style={{ background: "#9fd4ff", color: "#9fd4ff" }} />
        <span>
          <strong>Breeze</strong> — a pit is in an adjacent room. Step in and the shaft keeps you.
        </span>
      </li>
      <li>
        <i className="pip" style={{ background: "#c6f5a4", color: "#c6f5a4" }} />
        <span>
          <strong>Stench</strong> — the Wumpus is beside you. Do not step in. Shoot.
        </span>
      </li>
      <li>
        <i className="pip" style={{ background: "#f0c36a", color: "#f0c36a" }} />
        <span>
          <strong>Glitter</strong> — gold underfoot. Pocket it and the beast may wake.
        </span>
      </li>
      <li>
        <i className="pip" style={{ background: "#e7c98a", color: "#e7c98a" }} />
        <span>
          <strong>Rope</strong> — climb out to bank the floor, then delve deeper for a higher purse.
        </span>
      </li>
    </ul>
  );
}

function Chips({ snap }: { snap: Snap }) {
  return (
    <div className="chips">
      <span className={`chip ${snap.percepts.stench ? "on" : ""}`} style={{ ["--c" as string]: "#c6f5a4" }}>
        Stench
      </span>
      <span className={`chip ${snap.percepts.breeze ? "on" : ""}`} style={{ ["--c" as string]: "#9fd4ff" }}>
        Breeze
      </span>
      <span className={`chip ${snap.percepts.glitter ? "on" : ""}`} style={{ ["--c" as string]: "#f0c36a" }}>
        Glitter
      </span>
      <span className={`chip ${snap.percepts.scream ? "on" : ""}`} style={{ ["--c" as string]: "#ff5d6c" }}>
        Scream
      </span>
    </div>
  );
}

function DPad({ onDir, onWait }: { onDir: (dir: Dir | null) => void; onWait: () => void }) {
  const [lit, setLit] = useState<Dir | null>(null);
  const center = useRef(false);
  const pick = (el: HTMLDivElement, clientX: number, clientY: number): Dir | null => {
    const r = el.getBoundingClientRect();
    const x = clientX - (r.left + r.width / 2);
    const y = clientY - (r.top + r.height / 2);
    if (Math.hypot(x, y) < r.width * 0.18) return null;
    if (Math.abs(x) > Math.abs(y)) return x > 0 ? "E" : "W";
    return y > 0 ? "S" : "N";
  };
  return (
    <div
      className="dpad"
      role="group"
      aria-label="Move"
      onPointerDown={(e) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        const dir = pick(e.currentTarget, e.clientX, e.clientY);
        center.current = dir == null;
        setLit(dir);
        onDir(dir);
      }}
      onPointerMove={(e) => {
        if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
        const dir = pick(e.currentTarget, e.clientX, e.clientY);
        if (dir) center.current = false;
        setLit(dir);
        onDir(dir);
      }}
      onPointerUp={() => {
        if (center.current) onWait();
        center.current = false;
        setLit(null);
        onDir(null);
      }}
      onPointerCancel={() => {
        center.current = false;
        setLit(null);
        onDir(null);
      }}
    >
      <i data-d="n" className={lit === "N" ? "on" : ""} />
      <i data-d="e" className={lit === "E" ? "on" : ""} />
      <i data-d="s" className={lit === "S" ? "on" : ""} />
      <i data-d="w" className={lit === "W" ? "on" : ""} />
    </div>
  );
}

function FireButton({ arrows, max, onFire }: { arrows: number; max: number; onFire: (dir?: Dir) => void }) {
  const start = useRef<{ x: number; y: number } | null>(null);
  return (
    <button
      type="button"
      className={`orb fire ${arrows === 0 ? "spent" : ""}`}
      aria-label="Fire arrow. Drag to aim a direction."
      onPointerDown={(e) => {
        e.preventDefault();
        start.current = { x: e.clientX, y: e.clientY };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerUp={(e) => {
        if (!start.current) return;
        const dx = e.clientX - start.current.x;
        const dy = e.clientY - start.current.y;
        start.current = null;
        if (Math.hypot(dx, dy) > 18) onFire(dirFromDelta(dx, dy));
        else onFire();
      }}
    >
      <span>FIRE</span>
      <span className="mini">
        {arrows}/{max}
      </span>
    </button>
  );
}

function Initials({ onConfirm }: { onConfirm: (name: string) => void }) {
  const [chars, setChars] = useState(() => loadInitials().split(""));
  const [idx, setIdx] = useState(0);
  const charsRef = useRef(chars);
  charsRef.current = chars;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (/^[a-zA-Z]$/.test(e.key)) {
        e.preventDefault();
        e.stopPropagation();
        const letter = e.key.toUpperCase();
        setChars((curr) => {
          const next = [...curr];
          next[idx] = letter;
          return next;
        });
        setIdx((i) => Math.min(2, i + 1));
        return;
      }
      if (e.key === "Backspace") {
        e.preventDefault();
        setIdx((i) => Math.max(0, i - 1));
        return;
      }
      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();
        const delta = e.key === "ArrowUp" ? 1 : -1;
        setChars((curr) => {
          const next = [...curr];
          const code = (next[idx] ?? "A").charCodeAt(0) - 65;
          next[idx] = String.fromCharCode(((code + delta + 26) % 26) + 65);
          return next;
        });
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        setIdx((i) => Math.min(2, i + 1));
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setIdx((i) => Math.max(0, i - 1));
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        onConfirm(charsRef.current.join(""));
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [idx, onConfirm]);

  return (
    <div className="initials" data-capture="true">
      {chars.map((ch, i) => (
        <button
          key={i}
          type="button"
          className={`letter ${i === idx ? "active" : ""}`}
          onClick={() => {
            setIdx(i);
            setChars((curr) => {
              const next = [...curr];
              const code = next[i]!.charCodeAt(0) - 65;
              next[i] = String.fromCharCode(((code + 1) % 26) + 65);
              return next;
            });
          }}
        >
          {ch}
        </button>
      ))}
    </div>
  );
}

export default function App() {
  const gameRef = useRef<Game | null>(null);
  if (!gameRef.current) gameRef.current = createGame();
  const [snap, setSnap] = useState<Snap>(() => takeSnap(gameRef.current!));
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const ptr = useRef<{ x: number; y: number } | null>(null);

  const publish = (game: Game) => {
    game.uiDirty = false;
    setSnap(takeSnap(game));
  };

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      const game = gameRef.current;
      if (!game) return;
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      update(game, dt);
      const canvas = canvasRef.current;
      const wrap = wrapRef.current;
      if (canvas && wrap) {
        const w = wrap.clientWidth;
        const h = wrap.clientHeight;
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        const bw = Math.max(1, Math.floor(w * dpr));
        const bh = Math.max(1, Math.floor(h * dpr));
        if (canvas.width !== bw || canvas.height !== bh) {
          canvas.width = bw;
          canvas.height = bh;
        }
        const ctx = canvas.getContext("2d");
        if (ctx && w > 0 && h > 0) renderFrame(ctx, game, w, h, dpr);
      }
      if (game.uiDirty) {
        game.uiDirty = false;
        setSnap(takeSnap(game));
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    const onVis = () => {
      const game = gameRef.current;
      if (document.hidden && game?.phase === "playing") {
        pause(game);
        setSnap(takeSnap(game));
      }
    };
    const onBlur = () => {
      const game = gameRef.current;
      if (!game) return;
      game.keys.clear();
      game.touchDir = null;
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("blur", onBlur);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      const game = gameRef.current;
      if (!game) return;
      if (e.target instanceof HTMLElement && e.target.closest("input, textarea, [data-capture]")) return;
      unlock();
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) e.preventDefault();

      if (e.code === "KeyM" && !e.repeat && game.phase !== "gameover") {
        toggleMute(game);
        publish(game);
        return;
      }
      if (game.phase === "menu") {
        if ((e.code === "Enter" || e.code === "Space") && !e.repeat) {
          e.preventDefault();
          sfx.ui();
          startRun(game);
          publish(game);
        } else if (e.code === "KeyR" && !e.repeat) {
          reshuffle(game);
          publish(game);
        }
        return;
      }
      if (game.phase === "paused") {
        if (["KeyP", "Escape", "Enter"].includes(e.code) && !e.repeat) {
          e.preventDefault();
          resume(game);
          publish(game);
        } else if (e.code === "KeyR" && !e.repeat) {
          restart(game);
          publish(game);
        }
        return;
      }
      if (game.phase === "floorclear") {
        if (e.code === "Enter" && !e.repeat) {
          e.preventDefault();
          sfx.ui();
          delve(game);
          publish(game);
        } else if (e.code === "Escape" && !e.repeat) {
          retire(game);
          publish(game);
        }
        return;
      }
      if (game.phase === "gameover") {
        if (game.qualifies && !game.saved) return;
        if ((e.code === "Enter" || e.code === "KeyR") && !e.repeat) {
          e.preventDefault();
          restart(game);
          publish(game);
        }
        return;
      }
      if (game.phase !== "playing") return;
      if ((e.code === "KeyP" || e.code === "Escape") && !e.repeat) {
        e.preventDefault();
        pause(game);
        publish(game);
        return;
      }
      if (e.shiftKey && isDirCode(e.code) && !e.repeat) {
        e.preventDefault();
        requestShoot(game, dirFromCode(e.code));
        return;
      }
      if (isDirCode(e.code)) {
        e.preventDefault();
        game.keys.add(e.code);
        if (!e.repeat) game.impulse = dirFromCode(e.code);
        return;
      }
      if ((e.code === "Space" || e.code === "KeyF") && !e.repeat) {
        e.preventDefault();
        requestShoot(game);
      } else if ((e.code === "KeyE" || e.code === "Enter" || e.code === "KeyC") && !e.repeat) {
        e.preventDefault();
        requestClimb(game);
      } else if (e.code === "KeyQ" && !e.repeat) {
        e.preventDefault();
        requestWait(game);
      }
    };
    const onUp = (e: KeyboardEvent) => {
      gameRef.current?.keys.delete(e.code);
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, []);

  const act = (fn: (game: Game) => void) => () => {
    const game = gameRef.current;
    if (!game) return;
    unlock();
    sfx.ui();
    fn(game);
    publish(game);
  };

  const cellFromEvent = (e: { clientX: number; clientY: number }) => {
    const game = gameRef.current;
    const canvas = canvasRef.current;
    if (!game || !canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const view = game.view;
    if (view.cell <= 0) return null;
    return {
      x: Math.floor((x - view.ox) / view.cell),
      y: Math.floor((y - view.oy) / view.cell),
    };
  };

  const beast =
    snap.wumpusAlive === 0 ? "Slain" : snap.wumpusAwake ? `Hunting · ${snap.wumpusAlive}` : "Asleep";
  const expedition = (snap.seed % 9000) + 1000;

  return (
    <div className="shell" data-phase={snap.phase}>
      <aside className="panel">
        <div className="panel-inner">
          <header className="brand">
            <img className="portrait" src={explorerArt} alt="" />
            <div>
              <p className="kicker">Expedition #{expedition}</p>
              <h1 className="logo">
                Hunt the
                <br />
                Wumpus
              </h1>
            </div>
          </header>
          {snap.phase === "menu" ? (
            <>
              <p className="deck">
                One lantern. One rope. <em>Too few arrows.</em> The Maw is wet stone and bad air. Pits breathe
                cold. The beast smells like a grave. Pocket the gold and climb — or stay, and be the meal.
              </p>
              <div className="btn-row">
                <button type="button" className="btn-gold pulse" onClick={act(startRun)}>
                  Descend
                </button>
                <button type="button" className="btn-ghost" onClick={act(reshuffle)}>
                  Another cave
                </button>
                <button type="button" className="icon-btn" onClick={act(toggleMute)} aria-label={snap.muted ? "Unmute" : "Mute"}>
                  <SoundIcon off={snap.muted} />
                </button>
              </div>
              <Rules />
              <p className="keys">WASD move · Space fire · Shift+direction aim · E climb · Q wait · P pause · tap a room</p>
              <p className="section-label">Ledger</p>
              <Ledger rows={snap.scores} />
              <p className="footnote">After Gregory Yob, 1973 — and the caves that kept the name.</p>
            </>
          ) : (
            <>
              <div className="play-stats">
                <div className="stat">
                  <span>Depth</span>
                  <strong>{roman(snap.depth)}</strong>
                </div>
                <div className="stat">
                  <span>Purse</span>
                  <strong>{fmt(snap.score)}</strong>
                </div>
                <div className="stat">
                  <span>Arrows</span>
                  <strong>
                    {snap.arrows}/{snap.arrowsMax}
                  </strong>
                </div>
                <div className="stat">
                  <span>Gold</span>
                  <strong>{snap.gold}</strong>
                </div>
                <div className="stat">
                  <span>The Maw</span>
                  <strong style={{ fontSize: 16 }}>{beast}</strong>
                </div>
                <div className="stat">
                  <span>Steps</span>
                  <strong>{snap.steps}</strong>
                </div>
              </div>
              <p className="section-label">The lantern says</p>
              <Chips snap={snap} />
              <p className="deck">{snap.message}</p>
              {snap.hint ? <p className="keys">{snap.hint}</p> : null}
              <p className="keys">WASD · Space fire · Shift+aim · E climb · Q wait · P pause</p>
              <div className="btn-row">
                {snap.phase === "playing" || snap.phase === "dying" ? (
                  <button type="button" className="btn-ghost" onClick={act(pause)}>
                    Pause
                  </button>
                ) : null}
                <button type="button" className="icon-btn" onClick={act(toggleMute)} aria-label={snap.muted ? "Unmute" : "Mute"}>
                  <SoundIcon off={snap.muted} />
                </button>
              </div>
              <p className="section-label">Legends</p>
              <Ledger rows={snap.scores.slice(0, 5)} highlight={snap.lastSavedAt} />
            </>
          )}
        </div>
      </aside>

      <div className="stage-col">
        <div
          className={`stage ${snap.phase === "playing" && snap.percepts.stench ? "danger" : ""} ${
            snap.phase === "playing" && snap.percepts.breeze && !snap.percepts.stench ? "breeze" : ""
          }`}
          ref={wrapRef}
        >
          <canvas
            ref={canvasRef}
            onContextMenu={(e) => e.preventDefault()}
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              ptr.current = { x: e.clientX, y: e.clientY };
            }}
            onPointerMove={(e) => {
              const game = gameRef.current;
              if (!game) return;
              const cell = cellFromEvent(e);
              if (cell && game.phase === "playing") setHover(game, cell.x, cell.y);
              else setHover(game, null);
            }}
            onPointerLeave={() => {
              if (gameRef.current) setHover(gameRef.current, null);
            }}
            onPointerUp={(e) => {
              const start = ptr.current;
              ptr.current = null;
              const game = gameRef.current;
              if (!start || !game || game.phase !== "playing") return;
              const dx = e.clientX - start.x;
              const dy = e.clientY - start.y;
              const dist = Math.hypot(dx, dy);
              if (dist > 34) {
                game.impulse = dirFromDelta(dx, dy);
                return;
              }
              if (dist > 14) return;
              const cell = cellFromEvent(e);
              if (cell) tapCell(game, cell.x, cell.y);
            }}
          />
          <header className="float-hud">
            <div className="plaque">
              <span>Depth</span>
              <strong>{roman(snap.depth)}</strong>
            </div>
            <div className={`score-read ${snap.score ? "pop" : ""}`} key={snap.score}>
              {fmt(snap.score)}
            </div>
            <div className="hud-meta">
              <span>➶ {snap.arrows}</span>
              <span>◈ {snap.gold}</span>
            </div>
            <button type="button" className="icon-btn" onClick={act(pause)} aria-label="Pause">
              <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
                <path d="M7 5h3v14H7zM14 5h3v14h-3z" fill="currentColor" />
              </svg>
            </button>
            <button type="button" className="icon-btn" onClick={act(toggleMute)} aria-label={snap.muted ? "Unmute" : "Mute"}>
              <SoundIcon off={snap.muted} />
            </button>
          </header>
        </div>
        <div className="journal">
          <Chips snap={snap} />
          <p>{snap.hint || snap.message}</p>
        </div>
        <div className="touchbar">
          <FireButton
            arrows={snap.arrows}
            max={snap.arrowsMax}
            onFire={(dir) => {
              const game = gameRef.current;
              if (!game) return;
              unlock();
              requestShoot(game, dir);
            }}
          />
          <DPad
            onDir={(dir) => {
              const game = gameRef.current;
              if (game) pressDir(game, dir);
            }}
            onWait={() => {
              const game = gameRef.current;
              if (!game) return;
              unlock();
              requestWait(game);
            }}
          />
          <button
            type="button"
            className={`orb climb ${snap.onRope && (snap.goldFloor > 0 || snap.killsFloor > 0 || snap.wumpusAwake) ? "hot" : ""}`}
            onClick={() => {
              const game = gameRef.current;
              if (!game) return;
              unlock();
              const ready = snap.onRope && (snap.goldFloor > 0 || snap.killsFloor > 0 || snap.wumpusAwake);
              if (ready) requestClimb(game);
              else requestWait(game);
            }}
          >
            {snap.onRope && (snap.goldFloor > 0 || snap.killsFloor > 0 || snap.wumpusAwake) ? "CLIMB" : "WAIT"}
          </button>
          <div className="touch-note">Drag fire to aim · center pad waits · tap a room</div>
        </div>
      </div>

      <p className="sr" aria-live="polite">
        {snap.message}
      </p>

      {snap.phase === "paused" && (
        <div className="overlay">
          <div className="card">
            <MawMark />
            <h2 className="epitaph">Lantern dimmed</h2>
            <p className="cause">The cave holds its breath. Nothing hunts while you read.</p>
            <Rules />
            <p className="keys">WASD move · Space fire · Shift+direction shoots that way · E climb · Q wait</p>
            <div className="btn-row">
              <button type="button" className="btn-gold" onClick={act(resume)}>
                Resume
              </button>
              <button type="button" className="btn-ghost" onClick={act(restart)}>
                Restart run
              </button>
              <button type="button" className="btn-ghost" onClick={act(toggleMute)}>
                {snap.muted ? "Sound on" : "Mute"}
              </button>
            </div>
          </div>
        </div>
      )}

      {snap.phase === "floorclear" && (
        <div className="overlay">
          <div className="card">
            <img className="card-hero" src={heroArt} alt="" />
            <p className="kicker">Depth {roman(snap.depth)} cleared</p>
            <h2 className="epitaph">{snap.clean ? "A silent floor" : "The rope holds"}</h2>
            <p className="cause">{snap.bonusDetail}</p>
            <div className="score-hero">+{fmt(snap.lastBonus)}</div>
            <p className="breakdown">
              <span>Purse {fmt(snap.score)}</span>
              <span>Gold {snap.gold}</span>
              <span>Slain {snap.kills}</span>
            </p>
            <div className="btn-row">
              <button type="button" className="btn-gold wide" onClick={act(delve)}>
                Delve deeper
              </button>
              <button type="button" className="btn-ghost wide" onClick={act(retire)}>
                Retire with the gold
              </button>
            </div>
          </div>
        </div>
      )}

      {snap.phase === "gameover" && (
        <div className="overlay">
          <div className="card">
            <img
              className="card-hero"
              src={
                snap.victory || snap.cause.includes("flee")
                  ? explorerArt
                  : snap.cause.includes("shaft")
                    ? heroArt
                    : wumpusArt
              }
              alt=""
            />
            {snap.qualifies && !snap.saved ? <div className="stamp">NEW MARK</div> : null}
            <h2 className="epitaph">
              {snap.victory ? "Out of the Maw" : snap.cause.includes("shaft") ? "A long fall" : snap.cause.includes("flee") ? "Empty-handed" : "Devoured"}
            </h2>
            <p className="cause">{snap.cause}</p>
            <div className="score-hero">{fmt(snap.score)}</div>
            <p className="breakdown">
              <span>Depth {roman(snap.depth)}</span>
              <span>{snap.gold} gold</span>
              <span>{snap.kills} slain</span>
              <span>{snap.steps} steps</span>
            </p>
            {snap.qualifies && !snap.saved ? (
              <>
                <p className="keys">Carve three letters. Arrows cycle, keys type, Enter saves.</p>
                <Initials
                  onConfirm={(name) => {
                    const game = gameRef.current;
                    if (!game) return;
                    commitScore(game, name);
                    restart(game);
                    publish(game);
                  }}
                />
                <div className="btn-row">
                  <button
                    type="button"
                    className="btn-gold wide"
                    onClick={() => {
                      const game = gameRef.current;
                      if (!game) return;
                      const letters = document.querySelectorAll<HTMLButtonElement>(".letter");
                      const name = Array.from(letters)
                        .map((b) => b.textContent || "A")
                        .join("");
                      commitScore(game, name);
                      restart(game);
                      publish(game);
                    }}
                  >
                    Save & descend again
                  </button>
                  <button type="button" className="btn-ghost wide" onClick={act(restart)}>
                    Skip the ledger
                  </button>
                </div>
              </>
            ) : (
              <div className="btn-row">
                <button type="button" className="btn-gold wide" onClick={act(restart)}>
                  Descend again
                </button>
                <button type="button" className="btn-ghost wide" onClick={act(camp)}>
                  Return to camp
                </button>
              </div>
            )}
            <p className="section-label">Ledger</p>
            <Ledger rows={snap.scores} highlight={snap.lastSavedAt} />
          </div>
        </div>
      )}
    </div>
  );
}
