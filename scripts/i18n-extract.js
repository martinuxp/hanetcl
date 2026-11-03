#!/usr/bin/env node
/* global __dirname */
// Finds the interface texts that are still written straight into the code and,
// with --write, moves them to i18n/locales/es.json and swaps them for t('key').
//
//   npm run i18n:check            -> lists the texts still hardcoded (exit 1 if any)
//   npm run i18n:extract          -> moves them to es.json and rewrites the files
//   npm run i18n:extract -- app/settings.tsx   (only some files)
//
// Spanish is the source language: the text in es.json is the text of the app.
// Keys come from the file (app/anniversary/detail.tsx -> anniversary.detail.*)
// and the first words of the text; texts used in 3 or more files go to common.*.
// Interpolated values keep the name of the variable: `Hola ${name}` becomes
// t('x.hola', { name }) with "Hola {{name}}" in es.json.
//
// It skips what looks like data rather than text: comparisons, switch cases,
// object keys, types, imports, routes, styles, icon names and the like. Single
// words only count where they are clearly shown (JSX text, label/title props,
// alerts). Add `// i18n-ignore` on a line to leave its strings alone.
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const catalogPath = path.join(root, 'i18n', 'locales', 'es.json');
const SOURCE_DIRS = ['app', 'components', 'hooks', 'services'];
// Screens that only the team sees with sample data.
const SKIP_FILES = new Set(['app/ui-showcase.tsx']);

// Props and object keys whose string value is shown to people.
const TEXT_KEYS = new Set([
  'label', 'title', 'subtitle', 'placeholder', 'accessibilityLabel', 'accessibilityHint', 'aria-label',
  'description', 'detail', 'message', 'text', 'hint', 'caption', 'body', 'note', 'eyebrow', 'kicker',
  'emptyText', 'emptyTitle', 'emptyBody', 'headerTitle', 'tabBarLabel', 'confirmLabel', 'cancelLabel',
  'actionLabel', 'heading', 'lead', 'help', 'helper', 'error', 'summary', 'short', 'long', 'badge', 'tag',
  'cta', 'button', 'buttonLabel', 'question', 'answer', 'tip',
]);
// Props and object keys whose string value is data, never text.
const DATA_KEYS = new Set([
  'style', 'testID', 'nativeID', 'href', 'source', 'variant', 'mode', 'icon', 'fontFamily', 'key', 'id',
  'accessibilityRole', 'keyboardType', 'autoComplete', 'textContentType', 'autoCapitalize', 'returnKeyType',
  'presentation', 'animation', 'pathname', 'route', 'screen', 'type', 'kind', 'role', 'plan', 'value',
  'color', 'backgroundColor', 'tint', 'symbol', 'sfSymbol', 'systemImage', 'courseId', 'institutionId',
  'jornada', 'tone', 'size', 'weight', 'align', 'position', 'resizeMode', 'contentFit', 'uri', 'url',
  'emoji', 'mascot', 'initialRouteName', 'format', 'locale', 'subject', 'category', 'textAlign',
  'boxShadow', 'shadow', 'filter', 'transform', 'fontVariant', 'User-Agent', 'Content-Type', 'Accept',
  'mimeType', 'contentType', 'extension', 'scheme', 'channelId', 'categoryIdentifier', 'sound',
]);
// Words that are also values in the data (roles): only translated where shown.
const DATA_WORDS = new Set(['Estudiante', 'Directiva', 'CEE', 'Profesor', 'Admin', 'HNT', 'Web', 'iOS', 'Android']);
// Product names that stay as they are in every language.
const BRAND = new Set([
  'HaNet', 'ClassHall', 'HaNet ID', 'HN-QR', 'Calendar', 'HaNet Team', 'Expo Go', 'Instagram', 'iPhone', 'Wikipedia',
  'Ticketplus', 'TuAcceso', 'Passline', 'Portal Tickets', 'Temuco', 'Candelabro', 'Fractal', 'Simple', 'Comic Sans', 'TestFlight', 'Menlo',
]);
// Calls whose string arguments are never text.
const DATA_CALLS = /^(require|import|console\.\w+|router\.\w+|\w*[Rr]outer\.\w+|navigation\.\w+|Linking\.\w+|httpsCallable|callable|AsyncStorage\.\w+|doc|collection|getItem|setItem|removeItem|StyleSheet\.create|useLocalSearchParams|Haptics\.\w+|String\.raw|Platform\.select|\w+\.(normalize|startsWith|endsWith|includes|indexOf|split|replace|replaceAll|match|padStart|padEnd|join|toLocaleDateString|toLocaleTimeString|toLocaleString|localeCompare|getAttribute|setOptions)|new \w*(Date|RegExp|Intl\.\w+|URL)|t)$/;
// Hooks and callbacks whose bodies run as worklets: t() can't run there.
const WORKLET_CALLS = /^(useAnimatedStyle|useDerivedValue|useAnimatedProps|useAnimatedReaction|useAnimatedScrollHandler|useFrameCallback|runOnUI|scheduleOnUI|withTiming|withSpring|withDecay|withRepeat|withSequence|withDelay)$/;

const WORD = /[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]{2,}/;
const LETTERS3 = /[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]{3,}/;

function looksLikeData(text) {
  const s = text.trim();
  if (!s || !WORD.test(s)) return true;
  if (BRAND.has(s)) return true;
  if (/^(https?:|mailto:|tel:|hanet:|exp:|data:|file:)/.test(s)) return true;
  if (/^[./@~#]/.test(s) && !/\s/.test(s)) return true;
  if (/^#[0-9a-f]{3,8}$/i.test(s)) return true;
  if (/^[\w-]+_\d{3}\w*$/.test(s)) return true; // DMSans_700Bold
  if (/^[a-z0-9]+([A-Z][a-z0-9]*)+$/.test(s)) return true; // camelCase identifiers
  if (/^[A-Z][a-z0-9]+([A-Z][a-z0-9]*)+$/.test(s)) return true; // PascalCase names
  if (/^AIza|^G-[A-Z0-9]{6,}$/.test(s)) return true; // keys and ids
  if (/^[a-z0-9]+([-_.:/][a-z0-9]+)+$/.test(s)) return true; // kebab, snake, dotted ids
  if (/^[\w.-]+@[\w.-]+$/.test(s)) return true; // emails
  if (/^(rgba?|hsla?)\(/.test(s)) return true;
  if (/^[YMDHhmsaEdLTZ\s:/.,-]+$/.test(s)) return true; // date formats
  if (/[{}<>=;]/.test(s) && !/\s[a-záéíóúñ]{3,}\s/.test(s)) return true; // code-ish
  if (/\n/.test(s) && /;\s*\n/.test(s)) return true; // shaders and other code
  if (/^[\w-]+\/\d+(\.\d+)*\b/.test(s)) return true; // user agents
  if (/\.(jpe?g|png|pdf|docx?|xlsx?|pptx?|heic|webp|json|txt)$/i.test(s)) return true; // file names
  return false;
}

const isSingleWord = text => !/\s/.test(text.trim());

function camel(words) {
  return words
    .map((w, i) => (i === 0 ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1).toLowerCase()))
    .join('');
}

function slug(text) {
  const plain = text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\{\{\s*(\w+)\s*\}\}/g, ' $1 ');
  const words = plain.match(/[A-Za-z0-9]+/g) ?? ['texto'];
  const key = camel(words.slice(0, 5));
  return /^\d/.test(key) ? `n${key}` : key;
}

function fileNamespace(file) {
  const rel = path.relative(root, file).replace(/\\/g, '/').replace(/\.(tsx|ts)$/, '');
  const parts = rel
    .split('/')
    .filter(p => !/^\(.*\)$/.test(p))
    .map(p => p.replace(/^_/, '').replace(/[-.]+(\w)/g, (_, c) => c.toUpperCase()).replace(/^\w/, c => c.toLowerCase()));
  if (parts[0] === 'app') parts.shift();
  else if (parts[0] === 'components' || parts[0] === 'services' || parts[0] === 'hooks') parts[0] = parts[0];
  if (parts.length > 1 && parts[parts.length - 1] === 'index') parts.pop();
  return parts.join('.');
}

function listFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(full));
    else if (/\.(ts|tsx)$/.test(entry.name) && !/\.d\.ts$/.test(entry.name)) out.push(full);
  }
  return out;
}

// JSX text follows JSX whitespace rules: lines are trimmed and joined by a space.
function jsxTextValue(raw) {
  const lines = raw.split(/\r?\n/);
  let out = '';
  lines.forEach((line, i) => {
    let l = line.replace(/\t/g, ' ');
    if (i > 0) l = l.replace(/^\s+/, '');
    if (i < lines.length - 1) l = l.replace(/\s+$/, '');
    if (!l) return;
    out += out ? ` ${l}` : l;
  });
  return out
    .replace(/&nbsp;/g, '\u00a0')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&apos;/g, "'");
}

function calleeName(call) {
  const e = call.expression;
  if (ts.isIdentifier(e)) return e.text;
  if (ts.isPropertyAccessExpression(e)) {
    const left = ts.isIdentifier(e.expression) ? e.expression.text : ts.isPropertyAccessExpression(e.expression) ? e.expression.name.text : '?';
    return `${left}.${e.name.text}`;
  }
  return '';
}

function propName(name) {
  if (!name) return '';
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isPrivateIdentifier(name)) return name.text;
  return '';
}

// Where a string sits decides whether it is text: returns 'text', 'maybe' or 'data'.
function classify(node) {
  let child = node;
  let parent = node.parent;
  // Climb through wrappers that don't change the meaning.
  while (
    parent &&
    (ts.isParenthesizedExpression(parent) ||
      (ts.isConditionalExpression(parent) && child !== parent.condition) ||
      (ts.isBinaryExpression(parent) && ['||', '??', '&&'].includes(ts.tokenToString(parent.operatorKind)) && !(parent.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken && child === parent.left)) ||
      ts.isAsExpression(parent) ||
      ts.isSatisfiesExpression?.(parent) ||
      ts.isNonNullExpression(parent) ||
      ts.isArrayLiteralExpression(parent) ||
      ts.isSpreadElement(parent))
  ) {
    child = parent;
    parent = parent.parent;
  }
  if (!parent) return 'data';
  if (ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent) || ts.isExternalModuleReference(parent)) return 'data';
  if (ts.isLiteralTypeNode(parent) || ts.isTypeNode(parent)) return 'data';
  if (ts.isBinaryExpression(parent)) {
    const op = parent.operatorToken.kind;
    const K = ts.SyntaxKind;
    if ([K.EqualsEqualsEqualsToken, K.ExclamationEqualsEqualsToken, K.EqualsEqualsToken, K.ExclamationEqualsToken, K.InKeyword, K.LessThanToken, K.GreaterThanToken].includes(op)) return 'data';
    if (op === K.PlusToken) return 'maybe';
    if (op === K.EqualsToken) return 'maybe';
    return 'data';
  }
  if (ts.isCaseClause(parent)) return 'data';
  if (ts.isElementAccessExpression(parent)) return 'data';
  if (ts.isPropertyAssignment(parent)) {
    if (parent.name === child) return 'data';
    const key = propName(parent.name);
    if (DATA_KEYS.has(key)) return 'data';
    if (TEXT_KEYS.has(key)) return 'text';
    return 'maybe';
  }
  if (ts.isShorthandPropertyAssignment(parent) || ts.isPropertyDeclaration(parent) && parent.name === child) return 'data';
  if (ts.isEnumMember(parent)) return 'data';
  if (ts.isJsxExpression(parent)) {
    const holder = parent.parent;
    if (holder && ts.isJsxAttribute(holder)) return classifyAttr(holder);
    return 'text'; // {'texto'} as a child
  }
  if (ts.isJsxAttribute(parent)) return classifyAttr(parent);
  if (ts.isCallExpression(parent) || ts.isNewExpression(parent)) {
    if (parent.expression === child) return 'data';
    const name = ts.isNewExpression(parent) ? `new ${parent.expression.getText()}` : calleeName(parent);
    if (DATA_CALLS.test(name)) return 'data';
    if (/^(Alert\.alert|Alert\.prompt|\w*[Aa]lert|\w*[Cc]onfirm|\w*[Tt]oast|show\w*|set\w*(Error|Message|Notice|Status|Hint|Label|Title|Text|Note|Feedback|Info|Warning|Toast))$/.test(name)) return 'text';
    if (/^(describe\w*Error|appError|AppError|friendly\w*|\w+Error)$/.test(name) || name === 'new Error' || name === 'new AppError') return 'text';
    return 'maybe';
  }
  if (ts.isReturnStatement(parent) || ts.isArrowFunction(parent)) return 'maybe';
  if (ts.isVariableDeclaration(parent)) return 'maybe';
  if (ts.isTemplateSpan(parent)) return 'maybe';
  if (ts.isDefaultClause?.(parent) || ts.isParameter(parent)) return 'maybe';
  return 'maybe';
}

function classifyAttr(attr) {
  const name = attr.name.getText();
  if (DATA_KEYS.has(name)) return 'data';
  if (TEXT_KEYS.has(name)) return 'text';
  return 'maybe';
}

function insideWorklet(node) {
  for (let p = node.parent; p; p = p.parent) {
    if ((ts.isFunctionLike(p)) && p.body && ts.isBlock(p.body)) {
      const first = p.body.statements[0];
      if (first && ts.isExpressionStatement(first) && ts.isStringLiteral(first.expression) && first.expression.text === 'worklet') return true;
    }
    if (ts.isCallExpression(p) && WORKLET_CALLS.test(calleeName(p))) return true;
  }
  return false;
}

function isModuleLevel(node) {
  for (let p = node.parent; p; p = p.parent) {
    if (ts.isFunctionLike(p) || ts.isClassLike(p)) return false;
  }
  return true;
}

function ignoredLine(sf, node) {
  const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
  const lines = sf.text.split('\n');
  return /i18n-ignore/.test(lines[line] ?? '') || /i18n-ignore-next-line/.test(lines[line - 1] ?? '');
}

// The name an interpolated value gets: the variable or the last property.
const TRANSFORMS = /^(toLocaleLowerCase|toLowerCase|toLocaleUpperCase|toUpperCase|trim|toString|toFixed|padStart|padEnd|toLocaleString|slice)$/;
function strip(expr) {
  let e = expr;
  while (ts.isParenthesizedExpression(e) || ts.isNonNullExpression(e) || ts.isAsExpression(e)) e = e.expression;
  return e;
}
function baseName(expr) {
  const e = strip(expr);
  if (ts.isIdentifier(e)) return e.text;
  if (ts.isPropertyAccessExpression(e)) return e.name.text === 'length' ? `${baseName(e.expression)}Count` : e.name.text;
  if (ts.isCallExpression(e)) {
    if (ts.isPropertyAccessExpression(e.expression) && TRANSFORMS.test(e.expression.name.text)) return baseName(e.expression.expression);
    if (ts.isIdentifier(e.expression) && /^(String|Number|Math\.\w+)$/.test(e.expression.text) && e.arguments[0]) return baseName(e.arguments[0]);
    if (ts.isPropertyAccessExpression(e.expression) && ts.isIdentifier(e.expression.expression) && e.expression.expression.text === 'Math' && e.arguments[0]) return baseName(e.arguments[0]);
    const n = calleeName(e).split('.').pop() ?? '';
    const b = n.replace(/^(get|format|describe|to)(?=[A-Z])/, '');
    return b ? b[0].toLowerCase() + b.slice(1) : 'value';
  }
  if (ts.isBinaryExpression(e)) {
    const op = e.operatorToken.kind;
    if (op === ts.SyntaxKind.QuestionQuestionToken || op === ts.SyntaxKind.BarBarToken) return baseName(e.left);
    if ([ts.SyntaxKind.PlusToken, ts.SyntaxKind.MinusToken].includes(op)) {
      const l = strip(e.left);
      if (ts.isNumericLiteral(e.right) && (ts.isIdentifier(l) || ts.isPropertyAccessExpression(l))) return op === ts.SyntaxKind.PlusToken && e.right.text === '1' ? 'number' : baseName(l);
      return 'value';
    }
  }
  if (ts.isElementAccessExpression(e)) return baseName(e.expression);
  return 'value';
}
function valueName(expr, taken) {
  const e = strip(expr);
  let base = baseName(expr) || 'value';
  if (/^[A-Z0-9_]+$/.test(base)) base = camel(base.toLowerCase().split('_').filter(Boolean)) || 'value';
  base = base.replace(/^\w/, c => c.toLowerCase());
  if (base === 't' || base === 'count' || base === 'context') base = `${base}Value`;
  let name = base;
  for (let i = 2; taken.has(name); i++) name = `${base}${i}`;
  taken.add(name);
  return { name, simple: ts.isIdentifier(e) && e.text === name };
}

const sameExpr = (a, b) => a.replace(/\s*\?\?\s*0$/, '').replace(/\s+/g, '') === b.replace(/\s*\?\?\s*0$/, '').replace(/\s+/g, '');

// `n === 1 ? 'a' : 'b'` (or !== 1 the other way round): a plural.
function pluralOf(expr) {
  const e = strip(expr);
  if (!ts.isConditionalExpression(e)) return null;
  const c = strip(e.condition);
  if (!ts.isBinaryExpression(c)) return null;
  const isOne = n => ts.isNumericLiteral(n) && n.text === '1';
  const count = isOne(c.right) ? c.left : isOne(c.left) ? c.right : null;
  if (!count) return null;
  const K = ts.SyntaxKind;
  const op = c.operatorToken.kind;
  const stringy = n => { const x = strip(n); return ts.isStringLiteral(x) || ts.isNoSubstitutionTemplateLiteral(x) || ts.isTemplateExpression(x); };
  if (!stringy(e.whenTrue) || !stringy(e.whenFalse)) return null;
  if (op === K.EqualsEqualsEqualsToken || op === K.EqualsEqualsToken) return { count, one: strip(e.whenTrue), other: strip(e.whenFalse) };
  if (op === K.ExclamationEqualsEqualsToken || op === K.ExclamationEqualsToken) return { count, one: strip(e.whenFalse), other: strip(e.whenTrue) };
  return null;
}

// The pieces of a string-ish node: text and expressions.
function partsOf(node) {
  const n = strip(node);
  if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) return [{ text: n.text }];
  if (ts.isTemplateExpression(n)) {
    const out = [{ text: n.head.text }];
    for (const span of n.templateSpans) out.push({ expr: span.expression }, { text: span.literal.text });
    return out;
  }
  return [{ expr: n }];
}

function analyze(file) {
  const text = fs.readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const found = []; // { start, end, kind, value, params: [{name, exprStart, exprEnd, simple}], ctx, line, moduleLevel }

  function add(node, kind, value, params, start = node.getStart(sf), end = node.getEnd()) {
    if (ignoredLine(sf, node)) return;
    const { line } = sf.getLineAndCharacterOfPosition(start);
    found.push({ start, end, kind, value, params, line: line + 1, moduleLevel: isModuleLevel(node), worklet: insideWorklet(node) });
  }

  function accept(node, value) {
    if (looksLikeData(value.replace(/\{\{\w+\}\}/g, ''))) return false;
    const where = classify(node);
    if (where === 'data') return false;
    const single = isSingleWord(value.replace(/\{\{\w+\}\}/g, 'x'));
    if (where === 'text') return !(single && /^[a-z0-9-]+$/.test(value.trim()));
    // 'maybe': needs to read like a sentence or a label.
    if (single) {
      const w = value.trim();
      if (DATA_WORDS.has(w)) return false;
      if (/^[A-ZÁÉÍÓÚÑ0-9.]+$/.test(w) || /^\d/.test(w)) return false; // codes, all caps
      if (/^[A-ZÁÉÍÓÚÑ¡¿]/.test(w) || /[áéíóúñ…]/.test(w)) return true;
      // A lowercase word as a branch of a ternary that goes into a text is text.
      let p = node.parent && ts.isParenthesizedExpression(node.parent) ? node.parent.parent : node.parent;
      if (!p || !ts.isConditionalExpression(p) || p.condition === node || !LETTERS3.test(w)) return false;
      while (p.parent && (ts.isParenthesizedExpression(p.parent) || ts.isConditionalExpression(p.parent))) p = p.parent;
      return !!p.parent && (ts.isTemplateSpan(p.parent) || (ts.isJsxExpression(p.parent) && !ts.isJsxAttribute(p.parent.parent)));
    }
    if (!LETTERS3.test(value)) return false;
    if (/^[a-z]/.test(value.trim()) && !/[áéíóúñ]/.test(value) && value.trim().split(/\s+/).length < 2) return false;
    return true;
  }

  // Builds one message from text and values. A `n === 1 ? 'a' : 'b'` inside
  // turns it into a plural: key_one / key_other with {{count}}.
  function message(parts) {
    const taken = new Set(['count']);
    const params = [];
    const consumed = [];
    let countExpr = null;
    for (const part of parts) {
      if (part.expr) {
        const pl = pluralOf(part.expr);
        if (pl && (!countExpr || sameExpr(countExpr.getText(sf), pl.count.getText(sf)))) countExpr = countExpr ?? pl.count;
      }
    }
    // Prefer the count as written in the text (`n ?? 0`) over the one in the condition.
    if (countExpr) {
      const look = list => {
        for (const part of list) {
          if (!part.expr) continue;
          const pl = pluralOf(part.expr);
          if (pl) { look(partsOf(pl.one)); look(partsOf(pl.other)); continue; }
          if (sameExpr(part.expr.getText(sf), countExpr.getText(sf)) && part.expr.getText(sf).length > countExpr.getText(sf).length) countExpr = part.expr;
        }
      };
      look(parts);
      // A count that may be missing still needs a number to pick the form.
      if (!/\?\?/.test(countExpr.getText(sf)) && /\?\./.test(countExpr.getText(sf))) countExpr = { fallback: true, node: countExpr };
    }
    const cn = () => (countExpr && countExpr.fallback ? countExpr.node : countExpr);
    const render = which => {
      let out = '';
      const walk = list => {
        for (const part of list) {
          if (part.text !== undefined) { out += part.text; continue; }
          const pl = countExpr && pluralOf(part.expr);
          if (pl && sameExpr(pl.count.getText(sf), cn().getText(sf))) {
            if (which === 'one') consumed.push([pl.one.getStart(sf), pl.one.getEnd()]);
            else consumed.push([pl.other.getStart(sf), pl.other.getEnd()]);
            walk(partsOf(which === 'one' ? pl.one : pl.other));
            continue;
          }
          if (countExpr && sameExpr(part.expr.getText(sf), cn().getText(sf))) { out += '{{count}}'; continue; }
          const e = strip(part.expr);
          if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) { out += e.text; consumed.push([e.getStart(sf), e.getEnd()]); continue; }
          const start = part.expr.getStart(sf);
          const exprText = part.expr.getText(sf);
          let param = params.find(x => x.exprText === exprText);
          if (!param) {
            const { name, simple } = valueName(part.expr, taken);
            param = { name, exprStart: start, exprEnd: part.expr.getEnd(), simple, exprText };
            params.push(param);
          }
          out += `{{${param.name}}}`;
        }
      };
      walk(parts);
      return out;
    };
    const countNode = countExpr && countExpr.fallback ? countExpr.node : countExpr;
    if (!countExpr) return { value: render('other'), params, consumed };
    const one = render('one');
    const other = render('other');
    const count = { name: 'count', exprStart: countNode.getStart(sf), exprEnd: countNode.getEnd(), simple: ts.isIdentifier(strip(countNode)) && strip(countNode).text === 'count', fallback: !!countExpr.fallback };
    return { value: { one, other }, params: [count, ...params], consumed };
  }

  const textOf = value => (typeof value === 'string' ? value : `${value.one} ${value.other}`).replace(/\{\{\w+\}\}/g, '');

  // A <Text> whose children are only text and plain values becomes one t() call.
  function mergeableChildren(el) {
    const kids = el.children;
    if (!kids.length) return null;
    let hasWords = false;
    for (const k of kids) {
      if (ts.isJsxText(k)) {
        if (WORD.test(jsxTextValue(k.text))) hasWords = true;
        continue;
      }
      if (ts.isJsxExpression(k)) {
        if (!k.expression) continue;
        let bad = false;
        const visit = n => {
          if (ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n) || ts.isJsxFragment(n) || ts.isArrowFunction(n) || ts.isFunctionExpression(n)) bad = true;
          else ts.forEachChild(n, visit);
        };
        visit(k.expression);
        if (bad) return null;
        // `cond && 'x'` would render false/"" as text: leave those alone.
        if (ts.isBinaryExpression(k.expression) && k.expression.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) return null;
        continue;
      }
      return null;
    }
    const textKids = kids.filter(k => ts.isJsxText(k) && jsxTextValue(k.text));
    const exprKids = kids.filter(k => ts.isJsxExpression(k) && k.expression);
    const plural = exprKids.some(k => pluralOf(k.expression));
    if (!(hasWords || plural) || !exprKids.length || (!textKids.length && !plural)) return null;
    return kids;
  }

  const consumedRanges = [];

  function addMessage(node, kind, msg, start, end) {
    if (ignoredLine(sf, node)) return;
    const { line } = sf.getLineAndCharacterOfPosition(Math.max(start, node.getStart(sf)));
    found.push({ start, end, kind, value: msg.value, params: msg.params, line: line + 1, moduleLevel: isModuleLevel(node), worklet: insideWorklet(node) });
    consumedRanges.push(...msg.consumed);
  }

  function visit(node) {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node) || ts.isTypeNode(node) && !ts.isTypeLiteralNode(node)) return;

    if (ts.isJsxElement(node)) {
      const kids = mergeableChildren(node);
      if (kids) {
        const parts = [];
        for (const k of kids) {
          if (ts.isJsxText(k)) {
            // JSX keeps the spaces between text and {values} on the same line.
            const lines = k.text.split(/\r?\n/);
            let v = '';
            lines.forEach((line, i) => {
              let l = line.replace(/\t/g, ' ');
              if (i > 0) l = l.replace(/^\s+/, '');
              if (i < lines.length - 1) l = l.replace(/\s+$/, '');
              if (!l) return;
              v += v ? ` ${l}` : l;
            });
            if (v) parts.push({ text: v.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&') });
          } else if (k.expression) {
            parts.push({ expr: k.expression });
          }
        }
        const msg = message(parts);
        if (!looksLikeData(textOf(msg.value))) {
          addMessage(node, 'jsx-merged', msg, kids[0].pos, kids[kids.length - 1].getEnd());
          for (const k of kids) if (ts.isJsxExpression(k) && k.expression) ts.forEachChild(k, visit);
          ts.forEachChild(node.openingElement, visit);
          return;
        }
      }
    }

    if (ts.isJsxText(node)) {
      // The spaces at the edges stay in the code as {' '}; the catalog gets the words.
      const value = jsxTextValue(node.text).trim();
      if (value && !looksLikeData(value)) add(node, 'jsx-text', value, [], node.pos, node.getEnd());
      return;
    }
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      if (accept(node, node.text)) add(node, ts.isJsxAttribute(node.parent) ? 'attr' : 'string', node.text, []);
      return;
    }
    // n === 1 ? '1 archivo' : `${n} archivos`
    if (ts.isConditionalExpression(node) && pluralOf(node)) {
      const msg = message([{ expr: node }]);
      if (typeof msg.value === 'object' && LETTERS3.test(textOf(msg.value)) && accept(node, msg.value.other)) {
        addMessage(node, 'plural', msg, node.getStart(sf), node.getEnd());
        ts.forEachChild(node, visit);
        return;
      }
    }
    if (ts.isTemplateExpression(node)) {
      const msg = message(partsOf(node));
      const statics = [node.head.text, ...node.templateSpans.map(sp => sp.literal.text)].join(' ');
      const words = textOf(msg.value);
      const reads = LETTERS3.test(words) && (/\s/.test(statics.trim()) || typeof msg.value === 'object' || classify(node) === 'text');
      if (reads && accept(node, typeof msg.value === 'string' ? msg.value : msg.value.other)) addMessage(node, typeof msg.value === 'string' ? 'template' : 'plural', msg, node.getStart(sf), node.getEnd());
      ts.forEachChild(node, visit);
      return;
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);

  // Literals that became part of a bigger message (plural branches) go with it.
  const kept = found.filter(f => !consumedRanges.some(([cs, ce]) => f.start >= cs && f.end <= ce));
  found.length = 0;
  found.push(...kept);
  return { sf, text, found };
}

// ---- writing ----

function loadCatalog() {
  try {
    return JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  } catch {
    return {};
  }
}

function getPath(obj, key) {
  return key.split('.').reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), obj);
}

function setPath(obj, key, value) {
  const parts = key.split('.');
  let o = obj;
  parts.slice(0, -1).forEach(p => {
    if (o[p] === undefined) o[p] = {};
    if (typeof o[p] !== 'object') throw new Error(`Key clash at ${key}`);
    o = o[p];
  });
  o[parts[parts.length - 1]] = value;
}

function flatten(obj, prefix = '', out = new Map()) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, out);
    else out.set(key, v);
  }
  return out;
}

function sortDeep(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
  const out = {};
  const keys = Object.keys(obj);
  // common first, then alphabetical.
  keys.sort((a, b) => (a === 'common' ? -1 : b === 'common' ? 1 : a.localeCompare(b)));
  for (const k of keys) out[k] = sortDeep(obj[k]);
  return out;
}

function addImport(text, sf, file) {
  const existing = /import \{([^}]*)\} from ['"]@\/i18n['"];/.exec(text);
  if (existing) {
    const names = existing[1].split(',').map(n => n.trim()).filter(Boolean);
    if (names.includes('t')) return text;
    const merged = `import { ${[...names, 't'].sort().join(', ')} } from '@/i18n';`;
    return text.slice(0, existing.index) + merged + text.slice(existing.index + existing[0].length);
  }
  const imports = sf.statements.filter(s => ts.isImportDeclaration(s));
  const line = "import { t } from '@/i18n';\n";
  if (!imports.length) return line + text;
  const last = imports[imports.length - 1];
  const end = last.getEnd();
  void file;
  return `${text.slice(0, end)}\n${line.trimEnd()}${text.slice(end)}`;
}

function declaresT(sf) {
  let found = false;
  const visit = n => {
    if ((ts.isVariableDeclaration(n) || ts.isParameter(n) || ts.isBindingElement(n) || ts.isFunctionDeclaration(n)) && n.name && ts.isIdentifier(n.name) && n.name.text === 't') found = true;
    if (ts.isImportSpecifier(n) && n.name.text === 't' && !/@\/i18n/.test(n.parent.parent.parent.moduleSpecifier.getText())) found = true;
    if (!found) ts.forEachChild(n, visit);
  };
  visit(sf);
  return found;
}

// A list read whole, like t('dates.months', { returnObjects: true }), uses its children.
function prefixUsed(used, key) {
  for (const u of used) if (key.startsWith(`${u}.`)) return true;
  return false;
}

function main() {
  const args = process.argv.slice(2);
  const write = args.includes('--write');
  const only = args.filter(a => !a.startsWith('--')).map(a => path.resolve(root, a));
  const files = (only.length ? only : SOURCE_DIRS.flatMap(d => listFiles(path.join(root, d)))).filter(f => !SKIP_FILES.has(path.relative(root, f).replace(/\\/g, '/')));

  const results = files.map(file => ({ file, ...analyze(file) })).filter(r => r.found.length);
  const report = [];
  for (const r of results) {
    for (const f of r.found) {
      const flags = [f.moduleLevel && 'module', f.worklet && 'WORKLET'].filter(Boolean).join(',');
      report.push(`${path.relative(root, r.file)}:${f.line}\t${f.kind}${flags ? `[${flags}]` : ''}\t${JSON.stringify(f.value)}`);
    }
  }

  if (!write) {
    if (report.length) {
      console.log(report.join('\n'));
      console.log(`\n${report.length} textos sin pasar por t() en ${results.length} archivos.`);
      process.exit(1);
    }
    console.log('Todos los textos pasan por t().');
    return;
  }

  const catalog = loadCatalog();
  const existing = flatten(catalog);
  const byValue = new Map(); // value -> key already in the catalog
  for (const [k, v] of existing) {
    if (k.endsWith('_one')) {
      const base = k.slice(0, -4);
      const pair = JSON.stringify({ one: v, other: existing.get(`${base}_other`) });
      if (!byValue.has(pair)) byValue.set(pair, base);
    } else if (!k.endsWith('_other') && !byValue.has(v)) byValue.set(v, k);
  }

  // Texts in 3+ files go to common.
  const filesByValue = new Map();
  for (const r of results) for (const f of r.found) {
    const id = typeof f.value === 'string' ? f.value : JSON.stringify(f.value);
    if (!filesByValue.has(id)) filesByValue.set(id, new Set());
    filesByValue.get(id).add(r.file);
  }

  const usedKeys = new Set(existing.keys());
  const keyFor = (value, ns) => {
    const id = typeof value === 'string' ? value : JSON.stringify(value);
    if (byValue.has(id)) return byValue.get(id);
    const space = (filesByValue.get(id)?.size ?? 0) >= 3 ? 'common' : ns;
    const base = `${space}.${slug(typeof value === 'string' ? value : value.other)}`;
    const taken = k => usedKeys.has(k) || usedKeys.has(`${k}_one`) || getPath(catalog, k) !== undefined || getPath(catalog, `${k}_one`) !== undefined;
    let key = base;
    for (let i = 2; taken(key); i++) key = `${base}${i}`;
    if (typeof value === 'string') {
      usedKeys.add(key);
      setPath(catalog, key, value);
    } else {
      usedKeys.add(`${key}_one`);
      usedKeys.add(`${key}_other`);
      setPath(catalog, `${key}_one`, value.one);
      setPath(catalog, `${key}_other`, value.other);
    }
    byValue.set(id, key);
    return key;
  };

  let changed = 0;
  for (const r of results) {
    if (declaresT(r.sf)) {
      console.error(`${path.relative(root, r.file)}: declara una variable "t"; cámbiale el nombre y vuelve a correr.`);
      continue;
    }
    const ns = fileNamespace(r.file);
    const edits = [];
    for (const f of r.found) {
      if (f.worklet) {
        console.error(`${path.relative(root, r.file)}:${f.line}: texto dentro de un worklet, sáltalo a mano.`);
        continue;
      }
      edits.push({ ...f, key: keyFor(f.value, ns) });
    }
    // Inner edits first (by size), then compose outer ones from the edited text.
    edits.sort((a, b) => a.end - a.start - (b.end - b.start));
    const applied = [];
    const sliceWithEdits = (start, end) => {
      let s = r.text.slice(start, end);
      const inner = applied.filter(e => !e.consumed && e.start >= start && e.end <= end).sort((a, b) => b.start - a.start);
      for (const e of inner) {
        s = s.slice(0, e.start - start) + e.replacement + s.slice(e.end - start);
        e.consumed = true;
      }
      return s;
    };
    for (const e of edits) {
      const params = e.params.map(p => (p.simple ? p.name : `${p.name}: ${sliceWithEdits(p.exprStart, p.exprEnd)}${p.fallback ? ' ?? 0' : ''}`));
      const call = `t('${e.key}'${params.length ? `, { ${params.join(', ')} }` : ''})`;
      let replacement;
      if (e.kind === 'jsx-text') {
        const raw = r.text.slice(e.start, e.end);
        const lead = raw.match(/^\s*/)[0];
        const trail = raw.match(/\s*$/)[0];
        // Keep a space that JSX would keep next to another child.
        const keepLead = lead && !lead.includes('\n') ? "{' '}" : '';
        const keepTrail = trail && !trail.includes('\n') ? "{' '}" : '';
        replacement = `${lead.includes('\n') ? lead : ''}${keepLead}{${call}}${keepTrail}${trail.includes('\n') ? trail : ''}`;
      } else if (e.kind === 'jsx-merged') {
        const raw = r.text.slice(e.start, e.end);
        const lead = raw.match(/^\s*/)[0];
        const trail = raw.match(/\s*$/)[0];
        sliceWithEdits(e.start, e.end); // consume inner edits, their text lives in params now
        replacement = `${lead.includes('\n') ? lead : ''}{${call}}${trail.includes('\n') ? trail : ''}`;
      } else if (e.kind === 'attr') {
        replacement = `{${call}}`;
      } else {
        sliceWithEdits(e.start, e.end);
        replacement = call;
      }
      applied.push({ start: e.start, end: e.end, replacement });
    }
    let out = r.text;
    for (const e of applied.filter(a => !a.consumed).sort((a, b) => b.start - a.start)) {
      out = out.slice(0, e.start) + e.replacement + out.slice(e.end);
    }
    if (out !== r.text) {
      const sf2 = ts.createSourceFile(r.file, out, ts.ScriptTarget.Latest, true, r.file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
      out = addImport(out, sf2, r.file);
      fs.writeFileSync(r.file, out);
      changed++;
    }
  }

  // Keys nobody uses any more (a text that was deleted, or merged into another) go away.
  const used = new Set();
  for (const file of SOURCE_DIRS.flatMap(d => listFiles(path.join(root, d)))) {
    for (const m of fs.readFileSync(file, 'utf8').matchAll(/\bt(?:List)?\(\s*'([\w.]+)'/g)) used.add(m[1]);
  }
  for (const key of flatten(catalog).keys()) {
    const base = key.replace(/_(one|other|zero|two|few|many)$/, '');
    if (used.has(base) || used.has(key) || key.startsWith('dates.') || prefixUsed(used, key)) continue;
    const parts = key.split('.');
    let o = catalog;
    parts.slice(0, -1).forEach(k => { o = o[k]; });
    delete o[parts[parts.length - 1]];
  }
  const dropEmpty = o => { for (const k of Object.keys(o)) if (o[k] && typeof o[k] === 'object' && !Array.isArray(o[k])) { dropEmpty(o[k]); if (!Object.keys(o[k]).length) delete o[k]; } };
  dropEmpty(catalog);

  fs.mkdirSync(path.dirname(catalogPath), { recursive: true });
  fs.writeFileSync(catalogPath, `${JSON.stringify(sortDeep(catalog), null, 2)}\n`);
  console.log(`${changed} archivos reescritos, ${flatten(catalog).size} textos en i18n/locales/es.json.`);
}

main();
