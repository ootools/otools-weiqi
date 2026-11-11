/**
 * 测试聚合入口：`node --test tests/` 时由测试运行器加载本文件，
 * 进而注册全部测试（engine / sgf / games / go-ai）。
 * 直接 `node --test tests/*.test.js` 亦可（不会重复执行本文件）。
 */
import './engine.test.js';
import './sgf.test.js';
import './games.test.js';
import './go-ai.test.js';
