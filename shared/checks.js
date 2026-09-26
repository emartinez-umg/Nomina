import Decimal from 'decimal.js';
// Closed grammar for this DDL. No eval or executable SQL from request payloads.
export function parseCheck(sql) {
  const tokens =
    sql.match(/'(?:''|[^'])*'|>=|<=|<>|[=><(),]|-?\d+(?:\.\d+)?|[A-Z_][A-Z_0-9]*/g) || [];
  let i = 0;
  const take = () => tokens[i++],
    eat = (x) => (tokens[i] === x ? (i++, true) : false),
    expect = (x) => {
      if (!eat(x)) throw Error('Expected ' + x + ' in ' + sql);
    };
  function value() {
    const x = take();
    if (!x) throw Error('Unexpected end');
    return x.startsWith("'")
      ? { literal: x.slice(1, -1).replaceAll("''", "'") }
      : /^-?\d/.test(x)
        ? { literal: x }
        : { field: x };
  }
  function term() {
    if (eat('(')) {
      const r = or();
      expect(')');
      return r;
    }
    let left = value();
    if (eat('IS')) {
      const not = eat('NOT');
      expect('NULL');
      return { op: not ? 'notNull' : 'null', left };
    }
    if (eat('IN')) {
      expect('(');
      const values = [value()];
      while (eat(',')) values.push(value());
      expect(')');
      return { op: 'in', left, values };
    }
    if (eat('BETWEEN')) {
      const min = value();
      expect('AND');
      return { op: 'between', left, min, max: value() };
    }
    const op = take();
    if (!['>', '>=', '<', '<=', '=', '<>'].includes(op)) throw Error('Unsupported operator ' + op);
    return { op, left, right: value() };
  }
  function and() {
    let l = term();
    while (eat('AND')) l = { op: 'and', left: l, right: term() };
    return l;
  }
  function or() {
    let l = and();
    while (eat('OR')) l = { op: 'or', left: l, right: and() };
    return l;
  }
  const ast = or();
  if (i !== tokens.length) throw Error('Unconsumed CHECK ' + sql);
  return ast;
}
function compare(a, b) {
  try {
    if (/^-?\d+(\.\d+)?$/.test(a) && /^-?\d+(\.\d+)?$/.test(b)) return new Decimal(a).cmp(b);
  } catch {}
  return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
}
export function evaluateCheck(n, row) {
  if ('literal' in n) return n.literal;
  if ('field' in n) return row[n.field] ?? null;
  const a = evaluateCheck(n.left, row);
  if (n.op === 'null') return a === null;
  if (n.op === 'notNull') return a !== null;
  if (n.op === 'in')
    return a === null ? null : n.values.some((v) => compare(a, evaluateCheck(v, row)) === 0);
  if (n.op === 'between')
    return a === null
      ? null
      : compare(a, evaluateCheck(n.min, row)) >= 0 && compare(a, evaluateCheck(n.max, row)) <= 0;
  const b = evaluateCheck(n.right, row);
  if (n.op === 'and')
    return a === false || b === false ? false : a === null || b === null ? null : true;
  if (n.op === 'or')
    return a === true || b === true ? true : a === null || b === null ? null : false;
  if (a === null || b === null) return null;
  const c = compare(a, b);
  return { '=': c === 0, '<>': c !== 0, '>': c > 0, '>=': c >= 0, '<': c < 0, '<=': c <= 0 }[n.op];
}
export function checkFields(ast) {
  return [
    ...new Set(
      JSON.stringify(ast)
        .match(/"field":"([^"]+)"/g)
        ?.map((s) => JSON.parse('{' + s + '}').field) || [],
    ),
  ];
}

// Oracle rewrites IN lists into OR/equality expressions after column renames.
// Recognize both equivalent forms so renamed catalogs keep selects and switches.
export function enumValues(node, field) {
  if (node.op === 'in' && node.left.field === field && node.values.every((v) => 'literal' in v))
    return node.values.map((v) => v.literal);
  if (node.op === '=' && node.left.field === field && 'literal' in node.right)
    return [node.right.literal];
  if (node.op === 'null' && node.left.field === field) return [];
  if (node.op === 'or') {
    const left = enumValues(node.left, field),
      right = enumValues(node.right, field);
    if (left !== undefined && right !== undefined) return [...new Set([...left, ...right])];
  }
  return undefined;
}
