"use client";

import { useEffect, useRef, useState } from "react";

const SIZE = 8;
const TYPES = ["berry", "lemon", "leaf", "grape", "peach", "drop"] as const;
type GemType = (typeof TYPES)[number];
type Special = "line" | "rainbow";
type Gem = { id: number; type: GemType; special?: Special };
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
  const busy = useRef(false);
  const scoreRef = useRef(0);
  const movesRef = useRef(24);

  useEffect(() => setBest(Number(localStorage.getItem("forest-pop-best") || 0)), []);

  const sound = (frequency: number, duration = 0.08) => {
    if (muted) return;
    try {
      const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioContextClass();
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(0.07, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      osc.connect(gain); gain.connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime + duration);
    } catch { /* audio is optional */ }
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

  const choose = async (index: number) => {
    if (busy.current || status !== "playing") return;
    if (selected === null) { setSelected(index); sound(220, 0.04); return; }
    if (selected === index) { setSelected(null); return; }
    if (!adjacent(selected, index)) { setSelected(index); return; }
    busy.current = true;
    const swapped = [...board];
    [swapped[selected], swapped[index]] = [swapped[index], swapped[selected]];
    setBoard(swapped); setSelected(null); await wait(170);
    if (!groups(swapped).length) {
      setMessage("这一步还不能消除，换个方向试试"); sound(120, 0.12);
      setBoard(board); await wait(180); busy.current = false; return;
    }
    const left = movesRef.current - 1;
    movesRef.current = left; setMoves(left);
    await resolveBoard(swapped); busy.current = false;
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
        <div className="top-actions"><span className="best">最佳 {best.toLocaleString()}</span><button className="icon-button" onClick={() => setMuted(!muted)} aria-label={muted ? "打开声音" : "关闭声音"}>{muted ? "♩" : "♪"}</button></div>
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
              <button key={item.id} role="gridcell" className={`tile ${selected === index ? "selected" : ""}`} onClick={() => choose(index)} aria-label={`${LABELS[item.type]}${item.special ? "，特殊精灵" : ""}`}>
                <span className={`gem gem-${item.type} ${item.special ? `special-${item.special}` : ""}`}><i>{ICONS[item.type]}</i>{item.special && <em>✦</em>}</span>
              </button>
            ))}
          </div>
          <div className="board-foot"><span><i className="status-dot" /> {status === "playing" ? "关卡进行中" : status === "won" ? "任务完成" : "本局结束"}</span><button onClick={restart}>↻ 重新开始</button></div>
        </div>
      </section>
      {status !== "playing" && <div className="modal-backdrop"><div className="result-card"><span className="result-spark">✦</span><p>{status === "won" ? "关卡完成" : "本局结束"}</p><h2>{status === "won" ? "森林醒来了！" : "再试一次吧"}</h2><strong>{score.toLocaleString()} 分</strong><button onClick={restart}>再玩一局</button></div></div>}
      <footer>原创三消游戏 · 点击两个相邻精灵进行交换</footer>
    </main>
  );
}