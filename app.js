// スタレ育成ノート。data.json を読んで、全体の達成度・編成ごとの育成方針と目標ステータスを表示する。
(function () {
  'use strict';
  var S = { data: null, tab: null, done: {}, jump: null };
  try { S.tab = localStorage.getItem('hsr-tab'); } catch (e) {}
  try { S.done = JSON.parse(localStorage.getItem('hsr-done') || '{}') || {}; } catch (e) { S.done = {}; }

  var ELEMENT = { wind: '風', lightning: '雷', quantum: '量子', physical: '物理', fire: '炎', ice: '氷', imaginary: '虚数' };
  var NEAR = 0.93; // 目標の93%以上なら「あと少し」

  var $ = function (id) { return document.getElementById(id); };
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function fmt(n, unit) { if (typeof n !== 'number') return '—'; return (Math.round(n * 10) / 10).toLocaleString('ja-JP', { maximumFractionDigits: 1 }) + (unit || ''); }
  function ratio(t) { return (typeof t.now === 'number' && typeof t.target === 'number' && t.target > 0) ? t.now / t.target : 0; }
  function level(t) { var r = ratio(t); return r >= 1 ? 'ok' : r >= NEAR ? 'near' : 'far'; }
  function charBy() { var by = {}; (S.data.chars || []).forEach(function (c) { by[c.name] = c; }); return by; }
  function members(team) { var by = charBy(); return (team.members || []).map(function (m) { return { m: m, c: by[m.char] }; }); }
  // キャラ1人のまとめ。目標が無いキャラは level を 'none' にする。
  function charStat(c) {
    var ts = (c && c.targets) || [], miss = 0, sum = 0, worst = 'ok';
    ts.forEach(function (t) { var l = level(t); if (l !== 'ok') miss++; if (l === 'far' || (l === 'near' && worst === 'ok')) worst = l; sum += Math.min(1, ratio(t)); });
    return { total: ts.length, miss: miss, level: ts.length ? worst : 'none', score: ts.length ? sum / ts.length : null };
  }
  function teamStat(team) {
    var total = 0, miss = 0, sum = 0;
    members(team).forEach(function (x) { (x.c && x.c.targets || []).forEach(function (t) { total++; if (level(t) !== 'ok') miss++; sum += Math.min(1, ratio(t)); }); });
    return { total: total, miss: miss, score: total ? sum / total : 0 };
  }
  function todos() { return (S.data.todos || []).map(function (t) { var local = S.done[t.id]; return { id: t.id, order: t.order || 0, char: t.char, text: t.text, reason: t.reason, done: local == null ? !!t.done : !!local }; }); }

  // 丸いアイコン。画像が読めないときは名前の1文字目を出す。
  function avatar(name, c, size) {
    var a = el('span', 'av' + (size ? ' ' + size : '') + (c && c.element ? ' el-' + c.element : ''));
    var letter = el('span', 'avl', (name || '?').replace(/^星神★/, '').charAt(0)); a.appendChild(letter);
    if (c && c.icon) {
      var img = el('img'); img.alt = ''; img.loading = 'lazy'; img.decoding = 'async'; img.referrerPolicy = 'no-referrer';
      img.addEventListener('error', function () { img.remove(); });
      img.addEventListener('load', function () { letter.remove(); });
      img.src = c.icon; a.appendChild(img);
    }
    return a;
  }
  function gauge(p, lv, cls) { var bar = el('div', 'bar ' + lv + (cls ? ' ' + cls : '')), fill = el('i'); fill.style.width = (Math.max(0, Math.min(1, p)) * 100).toFixed(1) + '%'; bar.appendChild(fill); return bar; }
  function scoreLevel(s) { return s >= 1 ? 'ok' : s >= NEAR ? 'near' : 'far'; }

  function setTab(t, jump) { S.tab = t; S.jump = jump || null; try { localStorage.setItem('hsr-tab', t); } catch (e) {} render(); if (!S.jump) window.scrollTo(0, 0); }
  function tabButton(label, key, countText, lv) {
    var b = el('button', 'tab'); b.type = 'button'; b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', String(S.tab === key));
    b.appendChild(el('span', null, label)); if (countText != null) b.appendChild(el('span', 'count ' + lv, countText));
    b.addEventListener('click', function () { setTab(key); });
    return b;
  }
  function renderTabs() {
    var tabs = $('tabs'); tabs.textContent = '';
    var names = (S.data.teams || []).map(function (t) { return t.name; });
    if (S.tab !== 'todo' && S.tab !== 'all' && names.indexOf(S.tab) < 0) S.tab = 'all';
    tabs.appendChild(tabButton('全体', 'all', null));
    (S.data.teams || []).forEach(function (t) { var s = teamStat(t); tabs.appendChild(tabButton(t.name, t.name, s.miss ? '未達' + s.miss : '達成', s.miss ? 'far' : 'ok')); });
    var open = todos().filter(function (t) { return !t.done; }).length;
    tabs.appendChild(tabButton('やること', 'todo', String(open), open ? 'far' : 'ok'));
    var cur = tabs.querySelector('[aria-selected="true"]'); if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  // ---- 全体 ----
  function renderOverview(view) {
    var teams = S.data.teams || [], seen = {}, total = 0, okN = 0;
    (S.data.chars || []).forEach(function (c) { (c.targets || []).forEach(function (t) { total++; if (level(t) === 'ok') okN++; }); });
    var hero = el('section', 'hero');
    var hl = el('div', 'heronum'); hl.appendChild(el('b', null, String(okN))); hl.appendChild(el('span', null, ' / ' + total + ' 項目を達成')); hero.appendChild(hl);
    hero.appendChild(gauge(total ? okN / total : 0, 'ok', 'big'));
    var lg = el('div', 'keys');
    [['ok', '達成'], ['near', 'あと少し'], ['far', '未達']].forEach(function (k) { var s = el('span', 'key'); s.appendChild(el('i', 'dot ' + k[0])); s.appendChild(document.createTextNode(k[1])); lg.appendChild(s); });
    hero.appendChild(lg); view.appendChild(hero);

    teams.forEach(function (team) {
      var s = teamStat(team), box = el('section', 'card team');
      var head = el('button', 'teamhead'); head.type = 'button';
      head.appendChild(el('h2', null, team.name + '編成'));
      var pct = el('span', 'pct ' + scoreLevel(s.score)); pct.appendChild(el('b', null, String(Math.floor(s.score * 100)))); pct.appendChild(document.createTextNode('%')); head.appendChild(pct);
      head.addEventListener('click', function () { setTab(team.name); });
      box.appendChild(head);
      box.appendChild(gauge(s.score, scoreLevel(s.score), 'big'));
      var grid = el('div', 'tiles'); grid.style.gridTemplateColumns = 'repeat(' + Math.max(4, (team.members || []).length) + ',minmax(0,1fr))';
      members(team).forEach(function (x) {
        var st = charStat(x.c), tile = el('button', 'tile ' + st.level); tile.type = 'button';
        tile.appendChild(avatar(x.m.char, x.c, 'lg'));
        tile.appendChild(el('span', 'tname', x.m.char.replace(/^星神★/, '').replace(/・.*/, '')));
        tile.appendChild(el('span', 'tstat', st.level === 'none' ? '目標なし' : st.miss ? '未達 ' + st.miss : '達成'));
        tile.setAttribute('aria-label', x.m.char + ' ' + (st.level === 'none' ? '目標なし' : st.miss ? '未達' + st.miss + '項目' : '達成'));
        tile.addEventListener('click', function () { setTab(team.name, x.m.char); });
        grid.appendChild(tile); seen[x.m.char] = 1;
      });
      box.appendChild(grid); view.appendChild(box);
    });

    var next = todos().filter(function (t) { return !t.done; }).sort(function (a, b) { return a.order - b.order; }).slice(0, 3);
    if (next.length) {
      var nb = el('section', 'card'); var nh = el('div', 'cardhead'); nh.appendChild(el('h2', null, '次にやること')); nb.appendChild(nh);
      var by = charBy();
      next.forEach(function (t, i) {
        var r = el('div', 'nextrow'); r.appendChild(el('span', 'rank', String(i + 1)));
        r.appendChild(avatar(t.char, by[t.char], 'sm'));
        var b = el('span', 'nextbody'); b.appendChild(el('span', 'who', t.char || '')); b.appendChild(el('span', 'what', t.text || '')); r.appendChild(b); nb.appendChild(r);
      });
      var more = el('button', 'more', 'やることをすべて見る'); more.type = 'button'; more.addEventListener('click', function () { setTab('todo'); }); nb.appendChild(more);
      view.appendChild(nb);
    }
  }

  // ---- 編成 ----
  function gearRow(dl, label, g) {
    if (!g) return;
    dl.appendChild(el('dt', null, label)); var dd = el('dd');
    if (g.now) { var a = el('span', 'gl'); a.appendChild(el('span', 'lbl', '今')); a.appendChild(document.createTextNode(g.now)); dd.appendChild(a); }
    if (g.rec) { var r = el('span', 'gl'); r.appendChild(el('span', 'lbl rec', '推奨')); r.appendChild(document.createTextNode(g.rec)); dd.appendChild(r); }
    if (g.note) dd.appendChild(el('span', 'gl', g.note));
    dl.appendChild(dd);
  }
  function renderCard(x) {
    var c = x.c, m = x.m, st = charStat(c), card = el('section', 'card char ' + st.level + (c && c.element ? ' el-' + c.element : ''));
    card.id = 'c-' + m.char;
    var head = el('div', 'charhead'); head.appendChild(avatar(m.char, c, 'lg'));
    var ht = el('div', 'chartitle'); ht.appendChild(el('h2', null, m.char));
    var chips = el('div', 'chips'); if (m.role) chips.appendChild(el('span', 'role', m.role)); if (c && ELEMENT[c.element]) chips.appendChild(el('span', 'elem', ELEMENT[c.element])); ht.appendChild(chips); head.appendChild(ht);
    if (st.total) { var sc = el('span', 'score ' + st.level); sc.appendChild(el('b', null, String(st.total - st.miss))); sc.appendChild(document.createTextNode('/' + st.total)); sc.setAttribute('aria-label', st.total + '項目中' + (st.total - st.miss) + '項目達成'); head.appendChild(sc); }
    card.appendChild(head);
    if (!c) { if (m.policy) card.appendChild(el('p', 'policy', m.policy)); return card; }
    if ((c.targets || []).length) {
      var box = el('div', 'targets');
      c.targets.forEach(function (t) {
        var lv = level(t), row = el('div', 'trow ' + lv);
        var top = el('div', 'ttop'); top.appendChild(el('span', 'titem', t.item));
        top.appendChild(el('span', 'pill', lv === 'ok' ? '達成' : 'あと ' + fmt(t.target - t.now, t.unit))); row.appendChild(top);
        var num = el('div', 'tnum'); num.appendChild(el('span', 'cur', fmt(t.now, t.unit))); num.appendChild(el('span', 'goal', '目標 ' + fmt(t.target, t.unit))); row.appendChild(num);
        row.appendChild(gauge(ratio(t), lv));
        if (t.g8 || t.memo) { var meta = el('div', 'tmeta'); if (t.memo) meta.appendChild(el('span', null, t.memo)); if (t.g8) meta.appendChild(el('span', null, 'Game8参考 ' + t.g8)); row.appendChild(meta); }
        box.appendChild(row);
      });
      card.appendChild(box);
    }
    if (m.policy) { var p = el('p', 'policy'); p.appendChild(el('span', 'plabel', '方針')); p.appendChild(document.createTextNode(m.policy)); card.appendChild(p); }
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
  function renderTeam(view, team) {
    var s = teamStat(team), hero = el('section', 'hero');
    var hl = el('div', 'heronum'); hl.appendChild(el('b', null, String(Math.floor(s.score * 100)))); hl.appendChild(el('span', null, '% ・ ' + (s.total - s.miss) + ' / ' + s.total + ' 項目を達成')); hero.appendChild(hl);
    hero.appendChild(gauge(s.score, scoreLevel(s.score), 'big'));
    if (team.note) hero.appendChild(el('p', 'teamnote', team.note));
    view.appendChild(hero);
    members(team).forEach(function (x) { view.appendChild(renderCard(x)); });
  }

  // ---- やること ----
  function renderTodos(view) {
    var items = todos().sort(function (a, b) { return (a.done - b.done) || (a.order - b.order); });
    if (!items.length) { view.appendChild(el('div', 'state', 'やることはまだ登録されていません。')); return; }
    var doneN = items.filter(function (t) { return t.done; }).length, hero = el('section', 'hero');
    var hl = el('div', 'heronum'); hl.appendChild(el('b', null, String(doneN))); hl.appendChild(el('span', null, ' / ' + items.length + ' 件が完了')); hero.appendChild(hl);
    hero.appendChild(gauge(doneN / items.length, 'ok', 'big')); view.appendChild(hero);
    var by = charBy(), n = 0;
    items.forEach(function (t) {
      var row = el('label', 'todo' + (t.done ? ' done' : ''));
      var cb = el('input'); cb.type = 'checkbox'; cb.id = 'todo-' + t.id; cb.checked = t.done;
      cb.addEventListener('change', function () { S.done[t.id] = cb.checked; try { localStorage.setItem('hsr-done', JSON.stringify(S.done)); } catch (e) {} render(); });
      row.appendChild(cb);
      row.appendChild(avatar(t.char, by[(t.char || '').split('／')[0]], 'sm'));
      var body = el('span', 'todobody'); var who = el('span', 'who'); if (!t.done) who.appendChild(el('span', 'rank', String(++n))); who.appendChild(document.createTextNode(t.char || '')); body.appendChild(who);
      body.appendChild(el('span', 'what', t.text || '')); if (t.reason) body.appendChild(el('span', 'why', t.reason));
      row.appendChild(body); view.appendChild(row);
    });
  }

  function render() {
    if (!S.data) return;
    var view = $('view');
    $('updated').textContent = S.data.updated ? '最終更新 ' + S.data.updated : '';
    renderTabs(); view.textContent = '';
    if (S.tab === 'todo') { renderTodos(view); return; }
    if (S.tab === 'all') { renderOverview(view); return; }
    var team = (S.data.teams || []).filter(function (t) { return t.name === S.tab; })[0]; if (!team) return;
    renderTeam(view, team);
    if (S.jump) { var target = document.getElementById('c-' + S.jump); S.jump = null; if (target) target.scrollIntoView({ block: 'start' }); }
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
