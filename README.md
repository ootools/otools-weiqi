# otools-weiqi · 围棋

OTools 独立插件：**围棋**——双人对弈 + 名局 SGF 排盘 + 交互式玩法介绍，从入门到复盘。
纯静态实现（原生 HTML/CSS/JS ES modules，无 npm / 无框架 / 无打包器），规则引擎为纯函数、可在 node 下直接测试。

![logo](logo.svg)

## 功能

- **对弈**：19 / 13 / 9 路棋盘切换，贴目 7.5 / 6.5 / 5.5 / 0，让子棋 2~9 子（白先行、黑贴 0）；
  点击落子、虚手、悔棋 / 前进、提子数与手数显示、最后一手高亮；双方连续虚手后进入死子标记阶段，
  数子法（子 + 空）计算胜负；对局自动保存到 localStorage，下次打开继续。
- **排盘**：内置 10 局名局 SGF（见下表），首 / 上一手 / 下一手 / 末 / 自动播放（慢中快），
  手数显示开关，点击着法列表跳转，SGF 注释作为棋评显示，最后一手标记。
- **学棋**：9 章交互式玩法介绍（棋盘与落子 → 气与提子 → 禁入点 → 打劫 → 终局数子与贴目 →
  让子棋 → 段位与术语 → 礼仪 → 常见开局），每章配可点击的演示棋盘（复用主渲染器），
  提子 / 禁入点 / 打劫 / 征子收网全部由真实引擎执行判定；每章附小结。
- **SGF 导入 / 导出**：通过 OTools 宿主桥（`window.otoolsPlugin`）读写真实文件；
  在普通浏览器中自动退化为文件选择框 / 下载。
- **棋盘渲染**：canvas 自适应窗口缩放，木纹底色，坐标（A–T 跳过 I，1–19），星位，HiDPI 支持。

## 目录结构

```
otools-weiqi/
├── plugin.json             # 插件清单（entry: dist/index.html）
├── logo.svg                # 自绘围棋主题图标
├── docs/SPEC.md            # 实现规格
├── web/
│   ├── index.html          # 入口（含 OTools 宿主桥 window.otoolsPlugin）
│   ├── css/style.css       # 深色主题
│   ├── js/
│   │   ├── engine/
│   │   │   ├── go.js       # 围棋规则引擎（纯函数，无 DOM，node 可测试）
│   │   │   └── sgf.js      # SGF 解析 / 序列化（纯函数）
│   │   ├── ui/
│   │   │   ├── board.js    # canvas 棋盘渲染器（对弈 / 排盘 / 学棋共用）
│   │   │   ├── app.js      # 入口组装 + tab 切换
│   │   │   ├── play.js     # 对弈控制器
│   │   │   ├── records.js  # 排盘控制器
│   │   │   └── learn.js    # 学棋控制器（9 章）
│   │   └── ...
│   └── data/games/         # 内置名局 SGF + manifest.js 清单
├── tests/                  # node --test（引擎规则 / SGF / 名局重放）
└── scripts/                # 模板自带构建 / 打包脚本（未改动）
```

## 内置名局与来源

共 10 局，全部通过 `tests/games.test.js` 解析并逐步重放验证（落点为空、交替行棋、简单劫规则成立）：

| # | 局名 | 对局者 | 年代 | 结果 | 来源 |
| --- | --- | --- | --- | --- | --- |
| 1 | 当湖十局 · 第一局 | 范西屏（黑）对 施襄夏（白） | 1739 | 黑胜 7 子 | 自公开记录整理：Jim Yu (JZY) 1992 年发布于 rec.games.go 的 Smart Go 格式棋谱转 SGF（flygo.net 古谱档案归档） |
| 2 | 当湖十局 · 第五局 | 施襄夏（黑）对 范西屏（白） | 1739 | 白胜 14.5 子 | 同上 |
| 3 | 当湖十局 · 第七局 | 施襄夏（黑）对 范西屏（白） | 1739 | 白中盘胜 | 同上 |
| 4 | 耳赤之局 | 本因坊秀策（黑）对 井上因硕 幻庵因硕（白） | 1846 | 黑胜 2 目 | 下载自 CWI 围棋档案（homepages.cwi.nl/~aeb/go/games，Andries E. Brouwer 整理） |
| 5 | 世纪名局：三三·星·天元 | 吴清源（黑）对 本因坊秀哉（白） | 1933–1934 | 白胜 2 目 | 下载自 gokifu.com 公开棋谱页（附英文解说） |
| 6 | 吴清源 vs 木谷实 十番棋第 5 局 | 吴清源（黑）对 木谷实（白） | 1933 | 黑中盘胜 | 下载自 CWI 围棋档案（GoGoD 95 数据） |
| 7 | AlphaGo vs 李世石 第二局 | AlphaGo（黑）对 李世石（白） | 2016 | 黑中盘胜 | 下载自 CWI 围棋档案（Fan Hui 评注版） |
| 8 | AlphaGo vs 李世石 第四局（神之一手） | AlphaGo（黑）对 李世石（白） | 2016 | 白中盘胜 | 下载自 CWI 围棋档案（Fan Hui 评注版） |
| 9 | AlphaGo vs 柯洁 乌镇第一局 | 柯洁（黑）对 AlphaGo Master（白） | 2017 | 白胜 0.5 目 | 下载自 CWI 围棋档案 |
| 10 | AlphaGo vs 柯洁 乌镇第二局 | AlphaGo Master（黑）对 柯洁（白） | 2017 | 黑中盘胜 | 下载自 CWI 围棋档案 |

当湖十局的原始新闻组棋谱使用早期「Smart Go」格式（`White[..]` / `AddBlack[..]` / `Comment[..]`），
本仓库在收录时转换为标准 SGF（FF[4]），各局黑白执子与结果依原始注释校订；除此之外未改动任何着法。

## 引擎规则（中国规则 · 数子法）

- 提子：无气棋组整体提掉；禁入点（自杀）非法，但**提子后自己有气的点合法**；
- 打劫：简单劫——禁止立即回提形成上一手前的局面（记录上一手单提点）；
- 双方连续虚手 → 死子标记阶段（点击棋子标记 / 取消，可跳过）→ 移除死子 →
  空点区域 flood fill，仅邻一色归该色（邻双色为公气不计）→ 子 + 空 = 各方数，白方加贴目定胜负；
- 贴目 7.5（默认）/ 6.5 / 5.5 / 0；让子棋 2~9 子按星位摆放，白先行，黑贴 0。

## 开发

```bash
# 安装：无任何依赖，clone 即用（node >= 18，经 nvm 的 node v22 验证）

# 运行测试（引擎规则 / SGF 往返 / 全部内置棋谱重放）
node --test tests/

# 构建产物 dist/（web 模式：直接拷贝 web/）
node scripts/build-web.mjs

# 本地预览 dist/
node scripts/serve-dist.mjs

# 打包 / 校验 .oplg（可选）
node scripts/pack-plugin.mjs --out dist-pack --version 0.1.0
node scripts/verify-plugin.mjs dist-pack
```

测试清单：`tests/engine.test.js`（提子、禁入点及提子反例、打劫、pass 终局、数子法、
贴目变体、让子棋、undo/redo）、`tests/sgf.test.js`（属性解析、转义、变化树取主线、
坐标、解析→序列化往返、引擎导出再导入）、`tests/games.test.js`（manifest 与目录一致性、
全部内置 SGF 解析 + 逐步重放合法性 + 终盘子数检查）。

## 棋谱来源声明

内置名局 SGF 仅用于学习与复盘演示：

- CWI 围棋档案（https://homepages.cwi.nl/~aeb/go/games/）：公开的职业/名局 SGF 收藏；
- gokifu.com：公开棋谱页；
- 当湖十局：Jim Yu (JZY) 1992 年发布于 Usenet 新闻组 rec.games.go 的公开整理稿
  （经 flygo.net 古谱档案归档），本仓库转换为 SGF 后收录，并注明「自公开记录整理」。

各棋谱版权归原始整理者 / 发布者所有；如涉及版权问题请联系移除。

## 发布

沿用模板的「打 tag 即发布」流程：`plugin.json` 的 `version` 与 tag `v<version>` 保持一致，
push tag 后由 `.github/workflows/release-plugin.yml` 自动构建 + 打包 + 创建 Release。
