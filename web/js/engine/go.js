/**
 * 围棋规则引擎（纯函数、无 DOM 依赖，node 可直接 import / 测试）。
 * ------------------------------------------------------------------
 * 规则（中国规则 · 数子法）：
 *  - 提子：无气棋组整体提掉；
 *  - 禁入点（自杀）非法，但提子后自己有气的点合法（打吃提子）；
 *  - 打劫：简单劫——禁止立即回提形成上一手前局面（记录上一手单提点）；
 *  - pass；双方连续 pass → 进入死子标记阶段 → 数子法计算胜负；
 *  - 贴目 7.5（默认）/ 6.5 / 5.5 / 0；让子棋 2~9 子（星位摆放，白先行，黑贴 0）。
 */

export const EMPTY = 0;
export const BLACK = 1;
export const WHITE = 2;

/** 星位（坐标 [x, y]，x 向右、y 向下，均从 0 起） */
export const HOSHI = {
  9: [
    [2, 2], [6, 2], [4, 4], [2, 6], [6, 6],
  ],
  13: [
    [3, 3], [9, 3], [6, 6], [3, 9], [9, 9],
  ],
  19: [
    [3, 3], [9, 3], [15, 3], [3, 9], [9, 9], [15, 9], [3, 15], [9, 15], [15, 15],
  ],
};

/**
 * 让子棋星位摆放顺序（常规约定）：
 * 2 子 = 右上 + 左下；3 子加右下；4 子四角；5 子加天元；
 * 6 子加左/右边星；7 子再加天元；8 子上下边星；9 子全星位。
 */
export const HANDICAP_POINTS = {
  9: {
    2: [[6, 2], [2, 6]],
    3: [[6, 2], [2, 6], [6, 6]],
    4: [[6, 2], [2, 6], [6, 6], [2, 2]],
    5: [[6, 2], [2, 6], [6, 6], [2, 2], [4, 4]],
    6: [[6, 2], [2, 6], [6, 6], [2, 2], [6, 4], [2, 4]],
    7: [[6, 2], [2, 6], [6, 6], [2, 2], [6, 4], [2, 4], [4, 4]],
    8: [[6, 2], [2, 6], [6, 6], [2, 2], [6, 4], [2, 4], [4, 2], [4, 6]],
    9: [[6, 2], [2, 6], [6, 6], [2, 2], [6, 4], [2, 4], [4, 2], [4, 6], [4, 4]],
  },
  13: {
    2: [[9, 3], [3, 9]],
    3: [[9, 3], [3, 9], [9, 9]],
    4: [[9, 3], [3, 9], [9, 9], [3, 3]],
    5: [[9, 3], [3, 9], [9, 9], [3, 3], [6, 6]],
    6: [[9, 3], [3, 9], [9, 9], [3, 3], [9, 6], [3, 6]],
    7: [[9, 3], [3, 9], [9, 9], [3, 3], [9, 6], [3, 6], [6, 6]],
    8: [[9, 3], [3, 9], [9, 9], [3, 3], [9, 6], [3, 6], [6, 3], [6, 9]],
    9: [[9, 3], [3, 9], [9, 9], [3, 3], [9, 6], [3, 6], [6, 3], [6, 9], [6, 6]],
  },
  19: {
    2: [[15, 3], [3, 15]],
    3: [[15, 3], [3, 15], [15, 15]],
    4: [[15, 3], [3, 15], [15, 15], [3, 3]],
    5: [[15, 3], [3, 15], [15, 15], [3, 3], [9, 9]],
    6: [[15, 3], [3, 15], [15, 15], [3, 3], [15, 9], [3, 9]],
    7: [[15, 3], [3, 15], [15, 15], [3, 3], [15, 9], [3, 9], [9, 9]],
    8: [[15, 3], [3, 15], [15, 15], [3, 3], [15, 9], [3, 9], [9, 3], [9, 15]],
    9: [[15, 3], [3, 15], [15, 15], [3, 3], [15, 9], [3, 9], [9, 3], [9, 15], [9, 9]],
  },
};

export const SUPPORTED_SIZES = [9, 13, 19];
export const SUPPORTED_KOMIS = [7.5, 6.5, 5.5, 0];
export const MAX_HANDICAP = 9;
export const MIN_HANDICAP = 2;

const other = (c) => (c === BLACK ? WHITE : BLACK);

/**
 * 在给定棋盘上求 (x, y) 处棋组及其气。
 * 返回 { stones: number[], liberties: number[] }（一维索引）。
 */
export function groupAndLiberties(board, size, x, y) {
  const idx = y * size + x;
  const color = board[idx];
  if (color === EMPTY) return { stones: [], liberties: [] };
  const stones = [];
  const libs = new Set();
  const seen = new Set([idx]);
  const stack = [idx];
  while (stack.length) {
    const cur = stack.pop();
    stones.push(cur);
    const cx = cur % size;
    const cy = (cur - cx) / size;
    const neigh = [];
    if (cx > 0) neigh.push(cur - 1);
    if (cx < size - 1) neigh.push(cur + 1);
    if (cy > 0) neigh.push(cur - size);
    if (cy < size - 1) neigh.push(cur + size);
    for (const n of neigh) {
      if (board[n] === EMPTY) libs.add(n);
      else if (board[n] === color && !seen.has(n)) {
        seen.add(n);
        stack.push(n);
      }
    }
  }
  return { stones, liberties: [...libs] };
}

/** 无气棋组收集：返回棋盘上所有无气的 color 棋组（一维索引数组组成的数组）。 */
function deadGroups(board, size, color) {
  const seen = new Set();
  const groups = [];
  for (let idx = 0; idx < board.length; idx++) {
    if (board[idx] !== color || seen.has(idx)) continue;
    const g = groupAndLiberties(board, size, idx % size, Math.floor(idx / size));
    for (const s of g.stones) seen.add(s);
    if (g.liberties.length === 0) groups.push(g.stones);
  }
  return groups;
}

/** 数子法：移除死子后对空点区域 flood fill 归属。 */
export function scoreBoard(board, size, komi, deadStones = []) {
  const work = Int8Array.from(board);
  const deadSet = new Set(deadStones);
  for (const idx of deadSet) if (work[idx] !== EMPTY) work[idx] = EMPTY;

  let blackStones = 0;
  let whiteStones = 0;
  for (let i = 0; i < work.length; i++) {
    if (work[i] === BLACK) blackStones++;
    else if (work[i] === WHITE) whiteStones++;
  }

  const blackArea = [];
  const whiteArea = [];
  const neutral = [];
  const visited = new Uint8Array(work.length);
  for (let i = 0; i < work.length; i++) {
    if (work[i] !== EMPTY || visited[i]) continue;
    const region = [];
    const borders = new Set();
    const stack = [i];
    visited[i] = 1;
    while (stack.length) {
      const cur = stack.pop();
      region.push(cur);
      const cx = cur % size;
      const cy = (cur - cx) / size;
      const neigh = [];
      if (cx > 0) neigh.push(cur - 1);
      if (cx < size - 1) neigh.push(cur + 1);
      if (cy > 0) neigh.push(cur - size);
      if (cy < size - 1) neigh.push(cur + size);
      for (const n of neigh) {
        if (work[n] === EMPTY) {
          if (!visited[n]) {
            visited[n] = 1;
            stack.push(n);
          }
        } else borders.add(work[n]);
      }
    }
    if (borders.size === 1) {
      const owner = borders.has(BLACK) ? blackArea : whiteArea;
      owner.push(...region);
    } else {
      neutral.push(...region);
    }
  }

  const black = blackStones + blackArea.length;
  const white = whiteStones + whiteArea.length + komi;
  const diff = black - white;
  let result;
  if (diff > 0) result = 'B+' + trimNum(diff);
  else if (diff < 0) result = 'W+' + trimNum(-diff);
  else result = 'Draw';

  return {
    black: trimNum(black),
    white: trimNum(white),
    komi,
    diff: trimNum(diff),
    result,
    blackArea: blackArea.length,
    whiteArea: whiteArea.length,
    neutral: neutral.length,
    deadBlack: deadStones.filter((i) => board[i] === BLACK).length,
    deadWhite: deadStones.filter((i) => board[i] === WHITE).length,
  };
}

function trimNum(n) {
  return Number(n.toFixed(2));
}

/** 完整对局快照（用于 undo/redo 与 localStorage 持久化之外的内部机制）。 */
function snapshot(game) {
  return {
    board: Int8Array.from(game.board),
    turn: game.turn,
    captures: { ...game.captures },
    koPoint: game.koPoint ? { ...game.koPoint } : null,
    lastMove: game.lastMove ? { ...game.lastMove } : null,
    consecutivePasses: game.consecutivePasses,
    moveList: game.moveList.slice(),
  };
}

function restore(game, snap) {
  game.board = Int8Array.from(snap.board);
  game.turn = snap.turn;
  game.captures = { ...snap.captures };
  game.koPoint = snap.koPoint ? { ...snap.koPoint } : null;
  game.lastMove = snap.lastMove ? { ...snap.lastMove } : null;
  game.consecutivePasses = snap.consecutivePasses;
  game.moveList = snap.moveList.slice();
  game.deadMarks = new Set();
}

export class GoGame {
  /**
   * @param {number} size 棋盘路数（9 / 13 / 19）
   * @param {number} komi 贴目（默认 7.5；让子棋自动为 0）
   * @param {number} handicap 让子数（0 或 2~9）
   */
  constructor(size = 19, komi = 7.5, handicap = 0) {
    this.newGame(size, komi, handicap);
  }

  newGame(size = 19, komi = 7.5, handicap = 0) {
    this.size = size;
    this.handicap = handicap > 0 ? Math.max(MIN_HANDICAP, Math.min(MAX_HANDICAP, handicap)) : 0;
    this.komi = this.handicap > 0 ? 0 : komi; // 让子棋黑贴 0
    this.board = new Int8Array(size * size);
    this.turn = BLACK;
    this.captures = { [BLACK]: 0, [WHITE]: 0 };
    this.koPoint = null;
    this.lastMove = null;
    this.consecutivePasses = 0;
    this.moveList = [];
    this.deadMarks = new Set();
    this.phase = 'playing'; // playing | marking | over
    this.result = null;
    this.history = [];
    this.historyIndex = -1;
    this.historyLimit = 2000;

    if (this.handicap > 0) {
      const pts = (HANDICAP_POINTS[size] || HANDICAP_POINTS[19])[this.handicap];
      for (const [x, y] of pts) this.board[y * size + x] = BLACK;
      this.turn = WHITE; // 白先黑后
    }
    this.history.push(snapshot(this));
    this.historyIndex = 0;
    return this;
  }

  get moveNumber() {
    return this.moveList.length;
  }

  get canUndo() {
    return this.historyIndex > 0;
  }

  get canRedo() {
    return this.historyIndex < this.history.length - 1;
  }

  /** 坐标合法性 */
  inBounds(x, y) {
    return x >= 0 && y >= 0 && x < this.size && y < this.size;
  }

  /**
   * 尝试落子（规则完整校验：占位、打劫、自杀、阶段）。
   * @param {number} x
   * @param {number} y
   * @param {number} [color] 显式指定行棋方（SGF 排盘用）；缺省用当前 turn
   * @returns {{ ok: boolean, error?: string, captured?: number[], capturedCount?: number, color?: number }}
   */
  play(x, y, color) {
    if (this.phase !== 'playing') {
      return { ok: false, error: this.phase === 'marking' ? '对局已结束，正在标记死子' : '对局已结束' };
    }
    if (!this.inBounds(x, y)) return { ok: false, error: '落点超出棋盘' };
    const idx = y * this.size + x;
    const c = color ?? this.turn;
    if (c !== BLACK && c !== WHITE) return { ok: false, error: '非法行棋方' };
    if (this.board[idx] !== EMPTY) return { ok: false, error: '该点已有棋子' };
    if (this.koPoint && this.koPoint.idx === idx && this.koPoint.color === c) {
      return { ok: false, error: '打劫：禁止立即回提' };
    }

    // 模拟落子
    const sim = Int8Array.from(this.board);
    sim[idx] = c;
    // 先提对方无气棋组
    const captured = [];
    for (const g of deadGroups(sim, this.size, other(c))) {
      for (const s of g) {
        sim[s] = EMPTY;
        captured.push(s);
      }
    }
    // 再检查自己是否自杀（提子后无气 → 非法）
    const own = groupAndLiberties(sim, this.size, x, y);
    if (own.liberties.length === 0) {
      return { ok: false, error: '禁入点（自杀）' };
    }

    // 提交
    this.history = this.history.slice(0, this.historyIndex + 1);
    this.board = sim;
    this.captures[c] += captured.length;
    this.lastMove = { x, y, color: c };
    // 简单劫判定：单提 + 自身单子 + 单气
    if (captured.length === 1 && own.stones.length === 1 && own.liberties.length === 1) {
      this.koPoint = { idx: captured[0], color: other(c) };
    } else {
      this.koPoint = null;
    }
    this.consecutivePasses = 0;
    this.turn = other(c);
    this.moveList.push({ color: c, x, y, pass: false, captured: captured.slice() });
    this.deadMarks = new Set();
    this._pushHistory();
    return { ok: true, captured, capturedCount: captured.length, color: c };
  }

  /** 虚手（弃一手）。双方连续虚手 → 进入死子标记阶段。 */
  pass(color) {
    if (this.phase !== 'playing') {
      return { ok: false, error: '对局不在进行中' };
    }
    const c = color ?? this.turn;
    this.history = this.history.slice(0, this.historyIndex + 1);
    this.consecutivePasses += 1;
    this.koPoint = null;
    this.lastMove = { pass: true, color: c };
    this.moveList.push({ color: c, x: -1, y: -1, pass: true, captured: [] });
    this.turn = other(c);
    if (this.consecutivePasses >= 2) {
      this.phase = 'marking';
      this.deadMarks = new Set();
    }
    this._pushHistory();
    return { ok: true, consecutivePasses: this.consecutivePasses, phase: this.phase };
  }

  _pushHistory() {
    this.history.push(snapshot(this));
    if (this.history.length > this.historyLimit) {
      this.history.shift();
    }
    this.historyIndex = this.history.length - 1;
  }

  undo() {
    if (!this.canUndo) return false;
    this.historyIndex -= 1;
    restore(this, this.history[this.historyIndex]);
    // 恢复后重导出阶段：连续两次 pass 的快照即为 marking
    this.phase = this.consecutivePasses >= 2 ? 'marking' : 'playing';
    if (this.phase !== 'marking' && this.result) this.result = null;
    return true;
  }

  redo() {
    if (!this.canRedo) return false;
    this.historyIndex += 1;
    restore(this, this.history[this.historyIndex]);
    this.phase = this.consecutivePasses >= 2 ? 'marking' : 'playing';
    return true;
  }

  /** 提子信息（captureDetection）：某点棋组、气与当前整体提子数。 */
  getGroup(x, y) {
    if (!this.inBounds(x, y)) return null;
    const g = groupAndLiberties(this.board, this.size, x, y);
    return {
      x,
      y,
      color: this.board[y * this.size + x],
      stones: g.stones.map((i) => ({ x: i % this.size, y: Math.floor(i / this.size) })),
      liberties: g.liberties.map((i) => ({ x: i % this.size, y: Math.floor(i / this.size) })),
      capturesSoFar: { ...this.captures },
    };
  }

  /** 死子标记阶段：切换某点所属棋组的死活标记。 */
  toggleDead(x, y) {
    if (this.phase !== 'marking') return { ok: false, error: '当前不在死子标记阶段' };
    if (!this.inBounds(x, y)) return { ok: false, error: '坐标越界' };
    const idx = y * this.size + x;
    if (this.board[idx] === EMPTY) return { ok: false, error: '该点没有棋子' };
    const g = groupAndLiberties(this.board, this.size, x, y);
    const isDead = this.deadMarks.has(g.stones[0]);
    for (const s of g.stones) {
      if (isDead) this.deadMarks.delete(s);
      else this.deadMarks.add(s);
    }
    return { ok: true, dead: !isDead, groupSize: g.stones.length };
  }

  /** 跳过死子标记，直接按现状数子（视为全部存活）。 */
  skipMarking() {
    if (this.phase !== 'marking') return { ok: false, error: '当前不在死子标记阶段' };
    this.deadMarks = new Set();
    return { ok: true, score: this.score() };
  }

  /** 死子标记完成后定格结果。 */
  finalize() {
    if (this.phase !== 'marking') return { ok: false, error: '当前不在死子标记阶段' };
    this.phase = 'over';
    this.result = this.score();
    return { ok: true, result: this.result };
  }

  /** 死子标记阶段回到对局（撤销两次 pass 之后继续下）。 */
  resumePlay() {
    if (this.phase !== 'marking' && this.phase !== 'over') {
      return { ok: false, error: '对局仍在进行中' };
    }
    // 回退两步（两次 pass），重新落子
    let undone = 0;
    while (this.moveList.length > 0 && this.moveList[this.moveList.length - 1].pass && undone < 2) {
      this.undo();
      undone++;
    }
    this.phase = 'playing';
    this.result = null;
    this.deadMarks = new Set();
    return { ok: true, undone };
  }

  /**
   * 数子法计算胜负。
   * @param {Array<{x:number,y:number}|number>} [deadStones] 死子列表（缺省用内部标记）
   */
  score(deadStones) {
    let dead = [];
    if (Array.isArray(deadStones)) {
      dead = deadStones.map((d) => (typeof d === 'number' ? d : d.y * this.size + d.x));
    } else {
      dead = [...this.deadMarks];
    }
    const s = scoreBoard(this.board, this.size, this.komi, dead);
    return s;
  }

  /** 导出对局基本信息（UI/测试用） */
  info() {
    return {
      size: this.size,
      komi: this.komi,
      handicap: this.handicap,
      moveNumber: this.moveNumber,
      turn: this.turn,
      captures: { ...this.captures },
      phase: this.phase,
    };
  }
}

/** 星位列表（含让子点重合时去重） */
export function hoshiFor(size) {
  return (HOSHI[size] || HOSHI[19]).slice();
}

export { BLACK as COLOR_BLACK, WHITE as COLOR_WHITE };
