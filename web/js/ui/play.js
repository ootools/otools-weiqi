/**
 * 「对弈」tab 控制器：点击落子、虚手、悔棋/前进、死子标记与数子、
 * 人机对弈（电脑执黑/执白，思考中锁定落子）、SGF 导入导出（宿主桥优先、浏览器退化）、
 * localStorage 持久化。
 */
import { GoGame, BLACK, WHITE, EMPTY } from '../engine/go.js';
import { chooseMove } from '../engine/go-ai.js';
import { parseSGF, gameToSGF } from '../engine/sgf.js';

const AI_LEVEL_NAMES = { easy: '入门', normal: '普通', hard: '困难' };
const MODE_NAMES = { pvp: '双人对弈', 'ai-black': '人机 · AI 执黑', 'ai-white': '人机 · AI 执白' };

const LS_KEY = 'otools-weiqi.play.v1';

export class PlayController {
  /**
   * @param {import('./board.js').BoardRenderer} renderer
   * @param {() => void} [onChrome] 状态条刷新回调（app 层如需联动）
   */
  constructor(renderer) {
    this.renderer = renderer;
    this.game = new GoGame(19, 7.5, 0);
    // 人机对弈状态
    this.mode = 'pvp';        // pvp | ai-black | ai-white
    this.aiLevel = 'normal';  // easy | normal | hard
    this._thinking = false;   // AI 正在计算
    this._aiTimer = null;     // 挂起的 AI 计算定时器
    this._aiGen = 0;          // 局面代数：新对局/导入/切模式时递增，用于丢弃过期的 AI 计算
    this.el = {
      status: document.getElementById('play-status'),
      marking: document.getElementById('marking-box'),
      result: document.getElementById('play-result'),
      btnPass: document.getElementById('btn-pass'),
      btnUndo: document.getElementById('btn-undo'),
      btnRedo: document.getElementById('btn-redo'),
      btnNew: document.getElementById('btn-new'),
      btnImport: document.getElementById('btn-import'),
      btnExport: document.getElementById('btn-export'),
      btnScoreNow: document.getElementById('btn-score-now'),
      btnSkipDead: document.getElementById('btn-skip-dead'),
      btnResume: document.getElementById('btn-resume'),
      selSize: document.getElementById('sel-size'),
      selKomi: document.getElementById('sel-komi'),
      selHandicap: document.getElementById('sel-handicap'),
      selMode: document.getElementById('sel-mode'),
      selAiLevel: document.getElementById('sel-ai-level'),
      fileInput: document.getElementById('file-fallback'),
      toast: document.getElementById('toast'),
    };
    this._wire();
  }

  activate() {
    this.renderer.interactive = true;
    this.renderer.onClick = (x, y) => this.onCellClick(x, y);
    this.renderer.setSize(this.game.size);
    this._render();
    // 恢复的对局若正轮到 AI，让其继续应手
    this._maybeAIMove();
  }

  _wire() {
    this.el.selMode.addEventListener('change', () => {
      this._cancelAi();
      this.mode = this.el.selMode.value;
      this._persist();
      this._render();
      this._maybeAIMove();
      this._toast(`已切换为${MODE_NAMES[this.mode] || this.mode}`);
    });
    this.el.selAiLevel.addEventListener('change', () => {
      this.aiLevel = this.el.selAiLevel.value;
      this._persist();
      this._toast(`AI 难度：${AI_LEVEL_NAMES[this.aiLevel] || this.aiLevel}`);
    });
    this.el.btnPass.addEventListener('click', () => {
      if (this._aiTurnLocked()) {
        this._toast('对手思考中，请稍候…');
        return;
      }
      const r = this.game.pass();
      if (!r.ok) this._toast(r.error);
      this._persist();
      this._render();
      this._maybeAIMove();
    });
    this.el.btnUndo.addEventListener('click', () => {
      if (this._thinking) {
        this._toast('对手思考中，请稍候…');
        return;
      }
      this._cancelAi();
      const ai = this._aiColor();
      let undone = 0;
      if (this.game.undo()) {
        undone++;
        // 人机模式：悔棋一次撤 AI 应手 + 玩家上一手（共两手）
        if (ai && this.game.turn === ai && this.game.canUndo) {
          if (this.game.undo()) undone++;
        }
        this._toast(undone > 1 ? '已悔 2 手（AI 与你各一手）' : '已悔 1 手');
      } else {
        this._toast('没有可悔的棋');
      }
      this._persist();
      this._render();
      this._maybeAIMove();
    });
    this.el.btnRedo.addEventListener('click', () => {
      if (this._thinking) {
        this._toast('对手思考中，请稍候…');
        return;
      }
      this._cancelAi();
      if (!this.game.redo()) this._toast('没有可前进的棋');
      this._persist();
      this._render();
      this._maybeAIMove();
    });
    this.el.btnNew.addEventListener('click', () => {
      const size = Number(this.el.selSize.value);
      const komi = Number(this.el.selKomi.value);
      const handicap = Number(this.el.selHandicap.value);
      if (handicap > 0 && komi > 0) {
        this._toast('让子棋黑贴 0，已自动将贴目设为 0');
        this.el.selKomi.value = '0';
      }
      this._cancelAi();
      this.game = new GoGame(size, komi, handicap);
      this.renderer.setSize(size);
      this._persist();
      this._render();
      this._maybeAIMove();
      this._toast(handicap > 0 ? `让 ${handicap} 子开局，白先行` : '新对局开始，黑先行');
    });
    this.el.btnScoreNow.addEventListener('click', () => {
      const f = this.game.finalize();
      if (!f.ok) this._toast(f.error);
      this._persist();
      this._render();
      this._maybeAIMove();
    });
    this.el.btnSkipDead.addEventListener('click', () => {
      const s = this.game.skipMarking();
      if (!s.ok) {
        this._toast(s.error);
        return;
      }
      this.game.finalize();
      this._persist();
      this._render();
      this._maybeAIMove();
    });
    this.el.btnResume.addEventListener('click', () => {
      const r = this.game.resumePlay();
      if (!r.ok) this._toast(r.error);
      this._persist();
      this._render();
      this._maybeAIMove();
    });
    this.el.btnImport.addEventListener('click', () => this._import());
    this.el.btnExport.addEventListener('click', () => this._export());
    this.el.fileInput.addEventListener('change', () => {
      const file = this.el.fileInput.files && this.el.fileInput.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = () => this.loadSGFText(String(reader.result || ''), file.name);
        reader.readAsText(file, 'utf-8');
      }
      this.el.fileInput.value = '';
    });
    this._restore();
  }

  onCellClick(x, y) {
    const g = this.game;
    if (this._aiTurnLocked()) {
      this._toast('对手思考中，请稍候…');
      return;
    }
    if (g.phase === 'playing') {
      const r = g.play(x, y);
      if (!r.ok) {
        this._toast(r.error);
        return;
      }
      if (r.capturedCount > 0) {
        const who = r.color === BLACK ? '黑' : '白';
        this._toast(`${who}方提子 ${r.capturedCount} 枚`);
      }
      this._persist();
      this._render();
      this._maybeAIMove();
    } else if (g.phase === 'marking') {
      const r = g.toggleDead(x, y);
      if (!r.ok) this._toast(r.error);
      this._render();
    }
  }

  /** 导入 SGF 文本（宿主桥或浏览器路径最终都会走到这里） */
  loadSGFText(text, name) {
    this._cancelAi();
    try {
      const rec = parseSGF(text);
      const g = new GoGame(rec.size, rec.komi, 0);
      for (const p of rec.setup.black) g.board[p.y * rec.size + p.x] = BLACK;
      for (const p of rec.setup.white) g.board[p.y * rec.size + p.x] = WHITE;
      if ((rec.setup.black.length || rec.setup.white.length) && rec.nodes.length &&
          rec.nodes[0].move && rec.nodes[0].move.color === WHITE) {
        g.turn = WHITE;
      }
      let lastErr = null;
      for (const node of rec.nodes) {
        if (!node.move) continue;
        const m = node.move;
        const r = m.pass ? g.pass(m.color) : g.play(m.x, m.y, m.color);
        if (!r.ok) lastErr = r.error;
      }
      this.game = g;
      this.renderer.setSize(rec.size);
      if (rec.size !== 19) this.el.selSize.value = String(rec.size);
      this._persist();
      this._render();
      this._maybeAIMove();
      this._toast(
        `已导入${name ? '：' + name : ''}（${rec.size} 路，${g.moveNumber} 手）` +
        (lastErr ? `；有 ${lastErr} 的手数被跳过` : ''),
      );
    } catch (e) {
      this._toast('导入失败：' + e.message);
    }
  }

  async _import() {
    const bridge = typeof window !== 'undefined' ? window.otoolsPlugin : null;
    if (bridge && typeof bridge.openText === 'function') {
      try {
        const res = await bridge.openText([{ name: 'SGF 棋谱', extensions: ['sgf', 'txt'] }]);
        if (!res) return; // 用户取消
        this.loadSGFText(res.text, res.name);
        return;
      } catch (e) {
        // 宿主不可用 → 浏览器退化
      }
    }
    this.el.fileInput.click();
  }

  async _export() {
    const g = this.game;
    const meta = {
      black: '黑方',
      white: '白方',
      result: g.result ? g.result.result : undefined,
    };
    const sgf = gameToSGF(g, meta);
    const bridge = typeof window !== 'undefined' ? window.otoolsPlugin : null;
    if (bridge && typeof bridge.saveText === 'function') {
      try {
        const p = await bridge.saveText('weiqi-game.sgf', sgf, [{ name: 'SGF 棋谱', extensions: ['sgf'] }]);
        if (p) {
          this._toast('已保存：' + p);
          return;
        }
        return; // 用户取消
      } catch (e) {
        // 走浏览器退化
      }
    }
    // 浏览器退化：触发下载
    try {
      const blob = new Blob([sgf], { type: 'application/x-go-sgf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'weiqi-game.sgf';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      this._toast('浏览器模式：已下载 weiqi-game.sgf');
    } catch (e) {
      this._toast('导出失败：' + e.message);
    }
  }

  _persist() {
    try {
      const meta = { black: '黑方', white: '白方' };
      const sgf = gameToSGF(this.game, meta);
      localStorage.setItem(LS_KEY, JSON.stringify({
        sgf,
        savedAt: Date.now(),
        mode: this.mode,
        aiLevel: this.aiLevel,
      }));
    } catch (e) {
      /* localStorage 不可用时忽略 */
    }
  }

  _restore() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (!data || !data.sgf) return;
      const rec = parseSGF(data.sgf);
      const g = new GoGame(rec.size, rec.komi, 0);
      for (const p of rec.setup.black) g.board[p.y * rec.size + p.x] = BLACK;
      for (const p of rec.setup.white) g.board[p.y * rec.size + p.x] = WHITE;
      if ((rec.setup.black.length || rec.setup.white.length) && rec.nodes.length &&
          rec.nodes[0].move && rec.nodes[0].move.color === WHITE) {
        g.turn = WHITE;
      }
      for (const node of rec.nodes) {
        if (!node.move) continue;
        const m = node.move;
        if (m.pass) g.pass(m.color);
        else g.play(m.x, m.y, m.color);
      }
      this.game = g;
      if (rec.size !== 19) this.el.selSize.value = String(rec.size);
      // 恢复人机模式设置
      if (data.mode === 'pvp' || data.mode === 'ai-black' || data.mode === 'ai-white') {
        this.mode = data.mode;
        if (this.el.selMode) this.el.selMode.value = data.mode;
      }
      if (data.aiLevel === 'easy' || data.aiLevel === 'normal' || data.aiLevel === 'hard') {
        this.aiLevel = data.aiLevel;
        if (this.el.selAiLevel) this.el.selAiLevel.value = data.aiLevel;
      }
    } catch (e) {
      /* 恢复失败则忽略，使用新对局 */
    }
  }

  _render() {
    const g = this.game;
    const aiColor = this._aiColor();
    const aiTurn = !!aiColor && g.phase === 'playing' && g.turn === aiColor;
    // 人机模式：轮到 AI（含思考中）时锁定棋盘；死子标记阶段仍可点击标记
    this.renderer.interactive = g.phase === 'playing' ? !(this._thinking || aiTurn) : true;
    this.renderer.setState({
      board: g.board,
      size: g.size,
      lastMove: g.lastMove && !g.lastMove.pass ? { x: g.lastMove.x, y: g.lastMove.y } : null,
      deadMarks: g.phase !== 'playing' ? g.deadMarks : new Set(),
    });

    // 状态条
    const turnName = aiColor
      ? (g.turn === aiColor ? 'AI' : '你')
      : (g.turn === BLACK ? '黑方' : '白方');
    const aiLabel = aiColor
      ? ` · AI（${AI_LEVEL_NAMES[this.aiLevel] || this.aiLevel}·执${aiColor === BLACK ? '黑' : '白'}）`
      : '';
    let statusText;
    if (g.phase === 'over') {
      statusText = `对局结束 · ${g.result ? g.result.result : ''}`;
    } else if (g.phase === 'marking') {
      statusText = `第 ${g.moveNumber} 手 · 死子标记阶段（点击棋子标记死子）`;
    } else {
      statusText = `第 ${g.moveNumber + 1} 手 · ` +
        (aiTurn ? '对手思考中…' : `轮到${turnName}`) +
        (g.handicap > 0 && g.moveNumber === 0 ? '（让子棋白先行）' : '');
    }
    this.el.status.textContent =
      `${statusText} · 黑提 ${g.captures[BLACK]} / 白提 ${g.captures[WHITE]} · 贴 ${g.komi}` +
      (g.handicap > 0 ? ` · 让 ${g.handicap} 子` : '') + aiLabel;

    this.el.marking.classList.toggle('hidden', g.phase !== 'marking');
    this.el.btnUndo.disabled = !g.canUndo;
    this.el.btnRedo.disabled = !g.canRedo;
    this.el.btnPass.disabled = aiTurn;

    // 结果面板
    if (g.phase === 'over' && g.result) {
      const r = g.result;
      this.el.result.innerHTML =
        `<div class="result-line">黑 ${r.black} 目 · 白 ${r.white} 目（含贴目 ${r.komi}）</div>` +
        `<div class="result-strong">${r.result === 'Draw' ? '和棋' : (r.result.startsWith('B') ? '黑胜 ' : '白胜 ') + r.result.slice(2) + ' 目'}</div>` +
        `<div class="result-sub">死子：黑 ${r.deadBlack} / 白 ${r.deadWhite} · 公气 ${r.neutral} 点</div>`;
      this.el.result.classList.remove('hidden');
    } else if (g.phase === 'marking') {
      const s = g.score();
      this.el.result.innerHTML =
        `<div class="result-sub">当前标记下实时数子：黑 ${s.black} · 白 ${s.white} → ${s.result}` +
        `（已标死子：黑 ${s.deadBlack} / 白 ${s.deadWhite}）</div>`;
      this.el.result.classList.remove('hidden');
    } else {
      this.el.result.classList.add('hidden');
      this.el.result.innerHTML = '';
    }
  }

  /** 当前模式下 AI 执子颜色；双人对弈返回 null */
  _aiColor() {
    if (this.mode === 'ai-black') return BLACK;
    if (this.mode === 'ai-white') return WHITE;
    return null;
  }

  /** 轮到 AI（或 AI 正在思考）时锁定棋盘与虚手 */
  _aiTurnLocked() {
    const ai = this._aiColor();
    return !!(ai && this.game.phase === 'playing' && (this._thinking || this.game.turn === ai));
  }

  /** 取消挂起的 AI 计算（新对局 / 导入 / 切换模式 / 悔棋前进时） */
  _cancelAi() {
    this._aiGen++;
    if (this._aiTimer) {
      clearTimeout(this._aiTimer);
      this._aiTimer = null;
    }
    this._thinking = false;
  }

  /**
   * 轮到 AI 时延迟约 50ms 计算着法并落子；期间显示「对手思考中…」并锁定落子。
   * AI 虚手与玩家虚手走同一条双 pass 死子标记 / 数子流程。
   */
  _maybeAIMove() {
    const ai = this._aiColor();
    const g = this.game;
    if (!ai || g.phase !== 'playing' || g.turn !== ai) {
      this._thinking = false;
      return;
    }
    if (this._thinking || this._aiTimer) return; // 已在计算
    this._thinking = true;
    const gen = this._aiGen;
    this._render(); // 显示「对手思考中…」并锁盘
    this._aiTimer = setTimeout(() => {
      this._aiTimer = null;
      if (gen !== this._aiGen || this.game !== g || g.phase !== 'playing' || g.turn !== ai) {
        this._thinking = false;
        this._render();
        return;
      }
      let mv = 'pass';
      try {
        mv = chooseMove(g, ai, { level: this.aiLevel });
      } catch (e) {
        mv = 'pass'; // 引擎异常时兜底虚手，不中断对局
      }
      if (mv === 'pass') {
        const r = g.pass();
        if (r.ok) this._toast('AI 选择虚手');
      } else {
        const r = g.play(mv.x, mv.y);
        if (r.ok && r.capturedCount > 0) this._toast(`AI 提子 ${r.capturedCount} 枚`);
      }
      this._thinking = false;
      this._persist();
      this._render();
      this._maybeAIMove(); // 防御：正常情况下此时轮到玩家
    }, 50);
  }

  _toast(msg) {
    if (!this.el.toast) return;
    this.el.toast.textContent = msg;
    this.el.toast.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => this.el.toast.classList.remove('show'), 2600);
  }
}
