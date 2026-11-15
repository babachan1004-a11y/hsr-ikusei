// スタレ育成ノート。data.json を読んで、全体の達成度・編成ごとの育成方針と目標ステータスを表示する。
(function () {
  'use strict';
  var S = { data: null, tab: null, done: {}, jump: null };
  try { S.tab = localStorage.getItem('hsr-tab'); S.guide = localStorage.getItem('hsr-guide'); } catch (e) {}
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
  // 装備1つ分（光円錐か遺物）。アイコンの下にメインステータスを出す。
  function piece(icon, label, full, cls, r) {
    var has = r && typeof r.hits === 'number' && r.rolls > 0;
    if (has) full += '、有効サブ ' + r.hits + '回（全' + r.rolls + '回）';
    var p = el('span', 'piece' + (cls ? ' ' + cls : '')); p.setAttribute('role', 'listitem'); p.setAttribute('aria-label', full); p.title = full;
    var box = el('span', 'pimg');
    if (icon) { var img = el('img'); img.alt = ''; img.loading = 'lazy'; img.decoding = 'async'; img.referrerPolicy = 'no-referrer'; img.addEventListener('error', function () { img.remove(); }); img.src = icon; box.appendChild(img); }
    p.appendChild(box); p.appendChild(el('span', 'plab', label));
    if (has) p.appendChild(el('span', 'phit ' + hitLevel(r), r.hits + '/' + r.rolls));
    return p;
  }
  function coneImg(src) {
    var box = el('span', 'cimg'), img = el('img'); img.alt = ''; img.loading = 'lazy'; img.decoding = 'async'; img.referrerPolicy = 'no-referrer';
    img.addEventListener('error', function () { box.remove(); }); img.src = src; box.appendChild(img); return box;
  }
  // 厳選度：有効サブが伸びた回数の割合
  function hitRatio(r) { return r && typeof r.hits === 'number' && r.rolls > 0 ? r.hits / r.rolls : null; }
  function hitLevel(r) { var x = hitRatio(r); return x === null ? 'none' : x >= 0.6 ? 'ok' : x >= 0.4 ? 'near' : 'far'; }
  // 期限：今日から何日後か（0＝今日まで、負＝終了）
  function dayDiff(iso) { var p = String(iso).split('-'), e = new Date(+p[0], +p[1] - 1, +p[2]), n = new Date(); n = new Date(n.getFullYear(), n.getMonth(), n.getDate()); return Math.round((e - n) / 86400000); }
  function dueText(n) { return n < 0 ? '期間終了' : n === 0 ? '今日まで' : 'あと' + n + '日'; }
  function dueLevel(n) { return n < 0 ? 'none' : n <= 3 ? 'far' : n <= 14 ? 'near' : 'ok'; }
  function md(iso) { var p = String(iso).split('-'); return (+p[1]) + '/' + (+p[2]); }
  // 周回先：目標に届いていないキャラを、使うセットの入手場所ごとにまとめる
  function farmPlan() {
    var m = {}, P = S.data.places || {}, nTeam = {};
    (S.data.teams || []).forEach(function (t) { (t.members || []).forEach(function (x) { nTeam[x.char] = (nTeam[x.char] || 0) + 1; }); });
    (S.data.chars || []).forEach(function (c) {
      var st = charStat(c), r = c.relics || []; if (!c.farm || !st.miss) return;
      [[c.farm.t, c.farm.tset, 0, 4], [c.farm.o, c.farm.oset, 4, 6]].forEach(function (z) {
        var w = -1, wr = 1;
        for (var i = z[2]; i < z[3]; i++) { var x = hitRatio(r[i]); if (x !== null && x < wr) { wr = x; w = i; } }
        if (!m[z[0]]) m[z[0]] = { name: z[0], p: P[z[0]] || {}, who: [], score: 0 };
        // 複数の編成で使うキャラほど重く数える
        var wt = st.miss * (1 - wr) * Math.max(1, nTeam[c.name] || 0);
        m[z[0]].who.push({ c: c, set: z[1], w: w, ratio: wr, miss: st.miss, wt: wt }); m[z[0]].score += wt;
      });
    });
    return Object.keys(m).map(function (k) { m[k].who.sort(function (a, b) { return b.wt - a.wt; }); return m[k]; }).sort(function (a, b) { return b.score - a.score; });
  }
  function deadlines() {
    var out = [];
    (S.data.guides || []).forEach(function (g) { if (g.end) out.push({ label: g.name + '（' + (g.state || '') + '）', n: dayDiff(g.end), end: g.end, go: function () { S.guide = g.id; setTab('guide'); } }); });
    ((S.data.gacha || {}).groups || []).forEach(function (gr) {
      if (!gr.end) return; var soon = gr.start && dayDiff(gr.start) > 0;
      out.push({ label: 'ガチャ ' + gr.picks.join('・'), n: dayDiff(gr.end), end: gr.end, from: soon ? gr.start : null, go: function () { setTab('gacha'); } });
    });
    return out.sort(function (a, b) { return (a.n < 0) - (b.n < 0) || a.n - b.n; });
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
    var hasGuide = (S.data.guides || []).length > 0;
    var hasGacha = !!(S.data.gacha && (S.data.gacha.picks || []).length);
    if (S.tab !== 'todo' && S.tab !== 'all' && !(S.tab === 'guide' && hasGuide) && !(S.tab === 'gacha' && hasGacha) && names.indexOf(S.tab) < 0) S.tab = 'all';
    tabs.appendChild(tabButton('全体', 'all', null));
    if (hasGuide) tabs.appendChild(tabButton('攻略', 'guide', null));
    if (hasGacha) tabs.appendChild(tabButton('ガチャ', 'gacha', null));
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
    hero.appendChild(lg);

    // 今日やること：期限の近いもの、いちばん効く周回先、次のやること
    var by0 = charBy(), today = el('section', 'card today'); var th = el('div', 'cardhead'); th.appendChild(el('h2', null, '今日やること')); today.appendChild(th);
    var dl = deadlines();
    dl.forEach(function (x) {
      var b = el('button', 'drow'); b.type = 'button';
      b.appendChild(el('span', 'dlabel', x.label));
      b.appendChild(el('span', 'pv ' + (x.from ? 'none' : dueLevel(x.n)), x.n < 0 ? '期間終了・要更新' : x.from ? md(x.from) + 'から' : dueText(x.n) + '（' + md(x.end) + '）'));
      b.addEventListener('click', x.go); today.appendChild(b);
    });
    var plan = farmPlan();
    if (plan.length) {
      var f = plan[0], fr = el('div', 'trow2'); fr.appendChild(el('span', 'plabel', '周回'));
      fr.appendChild(document.createTextNode(f.name + '（' + (f.p.sets || '') + '）：' + f.who.slice(0, 4).map(function (w) { return w.c.name.replace(/^星神★/, '').replace(/・.*/, ''); }).join('・')));
      today.appendChild(fr);
    }
    var nx = todos().filter(function (t) { return !t.done; }).sort(function (a, b) { return a.order - b.order; })[0];
    if (nx) { var nr = el('div', 'trow2'); nr.appendChild(el('span', 'plabel', '育成')); nr.appendChild(document.createTextNode((nx.char || '') + '：' + (nx.text || ''))); today.appendChild(nr); }
    view.appendChild(today); view.appendChild(hero);

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

    // 周回先
    if (plan.length) {
      var fc = el('section', 'card'); var fh = el('div', 'cardhead'); fh.appendChild(el('h2', null, '周回先')); fh.appendChild(el('span', 'grper', '効果が大きい順')); fc.appendChild(fh);
      var SLOT = ['頭', '手', '胴', '脚', 'オーブ', '縄'];
      plan.slice(0, S.farmAll ? plan.length : 5).forEach(function (pl, i) {
        var box = el('div', 'place'); var ph = el('div', 'conetop'); ph.appendChild(el('span', 'rank', String(i + 1))); ph.appendChild(el('span', 'conename', pl.name));
        ph.appendChild(el('span', 'lbl', pl.p.kind || '')); box.appendChild(ph);
        box.appendChild(el('p', 'enemy', (pl.p.sets || '') + (pl.p.where ? ' ・ ' + pl.p.where : '')));
        pl.who.forEach(function (w) {
          var b = el('button', 'wrow'); b.type = 'button'; b.appendChild(avatar(w.c.name, w.c, 'sm'));
          var bd = el('span', 'nextbody'); bd.appendChild(el('span', 'who', w.c.name));
          var r = w.w >= 0 ? w.c.relics[w.w] : null;
          bd.appendChild(el('span', 'what', w.set + (r ? ' ・ 弱い部位は' + SLOT[w.w] + '（有効' + r.hits + '/' + r.rolls + '）' : '') + ' ・ 未達' + w.miss)); b.appendChild(bd);
          var tm = (S.data.teams || []).filter(function (t) { return (t.members || []).some(function (m) { return m.char === w.c.name; }); })[0];
          b.addEventListener('click', function () { if (tm) setTab(tm.name, w.c.name); }); box.appendChild(b);
        });
        fc.appendChild(box);
      });
      if (plan.length > 5) { var fm = el('button', 'more', S.farmAll ? '上位5件だけにする' : 'すべての周回先を見る（' + plan.length + '件）'); fm.type = 'button'; fm.addEventListener('click', function () { S.farmAll = !S.farmAll; render(); }); fc.appendChild(fm); }
      fc.appendChild(el('p', 'teamnote', '目標に届いていないキャラだけを数えています。複数の編成で使うキャラと、有効サブの回数が少ない部位を重く見ています。'));
      view.appendChild(fc);
    }

    // 編成の取り合い
    var use = {}; teams.forEach(function (t) { (t.members || []).forEach(function (m) { (use[m.char] = use[m.char] || []).push(t.name); }); });
    var shared = Object.keys(use).filter(function (k) { return use[k].length > 1; }).sort(function (a, b) { return use[b].length - use[a].length; });
    if (shared.length) {
      var sc = el('section', 'card'); var sh = el('div', 'cardhead'); sh.appendChild(el('h2', null, '編成の取り合い')); sc.appendChild(sh);
      shared.forEach(function (n) {
        var r = el('div', 'nextrow'); r.appendChild(avatar(n, by0[n], 'sm'));
        var b = el('span', 'nextbody'); b.appendChild(el('span', 'who', n)); var ch = el('span', 'chips');
        use[n].forEach(function (t) { ch.appendChild(el('span', 'elem', t)); }); b.appendChild(ch); r.appendChild(b); sc.appendChild(r);
      });
      var free = [], T = teams.map(function (t) { return { n: t.name, m: (t.members || []).map(function (m) { return m.char; }) }; });
      var clash = function (a, b) { return a.m.some(function (x) { return b.m.indexOf(x) >= 0; }); };
      for (var i = 0; i < T.length; i++) for (var j = i + 1; j < T.length; j++) for (var k = j + 1; k < T.length; k++) if (!clash(T[i], T[j]) && !clash(T[i], T[k]) && !clash(T[j], T[k])) free.push(T[i].n + '＋' + T[j].n + '＋' + T[k].n);
      var fs = el('div', 'gsec'); fs.appendChild(el('h3', null, 'そのまま同時に組める3編成（' + free.length + '通り）'));
      if (free.length) { var ul = el('ul', 'sumlist'); free.forEach(function (x) { ul.appendChild(el('li', null, x)); }); fs.appendChild(ul); }
      else fs.appendChild(el('p', 'vtext', '誰かを入れ替えないと3編成は組めません。'));
      sc.appendChild(fs); view.appendChild(sc);
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
    if ((c.relics || []).length || (c.cone && c.cone.icon)) {
      var eq = el('div', 'equip'); eq.setAttribute('role', 'list');
      if (c.cone && c.cone.icon) eq.appendChild(piece(c.cone.icon, '光円錐', '光円錐 ' + (c.cone.now || ''), 'cone'));
      (c.relics || []).forEach(function (r) { eq.appendChild(piece(r.icon, r.main, r.slot + ' メイン ' + r.main, null, r)); });
      card.appendChild(eq);
      var weak = (c.relics || []).filter(function (r) { var x = hitRatio(r); return x !== null && x < 0.4; }).sort(function (a, b) { return hitRatio(a) - hitRatio(b); });
      if ((c.relics || []).some(function (r) { return hitRatio(r) !== null; })) {
        var wk = el('p', 'tmeta');
        wk.appendChild(el('span', null, weak.length ? '厳選が弱い部位：' + weak.map(function (r) { return r.slot + '（' + r.hits + '/' + r.rolls + '）'; }).join('、') : '厳選が弱い部位はありません'));
        wk.appendChild(el('span', null, '数字は有効サブが伸びた回数／全回数'));
        if (c.farm) wk.appendChild(el('span', null, '周回：' + c.farm.t + '、' + c.farm.o));
        card.appendChild(wk);
      }
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
  function renderTeam(view, team) {
    var s = teamStat(team), hero = el('section', 'hero');
    var hl = el('div', 'heronum'); hl.appendChild(el('b', null, String(Math.floor(s.score * 100)))); hl.appendChild(el('span', null, '% ・ ' + (s.total - s.miss) + ' / ' + s.total + ' 項目を達成')); hero.appendChild(hl);
    hero.appendChild(gauge(s.score, scoreLevel(s.score), 'big'));
    if (team.note) hero.appendChild(el('p', 'teamnote', team.note));
    view.appendChild(hero);
    members(team).forEach(function (x) { view.appendChild(renderCard(x)); });
  }

  // ---- 攻略 ----
  function renderGuides(view) {
    var gs = S.data.guides || [], by = charBy(), roster = S.data.roster || {};
    var cur = gs.filter(function (g) { return g.id === S.guide; })[0] || gs[0];
    var seg = el('div', 'seg'); seg.setAttribute('role', 'tablist'); seg.setAttribute('aria-label', '高難度の種類');
    gs.forEach(function (g) {
      var b = el('button', 'segb'); b.type = 'button'; b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', String(g === cur));
      var gone = g.end && dayDiff(g.end) < 0;
      b.appendChild(el('span', 'segn', g.name)); b.appendChild(el('span', 'segs' + (gone ? ' gone' : ''), gone ? '期間終了' : g.end ? dueText(dayDiff(g.end)) : (g.state || '')));
      b.addEventListener('click', function () { S.guide = g.id; try { localStorage.setItem('hsr-guide', g.id); } catch (e) {} render(); });
      seg.appendChild(b);
    });
    view.appendChild(seg);
    var hero = el('section', 'hero');
    var hh = el('div', 'cardhead'); hh.appendChild(el('h2', null, cur.full || cur.name)); if (cur.period) hh.appendChild(el('span', 'role', cur.period)); hero.appendChild(hh);
    if (cur.end && dayDiff(cur.end) < 0) hero.appendChild(el('p', 'expired', 'この期は ' + md(cur.end) + ' で終了しました。下の内容は前の期のものです。次の期の解説が出たら更新が必要です。'));
    else if (cur.state) hero.appendChild(el('p', 'gline', '進み具合：' + cur.state));
    if (cur.record) { var r = el('p', 'gline'); r.appendChild(el('span', 'plabel', '今の記録')); r.appendChild(document.createTextNode(cur.record)); hero.appendChild(r); }
    if (cur.rule) { var u = el('p', 'gline'); u.appendChild(el('span', 'plabel', 'ルール')); u.appendChild(document.createTextNode(cur.rule)); hero.appendChild(u); }
    view.appendChild(hero);
    (cur.parts || []).forEach(function (p) {
      var card = el('section', 'card part' + (p.done ? ' ok' : ''));
      var head = el('div', 'cardhead'); head.appendChild(el('h2', null, p.name));
      if (p.basis) head.appendChild(el('span', 'basis' + (p.done ? ' ok' : ''), p.basis)); card.appendChild(head);
      if (p.enemy) card.appendChild(el('p', 'enemy', p.enemy));
      var team = el('div', 'gteam'); team.setAttribute('role', 'list');
      (p.team || []).forEach(function (n) {
        var m = el('span', 'gmem'); m.setAttribute('role', 'listitem'); m.appendChild(avatar(n, by[n] || roster[n], 'lg'));
        m.appendChild(el('span', 'tname', n.replace(/^星神★/, '').replace(/・.*/, ''))); team.appendChild(m);
      });
      card.appendChild(team);
      if (p.point) card.appendChild(el('p', 'gtext', p.point));
      if (p.note) { var nt = el('p', 'policy'); nt.appendChild(el('span', 'plabel', 'メモ')); nt.appendChild(document.createTextNode(p.note)); card.appendChild(nt); }
      view.appendChild(card);
    });
    if ((cur.sources || []).length || cur.srcnote) {
      var sc = el('section', 'card'); var sh = el('div', 'cardhead'); sh.appendChild(el('h2', null, '出典')); sc.appendChild(sh);
      (cur.sources || []).forEach(function (s) {
        var row = el('div', 'src plain'); row.appendChild(el('span', 'trust' + (s.trust === '高' ? ' hi' : ''), '信頼度 ' + (s.trust || '—')));
        var a = el('a', null, s.label); a.href = s.url; a.target = '_blank'; a.rel = 'noopener'; row.appendChild(a);
        if (s.age) row.appendChild(el('span', null, s.age)); sc.appendChild(row);
      });
      if (cur.srcnote) sc.appendChild(el('p', 'teamnote', cur.srcnote));
      sc.appendChild(el('p', 'teamnote', '「私の案」と書いた部分は、出典の方針をあなたの手持ちに当てはめたものです。'));
      view.appendChild(sc);
    }
  }

  // ---- ガチャ ----
  function srcRows(box, list) {
    (list || []).forEach(function (s) {
      var row = el('div', 'src plain'); row.appendChild(el('span', 'trust' + (s.trust === '高' ? ' hi' : ''), '信頼度 ' + (s.trust || '—')));
      var a = el('a', null, s.label); a.href = s.url; a.target = '_blank'; a.rel = 'noopener'; row.appendChild(a);
      if (s.age) row.appendChild(el('span', null, s.age)); box.appendChild(row);
    });
  }
  function renderPick(p) {
    var by = charBy(), c = by[p.name] || { element: p.element, icon: p.icon };
    var card = el('section', 'card char ' + (p.level || 'none')); card.id = 'g-' + p.name;
    var head = el('div', 'charhead'); head.appendChild(avatar(p.name, c, 'lg'));
    var ht = el('div', 'chartitle'); ht.appendChild(el('h2', null, p.name));
    var chips = el('div', 'chips'); if (p.kind) chips.appendChild(el('span', 'role', p.kind)); if (p.own) chips.appendChild(el('span', 'elem', p.own)); ht.appendChild(chips); head.appendChild(ht);
    card.appendChild(head);
    if (p.verdict) card.appendChild(el('p', 'verdict ' + (p.level || 'none'), p.verdict));
    if (p.text) card.appendChild(el('p', 'gtext', p.text));
    if ((p.teams || []).length) {
      var tb = el('div', 'gsec'); tb.appendChild(el('h3', null, 'どの編成で価値が高いか'));
      p.teams.forEach(function (t) {
        var r = el('div', 'vrow'); var l = el('div', 'vhead'); l.appendChild(el('span', 'vteam', t.team));
        l.appendChild(el('span', 'vval v-' + (t.value === '高' ? 'hi' : t.value === '中' ? 'mid' : 'lo'), '価値 ' + t.value)); r.appendChild(l);
        r.appendChild(el('p', 'vtext', t.text)); tb.appendChild(r);
      });
      card.appendChild(tb);
    }
    if ((p.cones || []).length) {
      var cb = el('div', 'gsec'); cb.appendChild(el('h3', null, 'おすすめ光円錐'));
      var ol = el('ol', 'conelist');
      p.cones.forEach(function (k) {
        var li = el('li'); var top = el('div', 'conetop'); if (k.icon) top.appendChild(coneImg(k.icon)); top.appendChild(el('span', 'conename', k.name));
        if (k.tag) top.appendChild(el('span', 'lbl' + (k.tag === 'モチーフ' ? ' rec' : ''), k.tag));
        if (k.own) top.appendChild(el('span', 'ownmark', '所持')); li.appendChild(top);
        if (k.note) li.appendChild(el('p', 'vtext', k.note)); ol.appendChild(li);
      });
      cb.appendChild(ol); card.appendChild(cb);
    }
    if (p.relic) {
      var rb = el('div', 'gsec'); rb.appendChild(el('h3', null, '遺物厳選'));
      var dl = el('dl', 'gear flat');
      [['セット', p.relic.set], ['メイン', p.relic.main], ['サブ優先', p.relic.subs], ['目安', p.relic.goal]].forEach(function (x) { if (x[1]) { dl.appendChild(el('dt', null, x[0])); dl.appendChild(el('dd', null, x[1])); } });
      rb.appendChild(dl); card.appendChild(rb);
    }
    if ((p.sources || []).length) { var sb = el('div', 'gsec srcs'); srcRows(sb, p.sources); card.appendChild(sb); }
    return card;
  }
  function renderGacha(view) {
    var g = S.data.gacha, pk = {}; (g.picks || []).forEach(function (p) { pk[p.name] = p; });
    var by = charBy();
    var hero = el('section', 'hero');
    var hh = el('div', 'cardhead'); hh.appendChild(el('h2', null, '取得のおすすめ')); if (g.asof) hh.appendChild(el('span', 'role', g.asof + ' 時点')); hero.appendChild(hh);
    if ((g.groups || []).some(function (gr) { return gr.end && dayDiff(gr.end) < 0; })) hero.appendChild(el('p', 'expired', '終了したガチャがあります。おすすめの内容は ' + (g.asof || '') + ' 時点のもので、更新が必要です。'));
    var ul = el('ul', 'sumlist'); (g.summary || []).forEach(function (s) { ul.appendChild(el('li', null, s)); }); hero.appendChild(ul);
    view.appendChild(hero);
    // 一覧（タップでそのキャラへ）
    var idx = el('section', 'card'); var ih = el('div', 'cardhead'); ih.appendChild(el('h2', null, 'キャラ')); idx.appendChild(ih);
    (g.groups || []).forEach(function (gr) {
      var gone = gr.end && dayDiff(gr.end) < 0, soon = gr.start && dayDiff(gr.start) > 0;
      var gh = el('div', 'grhead'); gh.appendChild(el('span', 'grname', gr.label)); gh.appendChild(el('span', 'grper', gr.period));
      if (gr.end) gh.appendChild(el('span', 'pv ' + (gone || soon ? 'none' : dueLevel(dayDiff(gr.end))), gone ? '終了・要更新' : soon ? md(gr.start) + 'から' : dueText(dayDiff(gr.end))));
      idx.appendChild(gh);
      (gr.picks || []).forEach(function (n) {
        var p = pk[n]; if (!p) return;
        var b = el('button', 'prow ' + (p.level || 'none') + (gone ? ' gone' : '')); b.type = 'button';
        b.appendChild(avatar(n, by[n] || { element: p.element, icon: p.icon }, 'sm'));
        var body = el('span', 'nextbody'); body.appendChild(el('span', 'who', n)); body.appendChild(el('span', 'what', p.own || '')); b.appendChild(body);
        b.appendChild(el('span', 'pv ' + (p.level || 'none'), p.verdict || ''));
        b.addEventListener('click', function () { var t = document.getElementById('g-' + n); if (t) t.scrollIntoView({ block: 'start', behavior: 'smooth' }); });
        idx.appendChild(b);
      });
    });
    view.appendChild(idx);
    if ((g.cones || []).length) {
      var cs = el('section', 'card'); var ch = el('div', 'cardhead'); ch.appendChild(el('h2', null, '光円錐')); cs.appendChild(ch);
      g.cones.forEach(function (k) {
        var kg = k.end && dayDiff(k.end) < 0;
        var r = el('div', 'crow' + (kg ? ' gone' : '')); var top = el('div', 'conetop'); if (k.icon) top.appendChild(coneImg(k.icon)); top.appendChild(el('span', 'conename', k.name)); top.appendChild(el('span', 'pv ' + (kg ? 'none' : (k.level || 'none')), kg ? '終了' : (k.verdict || ''))); r.appendChild(top);
        r.appendChild(el('p', 'enemy', (k.who || '') + (k.period ? ' ・ ' + k.period : '')));
        if (k.text) r.appendChild(el('p', 'vtext', k.text)); cs.appendChild(r);
      });
      view.appendChild(cs);
    }
    (g.groups || []).forEach(function (gr) { (gr.picks || []).forEach(function (n) { if (pk[n]) view.appendChild(renderPick(pk[n])); }); });
    if (g.note) view.appendChild(el('p', 'legend', g.note));
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
    if (S.tab === 'guide') { renderGuides(view); return; }
    if (S.tab === 'gacha') { renderGacha(view); return; }
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
