/**
 * 内置名局 SGF 库测试：
 *  - manifest.js 与 web/data/games/ 目录一一对应；
 *  - 全部棋谱解析成功；
 *  - 逐步重放合法（落点为空、行棋方交替、打劫规则成立）；
 *  - 元数据齐备（title/players/source 用于排盘 UI 与 README）。
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseSGF } from '../web/js/engine/sgf.js';
import { GoGame, BLACK, WHITE, EMPTY } from '../web/js/engine/go.js';
import { GAMES } from '../web/data/games/manifest.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const gamesDir = path.join(repoRoot, 'web', 'data', 'games');

describe('名局库一致性', () => {
  it('manifest 与目录文件一一对应', () => {
    const onDisk = new Set(fs.readdirSync(gamesDir).filter((f) => f.endsWith('.sgf')).sort());
    const inManifest = new Set(GAMES.map((g) => g.file).sort());
    assert.deepEqual([...inManifest], [...onDisk], 'manifest 与 .sgf 文件应完全一致');
    const ids = new Set(GAMES.map((g) => g.id));
    assert.equal(ids.size, GAMES.length, 'id 不得重复');
  });

  it('至少收录 6 局名局', () => {
    assert.ok(GAMES.length >= 6, `当前收录 ${GAMES.length} 局`);
  });

  it('每局元数据齐备且来源注明', () => {
    for (const game of GAMES) {
      assert.ok(game.id, 'id');
      assert.ok(game.title, 'title');
      assert.ok(game.players, 'players');
      assert.ok(game.date, 'date');
      assert.ok(game.result, 'result');
      assert.ok(game.desc, 'desc');
      assert.ok(game.source, 'source（下载来源或「自公开记录整理」）');
    }
  });
});

describe('名局逐局解析与重放', () => {
  for (const game of GAMES) {
    it(`${game.title}（${game.file}）`, () => {
      const text = fs.readFileSync(path.join(gamesDir, game.file), 'utf8');
      const rec = parseSGF(text);

      // 基本元数据
      assert.ok(rec.size === 19 || rec.size === 13 || rec.size === 9, `棋盘路数 ${rec.size}`);
      assert.ok(rec.nodes.length > 20, `手数过少：${rec.nodes.length}`);

      // 构造引擎局面并重放主线
      const g = new GoGame(rec.size, rec.komi, 0);
      for (const p of rec.setup.black) g.board[p.y * rec.size + p.x] = BLACK;
      for (const p of rec.setup.white) g.board[p.y * rec.size + p.x] = WHITE;
      const hasSetup = rec.setup.black.length + rec.setup.white.length > 0;
      if (hasSetup && rec.nodes.length && rec.nodes[0].move && rec.nodes[0].move.color === WHITE) {
        g.turn = WHITE; // 让子/座子局白先
      }

      let prevColor = 0;
      let moveCount = 0;
      let passCount = 0;
      for (let i = 0; i < rec.nodes.length; i++) {
        const node = rec.nodes[i];
        if (!node.move) continue;
        moveCount++;
        const m = node.move;
        // 行棋方交替
        if (prevColor !== 0) {
          assert.notEqual(m.color, prevColor, `第 ${moveCount} 手未交替行棋`);
        }
        prevColor = m.color;
        if (m.pass) {
          passCount++;
          const r = g.pass(m.color);
          assert.equal(r.ok, true, `第 ${moveCount} 手 pass 非法：${r.error}`);
          continue;
        }
        // 落点必须为空
        assert.equal(g.board[m.y * rec.size + m.x], EMPTY, `第 ${moveCount} 手落点非空 (${m.x},${m.y})`);
        const r = g.play(m.x, m.y, m.color);
        assert.equal(r.ok, true, `第 ${moveCount} 手非法：${r.error}`);
      }
      assert.ok(moveCount > 20, `有效手数 ${moveCount} 过少`);
      assert.ok(passCount <= 4, `pass 次数异常：${passCount}`);
    });
  }

  it('重放后的终盘局面子数合理', () => {
    for (const game of GAMES) {
      const text = fs.readFileSync(path.join(gamesDir, game.file), 'utf8');
      const rec = parseSGF(text);
      const g = new GoGame(rec.size, rec.komi, 0);
      for (const p of rec.setup.black) g.board[p.y * rec.size + p.x] = BLACK;
      for (const p of rec.setup.white) g.board[p.y * rec.size + p.x] = WHITE;
      if (rec.setup.black.length && rec.nodes[0].move && rec.nodes[0].move.color === WHITE) {
        g.turn = WHITE;
      }
      for (const node of rec.nodes) {
        if (!node.move) continue;
        const r = node.move.pass ? g.pass(node.move.color) : g.play(node.move.x, node.move.y, node.move.color);
        assert.equal(r.ok, true, `${game.file}: ${r.error}`);
      }
      // 终盘盘面子数应在合理范围（19 路名局通常 150~380 子）
      let stones = 0;
      for (let i = 0; i < g.board.length; i++) if (g.board[i] !== EMPTY) stones++;
      assert.ok(stones > 50 && stones <= rec.size * rec.size, `${game.file}: 终盘子数 ${stones} 异常`);
    }
  });
});
