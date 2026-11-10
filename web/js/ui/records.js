/**
 * 「排盘」tab 控制器：名局列表 → 载入 SGF；首/上/下一/末/自动播放；
 * 手数显示开关；点击着法跳转；棋评（SGF 注释）显示；最后一手标记。
 */
import { GoGame, BLACK, WHITE, EMPTY } from '../engine/go.js';
import { parseSGF } from '../engine/sgf.js';
import { GAMES } from '../../data/games/manifest.js';

const SPEEDS = { slow: 1600, normal: 800, fast: 350 };

export class RecordsController {
  /**
   * @param {import('./board.js').BoardRenderer} renderer
   */
  constructor(renderer) {
    this.renderer = renderer;
    this.record = null; // parseSGF 结果
    this.game = null;   // 重放中的 GoGame
    this.meta = null;   // manifest 条目
    this.cur = 0;       // 当前显示的手数（0 = 开局）
    this.playing = false;
    this.timer = null;
    this.showNumbers = false;
    this.el = {
      selGame: document.getElementById('sel-game'),
      meta: document.getElementById('game-meta'),
      btnFirst: document.getElementById('btn-first'),
      btnPrev: document.getElementById('btn-prev'),
      btnNext: document.getElementById('btn-next'),
      btnLast: document.getElementById('btn-last'),
      btnAuto: document.getElementById('btn-auto'),
      selSpeed: document.getElementById('sel-speed'),
      chkNum: document.getElementById('chk-num'),
      moveCount: document.getElementById('rec-movecount'),
      moveList: document.getElementById('move-list'),
      comment: document.getElementById('rec-comment'),
      loadError: document.getElementById('rec-load-error'),
    };
    this._wire();
    this._buildList();
  }

  activate() {
    this.renderer.interactive = false; // 排盘模式棋盘不响应落子
    this.renderer.onClick = null;
    this._render();
  }

  deactivate() {
    this._stopAuto();
  }

  _wire() {
    this.el.selGame.addEventListener('change', () => {
      this.load(this.el.selGame.value);
    });
    this.el.btnFirst.addEventListener('click', () => { this.goto(0); });
    this.el.btnPrev.addEventListener('click', () => { this.goto(this.cur - 1); });
    this.el.btnNext.addEventListener('click', () => { this.goto(this.cur + 1); });
    this.el.btnLast.addEventListener('click', () => { this.goto(this.totalMoves()); });
    this.el.btnAuto.addEventListener('click', () => {
      if (this.playing) this._stopAuto();
      else this._startAuto();
    });
    this.el.selSpeed.addEventListener('change', () => {
      if (this.playing) {
        this._stopAuto();
        this._startAuto();
      }
    });
    this.el.chkNum.addEventListener('change', () => {
      this.showNumbers = this.el.chkNum.checked;
      this._render();
    });
  }

  _buildList() {
    this.el.selGame.innerHTML = '';
    for (const g of GAMES) {
      const opt = document.createElement('option');
      opt.value = g.id;
      opt.textContent = `${g.title}（${g.players}，${g.result}）`;
      this.el.selGame.appendChild(opt);
    }
    this.el.selGame.value = GAMES[0].id;
    this.load(GAMES[0].id);
  }

  totalMoves() {
    if (!this.record) return 0;
    return this.record.nodes.filter((n) => n.move).length;
  }

  async load(id) {
    const meta = GAMES.find((g) => g.id === id);
    if (!meta) return;
    this.meta = meta;
    this._stopAuto();
    this.el.loadError.classList.add('hidden');
    try {
      const url = new URL(`../../data/games/${meta.file}`, import.meta.url);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      this.record = parseSGF(text);
      this.game = null;
      this.cur = 0;
      this._buildMoveList();
      this._render();
    } catch (e) {
      this.record = null;
      this.game = null;
      this.el.loadError.textContent = `载入 ${meta.title} 失败：${e.message}（请通过 http 服务访问 dist/，例如 node scripts/serve-dist.mjs）`;
      this.el.loadError.classList.remove('hidden');
      this.el.meta.innerHTML = '';
      this.el.moveList.innerHTML = '';
      this.el.comment.textContent = '';
      this.renderer.setState({ board: new Int8Array(361), size: 19, lastMove: null });
    }
  }

  _buildMoveList() {
    const ol = this.el.moveList;
    ol.innerHTML = '';
    if (!this.record) return;
    // 第一项：开局
    const liStart = document.createElement('li');
    liStart.textContent = '开局';
    liStart.dataset.index = '0';
    liStart.addEventListener('click', () => this.goto(0));
    ol.appendChild(liStart);
    let i = 0;
    for (const node of this.record.nodes) {
      if (!node.move) continue;
      i++;
      const m = node.move;
      const li = document.createElement('li');
      const colorName = m.color === BLACK ? '黑' : '白';
      li.textContent = `${i}. ${colorName}${m.pass ? ' 虚手' : ' ' + this._coordLabel(m)}`;
      li.dataset.index = String(i);
      li.addEventListener('click', () => this.goto(i));
      ol.appendChild(li);
    }
  }

  _coordLabel(m) {
    const LETTERS = 'ABCDEFGHJKLMNOPQRST';
    return LETTERS[m.x] + (this.record.size - m.y);
  }

  /** 跳转到第 n 手（0..totalMoves） */
  goto(n) {
    if (!this.record) return;
    const total = this.totalMoves();
    this.cur = Math.max(0, Math.min(total, n));
    this._rebuildGame();
    this._render();
  }

  _rebuildGame() {
    const { record } = this;
    const g = new GoGame(record.size, record.komi, 0);
    for (const p of record.setup.black) g.board[p.y * record.size + p.x] = BLACK;
    for (const p of record.setup.white) g.board[p.y * record.size + p.x] = WHITE;
    if ((record.setup.black.length || record.setup.white.length) &&
        record.nodes.length && record.nodes[0].move && record.nodes[0].move.color === WHITE) {
      g.turn = WHITE;
    }
    let done = 0;
    let lastReal = null;
    for (const node of record.nodes) {
      if (!node.move) continue;
      if (done >= this.cur) break;
      const m = node.move;
      if (m.pass) g.pass(m.color);
      else g.play(m.x, m.y, m.color);
      if (!m.pass) lastReal = { x: m.x, y: m.y };
      done++;
    }
    this.game = g;
    this.lastReal = lastReal;
  }

  _render() {
    if (!this.record || !this.game) return;
    const total = this.totalMoves();

    // 手数标记（仅当前局面盘面上的子）
    let moveNumbers = null;
    if (this.showNumbers) {
      moveNumbers = new Map();
      let i = 0;
      for (const node of this.record.nodes) {
        if (!node.move) continue;
        i++;
        if (i > this.cur) break;
        const m = node.move;
        if (!m.pass) moveNumbers.set(`${m.x},${m.y}`, i);
      }
    }

    this.renderer.setState({
      board: this.game.board,
      size: this.record.size,
      lastMove: this.lastReal || null,
      moveNumbers,
      deadMarks: new Set(),
    });

    // 手数指示
    this.el.moveCount.textContent = `第 ${this.cur} / ${total} 手` +
      (this.cur === total && this.record.result ? ` · 终局 ${this.record.result}` : '');

    // 着法列表高亮 + 滚动
    const items = this.el.moveList.children;
    for (const li of items) {
      const active = Number(li.dataset.index) === this.cur;
      li.classList.toggle('active', active);
      if (active) li.scrollIntoView({ block: 'nearest' });
    }

    // 棋评：当前节点注释（开局显示根注释）
    let comment = null;
    if (this.cur === 0) {
      comment = this.record.rootComment;
    } else {
      let i = 0;
      for (const node of this.record.nodes) {
        if (!node.move) continue;
        i++;
        if (i === this.cur) {
          comment = node.comment;
          break;
        }
      }
    }
    this.el.comment.textContent = comment ? `【棋评】${comment}` : '（本手无棋评）';

    // 元信息
    const m = this.meta;
    this.el.meta.innerHTML =
      `<div class="meta-title">${m.title}</div>` +
      `<div class="meta-line">${m.players} · ${m.date}</div>` +
      `<div class="meta-line">结果：${m.result} · 贴目 ${this.record.komi}` +
      (this.record.handicap > 0 ? ` · 让 ${this.record.handicap} 子` : '') +
      `${this.record.event ? ' · ' + this.record.event : ''}</div>` +
      `<div class="meta-desc">${m.desc}</div>` +
      `<div class="meta-source">来源：${m.source}</div>`;

    // 自动播放按钮文案
    this.el.btnAuto.textContent = this.playing ? '暂停' : '自动播放';
  }

  _startAuto() {
    if (!this.record) return;
    if (this.cur >= this.totalMoves()) this.goto(0);
    this.playing = true;
    const tick = () => {
      if (!this.playing) return;
      if (this.cur >= this.totalMoves()) {
        this._stopAuto();
        this._render();
        return;
      }
      this.goto(this.cur + 1);
      const speed = SPEEDS[this.el.selSpeed.value] || SPEEDS.normal;
      this.timer = setTimeout(tick, speed);
    };
    const speed = SPEEDS[this.el.selSpeed.value] || SPEEDS.normal;
    this.timer = setTimeout(tick, speed);
    this.el.btnAuto.textContent = '暂停';
  }

  _stopAuto() {
    this.playing = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.el.btnAuto) this.el.btnAuto.textContent = '自动播放';
  }
}
