/**
 * 应用入口：组装共享棋盘渲染器 + 三个 tab（对弈 / 排盘 / 学棋）。
 */
import { BoardRenderer } from './board.js';
import { PlayController } from './play.js';
import { RecordsController } from './records.js';
import { LearnController } from './learn.js';

const canvas = document.getElementById('board');
const renderer = new BoardRenderer(canvas, { size: 19, interactive: true, showCoords: true });

const tabs = ['play', 'records', 'learn'];
const controllers = {
  play: new PlayController(renderer),
  records: new RecordsController(renderer),
  learn: new LearnController(renderer),
};

function activateTab(name) {
  for (const t of tabs) {
    document.getElementById('panel-' + t).classList.toggle('active', t === name);
    document.getElementById('tab-' + t).classList.toggle('active', t === name);
  }
  for (const t of tabs) {
    if (t !== name && controllers[t].deactivate) controllers[t].deactivate();
  }
  // 棋盘下方状态条只属于「对弈」；排盘/学棋的面板里已有各自的进度信息
  document.querySelector('.board-caption').classList.toggle('hidden', name !== 'play');
  controllers[name].activate();
}

for (const t of tabs) {
  document.getElementById('tab-' + t).addEventListener('click', () => activateTab(t));
}

activateTab('play');
