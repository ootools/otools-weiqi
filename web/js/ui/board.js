/**
 * 围棋棋盘 Canvas 渲染器（复用于对弈 / 排盘 / 学棋 mini 演示）。
 * ------------------------------------------------------------------
 * - 木纹底色、坐标（A-T 跳过 I，1-19）、星位；
 * - 最后一手高亮、手数显示、死子标记、教学标记（叉/三角/文字/高亮）；
 * - 悬停幽灵子；窗口缩放自适应（ResizeObserver + devicePixelRatio）。
 */

export const EMPTY = 0;
export const BLACK = 1;
export const WHITE = 2;

const LETTERS = 'ABCDEFGHJKLMNOPQRST'; // 按惯例跳过 I
const HOSHI = {
  9: [[2, 2], [6, 2], [4, 4], [2, 6], [6, 6]],
  13: [[3, 3], [9, 3], [6, 6], [3, 9], [9, 9]],
  19: [[3, 3], [9, 3], [15, 3], [3, 9], [9, 9], [15, 9], [3, 15], [9, 15], [15, 15]],
};

export function hoshiFor(size) {
  return HOSHI[size] || HOSHI[19];
}

export class BoardRenderer {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {{size?:number, interactive?:boolean, showCoords?:boolean, onClick?:Function}} [opts]
   */
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.size = opts.size ?? 19;
    this.interactive = opts.interactive ?? true;
    this.showCoords = opts.showCoords ?? true;
    this.onClick = opts.onClick ?? null;
    this.state = null;
    this.hover = null;
    this.dpr = Math.max(1, window.devicePixelRatio || 1);
    this._ro = null;

    canvas.addEventListener('click', (e) => this._handleClick(e));
    canvas.addEventListener('mousemove', (e) => this._handleMove(e));
    canvas.addEventListener('mouseleave', () => {
      if (this.hover) {
        this.hover = null;
        this.render();
      }
    });

    if (typeof ResizeObserver !== 'undefined') {
      this._ro = new ResizeObserver(() => this.resize());
      this._ro.observe(canvas.parentElement || canvas);
    }
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  destroy() {
    if (this._ro) this._ro.disconnect();
  }

  setSize(n) {
    this.size = n;
    this.hover = null;
    this.resize();
  }

  /**
   * @param {{board:Int8Array|number[], size?:number, lastMove?:{x:number,y:number}|null,
   *          marks?:Array<{x:number,y:number,kind:string,label?:string}>,
   *          moveNumbers?:Map<string,number>|null,
   *          deadMarks?:Set<number>|Iterable<number>|null}} state
   */
  setState(state) {
    this.state = state;
    this.hover = null;
    this.resize();
  }

  resize() {
    const parent = this.canvas.parentElement;
    const cssW = parent ? parent.clientWidth : this.canvas.clientWidth;
    const cssH = parent ? parent.clientHeight : this.canvas.clientHeight;
    if (cssW <= 0 || cssH <= 0) return;
    const side = Math.max(160, Math.min(cssW, cssH));
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    this.dpr = dpr;
    this.canvas.width = Math.round(side * dpr);
    this.canvas.height = Math.round(side * dpr);
    this.canvas.style.width = side + 'px';
    this.canvas.style.height = side + 'px';
    this.render();
  }

  get padRatio() {
    return this.showCoords ? 1.35 : 0.75;
  }

  /** 由像素坐标换算交叉点；超出半个格距返回 null */
  cellFromEvent(e) {
    const rect = this.canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const total = rect.width;
    const pad = total / (this.size - 1 + 2 * this.padRatio);
    const cell = pad;
    const gx = Math.round((px - pad) / cell);
    const gy = Math.round((py - pad) / cell);
    if (gx < 0 || gy < 0 || gx >= this.size || gy >= this.size) return null;
    const nx = pad + gx * cell;
    const ny = pad + gy * cell;
    const dist = Math.hypot(px - nx, py - ny);
    if (dist > cell * 0.55) return null;
    return { x: gx, y: gy };
  }

  _handleClick(e) {
    if (!this.interactive || !this.onClick) return;
    const cell = this.cellFromEvent(e);
    if (cell) this.onClick(cell.x, cell.y);
  }

  _handleMove(e) {
    if (!this.interactive) return;
    const cell = this.cellFromEvent(e);
    const changed = JSON.stringify(cell) !== JSON.stringify(this.hover);
    this.hover = cell;
    if (changed) this.render();
  }

  render() {
    const ctx = this.ctx;
    const dpr = this.dpr;
    const px = this.canvas.width; // 物理像素
    const total = px / dpr;
    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, total, total);

    const N = this.size;
    const pad = total / (N - 1 + 2 * this.padRatio);
    const cell = pad;
    const grid = cell * (N - 1);

    // ---- 木纹底 ----
    const wood = ctx.createLinearGradient(0, 0, total, total);
    wood.addColorStop(0, '#cfa15e');
    wood.addColorStop(0.5, '#c89a55');
    wood.addColorStop(1, '#bd8f4d');
    ctx.fillStyle = wood;
    ctx.fillRect(0, 0, total, total);
    // 木纹（确定性伪随机）
    let seed = 7 * N + 13;
    const rnd = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };
    ctx.save();
    ctx.strokeStyle = 'rgba(120, 78, 30, 0.10)';
    for (let i = 0; i < 22; i++) {
      ctx.lineWidth = 0.6 + rnd() * 1.6;
      ctx.beginPath();
      const y0 = rnd() * total;
      ctx.moveTo(0, y0);
      ctx.bezierCurveTo(total * 0.33, y0 + (rnd() - 0.5) * 10, total * 0.66, y0 + (rnd() - 0.5) * 10, total, y0 + (rnd() - 0.5) * 6);
      ctx.stroke();
    }
    ctx.restore();

    // ---- 网格 ----
    const x0 = pad;
    const y0 = pad;
    ctx.strokeStyle = 'rgba(52, 34, 14, 0.85)';
    ctx.lineWidth = Math.max(1, cell * 0.035);
    for (let i = 0; i < N; i++) {
      const p = x0 + i * cell;
      ctx.beginPath();
      ctx.moveTo(p, y0);
      ctx.lineTo(p, y0 + grid);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x0, y0 + i * cell);
      ctx.lineTo(x0 + grid, y0 + i * cell);
      ctx.stroke();
    }
    // 外框加粗
    ctx.lineWidth = Math.max(1.5, cell * 0.07);
    ctx.strokeRect(x0, y0, grid, grid);

    // ---- 星位 ----
    ctx.fillStyle = 'rgba(40, 26, 10, 0.9)';
    for (const [sx, sy] of hoshiFor(N)) {
      ctx.beginPath();
      ctx.arc(x0 + sx * cell, y0 + sy * cell, Math.max(2, cell * 0.115), 0, Math.PI * 2);
      ctx.fill();
    }

    // ---- 坐标 ----
    if (this.showCoords) {
      ctx.fillStyle = 'rgba(58, 38, 15, 0.85)';
      ctx.font = `${Math.max(9, cell * 0.46).toFixed(1)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (let i = 0; i < N; i++) {
        const p = x0 + i * cell;
        ctx.fillText(LETTERS[i], p, y0 - cell * 0.72);
        ctx.fillText(LETTERS[i], p, y0 + grid + cell * 0.72);
        const q = y0 + i * cell;
        ctx.fillText(String(N - i), x0 - cell * 0.72, q);
        ctx.fillText(String(N - i), x0 + grid + cell * 0.72, q);
      }
    }

    // ---- 棋子 ----
    const state = this.state;
    const board = state && state.board;
    const r = cell * 0.47;
    if (board && board.length === N * N) {
      for (let y = 0; y < N; y++) {
        for (let x = 0; x < N; x++) {
          const v = board[y * N + x];
          if (v === BLACK || v === WHITE) {
            this._drawStone(ctx, x0 + x * cell, y0 + y * cell, r, v, cell);
          }
        }
      }
    }

    // ---- 死子标记（X） ----
    if (state && state.deadMarks) {
      ctx.strokeStyle = 'rgba(214, 69, 57, 0.95)';
      ctx.lineWidth = Math.max(1.4, cell * 0.09);
      ctx.lineCap = 'round';
      for (const idx of state.deadMarks) {
        const x = idx % N;
        const y = Math.floor(idx / N);
        const cx = x0 + x * cell;
        const cy = y0 + y * cell;
        const d = r * 0.55;
        ctx.beginPath();
        ctx.moveTo(cx - d, cy - d);
        ctx.lineTo(cx + d, cy + d);
        ctx.moveTo(cx + d, cy - d);
        ctx.lineTo(cx - d, cy + d);
        ctx.stroke();
      }
    }

    // ---- 手数 ----
    if (state && state.moveNumbers) {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `600 ${Math.max(9, cell * 0.42).toFixed(1)}px system-ui, sans-serif`;
      for (const [key, num] of state.moveNumbers) {
        const [xs, ys] = key.split(',');
        const x = Number(xs);
        const y = Number(ys);
        const v = board ? board[y * N + x] : EMPTY;
        if (v === EMPTY) continue;
        ctx.fillStyle = v === BLACK ? 'rgba(255,255,255,0.92)' : 'rgba(20,20,20,0.88)';
        const label = num > 999 ? String(num) : String(num);
        ctx.fillText(label, x0 + x * cell, y0 + y * cell + cell * 0.02);
      }
    }

    // ---- 教学标记 ----
    if (state && state.marks) {
      for (const m of state.marks) {
        const cx = x0 + m.x * cell;
        const cy = y0 + m.y * cell;
        this._drawMark(ctx, m.kind, cx, cy, cell, m.label);
      }
    }

    // ---- 最后一手 ----
    if (state && state.lastMove && typeof state.lastMove.x === 'number') {
      const { x, y } = state.lastMove;
      const cx = x0 + x * cell;
      const cy = y0 + y * cell;
      const v = board ? board[y * N + x] : EMPTY;
      ctx.strokeStyle = v === BLACK ? 'rgba(255, 255, 255, 0.95)' : 'rgba(20, 20, 20, 0.9)';
      ctx.lineWidth = Math.max(1.6, cell * 0.085);
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.5, 0, Math.PI * 2);
      ctx.stroke();
    }

    // ---- 悬停幽灵子 ----
    if (this.hover && this.interactive && board) {
      const { x, y } = this.hover;
      if (board[y * N + x] === EMPTY) {
        ctx.globalAlpha = 0.45;
        this._drawStone(ctx, x0 + x * cell, y0 + y * cell, r, 1, cell);
        ctx.globalAlpha = 1;
      }
    }

    ctx.restore();
  }

  _drawStone(ctx, cx, cy, r, color, cell) {
    ctx.save();
    ctx.shadowColor = 'rgba(30, 18, 5, 0.4)';
    ctx.shadowBlur = cell * 0.12;
    ctx.shadowOffsetY = cell * 0.06;
    const g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.15, cx, cy, r);
    if (color === BLACK) {
      g.addColorStop(0, '#5a5a5c');
      g.addColorStop(1, '#0c0c0e');
    } else {
      g.addColorStop(0, '#ffffff');
      g.addColorStop(1, '#c9c9c6');
    }
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  _drawMark(ctx, kind, cx, cy, cell, label) {
    const s = cell * 0.3;
    ctx.save();
    switch (kind) {
      case 'flash': // 高亮可点/重点位置（方块）
        ctx.fillStyle = 'rgba(120, 200, 255, 0.35)';
        ctx.strokeStyle = 'rgba(120, 200, 255, 0.9)';
        ctx.lineWidth = Math.max(1.2, cell * 0.06);
        ctx.beginPath();
        ctx.rect(cx - s, cy - s, s * 2, s * 2);
        ctx.fill();
        ctx.stroke();
        break;
      case 'bad': // 错误提示（红方块）
        ctx.fillStyle = 'rgba(230, 90, 80, 0.4)';
        ctx.strokeStyle = 'rgba(230, 90, 80, 0.95)';
        ctx.lineWidth = Math.max(1.2, cell * 0.06);
        ctx.beginPath();
        ctx.rect(cx - s, cy - s, s * 2, s * 2);
        ctx.fill();
        ctx.stroke();
        break;
      case 'tri': // 三角（重点棋子）
        ctx.strokeStyle = 'rgba(233, 84, 32, 0.95)';
        ctx.lineWidth = Math.max(1.6, cell * 0.09);
        ctx.beginPath();
        const r = cell * 0.3;
        ctx.moveTo(cx, cy - r);
        ctx.lineTo(cx + r * 0.9, cy + r * 0.65);
        ctx.lineTo(cx - r * 0.9, cy + r * 0.65);
        ctx.closePath();
        ctx.stroke();
        break;
      case 'x': // 叉
        ctx.strokeStyle = 'rgba(60, 105, 230, 0.95)';
        ctx.lineWidth = Math.max(1.6, cell * 0.09);
        ctx.beginPath();
        ctx.moveTo(cx - s, cy - s);
        ctx.lineTo(cx + s, cy + s);
        ctx.moveTo(cx + s, cy - s);
        ctx.lineTo(cx - s, cy + s);
        ctx.stroke();
        break;
      case 'text': {
        ctx.fillStyle = 'rgba(233, 84, 32, 0.95)';
        ctx.font = `700 ${Math.max(10, cell * 0.5).toFixed(1)}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(label ?? ''), cx, cy);
        break;
      }
      default:
        break;
    }
    ctx.restore();
  }
}
