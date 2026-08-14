"use client";

import { useEffect, useRef, useState } from "react";

const SIZE = 8;
const TYPES = ["berry", "lemon", "leaf", "grape", "peach", "drop"] as const;
type GemType = (typeof TYPES)[number];
type Special = "line" | "rainbow";
type Gem = { id: number; type: GemType; special?: Special };
type DragState = { index: number; x: number; y: number; pointerId: number };
const ICONS: Record<GemType, string> = { berry: "●", lemon: "◆", leaf: "♠", grape: "✦", peach: "♥", drop: "⬟" };
const LABELS: Record<GemType, string> = { berry: "莓果", lemon: "柠檬", leaf: "叶子", grape: "葡萄", peach: "蜜桃", drop: "露珠" };
let nextId = 1;
const gem = (type = TYPES[Math.floor(Math.random() * TYPES.length)]): Gem => ({ id: nextId++, type });
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function makeBoard() {
  const board: Gem[] = [];
  for (let i = 0; i < SIZE * SIZE; i++) {
    const blocked = new Set<GemType>();
    if (i % SIZE >= 2 && board[i - 1].type === board[i - 2].type) blocked.add(board[i - 1].type);
    if (i >= SIZE * 2 && board[i - SIZE].type === board[i - SIZE * 2].type) blocked.add(board[i - SIZE].type);
    const options = TYPES.filter((type) => !blocked.has(type));
    board.push(gem(options[Math.floor(Math.random() * options.length)]));
  }
  return board;
}

function groups(board: Gem[]) {
  const found: number[][] = [];
  for (let row = 0; row < SIZE; row++) {
    let start = 0;
    for (let col = 1; col <= SIZE; col++) {
      const same = col < SIZE && board[row * SIZE + col]?.type === board[row * SIZE + start]?.type;
      if (!same) {
        if (col - start >= 3) found.push(Array.from({ length: col - start }, (_, k) => row * SIZE + start + k));
        start = col;
      }
    }
  }
  for (let col = 0; col < SIZE; col++) {
    let start = 0;
    for (let row = 1; row <= SIZE; row++) {
      const same = row < SIZE && board[row * SIZE + col]?.type === board[start * SIZE + col]?.type;
      if (!same) {
        if (row - start >= 3) found.push(Array.from({ length: row - start }, (_, k) => (start + k) * SIZE + col));
        start = row;
      }
    }
  }
  return found;
}

function adjacent(a: number, b: number) {
  const ar = Math.floor(a / SIZE), ac = a % SIZE, br = Math.floor(b / SIZE), bc = b % SIZE;
  return Math.abs(ar - br) + Math.abs(ac - bc) === 1;
}

function collapse(board: (Gem | null)[]) {
  const next = [...board];
  for (let col = 0; col < SIZE; col++) {
    const kept: Gem[] = [];
    for (let row = SIZE - 1; row >= 0; row--) {
      const item = next[row * SIZE + col];
      if (item) kept.push(item);
    }
    for (let row = SIZE - 1; row >= 0; row--) next[row * SIZE + col] = kept[SIZE - 1 - row] ?? gem();
  }
  return next as Gem[];
}

export default function Home() {
  const [board, setBoard] = useState<Gem[]>(() => makeBoard());
  const [selected, setSelected] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [moves, setMoves] = useState(24);
  const [combo, setCombo] = useState(0);
  const [message, setMessage] = useState("交换相邻精灵，连成 3 个或更多");
  const [status, setStatus] = useState<"playing" | "won" | "lost">("playing");
  const [muted, setMuted] = useState(false);
  const [best, setBest] = useState(0);
  const [dragging, setDragging] = useState<number | null>(null);
  const busy = useRef(false);
  const scoreRef = useRef(0);
  const movesRef = useRef(24);
  const audioRef = useRef<AudioContext | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const suppressClick = useRef(false);

  useEffect(() => setBest(Number(localStorage.getItem("forest-pop-best") || 0)), []);

  const ensureAudio = () => {
    try {
      const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) return null;
      if (!audioRef.current || audioRef.current.state === "closed") audioRef.current = new AudioContextClass();
      const ctx = audioRef.current;
      if (ctx.state === "suspended") void ctx.resume();
      return ctx;
    } catch {
      return null;
    }
  };

  const sound = (frequency: number, duration = 0.08) => {
    if (muted) return;
    const ctx = ensureAudio();
    if (!ctx) return;
    const play = () => {
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(frequency, ctx.currentTime);
      gain.gain.setValueAtTime(0.09, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(); osc.stop(ctx.currentTime + duration);
    };
    if (ctx.state === "running") play();
    else void ctx.resume().then(play).catch(() => undefined);
  };
  const finish = (finalScore: number, remaining: number) => {
    if (finalScore >= 3200) { setStatus("won"); setMessage("森林重新亮起来了！"); sound(720, 0.35); }
    else if (remaining <= 0) { setStatus("lost"); setMessage("差一点！再来一局吧"); }
    if (finalScore > best) { setBest(finalScore); localStorage.setItem("forest-pop-best", String(finalScore)); }
  };

  const resolveBoard = async (initial: Gem[]) => {
    let current = initial, chain = 0, gained = 0;
    while (true) {
      const matched = groups(current);
      if (!matched.length) break;
      chain++;
      const clear = new Set(matched.flat());
      const specialAt = new Map<number, Special>();
      for (const match of matched) {
        if (match.length >= 4) {
          const pivot = match[Math.floor(match.length / 2)];
          clear.delete(pivot);
          specialAt.set(pivot, match.length >= 5 ? "rainbow" : "line");
        }
      }
      for (const index of [...clear]) {
        const item = current[index];
        if (item?.special === "line") {
          const row = Math.floor(index / SIZE), col = index % SIZE;
          for (let x = 0; x < SIZE; x++) { clear.add(row * SIZE + x); clear.add(x * SIZE + col); }
        }
        if (item?.special === "rainbow") current.forEach((g, i) => { if (g.type === item.type) clear.add(i); });
      }
      const marked = current.map((item, i) => specialAt.has(i) ? { ...item, special: specialAt.get(i) } : item);
      setBoard(marked); setCombo(chain); setMessage(chain > 1 ? `${chain} 连击！森林能量暴涨` : `消除了 ${clear.size} 个精灵`);
      sound(300 + chain * 110); await wait(210);
      const empty: (Gem | null)[] = marked.map((item, i) => clear.has(i) ? null : item);
      setBoard(empty.map((item, i) => item ?? { id: -(i + 1), type: "berry" as GemType })); await wait(120);
      current = collapse(empty); setBoard(current); gained += clear.size * 70 * chain; await wait(230);
    }
    const finalScore = scoreRef.current + gained;
    scoreRef.current = finalScore; setScore(finalScore); setCombo(0);
    if (gained) setMessage(`+${gained} 分 · 继续加油！`);
    finish(finalScore, movesRef.current);
  };

  const attemptSwap = async (from: number, to: number) => {
    if (busy.current || status !== "playing" || !adjacent(from, to)) return;
    busy.current = true;
    setSelected(null);
    const swapped = [...board];
    [swapped[from], swapped[to]] = [swapped[to], swapped[from]];
    setBoard(swapped); sound(250, 0.05); await wait(170);
    if (!groups(swapped).length) {
      setMessage("这一步还不能消除，换个方向试试"); sound(120, 0.12);
      setBoard(board); await wait(180); busy.current = false; return;
    }
    const left = movesRef.current - 1;
    movesRef.current = left; setMoves(left);
    await resolveBoard(swapped); busy.current = false;
  };

  const choose = async (index: number) => {
    if (busy.current || status !== "playing") return;
    ensureAudio();
    if (selected === null) { setSelected(index); sound(220, 0.04); return; }
    if (selected === index) { setSelected(null); return; }
    if (!adjacent(selected, index)) { setSelected(index); sound(220, 0.04); return; }
    await attemptSwap(selected, index);
  };

  const startDrag = (index: number, event: React.PointerEvent<HTMLButtonElement>) => {
    if (busy.current || status !== "playing") return;
    ensureAudio();
    dragRef.current = { index, x: event.clientX, y: event.clientY, pointerId: event.pointerId };
    setDragging(index);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const endDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    dragRef.current = null;
    setDragging(null);
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 18) return;
    suppressClick.current = true;
    const row = Math.floor(drag.index / SIZE), col = drag.index % SIZE;
    let target = drag.index;
    if (Math.abs(dx) > Math.abs(dy)) {
      if (dx > 0 && col < SIZE - 1) target++;
      else if (dx < 0 && col > 0) target--;
    } else {
      if (dy > 0 && row < SIZE - 1) target += SIZE;
      else if (dy < 0 && row > 0) target -= SIZE;
    }
    if (target !== drag.index) void attemptSwap(drag.index, target);
    else sound(120, 0.08);
  };

  const cancelDrag = () => {
    dragRef.current = null;
    setDragging(null);
  };
  const restart = () => {
    scoreRef.current = 0; movesRef.current = 24; busy.current = false;
    setBoard(makeBoard()); setScore(0); setMoves(24); setSelected(null); setCombo(0);
    setStatus("playing"); setMessage("新的一局，点亮整片森林吧！");
  };

  const progress = Math.min(100, (score / 3200) * 100);
  return (
    <main className="game-shell">
      <div className="forest-glow glow-one" /><div className="forest-glow glow-two" />
      <header className="topbar">
        <div className="brand"><span className="brand-mark">✦</span><div><h1>森灵消消乐</h1><p>FOREST POP</p></div></div>
        <div className="top-actions"><span className="best">最佳 {best.toLocaleString()}</span><button className="icon-button" onClick={() => { const next = !muted; setMuted(next); if (!next) ensureAudio(); }} aria-label={muted ? "打开声音" : "关闭声音"}>{muted ? "♩" : "♪"}</button></div>
      </header>
      <section className="game-layout">
        <aside className="mission-card">
          <div className="chapter">第 1 关</div><h2>唤醒萤光林</h2><p>收集森林能量，让沉睡的古树重新发光。</p>
          <div className="goal-row"><span>目标分数</span><strong>3,200</strong></div>
          <div className="progress-track"><i style={{ width: `${progress}%` }} /></div>
          <div className="score-display"><small>当前分数</small><b>{score.toLocaleString()}</b></div>
          <div className="tip"><span>✦</span><p><strong>连击秘诀</strong><br />一次连成 4 个会生成十字萤光，5 个则生成彩虹萤光。</p></div>
        </aside>
        <div className="board-wrap">
          <div className="board-head"><div><span className="eyebrow">森林深处</span><h2>{message}</h2></div><div className="moves"><b>{moves}</b><span>剩余步数</span></div></div>
          <div className={`board ${combo > 1 ? "board-combo" : ""}`} role="grid" aria-label="三消游戏棋盘">
            {board.map((item, index) => (
              <button key={item.id} role="gridcell" className={`tile ${selected === index ? "selected" : ""} ${dragging === index ? "dragging" : ""}`} onPointerDown={(event) => startDrag(index, event)} onPointerUp={endDrag} onPointerCancel={cancelDrag} onClick={() => { if (suppressClick.current) { suppressClick.current = false; return; } void choose(index); }} aria-label={`${LABELS[item.type]}${item.special ? "，特殊精灵" : ""}`}>
                <span className={`gem gem-${item.type} ${item.special ? `special-${item.special}` : ""}`}><i>{ICONS[item.type]}</i>{item.special && <em>✦</em>}</span>
              </button>
            ))}
          </div>
          <div className="board-foot"><span><i className="status-dot" /> {status === "playing" ? "关卡进行中" : status === "won" ? "任务完成" : "本局结束"}</span><button onClick={restart}>↻ 重新开始</button></div>
        </div>
      </section>
      {status !== "playing" && <div className="modal-backdrop"><div className="result-card"><span className="result-spark">✦</span><p>{status === "won" ? "关卡完成" : "本局结束"}</p><h2>{status === "won" ? "森林醒来了！" : "再试一次吧"}</h2><strong>{score.toLocaleString()} 分</strong><button onClick={restart}>再玩一局</button></div></div>}
      <footer>原创三消游戏 · 点击或拖动相邻精灵进行交换</footer>
    </main>
  );
}