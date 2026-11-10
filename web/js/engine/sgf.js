/**
 * SGF（Smart Game Format, FF[4]）解析与导出——纯函数、无 DOM 依赖。
 * ------------------------------------------------------------------
 * - 解析属性：SZ KM HA PB PW BR WR RE C EV DT PC RO RU TM OT 以及落子 B/W、
 *   摆子 AB/AW（让子/座子）等；
 * - 多变化树只取主线（每层取第一个分支）；
 * - 坐标：SGF 小写字母，aa = 左上角（x 向右、y 向下，从 0 起）；
 *   空值 B[]/W[] 表示虚手（pass）；
 * - 支持导出当前对局为 SGF；支持「解析 → 再序列化」往返。
 */

import { HANDICAP_POINTS } from './go.js';

function decodeValue(raw) {
  // SGF 转义：\] \[ \\ \\newline；统一换行为 \n
  let out = '';
  let i = 0;
  while (i < raw.length) {
    const ch = raw[i];
    if (ch === '\\') {
      const next = raw[i + 1];
      if (next === '\n') {
        i += 2;
        // 软换行：忽略行尾换行与行首空白
        while (i < raw.length && (raw[i] === ' ' || raw[i] === '\t')) i++;
        continue;
      }
      out += next ?? '';
      i += 2;
      continue;
    }
    if (ch === '\r') {
      out += raw[i + 1] === '\n' ? '\n' : '\n';
      i += raw[i + 1] === '\n' ? 2 : 1;
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

function encodeValue(text) {
  return String(text).replace(/\\/g, '\\\\').replace(/\]/g, '\\]');
}

class SGFError extends Error {}

/** 分词器：产出 '(' ')' ';' {name, values[]} */
function tokenize(text) {
  const tokens = [];
  let i = 0;
  const n = text.length;
  while (i < n) {
    const ch = text[i];
    if (ch === '(' || ch === ')' || ch === ';') {
      tokens.push({ type: ch });
      i++;
      continue;
    }
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    // 属性名：大写字母（容忍旧格式小写）
    if (/[A-Za-z]/.test(ch)) {
      let name = '';
      while (i < n && /[A-Za-z]/.test(text[i])) {
        name += text[i];
        i++;
      }
      const values = [];
      while (i < n && /\s/.test(text[i])) i++;
      while (i < n && text[i] === '[') {
        i++;
        let raw = '';
        while (i < n && text[i] !== ']') {
          if (text[i] === '\\') {
            raw += text[i] + (text[i + 1] ?? '');
            i += 2;
            continue;
          }
          raw += text[i];
          i++;
        }
        if (i >= n) throw new SGFError('SGF 值未闭合（缺少 ]）');
        i++; // 跳过 ']'
        values.push(decodeValue(raw));
        while (i < n && /\s/.test(text[i])) i++;
      }
      tokens.push({ type: 'P', name: name.toUpperCase(), values });
      continue;
    }
    throw new SGFError(`SGF 含非法字符：${JSON.stringify(ch)}（位置 ${i}）`);
  }
  return tokens;
}

/**
 * 把 token 序列组织成树：{ nodes: [...], children: [tree...] }
 * 每个 node = { props: Map<name, values[]> }
 */
function buildTree(tokens) {
  let pos = 0;
  function parseTree() {
    if (tokens[pos]?.type !== '(') throw new SGFError('SGF 缺少 "("');
    pos++;
    const tree = { nodes: [], children: [] };
    while (pos < tokens.length && tokens[pos].type === ';') {
      pos++;
      const node = new Map();
      while (pos < tokens.length && tokens[pos].type === 'P') {
        const t = tokens[pos];
        const existing = node.get(t.name);
        if (existing) existing.push(...t.values);
        else node.set(t.name, t.values.slice());
        pos++;
      }
      tree.nodes.push(node);
    }
    while (pos < tokens.length && tokens[pos].type === '(') {
      tree.children.push(parseTree());
    }
    if (tokens[pos]?.type !== ')') throw new SGFError('SGF 缺少 ")"');
    pos++;
    return tree;
  }
  const tree = parseTree();
  if (pos < tokens.length) throw new SGFError('SGF 存在多余的内容（多个根？）');
  return tree;
}

function num(value, fallback) {
  if (value == null || value === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function parseCoord(value, size) {
  if (!value || value.length < 2) return null; // 空值 = pass
  const x = value.charCodeAt(0) - 97;
  const y = value.charCodeAt(1) - 97;
  if (x < 0 || y < 0 || x >= size || y >= size) return null;
  return { x, y };
}

function firstProp(node, name) {
  const v = node.get(name);
  return v && v.length ? v[0] : null;
}

function allCoords(node, name, size) {
  const v = node.get(name) || [];
  const out = [];
  for (const val of v) {
    const p = parseCoord(val, size);
    if (p) out.push(p);
  }
  return out;
}

/**
 * 解析 SGF，返回主线（nodes）+ 根信息。
 * @returns {{
 *   size:number, komi:number, handicap:number,
 *   black:string|null, white:string|null, blackRank:string|null, whiteRank:string|null,
 *   event:string|null, date:string|null, place:string|null, round:string|null, result:string|null,
 *   ruleset:string|null, rootComment:string|null,
 *   setup: { black: {x,y}[], white: {x,y}[] },
 *   nodes: { move: {color:1|2,x:number,y:number,pass:boolean}|null, comment: string|null, props: Map }[],
 *   rootProps: Map
 * }}
 */
export function parseSGF(text) {
  const tokens = tokenize(String(text));
  if (!tokens.length) throw new SGFError('SGF 内容为空');
  const tree = buildTree(tokens);

  // 主线：根节点序列 + 每层第一个分支
  const mainline = [];
  let cur = tree;
  while (true) {
    mainline.push(...cur.nodes);
    if (cur.children.length > 0) cur = cur.children[0];
    else break;
  }

  const root = mainline[0] ?? new Map();
  const size = Math.max(2, Math.min(25, num(firstProp(root, 'SZ'), 19)));
  const komi = num(firstProp(root, 'KM'), 0);
  const handicap = num(firstProp(root, 'HA'), 0);
  const setup = {
    black: root.has('AB') ? allCoords(root, 'AB', size) : [],
    white: root.has('AW') ? allCoords(root, 'AW', size) : [],
  };

  const nodes = [];
  for (const node of mainline) {
    const hasB = node.has('B');
    const hasW = node.has('W');
    let move = null;
    if (hasB || hasW) {
      const color = hasB ? 1 : 2;
      const raw = (node.get(hasB ? 'B' : 'W') || [''])[0];
      const p = parseCoord(raw, size);
      move = p
        ? { color, x: p.x, y: p.y, pass: false }
        : { color, x: -1, y: -1, pass: true };
    }
    nodes.push({
      move,
      comment: firstProp(node, 'C'),
      props: node,
    });
  }

  return {
    size,
    komi,
    handicap,
    black: firstProp(root, 'PB'),
    white: firstProp(root, 'PW'),
    blackRank: firstProp(root, 'BR'),
    whiteRank: firstProp(root, 'WR'),
    event: firstProp(root, 'EV'),
    date: firstProp(root, 'DT'),
    place: firstProp(root, 'PC'),
    round: firstProp(root, 'RO'),
    result: firstProp(root, 'RE'),
    ruleset: firstProp(root, 'RU'),
    rootComment: firstProp(root, 'C'),
    setup,
    nodes,
    rootProps: root,
  };
}

function moveCoord(move) {
  if (move.pass || move.x < 0) return '';
  return String.fromCharCode(97 + move.x) + String.fromCharCode(97 + move.y);
}

/** 通用 SGF 序列化：按主线节点顺序原样重建（含注释）。往返测试用。 */
export function recordToSGF(record) {
  let out = '(';
  for (const node of record.nodes) {
    out += ';';
    if (node.move) {
      const colorName = node.move.color === 1 ? 'B' : 'W';
      out += colorName + '[' + moveCoord(node.move) + ']';
    }
    if (node.comment != null) out += 'C[' + encodeValue(node.comment) + ']';
    // 其余属性原样带回（B/W/C 已按上面规范化输出）
    for (const [name, values] of node.props ?? []) {
      if (name === 'B' || name === 'W' || name === 'C') continue;
      out += name + values.map((v) => '[' + encodeValue(v) + ']').join('');
    }
  }
  out += ')';
  return out;
}

/**
 * 把引擎对局导出为标准 SGF。
 * @param {import('./go.js').GoGame} game
 * @param {{black?:string, white?:string, result?:string, comment?:string, today?:string}} [meta]
 */
export function gameToSGF(game, meta = {}) {
  const root = [
    'GM[1]',
    'FF[4]',
    'CA[UTF-8]',
    'AP[otools-weiqi:0.1.0]',
    'SZ[' + game.size + ']',
    'RU[Chinese]',
    'KM[' + game.komi + ']',
  ];
  if (game.handicap > 0) {
    root.push('HA[' + game.handicap + ']');
    const pts = [];
    // 让子摆子点 = newGame 时的初始黑子点位（与 go.js HANDICAP_POINTS 一致）
    const table = HANDICAP_POINTS[game.size] || HANDICAP_POINTS[19];
    for (const [x, y] of table[game.handicap] || []) {
      pts.push('[' + String.fromCharCode(97 + x) + String.fromCharCode(97 + y) + ']');
    }
    if (pts.length) root.push('AB' + pts.join(''));
  }
  root.push('PB[' + encodeValue(meta.black ?? '黑方') + ']');
  root.push('PW[' + encodeValue(meta.white ?? '白方') + ']');
  const date = meta.today ?? new Date().toISOString().slice(0, 10);
  root.push('DT[' + date + ']');
  if (meta.result ?? game.result?.result) root.push('RE[' + encodeValue(meta.result ?? game.result.result) + ']');
  if (meta.comment) root.push('C[' + encodeValue(meta.comment) + ']');

  let out = '(;' + root.join('');
  for (const m of game.moveList) {
    out += ';';
    out += (m.color === 1 ? 'B' : 'W') + '[' + (m.pass ? '' : String.fromCharCode(97 + m.x) + String.fromCharCode(97 + m.y)) + ']';
  }
  out += ')';
  return out;
}

/** 计算让子摆子点（与 go.js 的 HANDICAP_POINTS 保持一致） */
export function handicapStonesFor(game) {
  if (game.handicap <= 0) return [];
  const table = HANDICAP_POINTS[game.size] || HANDICAP_POINTS[19];
  return (table[game.handicap] || []).map(([x, y]) => ({ x, y }));
}

export { SGFError };
