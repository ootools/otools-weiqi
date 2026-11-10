# otools-weiqi 实现规格（围棋）

OTools 独立插件：围棋——双人对弈 + 名局 SGF 排盘 + 交互式玩法介绍。
纯静态实现（原生 HTML/CSS/JS ES modules，无 npm/打包器）。

## plugin.json

```json
{
  "uuid": "otools-weiqi", "packid": "otools-weiqi",
  "displayName": "Weiqi", "displayNameCN": "围棋",
  "developerName": "OTools", "summary": "双人对弈 + 名局 SGF 排盘 + 交互式玩法介绍，从入门到复盘。",
  "version": "0.1.0", "entry": "dist/index.html",
  "devUrl": "http://127.0.0.1:6542", "quickDev": true, "hasAd": false,
  "inPluginPurchase": false, "openInBrowser": false,
  "logo": "logo.svg", "icon": "⚫", "screenshots": [],
  "key": ["围棋", "围棋入门", "棋谱", "SGF", "排盘", "weiqi", "go", "baduk"]
}
```

## 目录与公共约定

- `web/index.html`：入口，**保留模板 OTools 宿主桥脚本**（`window.otoolsPlugin`，用于 SGF 导入导出；含 "otools" 字样）。深色主题。
- `web/js/engine/go.js`、`web/js/engine/sgf.js`：纯函数无 DOM 依赖，node --test 可 import。
- `web/js/ui/`、`web/data/games/*.sgf`（内置名局）、`tests/`（仓库根）：`node --test tests/` 全绿。
- `node scripts/build-web.mjs` → dist/（构建产物按模板惯例 gitignore 不入库，CI 出 artifact）。
- 棋盘 canvas：19/13/9 路切换，木纹底色，坐标（A-T 跳过 I，1-19），星位绘制，窗口缩放自适应。

## 引擎规则

- 提子：无气棋组整体提掉；禁入点（自杀）非法，但**提子后自己有气的点合法**（打吃提子）。
- 打劫：简单劫——禁止立即回提形成上一手前局面（记录上一手单提点）。
- pass；双方连续 pass → 进入数子阶段。
- **数子法**：死子标记阶段（点击棋子标记/取消，可跳过）→ 移除死子 → 空点区域 flood fill，仅邻一色归该色（邻双色为公气不计）→ 子+空 = 各方数，黑方减贴目定胜负。
- 贴目可选 7.5（默认）/6.5/5.5/0；让子棋 2~9 子（星位摆放，白先黑后行棋方向按让子棋规则：黑贴 0）。
- API：`newGame(size,komi,handicap) / play(x,y) / pass() / undo / redo / captureDetection / koPoint / score(deadStones)`。

## SGF 与名局库（核心卖点）

- `sgf.js`：解析属性 `SZ KM HA PB PW BR WR RE C B W`（主线 + 注释；变化树可只取主线），坐标 `aa`=左上；支持导出当前对局为 SGF。
- 内置 `web/data/games/`：≥6 局名局 SGF。**优先从公开 SGF 档案 curl 下载**（如 u-go.net 公开职业棋谱、gokifu 等公开资源；README 逐局注明来源），下载不可行则整理公认名局并注明「自公开记录整理」。AlphaGo 对李世石名局、当湖十局选局、吴清源名局等方向。
- `tests/games.test.js`：全部内置 SGF 解析成功、逐步重放合法（落点为空、交替行棋）。
- 排盘 UI：名局列表 → 载入；首/上/下一/末/自动播放（速度可选）；手数显示开关；点击着法跳转；棋评（SGF 注释）显示；最后一手标记。

## 玩法介绍（学棋 tab，交互式）

用真实棋盘渲染器做可点击演示，至少 9 章：
① 棋盘与交叉点、落子 ② 气与提子（点击演示气的位置） ③ 禁入点 ④ 打劫 ⑤ 终局与数目/贴目 ⑥ 让子棋 ⑦ 段位体系与常用术语（虎口、征子、双活等配图） ⑧ 基本礼仪 ⑨ 常见开局（星位/小目/三三、金角银边草肚皮）。
章节导航 + 每章小结；mini 棋盘演示组件复用主渲染器。

## UI 布局

左侧棋盘 + 右侧面板三个 tab（对弈 / 排盘 / 学棋）。对弈：点击落子、虚手按钮、悔棋/前进、手数与提子数显示、最后一手高亮、双 pass 后死子标记与数目结果。导入/导出 SGF（宿主桥，浏览器退化）。localStorage 保存当前对局。

## 测试清单（node --test）

1. 提子（角上一组被吃）、打劫回提禁手、禁入点（含提子后合法的反例）、pass 终局。
2. 数子：构造小棋盘局面验证子空归属与贴目结果。
3. SGF：解析往返、全部内置棋谱重放合法。
