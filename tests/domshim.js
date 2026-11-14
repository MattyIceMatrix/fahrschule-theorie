/* Minimal DOM/browser shim: just enough to load index.html's single inline script
   in Node so the real functions (begin, isRight, finish, applyLang) can be driven
   directly. No dependencies. Only the DOM surface the page actually uses. */
'use strict';

// --- a very small HTML fragment parser: open/close/self-closing tags + text ---
function parseFragment(html, make) {
  const root = make('#fragment');
  const stack = [root];
  const re = /<\/?([a-zA-Z][a-zA-Z0-9]*)((?:\s+[a-zA-Z-]+(?:=(?:"[^"]*"|'[^']*'))?)*)\s*(\/?)>|([^<]+)/g;
  let m;
  while ((m = re.exec(html))) {
    const [all, tag, attrs, selfClose, text] = m;
    if (text !== undefined) {
      if (text.trim()) stack[stack.length - 1]._text += text;
      continue;
    }
    if (all[1] === '/') { if (stack.length > 1) stack.pop(); continue; }
    const el = make(tag.toLowerCase());
    for (const a of (attrs || '').matchAll(/([a-zA-Z-]+)(?:="([^"]*)"|='([^']*)')?/g)) {
      const name = a[1], val = a[2] !== undefined ? a[2] : (a[3] !== undefined ? a[3] : '');
      if (name === 'class') el.className = val;
      else if (name === 'id') el.id = val;
      else el._attrs[name] = val;
    }
    stack[stack.length - 1].appendChild(el);
    if (!selfClose && !['br', 'input', 'img', 'hr'].includes(el.tagName)) stack.push(el);
  }
  return root.children.slice();
}

function install() {
  const byId = new Map();

  class El {
    constructor(tag) {
      this.tagName = tag; this.id = ''; this.className = ''; this._text = '';
      this.children = []; this._attrs = {}; this.style = {}; this.hidden = false;
      this.disabled = false; this.checked = false; this.value = ''; this.type = '';
      this.width = 0; this.height = 0; this.title = '';
      this.classList = {
        add: (...c) => { c.forEach(x => { if (!this._cls().includes(x)) this.className = (this.className + ' ' + x).trim(); }); },
        remove: (...c) => { this.className = this._cls().filter(x => !c.includes(x)).join(' '); },
        toggle: (c, on) => { const has = this._cls().includes(c); const want = on === undefined ? !has : !!on; want ? this.classList.add(c) : this.classList.remove(c); },
        contains: c => this._cls().includes(c),
      };
    }
    _cls() { return this.className.split(/\s+/).filter(Boolean); }
    get textContent() { return this._text + this.children.map(c => c.textContent).join(''); }
    set textContent(v) { this._text = v == null ? '' : String(v); this.children = []; }
    set innerHTML(html) {
      this.children = []; this._text = '';
      if (!html) return;
      this.children = parseFragment(String(html), t => new El(t));
      this.children.forEach(c => { c.parentNode = this; if (c.id) byId.set(c.id, c); });
    }
    get innerHTML() { return this.textContent; }
    appendChild(c) { this.children.push(c); c.parentNode = this; if (c.id) byId.set(c.id, c); return c; }
    append(...cs) { cs.forEach(c => this.appendChild(c)); }
    setAttribute(k, v) { if (k === 'class') this.className = v; else this._attrs[k] = v; }
    getAttribute(k) { return k === 'class' ? this.className : this._attrs[k]; }
    _all() { const out = []; const walk = e => e.children.forEach(c => { out.push(c); walk(c); }); walk(this); return out; }
    _match(sel) {
      return e => sel.startsWith('.') ? e._cls().includes(sel.slice(1))
        : sel.startsWith('#') ? e.id === sel.slice(1)
          : e.tagName === sel.toLowerCase();
    }
    querySelector(sel) { return this._all().find(this._match(sel.trim())) || null; }
    querySelectorAll(sel) { const r = this._all().filter(this._match(sel.trim())); r.forEach = Array.prototype.forEach; return r; }
    scrollIntoView() { }
    getContext() { return new Proxy({}, { get: (t, k) => k === 'canvas' ? null : (() => { }) }); }
    focus() { }
  }

  const document = {
    documentElement: new El('html'),
    getElementById: id => byId.get(id) || null,
    createElement: t => new El(t),
    addEventListener: () => { },
    querySelector: () => null,
  };
  const store = new Map();
  const localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
  };
  const window = { scrollTo: () => { }, addEventListener: () => { }, matchMedia: () => ({ matches: false, addEventListener: () => { } }) };
  return {
    document, localStorage, window, byId, El,
    performance: { now: () => Date.now() },
    requestAnimationFrame: () => 0,
    cancelAnimationFrame: () => { },
  };
}

/* Build the page's element tree from index.html's markup (ids only - that is all
   the script looks up) and then run the inline script against it. */
function loadPage(html) {
  const env = install();
  const bodyStart = html.indexOf('<div class="wrap">');
  const markup = html.slice(bodyStart, html.indexOf('<script>'));
  // build the real element tree from the static markup so ids, classes and the
  // `hidden` attribute match the shipped page
  const tree = parseFragment(markup, t => new env.El(t));
  const register = e => { if (e.id) env.byId.set(e.id, e); if ('hidden' in e._attrs) e.hidden = true; e.children.forEach(register); };
  tree.forEach(register);
  const script = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'));
  const scope = {
    document: env.document, localStorage: env.localStorage, window: env.window,
    performance: env.performance, requestAnimationFrame: env.requestAnimationFrame,
    cancelAnimationFrame: env.cancelAnimationFrame,
    setInterval: () => 0, clearInterval: () => { }, setTimeout: () => 0,
  };
  const names = Object.keys(scope);
  // expose the script's top-level declarations so tests can drive them
  const exported = ['Q', 'CH', 'SCENE_OF', 'SC', 'T', 'RANKS', 'begin', 'finish', 'isRight',
    'applyLang', 'set', 'answers', 'mode', 'lang'];
  const body = script + '\n;return {' + exported.map(n => `get ${n}(){return typeof ${n}==="undefined"?undefined:${n}},set ${n}(v){${n}=v}`).join(',') + '};';
  const fn = new Function(...names, body);
  const api = fn(...names.map(n => scope[n]));
  return { api, env };
}

module.exports = { loadPage, install, parseFragment };
