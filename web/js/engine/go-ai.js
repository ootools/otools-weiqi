/**
 * 围棋电脑对弈 AI（启发式，纯函数、无 DOM 依赖，node 可直接 import / 测试）。
 * ------------------------------------------------------------------
 * 定位：入门陪练 AI——会提子、救棋、打吃、开晶角、不乱填真眼，
 *       但不做深算路，非强棋力。复用 go.js 的棋组/气计算（groupAndLiberties）
 *       与与其 play() 完全一致的合法性语义（占位 / 打劫 / 禁入点-自杀 / 提子后合法），
 *       自身不维护对局状态、不修改入参。
 *
 * chooseMove(gameState, color, opts)
 *   - gameState：GoGame 实例，或快照对象 { board, size, koPoint?, moveNumber?, consecutivePasses? }；
 *   - color：BLACK / WHITE；
 *   - opts.level：'easy' | 'normal' | 'hard'（缺省 'normal'）；opts.seed 可显式固定随机种子；
 *   - 返回 { x, y }（0 基坐标）或 'pass'。
 *
 * 评分项（对每个合法候选点累加，权重见 WEIGHTS）：
 *   ① 提子：提掉对方 1 口气棋组（提后自身有气，由合法性保证）→ +1000 × 提子数；
 *   ② 救棋：己方 1 口气棋组经此手（延长/连接/反提）走出 ≥2 气 → +800 × 该组子数；
 *   ③ 打吃：落子后对方棋组由 ≥2 气变 1 气，且自身 ≥2 气 → +300 × 对方组子数；
 *   ④ 气与联系：落子后己方新组气数加分；正邻己子（长/拆/粘）加分、正邻敌子（碰）小加分；
 *   ⑤ 势力：距离衰减（曼哈顿半径 3，每远一格减半）的黑白影响力图，候选点「己方−对方」增益差计入；
 *   ⑥ 开局（前 12 手）：空角 4-4（星位）/小目（3-4）/3-3 加分，其次三四线边；
 *   ⑦ 禁手项：绝不填自己的真眼（4 正邻全为己色且 ≥3 斜角为己色或边界 → 直接排除）；
 *      无提子受益的自撞气（落子后自身 1 气）按自身组子数减分。
 * 终局：无合法非填眼候选、或（最佳分低于阈值、或棋盘接近下满、或对手已虚手且盘面接近终局
 *       且无大提子棋）且己方棋组均 ≥2 气 → 'pass'（与双 pass 数子流程衔接）。
 *
 * 难度：
 *   easy   = 提子/救棋 + 气/联系基线，前三名随机取一（随机种子取局面哈希 → 同局面结果仍一致）；
 *   normal = 完整启发式；
 *   hard   = 完整启发式 + 对前 8 名候选做 1 层对手最佳回应校验
 *            （提子得失复核：对手下一手可提我方子数 ×1000、可救活其被打吃棋组 ×800，
 *             按 0.7 系数从候选分中扣减）。
 */

import { EMPTY, BLACK, WHITE, groupAndLiberties } from './go.js';

const other = (c) => (c === BLACK ? WHITE : BLACK);
const ORTHO = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const DIAG = [[1, 1], [1, -1], [-1, 1], [-1, -1]];

const OPENING_MOVES = 12;      // 前 12 手启用开局角部/边线加分
const INFLUENCE_RADIUS = 3;    // 势力衰减半径（曼哈顿距离）
const MIN_MOVES_BEFORE_PASS = 6; // 开局若干手内不虚手（兜底）

/** 各难度权重与选择策略 */
const WEIGHTS = {
  easy: {
    capture: 1000, rescue: 800, atari: 0,
    libs: 6, contactOwn: 10, contactOpp: 3,
    influence: 0, opening: false,
    selfAtari: -400, noise: 6,
    randomTop3: true, replyDiscount: 0,
    passThreshold: 14,
  },
  normal: {
    capture: 1000, rescue: 800, atari: 300,
    libs: 5, contactOwn: 8, contactOpp: 3,
    influence: 14, opening: true,
    selfAtari: -350, noise: 0,
    randomTop3: false, replyDiscount: 0,
    passThreshold: 20,
  },
  hard: {
    capture: 1000, rescue: 800, atari: 300,
    libs: 5, contactOwn: 8, contactOpp: 3,
    influence: 14, opening: true,
    selfAtari: -350, noise: 0,
    randomTop3: false, replyDiscount: 0.7, replyTopK: 8,
    passThreshold: 20,
  },
};

/**
 * 选一手棋。
 * @param {import('./go.js').GoGame|{board:Int8Array|number[],size:number,koPoint?:{idx:number,color:number},moveNumber?:number}} gameState
 * @param {number} color BLACK 或 WHITE
 * @param {{level?:'easy'|'normal'|'hard', seed?:number}} [opts]
 * @returns {{x:number,y:number}|'pass'}
 */
export function chooseMove(gameState, color, opts = {}) {
  if (color !== BLACK && color !== WHITE) {
    throw new TypeError('color 必须是 BLACK(1) 或 WHITE(2)');
  }
  const levelName = WEIGHTS[opts.level] ? opts.level : 'normal';
  const w = WEIGHTS[levelName];
  const { board, size, koPoint, moveNumber, consecutivePasses } = normalizeState(gameState);
  const opp = other(color);

  // 随机源：默认以局面哈希为种子 → 同局面同难度结果一致；opts.seed 可显式固定。
  const seed = typeof opts.seed === 'number'
    ? opts.seed >>> 0
    : hashState(board, color, koPoint, moveNumber, levelName);
  const rng = mulberry32(seed);

  const pre = analyzeBoard(board, size);
  const inf = w.influence > 0 ? influenceMaps(board, size) : null;

  const cands = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = y * size + x;
      if (board[idx] !== EMPTY) continue;
      if (isOwnTrueEye(board, size, x, y, color)) continue; // ⑦ 绝不填自己的真眼
      const sim = simulateMove(board, size, koPoint, x, y, color);
      if (!sim.legal) continue;

      let s = 0;
      s += w.capture * sim.capturedCount;                                    // ① 提子
      s += w.rescue * rescuedStones(sim, pre, size, color);                  // ② 救棋
      s += w.atari * newlyAtariedStones(pre, sim.board, size, opp, sim.ownLibs); // ③ 打吃
      s += w.libs * sim.ownLibs;                                             // ④ 气
      const adj = contactCounts(board, size, x, y, color);
      s += w.contactOwn * adj.own + w.contactOpp * adj.opp;                  // ④ 联系
      if (inf) s += w.influence * (inf[color][idx] - inf[opp][idx]);         // ⑤ 势力
      if (w.opening && moveNumber < OPENING_MOVES) {
        s += openingBonus(board, size, x, y);                                // ⑥ 开局
      }
      if (sim.ownLibs <= 1 && sim.capturedCount === 0) {
        s += w.selfAtari * sim.ownSize;                                      // ⑦ 无提子受益的自撞气
      }
      if (w.noise > 0) s += (rng() * 2 - 1) * w.noise;
      cands.push({ x, y, idx, score: s, sim });
    }
  }

  if (cands.length === 0) return 'pass'; // 无合法非填眼候选 → 虚手
  cands.sort((a, b) => b.score - a.score || a.idx - b.idx); // 平分按扫描序稳定排序

  // hard：对前 replyTopK 名候选做 1 层对手最佳回应校验（提子得失复核）
  let best = cands[0];
  let passScore = cands[0].score;
  if (w.replyDiscount > 0) {
    const top = cands.slice(0, Math.min(w.replyTopK, cands.length));
    for (const c of top) {
      c.hardScore = c.score - w.replyDiscount * bestReplyValue(c.sim.board, size, c.sim.ko, color);
    }
    top.sort((a, b) => b.hardScore - a.hardScore || a.idx - b.idx);
    best = top[0];
    passScore = top[0].hardScore;
  }

  // 终局：最佳分低于阈值（或棋盘接近下满/对手已虚手且无大提子棋）且己方棋组均安全 → 虚手
  const empties = countEmpty(board);
  if (moveNumber >= MIN_MOVES_BEFORE_PASS && allGroupsSafe(pre, color)) {
    if (passScore < w.passThreshold) return 'pass';
    if (consecutivePasses >= 1 && passScore < 300) {
      return 'pass'; // 对手已虚手且无大棋 → 一并虚手进入数子
    }
    if (empties <= size && passScore < 300) return 'pass'; // 接近下满且无大棋
  }

  // easy：前三名随机取一（种子来自局面 → 同局面结果一致）
  if (w.randomTop3) {
    const k = Math.min(3, cands.length);
    best = cands[Math.floor(rng() * k)];
  }
  return { x: best.x, y: best.y };
}

// ---------------------------------------------------------------------------
// 局面归一化与基本工具
// ---------------------------------------------------------------------------

/** 接受 GoGame 实例或 { board, size, koPoint?, moveNumber?, consecutivePasses? } 快照。 */
function normalizeState(gameState) {
  if (!gameState || typeof gameState !== 'object') {
    throw new TypeError('gameState 不能为空');
  }
  const size = gameState.size;
  const board = gameState.board;
  if (!Number.isInteger(size) || size <= 0 || !board || board.length !== size * size) {
    throw new TypeError('gameState 需要 { board, size }，且 board 长度 = size²');
  }
  const koPoint = gameState.koPoint && Number.isInteger(gameState.koPoint.idx)
    ? gameState.koPoint
    : null;
  let moveNumber = gameState.moveNumber;
  if (!Number.isFinite(moveNumber) || moveNumber < 0) {
    moveNumber = Array.isArray(gameState.moveList)
      ? gameState.moveList.length
      : countStones(board);
  }
  const consecutivePasses = Number.isFinite(gameState.consecutivePasses)
    ? gameState.consecutivePasses
    : 0;
  return { board, size, koPoint, moveNumber, consecutivePasses };
}

/**
 * 落子模拟：与 go.js GoGame.play() 相同的判定语义。
 * 返回 { legal, reason?, board, captured, capturedCount, ko, ownLibs, ownSize }。
 */
function simulateMove(board, size, koPoint, x, y, color) {
  if (x < 0 || y < 0 || x >= size || y >= size) return { legal: false, reason: 'bounds' };
  const idx = y * size + x;
  if (board[idx] !== EMPTY) return { legal: false, reason: 'occupied' };
  if (koPoint && koPoint.idx === idx && koPoint.color === color) {
    return { legal: false, reason: 'ko' };
  }
  const sim = Int8Array.from(board);
  sim[idx] = color;
  // 先提对方无气棋组（只可能与落点正邻的棋组气尽）
  const captured = [];
  const seen = new Set();
  for (const [dx, dy] of ORTHO) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
    const n = ny * size + nx;
    if (sim[n] !== other(color) || seen.has(n)) continue;
    const g = groupAndLiberties(sim, size, nx, ny);
    for (const st of g.stones) seen.add(st);
    if (g.liberties.length === 0) {
      for (const st of g.stones) {
        sim[st] = EMPTY;
        captured.push(st);
      }
    }
  }
  // 再查自杀（提子后自己有气才合法）
  const own = groupAndLiberties(sim, size, x, y);
  if (own.liberties.length === 0) return { legal: false, reason: 'suicide' };
  const ko = (captured.length === 1 && own.stones.length === 1 && own.liberties.length === 1)
    ? { idx: captured[0], color: other(color) }
    : null;
  return {
    legal: true,
    board: sim,
    captured,
    capturedCount: captured.length,
    ko,
    ownLibs: own.liberties.length,
    ownSize: own.stones.length,
  };
}

/** 一次性求出全盘棋组与「子 → 组」映射。 */
function analyzeBoard(board, size) {
  const groups = [];
  const stoneGroup = new Int32Array(board.length).fill(-1);
  const seen = new Uint8Array(board.length);
  for (let idx = 0; idx < board.length; idx++) {
    if (board[idx] === EMPTY || seen[idx]) continue;
    const g = groupAndLiberties(board, size, idx % size, Math.floor(idx / size));
    const id = groups.length;
    groups.push({ color: board[g.stones[0]], stones: g.stones, libs: g.liberties });
    for (const st of g.stones) {
      seen[st] = 1;
      stoneGroup[st] = id;
    }
  }
  return { groups, stoneGroup };
}

/** ② 救棋：己方 1 口气棋组经此手走出 ≥2 气（延长/连接/反提后均有气）→ 返回获救子数。 */
function rescuedStones(sim, pre, size, color) {
  let stones = 0;
  for (const g of pre.groups) {
    if (g.color !== color || g.libs.length !== 1) continue;
    const s0 = g.stones[0];
    const g2 = groupAndLiberties(sim.board, size, s0 % size, Math.floor(s0 / size));
    if (g2.liberties.length >= 2) stones += g.stones.length;
  }
  return stones;
}

/** ③ 打吃：对方棋组由 ≥2 气变 1 气（新打吃），且自身 ≥2 气 → 返回被打吃子数。 */
function newlyAtariedStones(pre, simBoard, size, opp, ownLibsAfter) {
  if (ownLibsAfter < 2) return 0; // 自身不安全（自撞气打吃通常吃亏）
  const post = analyzeBoard(simBoard, size);
  let stones = 0;
  for (const g of post.groups) {
    if (g.color !== opp || g.libs.length !== 1) continue;
    const preId = pre.stoneGroup[g.stones[0]];
    if (preId >= 0 && pre.groups[preId].libs.length >= 2) stones += g.stones.length;
  }
  return stones;
}

/** ④ 联系：正邻己子 / 正邻敌子计数。 */
function contactCounts(board, size, x, y, color) {
  let own = 0;
  let opp = 0;
  const o = other(color);
  for (const [dx, dy] of ORTHO) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
    const v = board[ny * size + nx];
    if (v === color) own++;
    else if (v === o) opp++;
  }
  return { own, opp };
}

/** ⑦ 真眼判定：4 正邻全为己色（越界视作边界满足）且 ≥3 斜角为己色或边界。 */
function isOwnTrueEye(board, size, x, y, color) {
  let ownOrtho = 0;
  for (const [dx, dy] of ORTHO) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= size || ny >= size) { ownOrtho++; continue; }
    if (board[ny * size + nx] === color) ownOrtho++;
  }
  if (ownOrtho < 4) return false;
  let diagOk = 0;
  for (const [dx, dy] of DIAG) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= size || ny >= size) { diagOk++; continue; }
    if (board[ny * size + nx] === color) diagOk++;
  }
  return diagOk >= 3;
}

/** ⑤ 势力：距离衰减影响力图（曼哈顿距离 ≤3，每远一格贡献减半）。 */
function influenceMaps(board, size) {
  const maps = {
    [BLACK]: new Float64Array(size * size),
    [WHITE]: new Float64Array(size * size),
  };
  for (let idx = 0; idx < board.length; idx++) {
    const c = board[idx];
    if (c !== BLACK && c !== WHITE) continue;
    const x = idx % size;
    const y = Math.floor(idx / size);
    const map = maps[c];
    for (let dy = -INFLUENCE_RADIUS; dy <= INFLUENCE_RADIUS; dy++) {
      const ny = y + dy;
      if (ny < 0 || ny >= size) continue;
      for (let dx = -INFLUENCE_RADIUS; dx <= INFLUENCE_RADIUS; dx++) {
        const d = Math.abs(dx) + Math.abs(dy);
        if (d === 0 || d > INFLUENCE_RADIUS) continue;
        const nx = x + dx;
        if (nx < 0 || nx >= size) continue;
        map[ny * size + nx] += 1 / Math.pow(2, d - 1); // d=1 → 1, d=2 → 0.5, d=3 → 0.25
      }
    }
  }
  return maps;
}

/** ⑥ 开局加分：空角 4-4（星位）/小目（3-4）/3-3，其次三四线边。 */
function openingBonus(board, size, x, y) {
  const c3 = 2, c4 = 3; // 0 基的第 3、4 线
  const edgeDist = (v) => (v * 2 < size - 1 ? v : size - 1 - v);
  const nx = edgeDist(x);
  const ny = edgeDist(y);

  if (nx <= c4 && ny <= c4) {
    // 所属角部方盒（(c4+2)×(c4+2)）内无子才算「空角」
    const span = c4 + 2;
    const highX = x * 2 > size - 1;
    const highY = y * 2 > size - 1;
    let emptyCorner = true;
    for (let i = 0; i < span && emptyCorner; i++) {
      for (let j = 0; j < span; j++) {
        const px = highX ? size - 1 - i : i;
        const py = highY ? size - 1 - j : j;
        if (board[py * size + px] !== EMPTY) { emptyCorner = false; break; }
      }
    }
    if (emptyCorner) {
      const lo = Math.min(nx, ny);
      const hi = Math.max(nx, ny);
      if (lo === c4 && hi === c4) return 105; // 4-4（星位）
      if (lo === c3 && hi === c4) return 100; // 小目（3-4）
      if (lo === c3 && hi === c3) return 95;  // 3-3
    }
  }
  // 其次边：三四线且不贴一二线
  const onSide = (a, b) => ((a === 2 || a === 3) && b >= 2) || ((b === 2 || b === 3) && a >= 2);
  if (onSide(nx, ny)) return 30;
  return 0;
}

/**
 * hard 专用：对手最佳回应的战术价值（提子得失复核）——
 * 对手下一手可提掉的己方子数 ×1000、可救活的其自身被打吃棋组 ×800 的最大值。
 */
function bestReplyValue(board, size, koPoint, victimColor) {
  const attacker = other(victimColor);
  const post = analyzeBoard(board, size);
  let best = 0;
  const simAt = (x, y) => simulateMove(board, size, koPoint, x, y, attacker);
  for (const g of post.groups) {
    if (g.color === victimColor && g.libs.length === 1) {
      // 对手提子：填我方 1 口气棋组的气
      const lx = g.liberties[0] % size;
      const ly = Math.floor(g.liberties[0] / size);
      const s2 = simAt(lx, ly);
      if (s2.legal && s2.capturedCount > 0) {
        best = Math.max(best, 1000 * s2.capturedCount);
      }
    } else if (g.color === attacker && g.libs.length === 1) {
      // 对手救棋：在其 1 口气棋组的邻空点落子（含反提），走出 ≥2 气
      for (const p of adjacentEmpties(board, size, g.stones)) {
        const px = p % size;
        const py = Math.floor(p / size);
        const s2 = simAt(px, py);
        if (!s2.legal) continue;
        const s0 = g.stones[0];
        const g2 = groupAndLiberties(s2.board, size, s0 % size, Math.floor(s0 / size));
        if (g2.liberties.length >= 2) {
          best = Math.max(best, 800 * g.stones.length);
        }
      }
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// 小工具
// ---------------------------------------------------------------------------

function adjacentEmpties(board, size, stones) {
  const out = [];
  const seen = new Set();
  for (const idx of stones) {
    const x = idx % size;
    const y = Math.floor(idx / size);
    for (const [dx, dy] of ORTHO) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
      const n = ny * size + nx;
      if (board[n] === EMPTY && !seen.has(n)) {
        seen.add(n);
        out.push(n);
      }
    }
  }
  return out;
}

/** 己方所有棋组是否都 ≥2 气（pass 判定中的「均安全」）。 */
function allGroupsSafe(pre, color) {
  for (const g of pre.groups) {
    if (g.color === color && g.libs.length < 2) return false;
  }
  return true;
}

function countEmpty(board) {
  let n = 0;
  for (let i = 0; i < board.length; i++) if (board[i] === EMPTY) n++;
  return n;
}

function countStones(board) {
  let n = 0;
  for (let i = 0; i < board.length; i++) if (board[i] !== EMPTY) n++;
  return n;
}

/** FNV-1a 局面哈希（棋盘 + 行棋方 + 劫点 + 手数 + 难度）→ 确定性随机种子。 */
function hashState(board, color, koPoint, moveNumber, levelName) {
  let h = 0x811c9dc5;
  const mix = (v) => {
    h ^= v & 0xff;
    h = Math.imul(h, 0x01000193) >>> 0;
  };
  for (let i = 0; i < board.length; i++) mix(board[i]);
  mix(color);
  mix(moveNumber & 0xff);
  mix((moveNumber >> 8) & 0xff);
  mix(koPoint ? (koPoint.idx & 0xff) : 0xff);
  for (let i = 0; i < levelName.length; i++) mix(levelName.charCodeAt(i));
  return h >>> 0;
}

/** mulberry32：小型确定性 PRNG。 */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
