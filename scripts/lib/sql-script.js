// Split Oracle scripts, preserving quoted semicolons and anonymous PL/SQL blocks.
export function parseScript(source) {
  const clean = source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/--[^\n]*/g, '')
    .replace(/^\s*SET DEFINE OFF;?\s*$/gm, '')
    .replace(/^\s*\+\s*$/gm, '');
  let statements = [],
    buffer = '',
    quoted = false,
    block = false,
    line = 1,
    start = 1;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (!buffer.trim() && !/\s/.test(ch)) {
      start = line;
      block = /^BEGIN\b/i.test(clean.slice(i));
    }
    if (ch === "'") {
      if (quoted && clean[i + 1] === "'") {
        buffer += "''";
        i++;
        continue;
      }
      quoted = !quoted;
    }
    if (
      !quoted &&
      block &&
      ch === '/' &&
      /^\s*$/.test(clean.slice(clean.lastIndexOf('\n', i - 1) + 1, i))
    ) {
      statements.push({ line: start, sql: buffer.trim() });
      buffer = '';
      block = false;
      continue;
    }
    if (ch === ';' && !quoted && !block) {
      if (buffer.trim()) statements.push({ line: start, sql: buffer.trim() });
      buffer = '';
    } else buffer += ch;
    if (ch === '\n') line++;
  }
  if (buffer.trim()) statements.push({ line: start, sql: buffer.trim() });
  return statements;
}
