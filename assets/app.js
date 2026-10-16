// 三栏阅读台：分类 | 列表 | 阅读页；手机上列表一屏，点开后阅读页盖上来
const $ = s => document.querySelector(s);
// 时区、站名来自 config.json，加载完数据前先用默认值
let TZ = 'Asia/Shanghai';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const day = s => new Date(s).toLocaleDateString('sv-SE', { timeZone: TZ });
const md = s => { const [y, m, d] = day(s).split('-'); return `${y === day(Date.now()).slice(0, 4) ? '' : y + '年'}${+m}月${+d}日`; };
const hm = s => new Date(s).toLocaleTimeString('zh-CN', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false });

// 分类全名太长，列表里用短名：取 data/categories.json 里的 short，没填就显示全名
let SHORT = {};
const short = n => SHORT[n] || n;

// 卡片上显示的是 @用户名，搜索时去掉开头的 @；分类名也在搜索范围里
const terms = q => String(q || '').toLowerCase().split(/\s+/).map(w => w.replace(/^@+/, '')).filter(Boolean);
const SORT = {
  bm: (a, b) => a.bookmarked_order - b.bookmarked_order,
  new: (a, b) => b.created_at.localeCompare(a.created_at),
  old: (a, b) => a.created_at.localeCompare(b.created_at),
};
// 分类计数跟着搜索走，切分类前就能看到哪一类有结果
function query({ c, q, s }) {
  const t = terms(q);
  const hit = t.length ? all.filter(b => t.every(w => b._h.includes(w))) : all;
  const counts = {};
  for (const b of hit) counts[b.category] = (counts[b.category] || 0) + 1;
  const list = (c ? hit.filter(b => b.category === c) : hit.slice()).sort(SORT[s] || SORT.bm);
  return { list, counts, total: hit.length, t };
}

// 先在原文上切分再逐段转义，避免高亮命中 &amp; 之类的实体
function hl(s, t) {
  s = String(s ?? '');
  if (!t.length) return esc(s);
  const re = new RegExp(`(${[...t].sort((a, b) => b.length - a.length).map(reEsc).join('|')})`, 'gi');
  return s.split(re).map((p, i) => i % 2 ? `<mark>${esc(p)}</mark>` : esc(p)).join('');
}
// 命中词只在正文里时，截一段正文说明为什么匹配
function snip(b, t) {
  const vis = [b.title, b.summary, b.author_name, b.author_username, b.category, short(b.category)].join('\n').toLowerCase();
  const w = t.find(w => !vis.includes(w));
  if (!w) return '';
  const tx = b.text.replace(/\s+/g, ' '), i = tx.toLowerCase().indexOf(w);
  if (i < 0) return '';
  const a = Math.max(0, i - 24), z = Math.min(tx.length, i + w.length + 64);
  return `${a ? '…' : ''}${hl(tx.slice(a, z), t)}${z < tx.length ? '…' : ''}`;
}

const xurl = u => /^https:\/\/(x|twitter)\.com\//.test(u) ? u : '#';
// first_seen_at 是 bot 首次抓到那天（config 时区）的日期，和今天相差不到 7 天算新收
const isNew = b => !!b.first_seen_at && Date.parse(day(Date.now())) - Date.parse(b.first_seen_at) < 7 * 864e5;
// 正文只有一个 x.com/i/article 链接的是 X 长文，抓取时拿不到正文
const isArticle = b => /^\s*https:\/\/(x|twitter)\.com\/i\/article\/\d+\s*$/.test(b.text);
const label = u => {
  if (/^https:\/\/(x|twitter)\.com\/i\/article\//.test(u)) return 'X 长文';
  const s = u.replace(/^https?:\/\/(www\.)?/, '');
  return s.length > 44 ? s.slice(0, 42) + '…' : s;
};
// URL 只取可见 ASCII 且止于转义后的引号/尖括号，避免把紧跟的标点（，”"）吞进链接；末尾的 .,:!?)] 也留在链接外
const lnk = s => esc(s).replace(/https?:\/\/(?:(?!&quot;|&lt;|&gt;|&#39;)[!-~])+/g, m => {
  const u = m.replace(/[.,:!?)\]]+$/, '');
  return `<a href="${u}" target="_blank" rel="noopener">${esc(label(u.replace(/&amp;/g, '&')))}</a>${m.slice(u.length)}`;
});
// 抓取时图片和视频被替换成「[图片/视频]」，换成指向原帖的提示；空行分段
const body = b => {
  const media = `<a class="media" href="${esc(xurl(b.url))}" target="_blank" rel="noopener">图片/视频，去 X 查看</a>`;
  return b.text.trim().split(/\n\s*\n/).map(p => `<p>${p.split(/「?\[图片\/视频\]」?/).map(lnk).join(media)}</p>`).join('');
};

// 分类/搜索/排序/当前条写进 hash，刷新和分享能恢复
function readState() {
  const p = new URLSearchParams(location.hash.slice(1));
  return { c: p.get('c') || '', q: p.get('q') || '', s: SORT[p.get('s')] ? p.get('s') : 'bm', id: p.get('id') || '' };
}
function writeState(o, push = false) {
  const p = new URLSearchParams();
  if (o.c) p.set('c', o.c);
  if (o.q) p.set('q', o.q);
  if (o.s && o.s !== 'bm') p.set('s', o.s);
  if (o.id) p.set('id', o.id);
  const h = p.toString();
  history[push ? 'pushState' : 'replaceState'](null, '', h ? '#' + h : location.pathname + location.search);
}

const mobile = matchMedia('(max-width:759px)');
const reading = () => document.body.classList.contains('reading');
let all = [], st = readState(), view = [], cur = null, unreadOnly = false, pushed = false;

// 已读记录只存在这台设备的浏览器里
let read;
try { read = new Set(JSON.parse(localStorage.getItem('xb-read') || '[]')); } catch { read = new Set(); }
const saveRead = () => { try { localStorage.setItem('xb-read', JSON.stringify([...read])); } catch {} };
const unread = b => !read.has(b.id);
const updUnread = () => { $('#unread').textContent = `只看未读 ${all.filter(unread).length}`; };

function renderCats(counts, total) {
  updUnread();
  const n = {};
  for (const b of all) n[b.category] = (n[b.category] || 0) + 1;
  const L = Object.keys(n).sort((a, b) => n[b] - n[a]);
  $('#cats').innerHTML =
    `<button class="cat cat-all" data-c="" aria-pressed="${!st.c}">全部<span>${total}</span></button>` +
    L.map(c => { const k = counts[c] || 0; return `<button class="cat" data-c="${esc(c)}" aria-pressed="${st.c === c}"${k || st.c === c ? '' : ' disabled'}>${esc(c)}<span>${k}</span></button>`; }).join('');
}

function render() {
  const r = query(st);
  view = unreadOnly ? r.list.filter(unread) : r.list;
  renderCats(r.counts, r.total);
  $('#count').textContent = `${view.length} 条`;
  $('#items').innerHTML = view.map(b => {
    const s = r.t.length ? snip(b, r.t) : '';
    return `<li><button class="item${unread(b) ? ' unread' : ''}" data-id="${esc(b.id)}" aria-current="${b.id === cur}">
      <span class="i-meta"><span>${hl(short(b.category), r.t)}</span>${isNew(b) ? '<em class="new">新收</em>' : ''}<span class="d">${md(b.created_at)}</span></span>
      <span class="i-title">${hl(b.title, r.t)}</span>
      <span class="i-sum">${hl(b.summary, r.t)}</span>
      ${s ? `<span class="i-snip">${s}</span>` : ''}
    </button></li>`;
  }).join('') || (all.length ? `<li class="empty">${r.t.length ? `没有包含「${esc(st.q)}」的${unreadOnly ? '未读' : ''}书签。` : unreadOnly ? '这里的书签都读过了。' : '这里没有书签。'} <button class="link" id="reset">清除筛选</button></li>` : '<li class="empty">还没有书签。</li>');
  writeState({ ...st, id: mobile.matches && !reading() ? '' : cur || '' });
  if (!mobile.matches && !cur) showDoc(view[0], false);
}

// explicit=false 只是桌面上默认展示列表第一条，不算读过
function showDoc(b, explicit) {
  if (!b) {
    // 刚 Fork 还没跑过 bot 时数据是空的，告诉主人下一步
    $('#doc').innerHTML = all.length ? '<div class="hint"><h2>没有可读的书签</h2>换个关键词，或者清除筛选。</div>'
      : '<div class="hint"><h2>还没有书签</h2>让 Grok Bot 按仓库里的 agent/SETUP.md 开通，它会抓取你的 X 书签并发布到这里。</div>';
    return;
  }
  if (explicit) { cur = b.id; if (unread(b)) { read.add(b.id); saveRead(); } }
  document.querySelectorAll('.item').forEach(e => {
    e.setAttribute('aria-current', e.dataset.id === b.id);
    if (e.dataset.id === b.id) e.classList.toggle('unread', unread(b));
  });
  $('#pcat').textContent = short(b.category);
  $('#doc').innerHTML = `<article class="doc">
    <p class="d-cat"><span>${esc(b.category)}</span>${isNew(b) ? '<em class="new">最近 7 天收进</em>' : ''}</p>
    <h1 class="d-title">${esc(b.title)}</h1>
    <p class="d-by"><b>${esc(b.author_name || b.author_username)}</b><span>@${esc(b.author_username)}</span><span>发帖于 ${md(b.created_at)}</span></p>
    <p class="d-sum"><span class="lab">摘要</span>${esc(b.summary)}</p>
    ${isArticle(b) ? '<div class="d-article"><b>这是一篇 X 长文</b>抓取时只拿到了链接，正文要去 X 上读。</div>' : `<div class="d-body">${body(b)}</div>`}
    <div class="d-act">
      <a class="btn pri" href="${esc(xurl(b.url))}" target="_blank" rel="noopener">${isArticle(b) ? '去 X 读全文' : '在 X 打开原帖'}</a>
      ${explicit ? `<button class="btn" id="mark">${unread(b) ? '标为已读' : '标为未读'}</button>` : ''}
    </div>
    <p class="keys"><kbd>J</kbd><kbd>K</kbd>上下切换　<kbd>O</kbd>打开原帖　<kbd>U</kbd>已读 / 未读　<kbd>/</kbd>搜索</p>
  </article>`;
  $('#page').scrollTop = 0;
}

// 手机上打开阅读页时压一条历史，按返回键回到列表而不是离开网站
function open(id, push = true) {
  const b = all.find(b => b.id === id);
  if (!b) return;
  showDoc(b, true);
  $(`.item[data-id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'nearest' });
  if (mobile.matches) {
    const was = reading();
    document.body.classList.add('reading');
    if (push && !was) { writeState({ ...st, id }, true); pushed = true; } else writeState({ ...st, id });
    $('#page').focus({ preventScroll: true });
  } else writeState({ ...st, id });
  updUnread();
}
function closeReader() {
  if (!reading()) return;
  document.body.classList.remove('reading');
  if (pushed) { pushed = false; history.back(); } else writeState(st);
  $(`.item[data-id="${CSS.escape(cur || '')}"]`)?.focus();
}
function step(d) {
  const i = view.findIndex(b => b.id === cur);
  const n = view[Math.min(view.length - 1, Math.max(0, i < 0 ? 0 : i + d))];
  if (n) open(n.id, false);
}

$('#cats').onclick = e => { const b = e.target.closest('.cat'); if (!b || b.disabled) return; st.c = b.dataset.c; cur = null; render(); $('#items').scrollTop = 0; };
$('#q').oninput = () => { st.q = $('#q').value.trim(); cur = null; render(); $('#items').scrollTop = 0; };
$('#sort').onchange = () => { st.s = $('#sort').value; render(); };
$('#unread').onclick = () => { unreadOnly = !unreadOnly; $('#unread').setAttribute('aria-pressed', unreadOnly); cur = null; render(); };
$('#items').onclick = e => {
  if (e.target.id === 'reset') { st.c = ''; st.q = ''; $('#q').value = ''; unreadOnly = false; $('#unread').setAttribute('aria-pressed', false); render(); return; }
  const it = e.target.closest('.item');
  if (it) open(it.dataset.id);
};
$('#doc').onclick = e => {
  if (e.target.id !== 'mark') return;
  const b = all.find(b => b.id === cur);
  unread(b) ? read.add(b.id) : read.delete(b.id);
  saveRead();
  e.target.textContent = unread(b) ? '标为已读' : '标为未读';
  $(`.item[data-id="${CSS.escape(cur)}"]`)?.classList.toggle('unread', unread(b));
  updUnread();
};
$('#back').onclick = closeReader;
addEventListener('popstate', () => {
  pushed = false;
  const s = readState();
  if (!s.id) document.body.classList.remove('reading');
  else if (s.id !== cur || !reading()) open(s.id, false);
});
addEventListener('keydown', e => {
  const typing = /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName);
  if (e.key === 'Escape') {
    if (typing && $('#q').value) { $('#q').value = ''; $('#q').oninput(); } else if (typing) e.target.blur(); else closeReader();
    return;
  }
  if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === '/') { e.preventDefault(); $('#q').focus(); }
  else if (e.key === 'j') step(1);
  else if (e.key === 'k') step(-1);
  else if (e.key === 'o' && cur) window.open($('.d-act .pri').href, '_blank', 'noopener');
  else if (e.key === 'u' && cur) $('#mark')?.click();
});

// 时区写错时 toLocaleDateString 会抛错导致整页空白，退回默认时区
const validTZ = z => { try { new Intl.DateTimeFormat('en', { timeZone: z }); return true; } catch { return false; } };

Promise.all(['config.json', 'data/categories.json', 'data/bookmarks.json', 'data/meta.json'].map(u => fetch(u).then(r => { if (!r.ok) throw r.status; return r.json(); }))).then(([cfg, cats, bs, m]) => {
  if (cfg.timezone && validTZ(cfg.timezone)) TZ = cfg.timezone;
  if (cfg.title) { document.title = cfg.title; $('#brand').textContent = cfg.title; }
  // 分类可以是 {name, short}，也兼容只写名字的字符串
  SHORT = Object.fromEntries(cats.filter(c => c && c.short).map(c => [c.name, c.short]));
  all = bs.filter(b => !b.removed_at);
  for (const b of all) b._h = [b.title, b.summary, b.text, b.author_name, b.author_username, b.category, short(b.category)].join('\n').toLowerCase();
  if (st.c && !all.some(b => b.category === st.c)) st.c = '';
  $('#q').value = st.q; $('#sort').value = st.s;
  const fresh = all.filter(isNew).length;
  $('#sync').innerHTML = m.updated_at ? `共 ${all.length} 条${fresh ? `，最近 7 天收进 ${fresh} 条` : ''}。<br>数据更新于 ${md(m.updated_at)} ${hm(m.updated_at)}` : '还没有同步过';
  const id = st.id;
  st.id = '';
  render();
  if (id) open(id, false);
}).catch(() => {
  $('#sync').textContent = '数据没有加载出来';
  $('#items').innerHTML = '<li class="empty">书签数据没有加载出来，可能是网络问题或数据文件异常，请刷新重试。</li>';
});
