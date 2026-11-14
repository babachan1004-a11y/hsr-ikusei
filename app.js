// スタレ育成ノート。data.json を読んで、編成ごとの育成方針と目標ステータスを表示する。
(function () {
  'use strict';
  var S = { data: null, tab: null, done: {} };
  try { S.tab = localStorage.getItem('hsr-tab'); } catch (e) {}
  try { S.done = JSON.parse(localStorage.getItem('hsr-done') || '{}') || {}; } catch (e) { S.done = {}; }

  var $ = function (id) { return document.getElementById(id); };
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function fmt(n, unit) { if (typeof n !== 'number') return '—'; return (Math.round(n * 10) / 10).toLocaleString('ja-JP', { maximumFractionDigits: 1 }) + (unit || ''); }
  function isOk(t) { return typeof t.now === 'number' && typeof t.target === 'number' && t.now >= t.target; }
  function members(team) { var by = {}; (S.data.chars || []).forEach(function (c) { by[c.name] = c; }); return (team.members || []).map(function (m) { return { m: m, c: by[m.char] }; }); }
  function missCount(team) { var n = 0; members(team).forEach(function (x) { if (x.c) (x.c.targets || []).forEach(function (t) { if (!isOk(t)) n++; }); }); return n; }
  function todos() { return (S.data.todos || []).map(function (t) { var local = S.done[t.id]; return { id: t.id, order: t.order || 0, char: t.char, text: t.text, reason: t.reason, done: local == null ? !!t.done : !!local }; }); }

  function setTab(t) { S.tab = t; try { localStorage.setItem('hsr-tab', t); } catch (e) {} render(); window.scrollTo(0, 0); }
  function tabButton(label, key, countText, zero) {
    var b = el('button', 'tab'); b.type = 'button'; b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', String(S.tab === key));
    b.appendChild(el('span', null, label)); b.appendChild(el('span', 'count' + (zero ? ' zero' : ''), countText));
    b.addEventListener('click', function () { setTab(key); });
    return b;
  }
  function renderTabs() {
    var tabs = $('tabs'); tabs.textContent = '';
    var names = (S.data.teams || []).map(function (t) { return t.name; });
    if (S.tab !== 'todo' && names.indexOf(S.tab) < 0) S.tab = names[0] || 'todo';
    (S.data.teams || []).forEach(function (t) { var n = missCount(t); tabs.appendChild(tabButton(t.name, t.name, n ? '未達' + n : '達成', !n)); });
    var open = todos().filter(function (t) { return !t.done; }).length;
    tabs.appendChild(tabButton('やること', 'todo', String(open), !open));
  }

  function gearRow(dl, label, g) {
    if (!g) return;
    dl.appendChild(el('dt', null, label)); var dd = el('dd');
    if (g.now) { var a = el('span', 'gl'); a.appendChild(el('span', 'lbl', '今')); a.appendChild(document.createTextNode(g.now)); dd.appendChild(a); }
    if (g.rec) { var r = el('span', 'gl'); r.appendChild(el('span', 'lbl rec', '推奨')); r.appendChild(document.createTextNode(g.rec)); dd.appendChild(r); }
    if (g.note) dd.appendChild(el('span', 'gl', g.note));
    dl.appendChild(dd);
  }
  function renderCard(x) {
    var c = x.c, m = x.m, card = el('section', 'card');
    var head = el('div', 'cardhead'); head.appendChild(el('h2', null, m.char)); if (m.role) head.appendChild(el('span', 'role', m.role)); card.appendChild(head);
    if (m.policy) card.appendChild(el('p', 'policy', m.policy));
    if (!c) return card;
    if ((c.targets || []).length) {
      var box = el('div', 'targets');
      c.targets.forEach(function (t) {
        var ok = isOk(t), row = el('div', 'trow' + (ok ? ' ok' : ''));
        row.appendChild(el('span', 'titem', t.item));
        var num = el('span', 'tnum'); num.appendChild(el('span', 'cur', fmt(t.now, t.unit))); num.appendChild(el('span', 'goal', ' / 目標 ' + fmt(t.target, t.unit))); row.appendChild(num);
        var bar = el('div', 'bar'), fill = el('i'); var p = (typeof t.now === 'number' && t.target) ? Math.max(0, Math.min(1, t.now / t.target)) : 0; fill.style.width = (p * 100).toFixed(1) + '%'; bar.appendChild(fill); row.appendChild(bar);
        var meta = el('div', 'tmeta');
        meta.appendChild(el('span', 'pill', ok ? '達成' : 'あと ' + fmt(t.target - t.now, t.unit)));
        if (t.g8) meta.appendChild(el('span', null, 'Game8参考 ' + t.g8));
        if (t.memo) meta.appendChild(el('span', null, t.memo));
        row.appendChild(meta); box.appendChild(row);
      });
      card.appendChild(box);
    }
    var dl = el('dl', 'gear');
    gearRow(dl, '光円錐', c.cone); gearRow(dl, 'セット', c.set); gearRow(dl, 'メイン', c.main);
    if (c.subs) { dl.appendChild(el('dt', null, 'サブ優先')); dl.appendChild(el('dd', null, c.subs)); }
    card.appendChild(dl);
    if (c.source) {
      var s = el('div', 'src');
      s.appendChild(el('span', 'trust' + (c.source.trust === '高' ? ' hi' : ''), '信頼度 ' + (c.source.trust || '—')));
      if (c.source.url) { var a = el('a', null, c.source.label || '出典'); a.href = c.source.url; a.target = '_blank'; a.rel = 'noopener'; s.appendChild(a); }
      else if (c.source.label) s.appendChild(el('span', null, c.source.label));
      if (c.source.age) s.appendChild(el('span', null, c.source.age));
      card.appendChild(s);
    }
    return card;
  }
  function renderTodos(view) {
    var items = todos().sort(function (a, b) { return (a.done - b.done) || (a.order - b.order); });
    if (!items.length) { view.appendChild(el('div', 'state', 'やることはまだ登録されていません。')); return; }
    items.forEach(function (t) {
      var row = el('label', 'todo' + (t.done ? ' done' : ''));
      var cb = el('input'); cb.type = 'checkbox'; cb.id = 'todo-' + t.id; cb.checked = t.done;
      cb.addEventListener('change', function () { S.done[t.id] = cb.checked; try { localStorage.setItem('hsr-done', JSON.stringify(S.done)); } catch (e) {} render(); });
      row.appendChild(cb);
      var body = el('span'); body.appendChild(el('span', 'who', t.char || '')); body.appendChild(el('span', 'what', t.text || '')); if (t.reason) body.appendChild(el('span', 'why', t.reason));
      row.appendChild(body); view.appendChild(row);
    });
  }
  function render() {
    if (!S.data) return;
    var view = $('view');
    $('updated').textContent = S.data.updated ? '最終更新 ' + S.data.updated : '';
    renderTabs(); view.textContent = '';
    if (S.tab === 'todo') { renderTodos(view); return; }
    var team = (S.data.teams || []).filter(function (t) { return t.name === S.tab; })[0]; if (!team) return;
    if (team.note) view.appendChild(el('p', 'teamnote', team.note));
    members(team).forEach(function (x) { view.appendChild(renderCard(x)); });
  }

  function load() {
    return fetch('data.json?t=' + Date.now()).then(function (r) { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
      .then(function (d) { S.data = d; render(); })
      .catch(function () { if (!S.data) $('state').textContent = 'データを読み込めませんでした。通信状態を確認して、開き直してください。'; });
  }
  load();
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') load(); });
  if ('serviceWorker' in navigator) { navigator.serviceWorker.register('sw.js').catch(function () {}); }
})();
