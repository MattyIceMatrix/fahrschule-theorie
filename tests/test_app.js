/* Tests for the Klasse B theory trainer. One static HTML file, so these run the page's own
   inline script in Node against a tiny DOM shim and drive the real functions.

   Run from the repo root:  node --test tests/
   Blast radius: reads index.html and README.md. Writes nothing. No network, no dependencies.

   The exam rules checked below are the official ones for a first-time Klasse B theory test
   (theoretische Fahrerlaubnisprufung, Anlage 7 FeV): 30 questions made up of 20 Grundstoff and
   10 Zusatzstoff, a pass at no more than 10 Fehlerpunkte, and a fail regardless of the total if
   two questions worth 5 Fehlerpunkte each are answered wrongly. Getting these wrong in a
   trainer is worse than useless: someone would practise against the wrong bar.
*/
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { loadPage } = require('./domshim.js');

const ROOT = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const README = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');

const page = loadPage(HTML);
const { api, env } = page;
const $ = id => env.byId.get(id);
const Q = api.Q, CH = api.CH, T = api.T, SC = api.SC, SCENE_OF = api.SCENE_OF;

// ---------------------------------------------------------------- page integrity
test('the page loads and every id the script looks up exists in the markup', () => {
  const markup = HTML.slice(HTML.indexOf('<div class="wrap">'), HTML.indexOf('<script>'));
  const script = HTML.slice(HTML.indexOf('<script>'));
  const declared = new Set([...markup.matchAll(/id="([^"]+)"/g)].map(m => m[1]));
  // ids the script creates at runtime rather than finding in the markup
  const runtime = new Set(['chc', 'rv', 'opt', 'qcanvas']);
  const looked = new Set([...script.matchAll(/\$\("([^"]+)"\)/g)].map(m => m[1]));
  const missing = [...looked].filter(id => !declared.has(id) && !runtime.has(id));
  assert.deepStrictEqual(missing, [], `script calls $() on ids that do not exist: ${missing}`);
  assert.ok(declared.size > 25, `only ${declared.size} ids in the markup, expected the full shell`);
});

test('the markup is well formed: every tag closes, in order', () => {
  const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link',
    'meta', 'param', 'source', 'track', 'wbr']);
  // the inline <script> and <style> bodies are not markup, so take them out first
  const markup = HTML
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '<script></script>')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/g, '<style></style>')
    .replace(/<!--[\s\S]*?-->/g, '');
  const stack = [];
  const re = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
  let m, tags = 0;
  while ((m = re.exec(markup))) {
    const [, slash, raw, attrs] = m;
    const tag = raw.toLowerCase();
    tags++;
    if (tag === '!doctype' || VOID.has(tag)) continue;
    if (slash) {
      assert.ok(stack.length, `</${tag}> closes nothing (character ${m.index})`);
      const open = stack.pop();
      assert.strictEqual(open, tag, `</${tag}> closes a <${open}> (character ${m.index})`);
    } else if (!attrs.trimEnd().endsWith('/')) {
      stack.push(tag);
    }
  }
  assert.deepStrictEqual(stack, [], `tags left open at the end of the document: ${stack}`);
  assert.ok(tags > 50, `only ${tags} tags found; the parser is not seeing the document`);
  assert.match(HTML, /^<!doctype html>/i, 'no doctype');
  assert.match(HTML, /<html[^>]*\slang="de"/, 'the document does not declare its language');
  assert.match(HTML, /<meta name="viewport"/, 'no viewport meta, on a page that advertises itself as phone-friendly');
  // unquoted attribute values are the usual way a single-file page breaks a parser
  const unquoted = [...markup.matchAll(/<[a-zA-Z][^>]*?\s[a-zA-Z-]+=(?!["'])[^\s>]+/g)].map(x => x[0].slice(0, 60));
  assert.deepStrictEqual(unquoted, [], `unquoted attribute values: ${unquoted}`);
});

test('no duplicate element ids', () => {
  const ids = [...HTML.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]);
  const seen = new Set(), dup = [];
  for (const id of ids) { if (seen.has(id)) dup.push(id); seen.add(id); }
  assert.deepStrictEqual(dup, [], `duplicate ids: ${dup}`);
});

test('no broken internal anchors and no dead relative links', () => {
  const ids = new Set([...HTML.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]));
  const anchors = [...HTML.matchAll(/href="#([^"]+)"/g)].map(m => m[1]);
  assert.deepStrictEqual(anchors.filter(a => !ids.has(a)), [], 'anchor points at no element');
  const rel = [...HTML.matchAll(/(?:href|src)="(?!#|https?:|data:|mailto:)([^"]+)"/g)].map(m => m[1]);
  assert.deepStrictEqual(rel.filter(f => !fs.existsSync(path.join(ROOT, f))), [], 'dead relative link');
  const readmeRel = [...README.matchAll(/\]\((?!https?:)([^)]+)\)/g)].map(m => m[1]);
  assert.deepStrictEqual(readmeRel.filter(f => !fs.existsSync(path.join(ROOT, f))), [], 'dead README link');
});

test('nothing private or secret is shipped in a public single-file page', () => {
  const patterns = [/sk-[A-Za-z0-9]{20,}/, /AKIA[0-9A-Z]{16}/, /ghp_[A-Za-z0-9]{36}/,
  /api[_-]?key\s*[:=]\s*['"][^'"]{8,}/i, /Authorization\s*:\s*['"]Bearer/i,
  /BEGIN [A-Z ]*PRIVATE KEY/, /[\w.+-]+@(?:gmail|googlemail|outlook|yahoo)\.[a-z]{2,}/i,
  /\/(?:home|Users)\/[A-Za-z0-9_.-]+\//];
  const hit = patterns.filter(re => re.test(HTML));
  assert.deepStrictEqual(hit.map(String), [], 'credential, personal address or local path in index.html');
});

/* The page loads its two display faces from Google Fonts, so a visitor's IP reaches Google
   before any consent. The README says so, and this test pins the list: any NEW third-party
   origin added to the page fails CI. Removing the link (the fallback stacks in :root already
   name Arial Narrow / system faces) or embedding the fonts as data: URIs would clear it; see
   the companion minedime repository, which cites LG Munchen I, 3 O 17493/20 (2022). */
const DECLARED_THIRD_PARTIES = ['fonts.googleapis.com'];

test('the page contacts no third party beyond the ones the README declares', () => {
  const origins = [...new Set([...HTML.matchAll(/https?:\/\/([^\/\s"'<>)]+)/g)].map(m => m[1]))];
  const undeclared = origins.filter(o => !DECLARED_THIRD_PARTIES.includes(o));
  assert.deepStrictEqual(undeclared, [], `page contacts undeclared third parties: ${undeclared}`);
  for (const host of origins) {
    assert.ok(README.includes(host), `the page loads from ${host} but the README does not say so`);
  }
});

// ---------------------------------------------------------------- question bank
test('the question bank is well formed', () => {
  assert.ok(Q.length >= 30, `only ${Q.length} questions`);
  const ids = Q.map(q => q.id);
  assert.strictEqual(new Set(ids).size, ids.length, 'duplicate question ids');
  for (const q of Q) {
    const where = `question ${q.id}`;
    assert.ok([2, 3, 4, 5].includes(q.p), `${where}: ${q.p} Fehlerpunkte is not one of 2, 3, 4, 5`);
    assert.ok(q.t === 'g' || q.t === 'z', `${where}: unknown section "${q.t}"`);
    for (const field of ['q', 'e', 'fig']) {
      assert.ok(Array.isArray(q[field]) && q[field].length === 2 && q[field][0] && q[field][1],
        `${where}: ${field} is not a filled German/English pair`);
    }
    if (q.num !== undefined) {
      assert.ok(typeof q.num === 'number' && Number.isFinite(q.num), `${where}: bad numeric answer`);
      assert.ok(Array.isArray(q.unit) && q.unit.length === 2, `${where}: numeric question without a unit pair`);
      assert.strictEqual(q.o, undefined, `${where}: numeric question also carries options`);
      assert.strictEqual(q.a, undefined, `${where}: numeric question also carries an answer index`);
    } else {
      assert.ok(Array.isArray(q.o) && q.o.length >= 2, `${where}: fewer than two options`);
      q.o.forEach((o, i) => assert.ok(Array.isArray(o) && o.length === 2 && o[0] && o[1],
        `${where}: option ${i} is not a filled German/English pair`));
      assert.ok(Array.isArray(q.a) && q.a.length >= 1, `${where}: no correct answer marked`);
      assert.strictEqual(new Set(q.a).size, q.a.length, `${where}: an answer index is listed twice`);
      q.a.forEach(i => assert.ok(Number.isInteger(i) && i >= 0 && i < q.o.length,
        `${where}: correct-answer index ${i} is outside the option list`));
    }
  }
  /* A real Klasse B question can have one, two or all of its answers correct - the page says
     so ("Mehrere Antworten koennen richtig sein"), so "exactly one correct" is NOT the rule.
     What would be a data-entry mistake is a bank where most questions are all-correct. */
  const mc = Q.filter(q => q.num === undefined);
  const allCorrect = mc.filter(q => q.a.length === q.o.length).length;
  assert.ok(allCorrect / mc.length < 0.2,
    `${allCorrect} of ${mc.length} multiple-choice questions mark every option correct`);
});

test('the bank is deep enough to draw a real exam, and every question is reachable', () => {
  const g = Q.filter(q => q.t === 'g').length, z = Q.filter(q => q.t === 'z').length;
  assert.ok(g >= 20, `${g} Grundstoff questions; an exam needs 20`);
  assert.ok(z >= 10, `${z} Zusatzstoff questions; an exam needs 10`);
  const inChapters = new Set(CH.flatMap(c => c.ids));
  const orphans = Q.map(q => q.id).filter(id => !inChapters.has(id));
  assert.deepStrictEqual(orphans, [], `questions in no chapter, so unreachable from Lernen: ${orphans}`);
  const ids = new Set(Q.map(q => q.id));
  for (const c of CH) {
    assert.deepStrictEqual(c.ids.filter(i => !ids.has(i)), [], `chapter ${c.k} points at a missing question`);
    assert.ok(SC[c.v], `chapter ${c.k} names lesson animation "${c.v}", which does not exist`);
    assert.ok(Array.isArray(c.n) && c.n.length === 2 && c.n[0] && c.n[1], `chapter ${c.k} name is not a DE/EN pair`);
  }
});

// ---------------------------------------------------------------- the exam rules
test('an exam is 30 questions: 20 Grundstoff plus 10 Zusatzstoff', () => {
  for (let i = 0; i < 25; i++) {           // the draw is random, so check it repeatedly
    api.begin('exam');
    assert.strictEqual(api.set.length, 30, 'exam is not 30 questions');
    assert.strictEqual(api.set.filter(q => q.t === 'g').length, 20, 'not 20 Grundstoff questions');
    assert.strictEqual(api.set.filter(q => q.t === 'z').length, 10, 'not 10 Zusatzstoff questions');
    assert.strictEqual(new Set(api.set.map(q => q.id)).size, 30, 'the same question was drawn twice');
  }
  assert.match(README, /30-question/, 'README no longer claims a 30-question exam');
});

test('scoring follows the official rule: at most 10 Fehlerpunkte, and never two wrong 5-point questions', () => {
  const byPoints = p => Q.filter(q => q.p === p && q.num === undefined);
  const PASS = T.de.pass, FAIL = T.de.fail;
  const verdict = wrong => {
    const filler = Q.filter(q => !wrong.includes(q) && q.num === undefined).slice(0, 5);
    const set = wrong.concat(filler);
    api.lang = 'de'; api.mode = 'exam'; api.set = set;
    api.answers = set.map(q => (wrong.includes(q) ? [] : q.a.slice()));
    api.finish();
    return { verdict: $('verdict').textContent, pts: Number($('s-pts').textContent) };
  };
  const cases = [
    ['everything right', [], 0, PASS],
    ['three 3-point questions wrong (9)', byPoints(3).slice(0, 3), 9, PASS],
    ['3 + 3 + 4 = exactly 10, the limit', byPoints(3).slice(0, 2).concat(byPoints(4).slice(0, 1)), 10, PASS],
    ['3 + 4 + 4 = 11, one over', byPoints(3).slice(0, 1).concat(byPoints(4).slice(0, 2)), 11, FAIL],
    ['one 5-point question plus a 3 (8)', byPoints(5).slice(0, 1).concat(byPoints(3).slice(0, 1)), 8, PASS],
    ['two 5-point questions: 10 points but still a fail', byPoints(5).slice(0, 2), 10, FAIL],
  ];
  for (const [name, wrong, pts, want] of cases) {
    if (wrong.length && wrong.length !== new Set(wrong).size) assert.fail('test set-up drew a duplicate');
    const r = verdict(wrong);
    assert.strictEqual(r.pts, pts, `${name}: scored ${r.pts} Fehlerpunkte, expected ${pts}`);
    assert.strictEqual(r.verdict, want, `${name}: verdict "${r.verdict}", expected "${want}"`);
  }
  // the special rule has to be reachable: the bank must hold at least two 5-point questions,
  // and they must be able to land in the same exam
  const fives = Q.filter(q => q.p === 5);
  assert.ok(fives.length >= 2, `only ${fives.length} five-point question(s); the two-fives rule can never fire`);
  assert.ok(fives.filter(q => q.t === 'g').length >= 2 || fives.filter(q => q.t === 'z').length >= 2
    || (fives.some(q => q.t === 'g') && fives.some(q => q.t === 'z')),
    'the five-point questions cannot both be drawn into one exam');
});

test('a question counts as right only when every correct option is ticked and no wrong one is', () => {
  const multi = Q.find(q => q.num === undefined && q.a.length > 1);
  const wrongIdx = multi.o.map((_, i) => i).find(i => !multi.a.includes(i));
  assert.strictEqual(api.isRight(multi, multi.a.slice()), true, 'the exact correct set is marked wrong');
  assert.strictEqual(api.isRight(multi, multi.a.slice().reverse()), true, 'order of ticks should not matter');
  assert.strictEqual(api.isRight(multi, multi.a.slice(0, 1)), false, 'a partial answer counted as right');
  assert.strictEqual(api.isRight(multi, multi.a.concat(wrongIdx)), false, 'a wrong extra tick counted as right');
  assert.strictEqual(api.isRight(multi, []), false, 'an empty answer counted as right');
  assert.strictEqual(api.isRight(multi, null), false, 'an unanswered question counted as right');
  const num = Q.find(q => q.num !== undefined);
  assert.strictEqual(api.isRight(num, String(num.num)), true, 'the right number is marked wrong');
  assert.strictEqual(api.isRight(num, String(num.num).replace('.', ',')), true, 'a German decimal comma is rejected');
  assert.strictEqual(api.isRight(num, String(num.num + 1)), false, 'a wrong number counted as right');
  assert.strictEqual(api.isRight(num, ''), false, 'a blank counted as right');
});

test('the exam is timed, and the clock matches what the page advertises', () => {
  const script = HTML.slice(HTML.indexOf('<script>'));
  const limit = Number(script.match(/const left\s*=\s*(\d+)\s*\*\s*60\s*-/)[1]);
  assert.ok(limit >= 30 && limit <= 45, `${limit} minutes is outside the 30-45 minutes a real Klasse B sitting allows`);
  for (const l of ['de', 'en']) {
    assert.ok(T[l].m1s.includes(String(limit)),
      `the ${l.toUpperCase()} exam blurb does not mention the ${limit}-minute clock it actually enforces`);
    assert.ok(T[l].m1s.includes('30'), `the ${l.toUpperCase()} exam blurb does not mention 30 questions`);
  }
  assert.match(README, /timed exam/, 'README no longer claims a timed exam');
});

// ---------------------------------------------------------------- lessons and language
test('every lesson animation really animates, with no NaN coordinates', () => {
  /* Regression guard for the easing helper. `E(t, start, duration)` returns the progress of a
     tween; it used to be declared with a spare parameter, so every call site (all of which pass
     three arguments) left `duration` undefined and E returned NaN for every t past its start.
     Canvas2D silently ignores a transform with a NaN in it, so 11 of the 14 lesson animations
     drew their vehicles stuck in the corner instead of moving. Nothing failed loudly.
     These assertions fail on that bug and pass on the fix. */
  const keys = Object.keys(SC);
  assert.ok(keys.length >= 8, `only ${keys.length} lesson animations`);
  const recorder = () => {
    const calls = [];
    const ctx = new Proxy({}, {
      get: (_, p) => {
        if (p === 'canvas') return { width: 640, height: 360 };
        if (p === 'measureText') return () => ({ width: 10 });
        return (...a) => calls.push(String(p) + '(' + a.join(',') + ')');
      },
      set: (_, p, v) => { calls.push(String(p) + '=' + v); return true; },
    });
    return { ctx, calls };
  };
  for (const k of keys) {
    const s = SC[k];
    assert.ok(typeof s.f === 'function', `scene ${k} has no draw function`);
    assert.ok(s.d > 1, `scene ${k} lasts ${s.d}s, too short to be an animation`);
    const frames = [];
    for (let i = 0; i <= 8; i++) {
      const r = recorder();
      const caption = s.f(r.ctx, (s.d * i) / 8, 640, 360, true);
      const drawn = r.calls.join('|');
      assert.ok(!/NaN|Infinity/.test(drawn),
        `scene ${k} draws with a NaN or Infinity coordinate at t=${((s.d * i) / 8).toFixed(1)}s`);
      assert.ok(r.calls.length > 3, `scene ${k} draws almost nothing at t=${((s.d * i) / 8).toFixed(1)}s`);
      if (caption !== undefined) assert.ok(typeof caption === 'string' && caption.length,
        `scene ${k} returns an empty caption`);
      frames.push(drawn);
    }
    assert.ok(new Set(frames).size >= 5,
      `scene ${k} produced only ${new Set(frames).size} distinct frames across 9 samples: it barely moves`);
    assert.notStrictEqual(frames[0], frames[8], `scene ${k} ends exactly where it started`);
    const de = s.f(recorder().ctx, s.d * 0.5, 640, 360, true);
    const en = s.f(recorder().ctx, s.d * 0.5, 640, 360, false);
    if (de !== undefined) assert.notStrictEqual(de, en, `scene ${k} returns the same caption for DE and EN`);
  }
  for (const [id, scene] of Object.entries(SCENE_OF)) {
    assert.ok(SC[scene], `question ${id} points at lesson animation "${scene}", which does not exist`);
    assert.ok(Q.some(q => q.id === Number(id)), `lesson animation mapped to question ${id}, which does not exist`);
  }
  assert.match(README, /animated lesson/, 'README no longer claims animated lessons');
});

test('the DE/EN switch is complete: no string is left in one language only', () => {
  const de = Object.keys(T.de), en = Object.keys(T.en);
  assert.deepStrictEqual(de.filter(k => !en.includes(k)), [], 'German strings with no English');
  assert.deepStrictEqual(en.filter(k => !de.includes(k)), [], 'English strings with no German');
  assert.deepStrictEqual(de.filter(k => !T.de[k]), [], 'empty German strings');
  assert.deepStrictEqual(en.filter(k => !T.en[k]), [], 'empty English strings');
  // "Situation" is the same word in both languages; anything else identical is untranslated
  const identical = de.filter(k => T.de[k] === T.en[k] && k !== 'figL');
  assert.deepStrictEqual(identical, [], `untranslated strings: ${identical}`);
  // every placeholder in the markup must be filled from the table when the language changes
  const markup = HTML.slice(HTML.indexOf('<div class="wrap">'), HTML.indexOf('<script>'));
  const slots = [...markup.matchAll(/id="t-([a-z0-9]+)"/g)].map(m => m[1]);
  const script = HTML.slice(HTML.indexOf('<script>'));
  const applied = new Set(eval(script.match(/\n\s*(\["sub",[\s\S]*?\])\.forEach\(k=>\{const el=\$\("t-"\+k\)/)[1]));
  const unwired = slots.filter(k => !applied.has(k) && !new RegExp(`\\$\\("t-${k}"\\)\\.textContent`).test(script));
  assert.deepStrictEqual(unwired, [], `markup slots never refilled on a language switch: ${unwired}`);
  assert.deepStrictEqual(slots.filter(k => !de.includes(k)), [], 'markup slot with no entry in the string table');
  // and nothing user-visible may be hard-coded in one language
  const germanOnly = [...markup.matchAll(/aria-label="([^"]+)"/g)].map(m => m[1])
    .filter(v => !de.some(k => T.de[k] === v) && !en.some(k => T.en[k] === v));
  assert.deepStrictEqual(germanOnly, [], `hard-coded aria-label text, never translated: ${germanOnly}`);
  assert.match(README, /DE\/EN/, 'README no longer claims DE/EN');
});

test('switching language actually rewrites the page', () => {
  api.lang = 'de'; api.applyLang();
  const deLead = $('t-lead').textContent;
  api.lang = 'en'; api.applyLang();
  const enLead = $('t-lead').textContent;
  assert.strictEqual(deLead, T.de.lead, 'German lead text not applied');
  assert.strictEqual(enLead, T.en.lead, 'English lead text not applied');
  assert.notStrictEqual(deLead, enLead, 'the language switch changed nothing');
  assert.strictEqual(env.document.documentElement.lang, 'en', 'the html lang attribute was not updated');
  const enAria = $('langbtn').getAttribute('aria-label');
  api.lang = 'de'; api.applyLang();
  const deAria = $('langbtn').getAttribute('aria-label');
  assert.notStrictEqual(enAria, deAria, 'the language button keeps the same accessible name in both languages');
  assert.strictEqual(deAria, T.de.langaria, 'the language button is not labelled from the string table');
});

// ---------------------------------------------------------------- honesty of the blurb
test('the page keeps saying the bank is not the official catalogue', () => {
  assert.ok(/Kein offizieller Fragenkatalog/.test(T.de.foot) && /not the official/i.test(T.en.foot),
    'the disclaimer that these are not the official questions has gone from the footer');
});
