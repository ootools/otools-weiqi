/**
 * 围棋规则引擎测试：提子、打劫、禁入点（含提子后合法反例）、
 * pass 终局、数子法、让子棋、undo/redo。
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { GoGame, BLACK, WHITE, EMPTY, groupAndLiberties, scoreBoard, HANDICAP_POINTS } from '../web/js/engine/go.js';

describe('提子', () => {
  it('角上一组棋子被整体提掉（气尽）', () => {
    const g = new GoGame(9, 7.5, 0);
    // 黑占角 (0,0),(0,1),(1,0)，白逐步包夹
    assert.equal(g.play(0, 0).ok, true); // 黑
    assert.equal(g.play(1, 1).ok, true); // 白
    assert.equal(g.play(0, 1).ok, true); // 黑
    assert.equal(g.play(0, 2).ok, true); // 白
    assert.equal(g.play(1, 0).ok, true); // 黑
    assert.equal(g.play(2, 0).ok, true); // 白 → 黑角上三子气尽
    const r = g.play(8, 8); // 黑闲着（无提子发生时白不提）——此处验证上一手是否已提
    assert.equal(r.ok, true, r.error);
    // 白第 6 手 (2,0) 已提黑三子
    assert.equal(g.captures[WHITE], 3);
    assert.equal(g.board[0], EMPTY);
    assert.equal(g.board[1], EMPTY);
    assert.equal(g.board[9], EMPTY);
  });

  it('边线棋组被整体提掉', () => {
    const g = new GoGame(9, 7.5, 0);
    g.play(0, 0); g.play(8, 8); // 黑(0,0) 白(8,8)
    g.play(0, 1); g.play(7, 8); // 黑(0,1) 白(7,8)
    g.play(8, 7);               // 黑闲
    g.play(1, 0);               // 白(1,0)：黑组剩 (0,2)(2,0) 两口气
    g.play(7, 7);               // 黑闲
    g.play(1, 1);               // 白(1,1)：黑组剩 (0,2)(2,0)
    g.play(8, 6);               // 黑闲
    g.play(2, 0);               // 白(2,0)：黑组只剩 (0,2)
    g.play(8, 5);               // 黑闲
    const r = g.play(0, 2);     // 白堵最后一口气 → 提黑两子
    assert.equal(r.ok, true, r.error);
    assert.equal(r.capturedCount, 2);
    assert.equal(g.captures[WHITE], 2);
    assert.equal(g.board[0], EMPTY); // (0,0)
    assert.equal(g.board[9], EMPTY); // (0,1)
  });
});

describe('禁入点（自杀）', () => {
  it('填进被包围的角点且无子可提 → 非法', () => {
    const g = new GoGame(9, 7.5, 0);
    g.play(8, 8); // 黑
    g.play(0, 0); // 白角上单子
    g.play(0, 1); // 黑
    g.play(8, 7); // 白闲
    g.play(1, 0); // 黑 → 白 (0,0) 气尽被提
    assert.equal(g.captures[BLACK], 1);
    assert.equal(g.board[0], EMPTY);
    // 白立即回填 (0,0)：两邻全是黑、无子可提 → 自杀，非法
    const r = g.play(0, 0);
    assert.equal(r.ok, false);
    assert.match(r.error, /禁入点/);
  });

  it('提子后自己有气 → 合法（打吃提子反例）', () => {
    const g = new GoGame(9, 7.5, 0);
    g.play(0, 0); // 黑 目标子
    g.play(1, 0); // 白
    g.play(1, 1); // 黑
    g.play(8, 8); // 白闲
    g.play(0, 2); // 黑（此时黑 (0,0) 只剩 (0,1) 一口气）
    // 白落 (0,1)：自身邻点 (1,1)B (0,2)B 无空，靠提掉黑 (0,0) 获得气 → 合法
    const r = g.play(0, 1);
    assert.equal(r.ok, true, r.error);
    assert.equal(r.capturedCount, 1);
    assert.equal(g.board[0], EMPTY);
    assert.equal(g.captures[WHITE], 1);
    // 黑回填 (0,0)：同时是劫点（单提+单子+单气）→ 立即回提禁手
    const r2 = g.play(0, 0);
    assert.equal(r2.ok, false);
    assert.match(r2.error, /打劫/);
  });
});

describe('打劫（简单劫）', () => {
  // 经典劫形（顶部）：
  //   y=0: . W . W .
  //   y=1: . B W B .
  //   y=2: . . B . .
  function koGame() {
    const g = new GoGame(9, 7.5, 0);
    g.board[0 * 9 + 1] = WHITE; // (1,0)
    g.board[0 * 9 + 3] = WHITE; // (3,0)
    g.board[1 * 9 + 2] = WHITE; // (2,1) 劫石（唯一气在 (2,0)）
    g.board[1 * 9 + 1] = BLACK; // (1,1)
    g.board[1 * 9 + 3] = BLACK; // (3,1)
    g.board[2 * 9 + 2] = BLACK; // (2,2)
    return g;
  }

  it('提劫后禁止立即回提，隔一手后可回提', () => {
    const g = koGame();
    assert.equal(g.turn, BLACK);
    // 黑 (2,0) 提白 (2,1)：单提 + 自身单子单气 → 形成劫
    const r1 = g.play(2, 0);
    assert.equal(r1.ok, true, r1.error);
    assert.equal(r1.capturedCount, 1);
    assert.equal(g.board[1 * 9 + 2], EMPTY, '白劫石被提');
    assert.ok(g.koPoint, '应产生劫点');
    assert.equal(g.koPoint.idx, 1 * 9 + 2);

    // 白立即回提 → 禁手
    const r2 = g.play(2, 1);
    assert.equal(r2.ok, false);
    assert.match(r2.error, /打劫/);

    // 白先在别处落子（找劫材后），黑应对，白即可回提
    assert.equal(g.play(8, 8).ok, true); // 白闲着
    assert.equal(g.play(8, 7).ok, true); // 黑闲着
    const r4 = g.play(2, 1); // 白回提黑 (2,0)
    assert.equal(r4.ok, true, r4.error);
    assert.equal(r4.capturedCount, 1);
    assert.equal(g.board[0 * 9 + 2], EMPTY, '黑劫石被提');
    assert.equal(g.koPoint.idx, 0 * 9 + 2);

    // 黑立即再回提 → 又被禁
    const r5 = g.play(2, 0);
    assert.equal(r5.ok, false);
    assert.match(r5.error, /打劫/);
  });

  it('劫点只对当前一手有效：白消劫（粘劫）后局面正常', () => {
    const g = koGame();
    g.play(2, 0);                 // 黑提劫
    assert.equal(g.play(2, 1).ok, false); // 立即回提被禁
    assert.equal(g.play(2, 1).ok, false); // 连续尝试仍被禁（同一手）
    // 白消劫：不在劫点落子
    assert.equal(g.play(5, 5).ok, true);
    assert.equal(g.play(5, 4).ok, true);
    // 现在白可以自由落 (2,1) 粘劫（该点已不再是禁手）
    const r = g.play(2, 1);
    assert.equal(r.ok, true, r.error);
  });
});

describe('pass 与终局', () => {
  it('双方连续 pass → 进入死子标记阶段；可回退继续对局', () => {
    const g = new GoGame(9, 7.5, 0);
    g.play(4, 4); g.play(4, 5);
    const p1 = g.pass();
    assert.equal(p1.phase, 'playing');
    const p2 = g.pass();
    assert.equal(p2.phase, 'marking');
    // marking 阶段不能落子
    const r = g.play(0, 0);
    assert.equal(r.ok, false);
    // 数子（无死子）
    const s = g.score();
    assert.equal(s.black, 1);
    assert.equal(s.white, 8.5);
    assert.equal(s.result, 'W+7.5');
    // 回到对局：回退两个 pass
    const rp = g.resumePlay();
    assert.equal(rp.ok, true);
    assert.equal(g.phase, 'playing');
    assert.equal(g.moveNumber, 2);
    assert.equal(g.play(0, 0).ok, true);
  });

  it('跳过死子标记 → finalize 定格结果', () => {
    const g = new GoGame(9, 7.5, 0);
    g.play(4, 4); g.play(4, 5); g.pass(); g.pass();
    g.skipMarking();
    const f = g.finalize();
    assert.equal(f.ok, true);
    assert.equal(g.phase, 'over');
    assert.equal(g.result.result, 'W+7.5');
  });
});

describe('数子法', () => {
  // 9 路局面：黑左下围栏（内部 1 空点），白右上围栏（内部 1 空点）
  function fenceGame() {
    const g = new GoGame(9, 7.5, 0);
    g.board.fill(0);
    for (let x = 0; x <= 2; x++) { g.board[6 * 9 + x] = BLACK; g.board[8 * 9 + x] = BLACK; }
    for (let y = 6; y <= 8; y++) { g.board[y * 9 + 0] = BLACK; g.board[y * 9 + 2] = BLACK; }
    for (let x = 6; x <= 8; x++) { g.board[0 * 9 + x] = WHITE; g.board[2 * 9 + x] = WHITE; }
    for (let y = 0; y <= 2; y++) { g.board[y * 9 + 6] = WHITE; g.board[y * 9 + 8] = WHITE; }
    return g;
  }

  it('子空归属与贴目（黑 8 子+1 空，白 8 子+1 空+贴目）', () => {
    const g = fenceGame();
    const s = g.score();
    assert.equal(s.black, 9);
    assert.equal(s.white, 16.5);
    assert.equal(s.result, 'W+7.5');
    assert.equal(s.blackArea, 1);
    assert.equal(s.whiteArea, 1);
  });

  it('死子标记改变数子结果（子+空两点摆动）', () => {
    const g = fenceGame();
    // 在黑围栏内部放一颗白子：不标记时按活子计，标记死子后该点归黑
    g.board[7 * 9 + 1] = WHITE;
    const sAlive = g.score(); // 未标记死子
    assert.equal(sAlive.black, 8);
    assert.equal(sAlive.white, 17.5);
    assert.equal(sAlive.result, 'W+9.5');
    const sDead = g.score([7 * 9 + 1]); // 标记该白子为死子
    assert.equal(sDead.deadWhite, 1);
    assert.equal(sDead.black, 9);
    assert.equal(sDead.white, 16.5);
    assert.equal(sDead.result, 'W+7.5');
  });

  it('邻双色的空点为公气，不计入任何一方', () => {
    const g = new GoGame(9, 0, 0);
    g.play(0, 0); g.play(8, 8);
    g.pass(); g.pass();
    const s = g.score();
    assert.equal(s.black, 1);
    assert.equal(s.white, 1);
    assert.equal(s.neutral, 79);
    assert.equal(s.result, 'Draw');
  });

  it('贴目 7.5/6.5/5.5/0 影响结果', () => {
    const board = new Int8Array(81);
    board[0] = BLACK; board[80] = WHITE;
    assert.equal(scoreBoard(board, 9, 7.5).result, 'W+7.5');
    assert.equal(scoreBoard(board, 9, 6.5).result, 'W+6.5');
    assert.equal(scoreBoard(board, 9, 5.5).result, 'W+5.5');
    assert.equal(scoreBoard(board, 9, 0).result, 'Draw');
  });
});

describe('让子棋', () => {
  it('让 2 子：星位摆放、白先行、黑贴 0', () => {
    const g = new GoGame(19, 7.5, 2);
    assert.equal(g.komi, 0);
    assert.equal(g.turn, WHITE);
    const pts = HANDICAP_POINTS[19][2];
    for (const [x, y] of pts) assert.equal(g.board[y * 19 + x], BLACK);
    const r = g.play(3, 3);
    assert.equal(r.ok, true, r.error);
    assert.equal(r.color, WHITE);
    const [hx, hy] = pts[0];
    assert.equal(g.play(hx, hy, BLACK).ok, false); // 已有子
  });

  it('让 9 子：九个星位全占', () => {
    const g = new GoGame(19, 6.5, 9);
    assert.equal(g.komi, 0);
    const pts = HANDICAP_POINTS[19][9];
    assert.equal(pts.length, 9);
    let blackCount = 0;
    for (let i = 0; i < g.board.length; i++) if (g.board[i] === BLACK) blackCount++;
    assert.equal(blackCount, 9);
    assert.equal(g.turn, WHITE);
  });

  it('让子棋数子：黑不贴目', () => {
    const g = new GoGame(9, 7.5, 2);
    g.pass(); g.pass(); // 白先 pass，黑再 pass
    const s = g.score();
    assert.equal(s.komi, 0);
    assert.equal(s.black, 81); // 两颗黑子 + 全盘空点（白无子，空点全邻黑）
    assert.equal(s.white, 0);
    assert.equal(s.result, 'B+81');
  });

  it('让子数不合法时收敛到 2~9', () => {
    assert.equal(new GoGame(19, 7.5, 1).handicap, 2);
    assert.equal(new GoGame(19, 7.5, 10).handicap, 9);
    assert.equal(new GoGame(19, 7.5, 0).handicap, 0);
  });
});

describe('undo / redo', () => {
  it('悔棋与前进', () => {
    const g = new GoGame(9, 7.5, 0);
    g.play(4, 4);
    g.play(4, 5);
    assert.equal(g.moveNumber, 2);
    assert.equal(g.undo(), true);
    assert.equal(g.moveNumber, 1);
    assert.equal(g.board[5 * 9 + 4], EMPTY); // (4,5)
    assert.equal(g.turn, WHITE);
    assert.equal(g.redo(), true);
    assert.equal(g.moveNumber, 2);
    assert.equal(g.board[5 * 9 + 4], WHITE); // (4,5)
    g.undo(); g.undo();
    assert.equal(g.undo(), false);
    assert.equal(g.moveNumber, 0);
    assert.equal(g.canRedo, true);
    g.play(2, 2); // 新落子截断 redo 分支
    assert.equal(g.canRedo, false);
    assert.equal(g.moveNumber, 1);
  });

  it('悔棋可撤销提子', () => {
    const g = new GoGame(9, 7.5, 0);
    g.play(0, 0); g.play(1, 1); // 黑(0,0) 白(1,1)
    g.play(0, 1); g.play(0, 2); // 黑(0,1) 白(0,2)
    g.play(1, 0); g.play(2, 0); // 黑(1,0) 白(2,0) → 提黑三子
    assert.equal(g.captures[WHITE], 3);
    g.undo();
    assert.equal(g.captures[WHITE], 0);
    assert.equal(g.board[0 * 9 + 2], EMPTY, '悔棋撤销了白 (2,0)');
    assert.equal(g.board[0], BLACK, '黑角棋子恢复');
    assert.equal(g.turn, WHITE);
  });
});

describe('引擎工具函数', () => {
  it('groupAndLiberties：棋组与气', () => {
    const board = new Int8Array(81);
    board[0] = BLACK; // (0,0)
    board[1] = BLACK; // (1,0)
    board[9] = WHITE; // (0,1)
    const g = groupAndLiberties(board, 9, 0, 0);
    assert.equal(g.stones.length, 2);
    assert.equal(g.liberties.length, 2);
  });
});
