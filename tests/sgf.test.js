/**
 * SGF 解析/导出测试：属性解析、转义、变化树取主线、坐标、
 * 解析→序列化往返、引擎对局导出与再导入。
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { parseSGF, recordToSGF, gameToSGF } from '../web/js/engine/sgf.js';
import { GoGame, BLACK, WHITE } from '../web/js/engine/go.js';

describe('SGF 解析', () => {
  it('解析根属性 SZ KM PB PW RE C', () => {
    const rec = parseSGF('(;SZ[13]KM[6.5]PB[黑方]PW[白方]RE[B+R]C[注释];B[dd];W[pp])');
    assert.equal(rec.size, 13);
    assert.equal(rec.komi, 6.5);
    assert.equal(rec.black, '黑方');
    assert.equal(rec.white, '白方');
    assert.equal(rec.result, 'B+R');
    assert.equal(rec.rootComment, '注释');
  });

  it('缺省 SZ 默认 19 路；缺省 KM 默认 0', () => {
    const rec = parseSGF('(;PB[X];B[dd])');
    assert.equal(rec.size, 19);
    assert.equal(rec.komi, 0);
  });

  it('坐标 aa = 左上，gs = (6,18)', () => {
    const rec = parseSGF('(;SZ[19];B[aa];W[gs])');
    assert.deepEqual(rec.nodes[1].move, { color: BLACK, x: 0, y: 0, pass: false });
    assert.deepEqual(rec.nodes[2].move, { color: WHITE, x: 6, y: 18, pass: false });
  });

  it('空值 B[] / W[] 解析为虚手（pass）', () => {
    const rec = parseSGF('(;B[dd];W[];B[pp])');
    assert.equal(rec.nodes[1].move.pass, true);
    assert.equal(rec.nodes[1].move.color, WHITE);
    assert.equal(rec.nodes[2].move.pass, false);
  });

  it('值内转义：\\] 与 \\\\', () => {
    const rec = parseSGF('(;C[a\\]b\\\\c] ;B[dd])');
    assert.equal(rec.rootComment, 'a]b\\c');
  });

  it('多变化树只取主线（每层第一个分支）', () => {
    const sgf = '(;B[aa](;W[bb];B[cc])(;W[dd];B[ee]))';
    const rec = parseSGF(sgf);
    const moves = rec.nodes.filter((n) => n.move).map((n) => n.move.x + ',' + n.move.y);
    assert.deepEqual(moves, ['0,0', '1,1', '2,2']);
  });

  it('AB/AW 摆子解析（让子/座子）', () => {
    const rec = parseSGF('(;SZ[19]HA[2]AB[dp][pd];W[qf])');
    assert.equal(rec.handicap, 2);
    // dp = (x=3,y=15)，pd = (x=15,y=3)
    assert.deepEqual(rec.setup.black, [{ x: 3, y: 15 }, { x: 15, y: 3 }]);
    assert.deepEqual(rec.setup.white, []);
    assert.equal(rec.nodes[1].move.color, WHITE);
  });

  it('非法 SGF 抛出错误', () => {
    assert.throws(() => parseSGF('(;B[dd]'));
    assert.throws(() => parseSGF(''));
    assert.throws(() => parseSGF('(;B[dd])extra'));
  });
});

describe('SGF 序列化往返', () => {
  it('解析 → recordToSGF → 解析：节点一致', () => {
    const src =
      '(;GM[1]FF[4]CA[UTF-8]SZ[19]KM[7.5]PB[Lee]PW[Cho]RE[W+2.5]DT[2020-01-01]' +
      'C[多行\n注释含 \\] 转义];B[pd]C[第一手];W[dp];B[pp];W[];B[qd])';
    const a = parseSGF(src);
    const b = parseSGF(recordToSGF(a));
    assert.equal(b.size, a.size);
    assert.equal(b.komi, a.komi);
    assert.equal(b.black, a.black);
    assert.equal(b.result, a.result);
    assert.equal(b.rootComment, a.rootComment);
    assert.equal(b.nodes.length, a.nodes.length);
    for (let i = 0; i < a.nodes.length; i++) {
      assert.deepEqual(b.nodes[i].move, a.nodes[i].move, `node ${i} move`);
      assert.equal(b.nodes[i].comment, a.nodes[i].comment, `node ${i} comment`);
    }
    // 序列化幂等
    assert.equal(recordToSGF(b), recordToSGF(a));
  });

  it('带 AB/AW 的座子局往返', () => {
    const src = '(;SZ[19]KM[0]AB[dp][pd]AW[dd][pp]PB[Fan]PW[Shi];W[qf];B[qk];W[qm])';
    const a = parseSGF(src);
    const b = parseSGF(recordToSGF(a));
    assert.deepEqual(b.setup.black, a.setup.black);
    assert.deepEqual(b.setup.white, a.setup.white);
    assert.equal(b.nodes.length, a.nodes.length);
    assert.deepEqual(b.nodes[1].move, { color: WHITE, x: 16, y: 5, pass: false });
  });
});

describe('引擎对局导出 SGF', () => {
  it('gameToSGF：普通对局导出并可再导入', () => {
    const g = new GoGame(9, 7.5, 0);
    g.play(2, 2);
    g.play(6, 6);
    g.pass();
    const sgf = gameToSGF(g, { black: '甲', white: '乙' });
    const rec = parseSGF(sgf);
    assert.equal(rec.size, 9);
    assert.equal(rec.komi, 7.5);
    assert.equal(rec.black, '甲');
    assert.equal(rec.white, '乙');
    const moves = rec.nodes.filter((n) => n.move).map((n) => n.move);
    assert.equal(moves.length, 3);
    assert.deepEqual([moves[0].x, moves[0].y], [2, 2]);
    assert.equal(moves[2].pass, true);
    assert.equal(moves[2].color, BLACK);
  });

  it('gameToSGF：让子棋导出 HA + AB，再导入后可重放', () => {
    const g = new GoGame(9, 7.5, 3);
    assert.equal(g.turn, WHITE);
    g.play(2, 2); // 白
    g.play(6, 6); // 黑
    const sgf = gameToSGF(g, { black: '黑方', white: '白方' });
    assert.match(sgf, /HA\[3\]/);
    // 9 路让 3 子星位 (6,2),(2,6),(6,6) → gc / cg / gg
    assert.match(sgf, /AB\[gc\]\[cg\]\[gg\]/);
    // 再导入并重放
    const rec = parseSGF(sgf);
    const g2 = new GoGame(rec.size, rec.komi, 0);
    for (const p of rec.setup.black) g2.board[p.y * rec.size + p.x] = BLACK;
    for (const p of rec.setup.white) g2.board[p.y * rec.size + p.x] = WHITE;
    if (rec.setup.black.length) g2.turn = WHITE;
    for (const n of rec.nodes) {
      if (!n.move) continue;
      const r = n.move.pass ? g2.pass(n.move.color) : g2.play(n.move.x, n.move.y, n.move.color);
      assert.equal(r.ok, true, r.error);
    }
    assert.equal(g2.board[2 * 9 + 2], WHITE);
  });

  it('对局结束导出带 RE 结果', () => {
    const g = new GoGame(9, 7.5, 0);
    g.play(4, 4); g.play(4, 5); g.pass(); g.pass();
    g.skipMarking(); g.finalize();
    const sgf = gameToSGF(g);
    assert.match(sgf, /RE\[W\+7\.5\]/);
  });
});
