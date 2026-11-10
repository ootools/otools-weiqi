/**
 * 「学棋」tab 控制器：9 章交互式玩法介绍。
 * 复用主渲染器（共享 canvas）做可点击的演示棋盘：
 * 每章一组「步骤」——静态讲解步骤点「下一步」推进；交互步骤等待用户
 * 点击标记的点，由引擎真实执行提子 / 禁入点 / 打劫判定。
 */
import { GoGame, BLACK, WHITE, EMPTY, groupAndLiberties, scoreBoard, HANDICAP_POINTS } from '../engine/go.js';

const B = BLACK;
const W = WHITE;

/**
 * 步骤格式：
 * {
 *   reset?: true                  // 本步骤重置棋盘
 *   setup?: [[x,y,color], ...]    // 直接摆盘（演示初始局面）
 *   add?: [[x,y,color], ...]      // 在当前棋面上继续落子（走引擎规则）
 *   marks?: [{x,y,kind,label?}]   // 教学标记：flash/tri/x/text/bad
 *   caption: string               // 说明文字（显示在棋盘下方）
 *   notice?: string               // 章节顶部操作提示
 *   expect?: {                    // 交互步骤：等待用户点击
 *     points: [[x,y], ...]        // 期望点击的点
 *     color: 1|2                  // 点击时代表哪一方落子
 *     expectFail?: true           // 期望引擎拒绝（禁入点/打劫演示）
 *     ok: string                  // 点击正确后的说明
 *     fail: string                // 点错提示
 *   }
 *   mode?: 'free'|'dead'|'handicap' // 特殊交互模式
 * }
 */
const CHAPTERS = [
  // ------------------------------------------------------------------ ①
  {
    num: 1,
    title: '棋盘与交叉点、落子',
    size: 9,
    body:
      '<p>围棋棋盘由<strong>纵横交叉的线</strong>构成，标准棋盘是 19 路（19×19 = 361 个交叉点），入门常用 13 路和 9 路。棋子要下在<strong>交叉点</strong>上，而不是格子里。</p>' +
      '<p>行棋顺序：<strong>黑先白后</strong>，双方轮流落子；棋子落下后不再移动（被提掉的死子除外）。为了补偿黑棋先行的优势，终局数子时白棋会得到「贴目」。</p>',
    summary: '落子落在交叉点上；黑先白后交替行棋；棋子落定后不能移动。',
    demo: [
      {
        mode: 'free',
        notice: '点击棋盘任意交叉点即可落子（黑白交替）',
        caption: '自由试下：点击棋盘任意交叉点落子，黑白交替。试着下一颗子吧！',
      },
    ],
  },
  // ------------------------------------------------------------------ ②
  {
    num: 2,
    title: '气与提子',
    size: 9,
    body:
      '<p>一颗棋子上下左右<strong>紧邻的空交叉点</strong>叫做它的「<strong>气</strong>」。棋子的气被对方全部占住，就会<strong>无气被提</strong>——从棋盘上拿掉。</p>' +
      '<p>同色相连的棋子构成一个「<strong>棋组</strong>」，气按<strong>整组</strong>一起计算：整组的公共气才是它的生命线。</p>',
    summary: '无气即被提；同色相连成棋组，气按整组计算。',
    demo: [
      {
        reset: true,
        setup: [[4, 4, B]],
        marks: [[3, 4, 'flash'], [5, 4, 'flash'], [4, 3, 'flash'], [4, 5, 'flash']],
        caption: '中央黑子的「气」＝紧邻的 4 个空交叉点（蓝框处）。白棋来占气——点击任意一个蓝框位置！',
        expect: { points: [[3, 4], [5, 4], [4, 3], [4, 5]], color: W, ok: '白子落下，黑子少了一口气！', fail: '请点击蓝框标记的气点' },
      },
      {
        marks: [[5, 4, 'flash'], [4, 3, 'flash'], [4, 5, 'flash']],
        caption: '黑子只剩 3 口气。继续点击下一个蓝框位置……',
        expect: { points: [[5, 4], [4, 3], [4, 5]], color: W, ok: '还剩 2 口气！', fail: '请点击蓝框标记的气点' },
      },
      {
        marks: [[4, 3, 'flash'], [4, 5, 'flash']],
        caption: '只剩 2 口气了……再点一个！',
        expect: { points: [[4, 3], [4, 5]], color: W, ok: '只剩最后一口气！', fail: '请点击蓝框标记的气点' },
      },
      {
        caption: '最后一口气被占——黑子无气，被整体提掉（从棋盘上消失）。这就是「提子」。',
      },
      {
        reset: true,
        setup: [[4, 4, B], [4, 5, B]],
        marks: [[3, 4, 'flash'], [5, 4, 'flash'], [4, 3, 'flash'], [4, 6, 'flash'], [3, 5, 'flash'], [5, 5, 'flash']],
        caption: '两颗黑子连成棋组：气按整组计算——这组黑子共有 6 口气（蓝框处）。棋组越大越不容易被提。',
      },
    ],
  },
  // ------------------------------------------------------------------ ③
  {
    num: 3,
    title: '禁入点（自杀与提子）',
    size: 9,
    body:
      '<p>如果一个交叉点周围全是对方的棋子（或棋盘边界）——落子后自己<strong>没有任何气</strong>，也提不掉对方的子——这个点就是「<strong>禁入点</strong>」（自杀），规则不允许下。</p>' +
      '<p>但有一个重要例外：落子时<strong>先提掉对方无气的棋子</strong>，自己就有气了——这样的点永远可以下。</p>',
    summary: '落子无气又提不了子 → 禁入点；能提子的点永远合法。',
    demo: [
      {
        reset: true,
        setup: [[0, 1, B], [1, 0, B], [1, 1, B], [8, 8, B], [7, 8, W], [8, 7, W]],
        marks: [[0, 0, 'flash']],
        caption: '角上 (A1) 被黑棋围死。白棋若下在这里：没有气、也提不了黑子 → 禁入点。试着点 (A1)，看看规则会不会拒绝！',
        expect: { points: [[0, 0]], color: W, expectFail: true, ok: '被拒绝了！落子后无气且提不了子 → 禁入点（自杀）。', fail: '请点击 (A1) 试试' },
      },
      {
        reset: true,
        setup: [[0, 0, B], [1, 1, B], [0, 2, B], [8, 8, W]],
        marks: [[0, 1, 'flash'], [1, 0, 'flash']],
        caption: '换个局面：黑 (A1) 只剩最后一口气，蓝框处是它仅存的气点。白棋下 (A1) 会怎样？试试点 (A1)！',
        expect: { points: [[0, 1]], color: W, ok: '看：白子落下时先提掉了黑 (A1)，自己立刻有气 → 完全合法！这就是「先提子」的例外——能提子的点永远可以下。', fail: '请点击 (A1)' },
      },
    ],
  },
  // ------------------------------------------------------------------ ④
  {
    num: 4,
    title: '打劫',
    size: 9,
    body:
      '<p>「<strong>劫</strong>」：双方在同一个地方互相提一子的拉锯战。为了防止棋局无限循环，规则规定：<strong>刚被提一子时，禁止立即回提</strong>——必须先在别处下一手（「找劫材」），对方应一手后才能回提。</p>',
    summary: '禁止立即回提；先在别处「找劫材」，对方应一手后再回提。',
    demo: [
      {
        setup: [[1, 0, W], [3, 0, W], [1, 1, B], [3, 1, B], [2, 1, W], [2, 2, B]],
        marks: [[2, 0, 'flash']],
        caption: '经典的「劫」形：黑下 (C1) 可以提掉白 (C2)——试试点 (C1)（黑棋行动）。',
        expect: { points: [[2, 0]], color: B, ok: '黑提劫成功！注意黑 (C1) 自身也只有一口气（就在刚被提掉的位置）——劫争的焦点就在这里。', fail: '请点击 (C1)' },
      },
      {
        marks: [[2, 1, 'flash']],
        caption: '白棋想立刻回提 (C2)？试试点 (C2)（白棋行动）——看看规则同不同意。',
        expect: { points: [[2, 1]], color: W, expectFail: true, ok: '被拒绝了！刚被提一子时禁止立即回提（否则双方永远循环）。必须先在别处下一手「找劫材」。', fail: '请点击 (C2) 试试' },
      },
      {
        add: [[8, 8, W], [8, 7, B]],
        marks: [[2, 1, 'flash']],
        caption: '白棋找劫材：白 (J1)，黑 (J2) 应了一手——现在可以回提了。再点一次 (C2)！',
        expect: { points: [[2, 1]], color: W, ok: '回提成功！劫争就是这样循环：提劫 → 找劫材 → 回提……直到一方劫材用尽。', fail: '请点击 (C2)' },
      },
    ],
  },
  // ------------------------------------------------------------------ ⑤
  {
    num: 5,
    title: '终局与数子、贴目',
    size: 9,
    body:
      '<p>双方连续<strong>虚手</strong>（弃一手）即终局。终局后用「<strong>数子法</strong>」计算：你的得分 = <strong>活子数 + 围住的空点数</strong>；白棋另加贴目（通常 7.5 目）以补偿黑先优势。</p>' +
      '<p>数子前要先标记<strong>死子</strong>：死子从盘上拿掉，它占据的位置归对方——所以标记一颗死子会带来「子 + 空点」两目的变化。</p>',
    summary: '连续虚手终局 → 标记死子 → 数子（子 + 空），白棋加贴目。',
    demo: [
      {
        reset: true,
        mode: 'dead',
        notice: '点击黑空里的白 (B2) 一子，标记死子（再点取消）',
        setup: [
          [0, 6, B], [1, 6, B], [2, 6, B], [0, 7, B], [2, 7, B], [0, 8, B], [1, 8, B], [2, 8, B],
          [6, 0, W], [7, 0, W], [8, 0, W], [6, 1, W], [8, 1, W], [6, 2, W], [7, 2, W], [8, 2, W],
          [1, 7, W],
        ],
        caption: '已终局的 9 路小局面：黑围左下、白围右上。黑空里的白 (B2) 是死子——点击它标记，看看数子结果怎么变！',
      },
    ],
  },
  // ------------------------------------------------------------------ ⑥
  {
    num: 6,
    title: '让子棋',
    size: 13,
    body:
      '<p>双方实力有差距时可以下「<strong>让子棋</strong>」：黑棋开局前先在星位摆放 2~9 枚黑子，然后<strong>白棋先行</strong>，并且<strong>黑贴 0</strong>（不贴目）。</p>' +
      '<p>让子数量大致对应实力差距：让 2 子实力接近，让 9 子则相差悬殊。摆放顺序：2 子对角星位 → 3 子加右下 → 4 子四角 → 5 子加天元 → 6 子加两边星 → 7 子再加天元 → 8、9 子补满星位。</p>',
    summary: '让子棋：黑先摆 2~9 子于星位，白先行，黑贴 0。',
    demo: [
      {
        reset: true,
        mode: 'handicap',
        notice: '点击让子数按钮，黑子自动摆上星位',
        caption: '选择让子数（2~9）：黑子会按星位自动摆好，之后白棋先行、黑贴 0。',
      },
    ],
  },
  // ------------------------------------------------------------------ ⑦
  {
    num: 7,
    title: '段位体系与常用术语',
    size: 9,
    body:
      '<p><strong>段位体系</strong>：业余棋手从「级」到「段」——30 级（入门）→ 1 级 → 业余 1 段 ~ 7 段（数字越大越强）；职业棋手为「初段 ~ 九段」，用「p」标注（如 柯洁 9p）。</p>' +
      '<p><strong>常用术语</strong>：点「下一步」看图例——虎口、打吃（叫吃）、征子、双活。</p>',
    summary: '级 → 业余段 → 职业段；虎口、打吃、征子、双活是最常用的形与术语。',
    demo: [
      {
        setup: [[4, 4, B], [3, 5, B], [5, 5, B]],
        marks: [[4, 5, 'tri']],
        caption: '「虎」与虎口：黑三子围成的形叫「虎」，三角标记处是「虎口」——白棋若下进去只剩一口气，黑立刻可提。',
      },
      {
        reset: true,
        setup: [[2, 2, B], [1, 2, W], [2, 1, W], [3, 2, W], [8, 8, W]],
        marks: [[2, 3, 'flash']],
        caption: '「打吃」（叫吃）：让对方的棋组只剩最后一口气。图中黑 (C7) 只剩蓝框处一口气——白再堵一手就被提。',
      },
      {
        reset: true,
        setup: [[2, 2, W], [3, 2, W], [2, 3, W], [1, 3, W], [1, 2, B], [2, 1, B], [3, 3, B], [4, 2, B], [2, 4, B], [1, 4, B]],
        marks: [[2, 2, 'text', '征'], [1, 3, 'text', '子']],
        caption: '「征子」（扭羊头）：白棋被追着跑，每逃一步只剩一两口气。黑棋现在挡 (A4)——试试点 (A4)！',
        expect: { points: [[0, 3]], color: B, ok: '黑 (A4) 挡住：白只剩一口气！', fail: '请点击 (A4)' },
      },
      {
        add: [[3, 1, W]],
        marks: [[3, 1, 'text', '逃']],
        caption: '白 (D8) 只能逃——但整组白棋还是只有 2 口气。黑继续挡：请点击 (E8)。',
        expect: { points: [[4, 1]], color: B, ok: '黑 (E8) 又挡住了！白被一步步逼向棋盘边缘。', fail: '请点击 (E8)' },
      },
      {
        add: [[3, 0, W]],
        marks: [[3, 0, 'text', '逃']],
        caption: '白 (D1) 逃向棋盘边缘——征子就是把对方这样「赶尽杀绝」。黑请点击 (C1)。',
        expect: { points: [[2, 0]], color: B, ok: '堵住！白棋的气越来越少……', fail: '请点击 (C1)' },
      },
      {
        add: [[4, 0, W]],
        marks: [[4, 0, 'text', '逃']],
        caption: '白 (E1) 已到边缘。黑请点击 (F1) 收网！',
        expect: { points: [[5, 0]], color: B, ok: '白棋整组 7 子被提！这就是征子的终结。注意：征子方向上若有白棋接应，征子就可能失败（「征子不利」）。', fail: '请点击 (F1)' },
      },
      {
        reset: true,
        setup: [[0, 0, B], [0, 1, B], [3, 0, B], [3, 1, B], [2, 2, B], [2, 0, W], [2, 1, W], [0, 2, W], [1, 2, W]],
        marks: [[1, 0, 'flash'], [1, 1, 'flash']],
        caption: '「双活」（双活无目）：黑白互相包围，共用 (B1)(B2) 两口公气。谁先填公气谁的棋先死——双方都不敢动，这块棋就「双活」，公气不算任何一方的地。',
      },
    ],
  },
  // ------------------------------------------------------------------ ⑧
  {
    num: 8,
    title: '基本礼仪',
    size: 19,
    body:
      '<ul>' +
      '<li><strong>猜先</strong>：对局开始前，上手抓一把白子，下手猜单双，猜中执黑。</li>' +
      '<li><strong>落子无悔</strong>：棋子落下（手已离开）就不能反悔，更不能拿起重下。</li>' +
      '<li><strong>轻拿轻放</strong>：落子置于交叉点上，不敲击棋盘、不发出噪音。</li>' +
      '<li><strong>提子入盒</strong>：提掉对方的子要放进对方棋盒，保持棋盘整洁。</li>' +
      '<li><strong>不打扰</strong>：对局中不说话、不做干扰对方思考的举动。</li>' +
      '<li><strong>认输有礼</strong>：形势不可挽回时说「我认输」，不无意义地拖延。</li>' +
      '<li><strong>复盘致谢</strong>：终局后互相致谢，高水平对局常一起复盘研究。</li>' +
      '<li><strong>网络对局</strong>：不中途退出、不使用软件辅助、结束后礼貌道别。</li>' +
      '</ul>',
    summary: '尊重对手、尊重棋局：猜先定黑白、落子无悔、终局致谢。',
    demo: [
      {
        caption: '本章是礼仪守则，无需操作棋盘。下一章我们学习常见的开局方式。',
      },
    ],
  },
  // ------------------------------------------------------------------ ⑨
  {
    num: 9,
    title: '常见开局与布局',
    size: 19,
    body:
      '<p>布局次序的口诀：「<strong>金角银边草肚皮</strong>」——同样围一块地，角上用的子最少、效率最高，边其次，中腹最费子力。所以布局<strong>先占角、再守边、后向中腹发展</strong>。</p>' +
      '<p>占角的三个常用点（点「下一步」看图）：</p>' +
      '<ul><li><strong>星位</strong>（4·4）：取外势，速度最快；</li>' +
      '<li><strong>小目</strong>（4·3）：偏重实地，便于守角；</li>' +
      '<li><strong>三三</strong>（3·3）：直接取角——1933 年吴清源对本因坊秀哉的「世纪名局」中，吴清源第一手就下在三三。</li></ul>' +
      '<p>学完本章，去「排盘」标签页打开那盘世纪名局看看实战吧！</p>',
    summary: '金角银边草肚皮；先角后边再中腹；星位 / 小目 / 三三各有所长。',
    demo: [
      {
        reset: true,
        setup: [[3, 3, B]],
        marks: [[15, 3, 'tri'], [3, 15, 'tri'], [15, 15, 'tri'], [9, 9, 'tri']],
        caption: '「星位」（4·4）：三角处是四个角的星位与天元。黑棋已占左上星位——取势、速度最快的占角方式。',
      },
      {
        reset: true,
        setup: [[3, 2, B]],
        marks: [[3, 2, 'tri']],
        caption: '「小目」（4·3）：比星位低一路，偏重实地，方便后续守角。',
      },
      {
        reset: true,
        setup: [[2, 2, B]],
        marks: [[2, 2, 'tri']],
        caption: '「三三」（3·3）：直接把角围到手，实利最大。1933 年吴清源执黑对本因坊秀哉，第一手就是三三——去「排盘」看看这盘世纪名局！',
      },
      {
        reset: true,
        setup: [[2, 2, B], [3, 3, B], [16, 16, W], [15, 15, W], [3, 9, B], [15, 9, W], [9, 3, B], [9, 15, W]],
        marks: [[4, 4, 'text', '角'], [4, 9, 'text', '边'], [9, 9, 'text', '中腹']],
        caption: '「金角银边草肚皮」：同样围一块地，角上效率最高（用子最少），边其次，中腹最费子——布局先角、后边、再中腹。',
      },
    ],
  },
];

const CIRCLED = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨'];

export class LearnController {
  /**
   * @param {import('./board.js').BoardRenderer} renderer
   */
  constructor(renderer) {
    this.renderer = renderer;
    this.chapterIndex = 0;
    this.stepIndex = 0;
    this.board = null;
    this.marks = [];
    this.deadMarks = new Set();
    this.game = null;       // 自由落子演示用
    this._demoGame = null;  // 交互步骤用（保持规则一致性）
    this.el = {
      body: document.getElementById('chapter-body'),
      title: document.getElementById('chapter-title'),
      index: document.getElementById('chapter-index'),
      prev: document.getElementById('btn-chapter-prev'),
      next: document.getElementById('btn-chapter-next'),
      demoNext: document.getElementById('btn-demo-next'),
      demoReset: document.getElementById('btn-demo-reset'),
      caption: document.getElementById('demo-caption'),
      notice: document.getElementById('demo-notice'),
    };
    this._wire();
    this._buildChapterNav();
  }

  activate() {
    this.renderer.interactive = true;
    this.renderer.onClick = (x, y) => this.onCellClick(x, y);
    this.enterChapter(this.chapterIndex);
  }

  deactivate() {}

  _wire() {
    this.el.prev.addEventListener('click', () => {
      this.enterChapter((this.chapterIndex - 1 + CHAPTERS.length) % CHAPTERS.length);
    });
    this.el.next.addEventListener('click', () => {
      this.enterChapter((this.chapterIndex + 1) % CHAPTERS.length);
    });
    this.el.demoNext.addEventListener('click', () => this.nextStep());
    this.el.demoReset.addEventListener('click', () => this.enterChapter(this.chapterIndex));
  }

  _buildChapterNav() {
    this.el.index.innerHTML = '';
    CHAPTERS.forEach((c, i) => {
      const b = document.createElement('button');
      b.className = 'chapter-btn';
      b.textContent = CIRCLED[i];
      b.title = c.title;
      b.addEventListener('click', () => this.enterChapter(i));
      this.el.index.appendChild(b);
    });
  }

  get chapter() {
    return CHAPTERS[this.chapterIndex];
  }

  get step() {
    return this.chapter.demo[this.stepIndex];
  }

  enterChapter(i) {
    this.chapterIndex = ((i % CHAPTERS.length) + CHAPTERS.length) % CHAPTERS.length;
    const ch = this.chapter;
    this.el.title.textContent = `${CIRCLED[ch.num - 1]} ${ch.title}`;
    this.el.body.innerHTML = ch.body + `<div class="chapter-summary"><strong>本章小结：</strong>${ch.summary}</div>`;
    [...this.el.index.children].forEach((b, bi) => b.classList.toggle('active', bi === this.chapterIndex));
    this.size = ch.size;
    this.renderer.setSize(this.size);
    this.stepIndex = 0;
    this._applyStep();
  }

  /** 应用当前步骤（进入章节 / 重置时） */
  _applyStep() {
    const step = this.step;
    this.mode = step.mode || null;
    this.deadMarks = new Set();
    this._demoGame = null; // 进入章节总是重置演示引擎

    if (step.reset) {
      this.board = new Int8Array(this.size * this.size);
    }
    if (!this.board || this.board.length !== this.size * this.size) {
      this.board = new Int8Array(this.size * this.size);
      this._demoGame = null;
    }
    if (step.setup) {
      for (const [x, y, c] of step.setup) this.board[y * this.size + x] = c;
    }
    if (step.mode === 'free') {
      this.game = new GoGame(this.size, 7.5, 0);
      this.board = this.game.board;
    }
    this.marks = step.marks || [];
    this.el.caption.textContent = step.caption;
    this._setNotice(step.notice, step.mode);
    this._render();
  }

  /** 进入下一步（保留棋面，衔接交互步骤的落子） */
  _advance(keepBoard = true) {
    if (this.stepIndex >= this.chapter.demo.length - 1) {
      this.el.caption.textContent = '本章演示已到结尾——点「重置演示」再看一遍，或切换下一章。';
      return;
    }
    this.stepIndex++;
    const step = this.step;
    this.mode = step.mode || null;
    this.deadMarks = new Set();
    if (step.reset) {
      this.board = new Int8Array(this.size * this.size);
      this._demoGame = null;
    }
    if (step.setup) {
      for (const [x, y, c] of step.setup) this.board[y * this.size + x] = c;
    }
    if (step.add) {
      for (const [x, y, c] of step.add) {
        const r = this._playOnBoard(x, y, c);
        if (!r.ok) this.board[y * this.size + x] = c; // 演示兜底
      }
    }
    this.marks = step.marks || [];
    this.el.caption.textContent = step.caption;
    this._setNotice(step.notice, step.mode);
    this._render();
  }

  _setNotice(text, mode) {
    if (mode === 'handicap') {
      // 让子数按钮
      this.el.notice.innerHTML = '让子数：';
      for (let n = 2; n <= 9; n++) {
        const b = document.createElement('button');
        b.className = 'mini-btn';
        b.textContent = String(n);
        b.addEventListener('click', () => this._setHandicap(n));
        this.el.notice.appendChild(b);
      }
      this.el.notice.classList.remove('hidden');
    } else {
      this.el.notice.textContent = text || '';
      this.el.notice.classList.toggle('hidden', !text);
    }
    const interactive = !this.mode; // 非特殊模式才有「下一步」
    this.el.demoNext.classList.toggle('hidden', !!this.mode && this.mode !== 'dead');
  }

  _setHandicap(n) {
    this.board = new Int8Array(this.size * this.size);
    this._demoGame = null;
    const pts = (HANDICAP_POINTS[this.size] || HANDICAP_POINTS[19])[n] || [];
    for (const [x, y] of pts) this.board[y * this.size + x] = BLACK;
    this.marks = [];
    this._render(`让 ${n} 子：黑棋 ${n} 枚已摆在星位上——接下来白棋先行，黑贴 0。可在「对弈」页选择让子开局真实对弈。`);
  }

  _render(extraCaption) {
    const g = this.game;
    this.renderer.setState({
      board: this.board,
      size: this.size,
      lastMove: g && g.lastMove && !g.lastMove.pass ? { x: g.lastMove.x, y: g.lastMove.y } : null,
      marks: (this.marks || []).map((m) =>
        Array.isArray(m) ? { x: m[0], y: m[1], kind: m[2], label: m[3] } : m,
      ),
      deadMarks: this.mode === 'dead' ? this.deadMarks : new Set(),
    });
    if (extraCaption !== undefined) this.el.caption.textContent = extraCaption;
  }

  /** 在演示棋盘上按规则落子（同步引擎，用于提子/禁入点/打劫判定） */
  _playOnBoard(x, y, color) {
    if (!this._demoGame || this._demoGame.size !== this.size) {
      this._demoGame = new GoGame(this.size, 7.5, 0);
      this._demoGame.board.set(this.board);
    }
    const r = this._demoGame.play(x, y, color);
    if (r.ok) this.board = this._demoGame.board;
    return r;
  }

  onCellClick(x, y) {
    const step = this.step;

    if (this.mode === 'free') {
      if (!this.game) return;
      const r = this.game.play(x, y);
      if (!r.ok) {
        this._render(r.error + '（换个空点试试）');
        return;
      }
      const nextName = this.game.turn === BLACK ? '黑' : '白';
      let msg = r.capturedCount > 0 ? `提子 ${r.capturedCount} 枚！` : '落子成功！';
      this._render(`${msg}轮到${nextName}方，继续试下吧。`);
      return;
    }

    if (this.mode === 'dead') {
      const idx = y * this.size + x;
      if (this.board[idx] === EMPTY) {
        this._render('请点击棋子（黑空里的白 B2）标记死子');
        return;
      }
      if (this.deadMarks.has(idx)) this.deadMarks.delete(idx);
      else this.deadMarks.add(idx);
      const s = scoreBoard(this.board, this.size, 7.5, [...this.deadMarks]);
      const tail = this.deadMarks.size > 0
        ? `死子被拿掉后：黑 = 8 子 + 2 空 = ${s.black}；白 = 8 子 + 1 空 + 贴 7.5 = ${s.white} → ${s.result}。一颗死子带来「子+空」2 目变化。`
        : '不标死子的话：黑 = 8 子 + 1 空；白 = 9 子 + 1 空 + 贴 7.5。';
      this._render(`死子标记：${this.deadMarks.size} 枚 → 黑 ${s.black} · 白 ${s.white} → ${s.result}。${tail}`);
      return;
    }

    // 交互步骤
    if (step && step.expect) {
      const exp = step.expect;
      const hit = exp.points.some(([px, py]) => px === x && py === y);
      if (!hit) {
        this._render(exp.fail || '点错了，试试标记处的位置');
        return;
      }
      const r = this._playOnBoard(x, y, exp.color);
      const allowed = exp.expectFail ? !r.ok : r.ok;
      if (allowed) {
        let okMsg = exp.ok;
        if (r.ok && r.capturedCount > 0) okMsg += `（提子 ${r.capturedCount} 枚）`;
        this._render(okMsg);
        if (this.stepIndex < this.chapter.demo.length - 1) {
          setTimeout(() => this._advance(true), 500);
        }
        return;
      }
      this._render((exp.expectFail ? '' : (r.error || '无法落子') + ' ') + '（再想想，或换标记处的位置）');
      return;
    }

    this._render('点击「下一步」继续本章演示');
  }

  /** 「下一步」按钮 */
  nextStep() {
    const step = this.step;
    if (step.expect) {
      // 用户没点对：代为点击第一个期望点（降低挫败感）
      const [px, py] = step.expect.points[0];
      this.onCellClick(px, py);
      return;
    }
    this._advance(true);
  }
}
