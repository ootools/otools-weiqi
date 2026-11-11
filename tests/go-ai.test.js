/**
 * 电脑对弈 AI（go-ai.js）测试：
 * 提子、救棋、绝不填自己的真眼、AI 自对弈（双 pass 终局 + 逐手合法 + 数子）、
 * 19 路空盘开局角部偏好（容差判断）、同局面同难度两次结果一致。
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { GoGame, BLACK, WHITE, EMPTY, groupAndLiberties } from '../web/js/engine/go.js';
import { chooseMove } from '../web/js/engine/go-ai.js';

/** 在 GoGame 上直接摆子（绕过行棋，构造测试局面） */
function setup(size, stones) {
  const g = new GoGame(size, 7.5, 0);
  for (const [x, y, c] of stones) g.board[y * size + x] = c;
  return g;
}

describe('go-ai · 提子', () => {
  it('优先提掉对方 1 口气的棋子', () => {
    // 白 (4,4) 被 black 三面包住，只剩 (4,5) 一口气
    const g = setup(9, [
      [3, 4, BLACK], [5, 4, BLACK], [4, 3, BLACK],
      [4, 4, WHITE],
    ]);
    const mv = chooseMove(g, BLACK, { level: 'normal' });
    assert.notEqual(mv, 'pass');
    assert.deepEqual(mv, { x: 4, y: 5 }, `应提子于 (4,5)，实际 ${JSON.stringify(mv)}`);
    // 用引擎验证该着确实是提子
    const r = g.play(mv.x, mv.y);
    assert.equal(r.ok, true, r.error);
    assert.equal(r.capturedCount, 1);
    assert.equal(g.captures[BLACK], 1);
    assert.equal(g.board[4 * 9 + 4], EMPTY);
  });

  it('hard 难度同样能提子', () => {
    const g = setup(9, [
      [2, 2, WHITE], [3, 2, BLACK], [1, 2, BLACK], [2, 1, BLACK],
    ]);
    const mv = chooseMove(g, BLACK, { level: 'hard' });
    assert.deepEqual(mv, { x: 2, y: 3 }, `应提子于 (2,3)，实际 ${JSON.stringify(mv)}`);
  });
});

describe('go-ai · 救棋', () => {
  it('己方 1 口气棋组：延长脱险（走出 ≥2 气）', () => {
    // 黑 (2,2),(2,3) 一组只剩 (2,4) 一口气；四周白子
    const g = setup(9, [
      [2, 2, BLACK], [2, 3, BLACK],
      [1, 2, WHITE], [2, 1, WHITE], [3, 2, WHITE], [3, 3, WHITE], [1, 3, WHITE],
    ]);
    const mv = chooseMove(g, BLACK, { level: 'normal' });
    assert.deepEqual(mv, { x: 2, y: 4 }, `应延长救棋于 (2,4)，实际 ${JSON.stringify(mv)}`);
    const r = g.play(mv.x, mv.y);
    assert.equal(r.ok, true, r.error);
    const grp = groupAndLiberties(g.board, 9, 2, 2);
    assert.ok(grp.liberties.length >= 2, `救棋后棋组应有 ≥2 气，实际 ${grp.liberties.length}`);
  });

  it('己方 1 口气棋组：反提对方脱险', () => {
    // 黑 (2,2) 1 口气 (2,3)；但 (2,3) 落黑可提白 (2,4)（白 (2,4) 唯一气在 (2,3)）
    const g = setup(9, [
      [2, 2, BLACK], [1, 2, WHITE], [2, 1, WHITE], [3, 2, WHITE],
      [2, 4, WHITE], [1, 4, BLACK], [3, 4, BLACK], [2, 5, BLACK],
    ]);
    const mv = chooseMove(g, BLACK, { level: 'normal' });
    assert.deepEqual(mv, { x: 2, y: 3 }, `应于 (2,3) 反提救棋，实际 ${JSON.stringify(mv)}`);
    const r = g.play(mv.x, mv.y);
    assert.equal(r.ok, true, r.error);
    assert.equal(r.capturedCount, 1);
  });
});

describe('go-ai · 真眼', () => {
  it('绝不填自己的真眼', () => {
    // 黑墙围出 (4,4) 真眼：4 正邻全黑 + 4 斜角全黑
    const g = setup(9, [
      [3, 4, BLACK], [5, 4, BLACK], [4, 3, BLACK], [4, 5, BLACK],
      [3, 3, BLACK], [5, 3, BLACK], [3, 5, BLACK], [5, 5, BLACK],
      [8, 8, WHITE],
    ]);
    const mv = chooseMove(g, BLACK, { level: 'normal' });
    assert.notEqual(mv, 'pass', '盘面还有明显大点，不应虚手');
    assert.ok(!(mv.x === 4 && mv.y === 4), `AI 不应填自己的真眼，却选择了 (${mv.x},${mv.y})`);
  });

  it('easy 难度同样不填真眼', () => {
    const g = setup(9, [
      [3, 4, BLACK], [5, 4, BLACK], [4, 3, BLACK], [4, 5, BLACK],
      [3, 3, BLACK], [5, 3, BLACK], [3, 5, BLACK], [5, 5, BLACK],
      [8, 8, WHITE],
    ]);
    for (let i = 0; i < 10; i++) {
      const mv = chooseMove(g, BLACK, { level: 'easy' });
      assert.notEqual(mv, 'pass');
      assert.ok(!(mv.x === 4 && mv.y === 4), `easy AI 填了自己的真眼 (${mv.x},${mv.y})`);
    }
  });
});

describe('go-ai · 自对弈', () => {
  /** 黑白都是 AI 的整局自对弈：逐手用引擎校验合法性，直到双 pass */
  function selfPlay(size, level, cap) {
    const g = new GoGame(size, 7.5, 0);
    let n = 0;
    while (g.phase === 'playing' && n < cap) {
      const mv = chooseMove(g, g.turn, { level });
      if (mv === 'pass') {
        const r = g.pass();
        assert.equal(r.ok, true, `第 ${n + 1} 手 pass 应成功`);
      } else {
        assert.equal(typeof mv.x, 'number', `着法应含 x：${JSON.stringify(mv)}`);
        assert.equal(typeof mv.y, 'number', `着法应含 y：${JSON.stringify(mv)}`);
        assert.equal(
          g.board[mv.y * size + mv.x], EMPTY,
          `AI 落在已有棋子的点上 (${mv.x},${mv.y})`,
        );
        const r = g.play(mv.x, mv.y);
        assert.equal(r.ok, true, `第 ${n + 1} 手 AI 着法非法（${r.error}）@ (${mv.x},${mv.y})`);
      }
      n++;
    }
    return { g, n };
  }

  it('9 路自对弈：整局终止于双 pass、全程每手合法、终局能数子', () => {
    const { g, n } = selfPlay(9, 'normal', 300);
    assert.equal(g.phase, 'marking', `自对弈未在 ${n} 手内双 pass 终局（phase=${g.phase}）`);
    assert.ok(g.consecutivePasses >= 2, '应以双 pass 终局');
    const s = g.score();
    assert.match(s.result, /^(B\+|W\+|Draw)/, `数子结果异常：${s.result}`);
  });

  it('13 路自对弈同样合法并正常终局', () => {
    const { g, n } = selfPlay(13, 'normal', 500);
    assert.equal(g.phase, 'marking', `13 路自对弈未在 ${n} 手内双 pass 终局（phase=${g.phase}）`);
    const s = g.score();
    assert.match(s.result, /^(B\+|W\+|Draw)/);
  });

  it('hard 难度自对弈（9 路）合法并正常终局', () => {
    const { g, n } = selfPlay(9, 'hard', 300);
    assert.equal(g.phase, 'marking', `hard 自对弈未在 ${n} 手内双 pass 终局（phase=${g.phase}）`);
    const s = g.score();
    assert.match(s.result, /^(B\+|W\+|Draw)/);
  });

  it('19 路自对弈（normal）合法并正常终局', () => {
    const { g, n } = selfPlay(19, 'normal', 800);
    assert.equal(g.phase, 'marking', `19 路自对弈未在 ${n} 手内双 pass 终局（phase=${g.phase}）`);
    const s = g.score();
    assert.match(s.result, /^(B\+|W\+|Draw)/);
  });
});

describe('go-ai · 开局', () => {
  it('19 路空盘 normal 首选在角部星位/3-3/4-4 附近（容差 1）', () => {
    const g = new GoGame(19, 7.5, 0);
    const mv = chooseMove(g, BLACK, { level: 'normal' });
    assert.notEqual(mv, 'pass', '空盘不应虚手');
    const keys = [[3, 3], [15, 3], [3, 15], [15, 15], [2, 2], [16, 2], [2, 16], [16, 16]];
    const d = Math.min(...keys.map(([kx, ky]) => Math.max(Math.abs(mv.x - kx), Math.abs(mv.y - ky))));
    assert.ok(d <= 1, `首选 (${mv.x},${mv.y}) 距角部要点切比雪夫距离 ${d} > 1`);
  });

  it('9 路空盘 normal 首选同样偏好角部', () => {
    const g = new GoGame(9, 7.5, 0);
    const mv = chooseMove(g, BLACK, { level: 'normal' });
    const keys = [[2, 2], [6, 2], [2, 6], [6, 6]];
    const d = Math.min(...keys.map(([kx, ky]) => Math.max(Math.abs(mv.x - kx), Math.abs(mv.y - ky))));
    assert.ok(d <= 1, `首选 (${mv.x},${mv.y}) 距角部要点切比雪夫距离 ${d} > 1`);
  });
});

describe('go-ai · 确定性', () => {
  it('同局面同难度两次结果一致（easy/normal/hard）', () => {
    const mk = () => setup(9, [
      [2, 2, BLACK], [6, 6, WHITE], [4, 4, BLACK], [4, 5, WHITE],
    ]);
    for (const level of ['easy', 'normal', 'hard']) {
      const a = chooseMove(mk(), BLACK, { level });
      const b = chooseMove(mk(), BLACK, { level });
      assert.deepEqual(a, b, `难度 ${level} 两次结果不一致：${JSON.stringify(a)} vs ${JSON.stringify(b)}`);
    }
  });
});
