'use strict';
/* =====================================================================
   PHILLIPS CRM
   Paste your Firebase web config below (Firebase console > Project
   settings > Your apps > Web app) to run it live for the whole team.
   Until you do, it runs in LOCAL MODE: everything is saved in this
   browser on this computer, and automations run as a preview.
   ===================================================================== */
const FIREBASE_CONFIG = {
  apiKey: "PASTE_API_KEY",
  authDomain: "PASTE_PROJECT.firebaseapp.com",
  projectId: "PASTE_PROJECT",
  storageBucket: "PASTE_PROJECT.appspot.com",
  messagingSenderId: "PASTE",
  appId: "PASTE"
};
const LOCAL = !FIREBASE_CONFIG.apiKey || FIREBASE_CONFIG.apiKey.indexOf('PASTE') === 0;
const DEMO = LOCAL;
const MODE_KEY = 'legacycrm_mode';
const STORAGE_OK = (() => { try { localStorage.setItem('__lc_t', '1'); localStorage.removeItem('__lc_t'); return true; } catch (e) { return false; } })();
let MODE = LOCAL ? (() => { try { return localStorage.getItem(MODE_KEY); } catch (e) { return null; } })() : 'live';
const FB_VER = '10.12.2';
const DEL = { __del: true };
const DEFAULT_FIRM = 'Phillips';

/* ---------- utils ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
const clone = o => JSON.parse(JSON.stringify(o));
const DAY = 86400000;
const money = n => (n == null || n === '') ? '—' : '$' + Math.round(Number(n) || 0).toLocaleString('en-US');
const moneyShort = n => { n = Number(n) || 0; return n >= 1e6 ? '$' + (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M' : n >= 1e3 ? '$' + Math.round(n / 1e3) + 'K' : '$' + Math.round(n); };
const fmtDate = t => t ? new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: new Date(t).getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined }) : '—';
const fmtDT = t => t ? new Date(t).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';
function ago(t) {
  if (!t) return '—';
  const d = Date.now() - t, a = Math.abs(d), m = Math.round(a / 60000);
  if (m < 1) return 'just now';
  let s;
  if (m < 60) s = m + 'm'; else if (m < 1440) s = Math.round(m / 60) + 'h'; else if (m < 43200) s = Math.round(m / 1440) + 'd'; else return fmtDate(t);
  return d < 0 ? 'in ' + s : s + ' ago';
}
const initials = n => (n || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('') || '?';
const fullName = c => c ? ([c.firstName, c.lastName].filter(Boolean).join(' ') || c.email || 'Unnamed') : '';
const norm = s => String(s || '').trim().toLowerCase();
const toDateInput = t => t ? new Date(t - new Date(t).getTimezoneOffset() * 60000).toISOString().slice(0, 10) : '';
const toDTInput = t => t ? new Date(t - new Date(t).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '';
const fromDateInput = s => s ? new Date(s + 'T12:00:00').getTime() : null;
const startOfDay = (t = Date.now()) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
function getPath(o, p) { return p.split('.').reduce((a, k) => a == null ? a : a[k], o); }
function setPath(o, p, v) {
  const ks = p.split('.'); let a = o;
  for (let i = 0; i < ks.length - 1; i++) { if (a[ks[i]] == null) a[ks[i]] = /^\d+$/.test(ks[i + 1]) ? [] : {}; a = a[ks[i]]; }
  a[ks[ks.length - 1]] = v;
}
const opt = (v, label, sel) => `<option value="${esc(v)}"${String(sel) === String(v) ? ' selected' : ''}>${esc(label)}</option>`;

/* ---------- merge tags (same rules as the engine) ---------- */
const MERGE_TAGS = ['firstName', 'lastName', 'fullName', 'company', 'title', 'email', 'dealName', 'dealAmount', 'senderName', 'senderFirstName', 'firmName'];
function mergeVars(contact, deal) {
  const g = S.settings.general || {};
  const co = contact && (byId('companies', contact.companyId) || {});
  const sender = g.senderName || meName();
  return {
    firstName: contact && contact.firstName || '', lastName: contact && contact.lastName || '',
    fullName: fullName(contact), email: contact && contact.email || '', title: contact && contact.title || '',
    company: (co && co.name) || (contact && contact.companyName) || '',
    dealName: deal && deal.name || '', dealAmount: deal && deal.amount ? money(deal.amount) : '',
    senderName: sender, senderFirstName: String(sender).split(' ')[0], firmName: firmName()
  };
}
function merge(str, v) {
  return String(str || '').replace(/\{\{\s*([\w.]+)\s*(?:\|([^}]*))?\}\}/g, (m, k, def) =>
    (v[k] != null && v[k] !== '') ? v[k] : (def != null ? def.trim() : ''));
}
function textToHtml(t) {
  t = String(t || '');
  if (/^\s*</.test(t)) return t;
  return t.split(/\n{2,}/).map(p => '<p style="margin:0 0 12px">' + esc(p).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>').replace(/\n/g, '<br>') + '</p>').join('');
}

/* ---------- data stores ---------- */
class LocalStore {
  constructor(key) { this.key = key; this.mem = null; this.subs = {}; this.failed = false; this.data = this.load() || null; }
  load() { try { const s = localStorage.getItem(this.key); return s ? JSON.parse(s) : null; } catch (e) { return this.mem; } }
  save() {
    this.mem = this.data;
    try { localStorage.setItem(this.key, JSON.stringify(this.data)); this.failed = false; }
    catch (e) { if (!this.failed && STORAGE_OK) toast('Could not save to this browser (storage may be full). Download a backup from Settings now.', 'error'); this.failed = true; }
  }
  kick(c) { if ((c === 'events' || c === 'jobs' || c === 'enrollments') && typeof localEngineKick === 'function') localEngineKick(); }
  reset() { try { localStorage.removeItem(this.key); } catch (e) { } location.reload(); }
  col(c) { return this.data[c] = this.data[c] || {}; }
  snap(c) { return Object.keys(this.col(c)).map(id => Object.assign({ id }, this.col(c)[id])); }
  emit(c) { (this.subs[c] || []).forEach(cb => cb(this.snap(c))); }
  watch(c, cb) { (this.subs[c] = this.subs[c] || []).push(cb); setTimeout(() => cb(this.snap(c))); }
  async add(c, d) { const id = uid(); this.col(c)[id] = clone(d); this.save(); this.emit(c); this.kick(c); return id; }
  async set(c, id, d, mergeIt) { this.col(c)[id] = mergeIt ? Object.assign(this.col(c)[id] || {}, clone(d)) : clone(d); this.save(); this.emit(c); }
  async update(c, id, p) {
    const doc = this.col(c)[id]; if (!doc) return;
    Object.keys(p).forEach(k => {
      const ks = k.split('.'); let o = doc;
      for (let i = 0; i < ks.length - 1; i++) { o[ks[i]] = o[ks[i]] || {}; o = o[ks[i]]; }
      if (p[k] === DEL) delete o[ks[ks.length - 1]]; else o[ks[ks.length - 1]] = clone(p[k]);
    });
    this.save(); this.emit(c); this.kick(c);
  }
  async remove(c, id) { delete this.col(c)[id]; this.save(); this.emit(c); }
}

class FirebaseStore {
  async init() {
    const base = 'https://www.gstatic.com/firebasejs/' + FB_VER + '/';
    const [app, fs, au] = await Promise.all([import(base + 'firebase-app.js'), import(base + 'firebase-firestore.js'), import(base + 'firebase-auth.js')]);
    this.f = fs; this.au = au;
    this.app = app.initializeApp(FIREBASE_CONFIG);
    this.db = fs.getFirestore(this.app);
    this.auth = au.getAuth(this.app);
  }
  onUser(cb) { this.au.onAuthStateChanged(this.auth, cb); }
  signIn() { return this.au.signInWithPopup(this.auth, new this.au.GoogleAuthProvider()); }
  signOut() { return this.au.signOut(this.auth); }
  watch(c, cb, o = {}) {
    const f = this.f; let q = f.collection(this.db, c);
    if (o.orderBy) q = f.query(q, f.orderBy(o.orderBy, 'desc'), f.limit(o.limit || 500));
    return f.onSnapshot(q, s => cb(s.docs.map(d => Object.assign({ id: d.id }, d.data()))), err => {
      if (err.code === 'permission-denied') { S.denied = true; schedule(); }
      else toast('Sync error (' + c + '): ' + err.message, 'error');
    });
  }
  async add(c, d) { const r = await this.f.addDoc(this.f.collection(this.db, c), d); return r.id; }
  async set(c, id, d, mergeIt) { await this.f.setDoc(this.f.doc(this.db, c, id), d, { merge: !!mergeIt }); }
  async update(c, id, p) {
    const q = {}; Object.keys(p).forEach(k => q[k] = p[k] === DEL ? this.f.deleteField() : p[k]);
    await this.f.updateDoc(this.f.doc(this.db, c, id), q);
  }
  async remove(c, id) { await this.f.deleteDoc(this.f.doc(this.db, c, id)); }
}
let store = LOCAL ? null : new FirebaseStore();

/* ---------- state ---------- */
const S = { data: {}, settings: {}, user: null, view: 'dashboard', drawer: null, draft: null, sel: new Set(), f: { q: '', tag: '', status: '', owner: '', assignee: 'me', logTab: 'queue' }, denied: false };
const EDITOR_VIEWS = new Set(['sequence-edit', 'workflow-edit', 'settings']);
const COLS = ['clients', 'revenue', 'contacts', 'companies', 'deals', 'tasks', 'templates', 'sequences', 'enrollments', 'workflows', 'settings'];
const _idx = {};
const list = c => S.data[c] || [];
function byId(c, id) { if (!id) return null; if (!_idx[c]) _idx[c] = new Map(list(c).map(d => [d.id, d])); return _idx[c].get(id) || null; }

const DEFAULT_STAGES = [
  { id: 'lead', name: 'New Lead' }, { id: 'discovery', name: 'Discovery Call' }, { id: 'analysis', name: 'Analysis Meeting' },
  { id: 'engagement', name: 'Engagement Sent' }, { id: 'won', name: 'Signed', kind: 'won' }, { id: 'lost', name: 'Lost', kind: 'lost' }
];
const DEFAULT_TEAM = [{ name: 'Jaleel', email: '' }, { name: 'Todd', email: '' }, { name: 'Jackson', email: '' }, { name: 'Sam', email: '' }];
const DEFAULT_SOURCES = ['Website form', 'Referral', 'CPA referral', 'Cold outreach', 'Event', 'Other'];
const stages = () => (S.settings.pipeline && S.settings.pipeline.stages && S.settings.pipeline.stages.length) ? S.settings.pipeline.stages : DEFAULT_STAGES;
const COMPANY_STAGES = [{ id: 'co_open', name: 'Open' }, { id: 'co_closed', name: 'Closed', kind: 'won' }, { id: 'co_lost', name: 'Lost', kind: 'lost' }];
const stageOf = id => stages().find(s => s.id === id) || COMPANY_STAGES.find(s => s.id === id) || { id, name: id || 'Unknown', kind: 'open' };
/* Company deals (advisory projects) use a simple Open / Closed / Lost pipeline; client deals use the full stage list. */
function isCompanyDeal(d) {
  if (!d) return false;
  if (d.pipeline) return d.pipeline === 'company';
  if (COMPANY_STAGES.some(s => s.id === d.stage)) return true;
  if (d.fee && d.fee.structure === 'bps') return true;
  const co = !d.clientId && d.companyId && byId('companies', d.companyId);
  return !!(co && co.advisory && co.advisory.active !== false);
}
const stagesFor = d => isCompanyDeal(d) ? COMPANY_STAGES : stages();
/* Map a stage into the other pipeline by its kind (open / won / lost). */
function mapStage(stage, toCompany) {
  const k = stageOf(stage).kind || 'open', list_ = toCompany ? COMPANY_STAGES : stages();
  if (list_.some(s => s.id === stage)) return stage;
  return (list_.find(s => (s.kind || 'open') === k) || list_[0]).id;
}
const shownStage = d => mapStage(d.stage, isCompanyDeal(d));
const stageKind = id => stageOf(id).kind || 'open';
const team = () => { const t = (S.settings.general || {}).team; return t && t.length ? t : DEFAULT_TEAM; };
const sources = () => { const s = (S.settings.general || {}).sources; return s && s.length ? s : DEFAULT_SOURCES; };
const meEmail = () => S.user ? S.user.email : '';
const firmName = () => (((S.settings && S.settings.general) || {}).firmName || DEFAULT_FIRM).trim() || DEFAULT_FIRM;
function brandMark() {
  const f = firmName(), first = f.split(/\s+/)[0];
  return `<div class="mark">${esc(first)} <b>CRM</b></div>${f !== first ? `<div class="sub">${esc(f)}</div>` : ''}`;
}
function meName() {
  const m = team().find(t => t.email && norm(t.email) === norm(meEmail()));
  if (m) return m.name;
  if (S.user && S.user.displayName) return S.user.displayName.split(' ')[0];
  if (LOCAL) return (S.settings.general || {}).me || team()[0].name || 'Me';
  return meEmail() || 'Me';
}

/* ---------- render loop ---------- */
let _rq = false, _fromData = true;
function schedule(fromData) {
  if (!fromData) _fromData = false;
  if (_rq) return; _rq = true;
  requestAnimationFrame(() => {
    _rq = false; const fd = _fromData; _fromData = true;
    if (!S.user) return;
    if (!$('#side')) renderShell();
    renderSide();
    if (!(fd && EDITOR_VIEWS.has(S.view))) renderMain();
    renderDrawer();
    if (typeof renderAI === 'function' && (!AI.open || !document.getElementById('aiLayer'))) renderAI();
  });
}
function swap(el, html) {
  if (!el) return;
  const keep = {};
  $$('[data-keep]', el).forEach(x => keep[x.dataset.keep] = { v: x.value, s: x.selectionStart, e: x.selectionEnd });
  const a = document.activeElement, actKey = a && el.contains(a) && a.dataset ? a.dataset.keep : null;
  el.innerHTML = html;
  $$('[data-keep]', el).forEach(x => { const k = keep[x.dataset.keep]; if (k && k.v) x.value = k.v; });
  if (actKey) { const n = $('[data-keep="' + actKey + '"]', el); if (n) { n.focus(); try { n.setSelectionRange(keep[actKey].s, keep[actKey].e); } catch (e) { } } }
}
function renderShell() {
  $('#root').innerHTML = `<div class="app"><aside class="side" id="side"></aside><main class="main"><div id="banner"></div><div class="top" id="top"></div><div class="content" id="content"></div></main></div>`;
}
const NAV = [
  ['dashboard', 'Dashboard', 'home'], ['tasks', 'Tasks', 'check'], ['clients', 'Clients', 'client'], ['companies', 'Companies', 'building'], ['deals', 'Deals', 'kanban'], ['revenue', 'Revenue', 'dollar'], ['contacts', 'Contacts', 'users'],
  '-Automation', ['sequences', 'Sequences', 'seq'], ['workflows', 'Workflows', 'zap'], ['templates', 'Templates', 'file'], ['log', 'Automation log', 'list'],
  '-Admin', ['settings', 'Settings', 'gear']
];
function renderSide() {
  const due = list('tasks').filter(t => !t.done && t.due && t.due < startOfDay() + DAY && (!t.assignee || t.assignee === meName())).length;
  const errs = list('jobs').filter(j => j.status === 'error').length;
  const base = S.view === 'sequence-edit' ? 'sequences' : S.view === 'workflow-edit' ? 'workflows' : S.view;
  document.title = firmName().split(/\s+/)[0] + ' CRM';
  const html = `<div class="brand">${brandMark()}</div>
  <nav class="nav">${NAV.map(n => typeof n === 'string' ? `<div class="grp">${n.slice(1)}</div>` :
    `<button class="${base === n[0] ? 'on' : ''}" data-act="go" data-v="${n[0]}">${ic(n[2])}<span>${n[1]}</span>${n[0] === 'tasks' && due ? `<span class="count">${due}</span>` : ''}${n[0] === 'log' && errs ? `<span class="count" style="background:var(--red-soft);color:var(--red)">${errs}</span>` : ''}</button>`).join('')}</nav>
  <div class="me"><span class="avatar">${initials(meName())}</span><div class="who"><div>${esc(meName())}</div><div class="em">${esc(LOCAL ? (MODE === 'sample' ? 'Sample data' : 'Local, this browser') : meEmail())}</div></div>${DEMO ? '' : '<button data-act="signOut">Sign out</button>'}</div>`;
  swap($('#side'), html);
}
function renderMain() {
  const v = (VIEWS[S.view] || VIEWS.dashboard)();
  $('#top').innerHTML = `<h1>${esc(v.title)}</h1><div class="spacer"></div>${v.actions || ''}`;
  let banner = '';
  if (LOCAL) banner = localBanner();
  else if (S.denied) banner = `<div class="banner" style="background:var(--red-soft);border-color:#EBC3BF;color:var(--red)"><b>Access denied.</b> ${esc(meEmail())} is not on the team list in the Firestore security rules. Ask an admin to add it.</div>`;
  $('#banner').innerHTML = banner;
  swap($('#content'), v.body);
}
function renderDrawer() {
  const L = $('#drawerLayer');
  if (!S.drawer) { L.innerHTML = ''; return; }
  const fn = DRAWERS[S.drawer.type], rec = byId({ contact: 'contacts', deal: 'deals', company: 'companies', client: 'clients' }[S.drawer.type], S.drawer.id);
  if (!fn || !rec) { S.drawer = null; L.innerHTML = ''; return; }
  const prev = $('.drawer .db', L), top = prev ? prev.scrollTop : 0, fresh = !prev;
  if (fresh) L.innerHTML = `<div class="scrim" data-act="closeDrawer"></div><div class="drawer" id="drawer"></div>`;
  swap($('#drawer', L), fn(rec));
  if (!fresh) $('.drawer .db', L).scrollTop = top;
}
function go(view) { S.view = view; S.sel.clear(); if (view === 'settings') S.draft = settingsDraft(); schedule(false); window.scrollTo(0, 0); }
function openDrawer(type, id) { S.drawer = { type, id }; $('#drawerLayer').innerHTML = ''; schedule(false); }

/* ---------- modal ---------- */
let _modalSubmit = null;
function openModal({ title, body, foot, wide, submit, onMount }) {
  _modalSubmit = submit || null;
  $('#modalLayer').innerHTML = `<div class="scrim top" data-act="closeModal"></div>
  <form class="modal${wide ? ' wide' : ''}" id="mform" autocomplete="off">
    <div class="mh"><h3>${esc(title)}</h3><button type="button" class="x" data-act="closeModal">×</button></div>
    <div class="mb">${body}</div>
    <div class="mf">${foot != null ? foot : `<button type="button" class="btn" data-act="closeModal">Cancel</button><button class="btn primary">Save</button>`}</div>
  </form>`;
  const f = $('#mform');
  f.addEventListener('submit', e => { e.preventDefault(); runModalSubmit(); });
  const first = $('input:not([type=hidden]):not([type=checkbox]),textarea,select', f); if (first) first.focus();
  if (onMount) onMount(f);
}
/* In-app confirm dialog (browser confirm() is blocked in sandboxed previews). */
function ask(msg, okLabel) {
  return new Promise(res => {
    let L = $('#askLayer'); if (!L) { L = document.createElement('div'); L.id = 'askLayer'; document.body.appendChild(L); }
    L.innerHTML = `<div class="scrim" style="z-index:60" data-ask="0"></div><div class="modal" style="z-index:61;width:min(420px,calc(100vw - 24px))" role="alertdialog">
      <div class="mb" style="padding-top:22px;font-size:14.5px;line-height:1.5">${esc(msg)}</div>
      <div class="mf"><button type="button" class="btn" data-ask="0">Cancel</button><button type="button" class="btn primary" data-ask="1">${esc(okLabel || 'OK')}</button></div></div>`;
    const done = v => { L.innerHTML = ''; document.removeEventListener('keydown', key, true); res(v); };
    const key = e => { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); done(false); } else if (e.key === 'Enter') { e.stopPropagation(); e.preventDefault(); done(true); } };
    document.addEventListener('keydown', key, true);
    L.querySelectorAll('[data-ask]').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); done(b.dataset.ask === '1'); }));
    L.querySelector('[data-ask="1"]').focus();
  });
}
let _modalBusy = false;
async function runModalSubmit() {
  const f = $('#mform'); if (!f || !_modalSubmit || _modalBusy) return;
  if (f.reportValidity && !f.reportValidity()) return;
  _modalBusy = true;
  const btn = $('.mf .primary', f); if (btn) btn.disabled = true;
  try { const r = await _modalSubmit(formObj(f), f); if (r !== false) closeModal(); }
  catch (err) { console.error(err); toast(err.message || String(err), 'error'); }
  _modalBusy = false;
  if (btn && document.body.contains(btn)) btn.disabled = false;
}
function runFormSubmit(f) {
  if (!f || !f.dataset.submit || !SUBMIT[f.dataset.submit]) return;
  Promise.resolve(SUBMIT[f.dataset.submit](formObj(f), f)).catch(err => toast(err.message, 'error'));
}
function closeModal() { $('#modalLayer').innerHTML = ''; _modalSubmit = null; _modalBusy = false; }
function formObj(f) {
  const o = {};
  $$('[name]', f).forEach(el => {
    if (el.type === 'checkbox') o[el.name] = el.checked;
    else if (el.type === 'radio') { if (el.checked) o[el.name] = el.value; }
    else o[el.name] = el.value.trim();
  });
  return o;
}
/* Downloads: a real file in a normal browser tab. Inside an embedded preview (where browsers
   block downloads) show the contents to copy instead, so nothing is lost and nothing breaks. */
const EMBEDDED = (() => { try { return window.self !== window.top; } catch (e) { return true; } })();
function downloadFile(name, text, type) {
  if (!EMBEDDED) {
    try {
      const url = URL.createObjectURL(new Blob([text], { type: type || 'text/plain' }));
      const a = document.createElement('a'); a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      return true;
    } catch (e) { console.warn('download failed', e); }
  }
  openModal({
    title: 'Copy your ' + (/\.json$/.test(name) ? 'backup' : 'export'), wide: true,
    body: `<p class="hint" style="margin-top:0">This window can't download files (it's an embedded preview). Your data is fine. Click <b>Copy to clipboard</b>, then open index.html in Chrome, Edge, or Safari, choose <b>Restore from a backup</b>, and paste it in. You can also paste it into a note or email to yourself to keep it safe.</p>
      <textarea id="dlText" readonly style="width:100%;height:280px;font-family:ui-monospace,monospace;font-size:12px">${esc(text)}</textarea>`,
    foot: `<button type="button" class="btn" data-act="closeModal">Close</button><button type="button" class="btn primary" data-act="copyDl">Copy to clipboard</button>`,
    onMount: f => { const t = $('#dlText', f); if (t) { t.focus(); t.select(); } }
  });
  return false;
}
function toast(msg, type) {
  const t = document.createElement('div'); t.className = 'toast' + (type ? ' ' + type : ''); t.textContent = msg;
  $('#toasts').appendChild(t); setTimeout(() => t.remove(), type === 'error' ? 6000 : 3000);
}

/* ---------- domain operations ---------- */
function emit(type, o = {}) {
  return store.add('events', { type, contactId: o.contactId || null, dealId: o.dealId || null, data: o.data || {}, processed: false, createdAt: Date.now(), depth: 0, by: meEmail() || meName() });
}
async function logAct(o) {
  const a = Object.assign({ type: 'note', by: meName(), at: Date.now(), contactId: null, dealId: null }, o);
  const id = await store.add('activities', a);
  // Calls, meetings, and logged touchpoints reset the client check-in clock.
  if (a.type === 'contact' || a.type === 'call') {
    const c = byId('contacts', a.contactId);
    if (c && (c.lastContactAt || 0) < a.at) await store.update('contacts', c.id, { lastContactAt: a.at });
    const cl = a.clientId && byId('clients', a.clientId);
    if (cl && (cl.lastContactAt || 0) < a.at) await store.update('clients', cl.id, { lastContactAt: a.at });
  }
  return id;
}
function parseTags(s) { return Array.from(new Set(String(s || '').split(',').map(t => t.trim()).filter(Boolean))); }
async function ensureCompany(name) {
  name = (name || '').trim(); if (!name) return null;
  const ex = list('companies').find(c => norm(c.name) === norm(name)); if (ex) return ex.id;
  return store.add('companies', { name, createdAt: Date.now(), updatedAt: Date.now() });
}
async function saveContact(o, id) {
  const companyId = await ensureCompany(o.companyName);
  const d = {
    firstName: o.firstName || '', lastName: o.lastName || '', email: o.email || '', emailLower: norm(o.email), phone: o.phone || '', title: o.title || '',
    companyId: companyId || null, companyName: o.companyName || '', owner: o.owner || '', source: o.source || '', updatedAt: Date.now()
  };
  if (id) {
    const old = byId('contacts', id);
    if (o.status) d.status = o.status;
    const newTags = parseTags(o.tags); d.tags = newTags;
    await store.update('contacts', id, d);
    const added = newTags.filter(t => !(old.tags || []).map(norm).includes(norm(t)));
    for (const t of added) await emit('tag_added', { contactId: id, data: { tag: t } });
    if (old.status !== 'unsubscribed' && d.status === 'unsubscribed') await stopAllFor(id, 'Unsubscribed');
    return id;
  }
  if (d.emailLower) { const dup = list('contacts').find(c => c.emailLower === d.emailLower); if (dup) { toast('A contact with that email already exists', 'error'); openDrawer('contact', dup.id); return dup.id; } }
  Object.assign(d, { status: 'active', tags: parseTags(o.tags), createdAt: Date.now(), createdBy: meName() });
  const nid = await store.add('contacts', d);
  await logAct({ type: 'system', contactId: nid, body: 'Contact created' + (d.source ? ' (source: ' + d.source + ')' : '') });
  await emit('contact_created', { contactId: nid });
  for (const t of d.tags) await emit('tag_added', { contactId: nid, data: { tag: t } });
  return nid;
}
async function addTag(cid, tag) {
  tag = (tag || '').trim(); const c = byId('contacts', cid); if (!tag || !c) return;
  if ((c.tags || []).map(norm).includes(norm(tag))) return;
  await store.update('contacts', cid, { tags: (c.tags || []).concat([tag]), updatedAt: Date.now() });
  await emit('tag_added', { contactId: cid, data: { tag } });
}
async function removeTag(cid, tag) {
  const c = byId('contacts', cid); if (!c) return;
  await store.update('contacts', cid, { tags: (c.tags || []).filter(t => t !== tag), updatedAt: Date.now() });
}
async function saveDeal(o, id) {
  const d = { name: o.name, contactId: o.contactId || null, clientId: o.clientId || null, companyId: o.companyId || null, amount: Number(String(o.amount || '').replace(/[^0-9.]/g, '')) || 0, owner: o.owner || '', closeDate: fromDateInput(o.closeDate), description: o.description || '', updatedAt: Date.now() };
  const cl = byId('clients', d.clientId);
  if (!d.contactId && cl && (cl.contactIds || [])[0]) d.contactId = cl.contactIds[0];
  const c = byId('contacts', d.contactId);
  if (!d.companyId && c) d.companyId = c.companyId || null;
  if (o.pipeline) { d.pipeline = o.pipeline; if (o.stage) o.stage = mapStage(o.stage, o.pipeline === 'company'); }
  if (o.feeStructure) { const ff = feeFromForm(o); d.fee = ff.fee; if (ff.amount != null) d.amount = ff.amount; }
  if (!d.clientId && c) { const ofc = list('clients').find(x => (x.contactIds || []).includes(c.id)); if (ofc) d.clientId = ofc.id; }
  if (id) {
    const old = byId('deals', id);
    await store.update('deals', id, d);
    if (o.stage && o.stage !== old.stage) await moveDeal(id, o.stage);
    return id;
  }
  Object.assign(d, { stage: o.stage || (d.pipeline === 'company' ? 'co_open' : stages()[0].id), createdAt: Date.now(), stageChangedAt: Date.now(), createdBy: meName() });
  const nid = await store.add('deals', d);
  await logAct({ type: 'stage', contactId: d.contactId, dealId: nid, body: 'Deal created in ' + stageOf(d.stage).name + ': ' + d.name });
  await emit('deal_created', { contactId: d.contactId, dealId: nid, data: { to: d.stage } });
  return nid;
}
async function moveDeal(id, stage) {
  const d = byId('deals', id); if (!d || d.stage === stage) return;
  await store.update('deals', id, { stage, stageChangedAt: Date.now(), updatedAt: Date.now() });
  await logAct({ type: 'stage', contactId: d.contactId || null, dealId: id, body: d.name + ': ' + stageOf(d.stage).name + ' → ' + stageOf(stage).name });
  await emit('deal_stage_changed', { contactId: d.contactId, dealId: id, data: { from: d.stage, to: stage } });
  if (stageKind(stage) === 'won') await onDealWon(id);
}
function stepDelay(st) { return ((Number(st && st.delayDays) || 0) * DAY) + ((Number(st && st.delayHours) || 0) * 3600000); }
async function enroll(ids, seqId) {
  const seq = byId('sequences', seqId); if (!seq) return;
  let ok = 0, skip = [];
  for (const id of ids) {
    const c = byId('contacts', id);
    if (!c || !c.email) { skip.push(fullName(c) + ' (no email)'); continue; }
    if (c.status === 'unsubscribed' || c.status === 'bounced') { skip.push(fullName(c) + ' (' + c.status + ')'); continue; }
    if (list('enrollments').some(e => e.contactId === id && e.sequenceId === seqId && e.status === 'active')) { skip.push(fullName(c) + ' (already enrolled)'); continue; }
    await store.add('enrollments', { sequenceId: seqId, sequenceName: seq.name, contactId: id, contactName: fullName(c), email: c.email, stepIndex: 0, status: 'active', startedAt: Date.now(), nextSendAt: Date.now() + stepDelay((seq.steps || [])[0]), sentCount: 0, enrolledBy: meName() });
    await logAct({ type: 'system', contactId: id, body: 'Enrolled in sequence "' + seq.name + '"' });
    ok++;
  }
  toast(plural(ok, 'contact') + ' enrolled' + (skip.length ? '. Skipped: ' + skip.slice(0, 3).join(', ') + (skip.length > 3 ? ' and ' + (skip.length - 3) + ' more' : '') : ''));
}
async function stopEnrollment(id, reason) {
  const e = byId('enrollments', id); if (!e) return;
  await store.update('enrollments', id, { status: 'stopped', stopReason: reason || 'Stopped by ' + meName(), endedAt: Date.now(), nextSendAt: null });
  await logAct({ type: 'system', contactId: e.contactId, body: 'Removed from sequence "' + e.sequenceName + '"' + (reason ? ' (' + reason + ')' : '') });
}
async function stopAllFor(cid, reason) { for (const e of list('enrollments').filter(e => e.contactId === cid && e.status === 'active')) await stopEnrollment(e.id, reason); }
async function queueEmail(cid, p) {
  return store.add('jobs', { type: 'send_email', params: { templateId: p.templateId || '', subject: p.subject || '', body: p.body || '', unsubscribe: !!p.unsubscribe }, contactId: cid, dealId: p.dealId || null, runAt: p.runAt || Date.now(), dueAt: p.runAt || Date.now(), status: 'pending', createdAt: Date.now(), createdBy: meName() });
}

/* ---------- events ---------- */
const ACT = {}, CHANGE = {}, INPUT = {}, SUBMIT = {};
/* Forms are handled without native submission, because sandboxed previews
   (like the in-chat file preview) block form submit events entirely. */
function isSubmitBtn(b) { return b && b.tagName === 'BUTTON' && (b.getAttribute('type') || 'submit') === 'submit'; }
document.addEventListener('click', e => {
  const sb = e.target.closest && e.target.closest('button');
  if (isSubmitBtn(sb) && !sb.dataset.act) {
    const f = sb.closest('form');
    if (f && f.id === 'mform') { e.preventDefault(); runModalSubmit(); return; }
    if (f && f.dataset.submit) { e.preventDefault(); runFormSubmit(f); return; }
  }
  const t = e.target.closest('[data-act]'); if (!t) return;
  const fn = ACT[t.dataset.act]; if (!fn) return;
  if (t.tagName !== 'INPUT' && t.tagName !== 'LABEL') e.preventDefault();
  Promise.resolve(fn(t.dataset, t, e)).catch(err => { console.error(err); toast(err.message || String(err), 'error'); });
});
function bindHandler(e, map) {
  const t = e.target;
  if (t.dataset && t.dataset.bind && S.draft) {
    let v = t.type === 'checkbox' ? t.checked : t.type === 'number' ? (t.value === '' ? '' : Number(t.value)) : t.value;
    setPath(S.draft, t.dataset.bind, v);
    if (t.dataset.rerender != null && e.type === 'change') renderMain();
  }
  const k = e.type === 'change' ? t.dataset && t.dataset.change : t.dataset && t.dataset.input;
  if (k && map[k]) Promise.resolve(map[k](t.dataset, t, e)).catch(err => toast(err.message, 'error'));
}
document.addEventListener('change', e => bindHandler(e, CHANGE));
document.addEventListener('input', e => bindHandler(e, INPUT));
document.addEventListener('submit', e => {
  const f = e.target; if (!f.dataset || !f.dataset.submit) return;
  e.preventDefault(); runFormSubmit(f);
});
document.addEventListener('keydown', e => {
  const t = e.target;
  if (e.key === 'Enter' && t.tagName === 'INPUT' && !/^(checkbox|radio|button|submit)$/.test(t.type) && !e.isComposing) {
    const f = t.closest('form');
    if (f && f.id === 'mform') { e.preventDefault(); runModalSubmit(); return; }
    if (f && f.dataset.submit) { e.preventDefault(); runFormSubmit(f); return; }
  }
  if (e.key === 'Escape') { if ($('#mform')) closeModal(); else if (S.drawer) { S.drawer = null; schedule(false); } }
});
let _lastField = null;
document.addEventListener('focusin', e => { if (e.target.dataset && e.target.dataset.merge != null) _lastField = e.target; });
function insertAtCursor(tag) {
  const el = _lastField; if (!el || !document.body.contains(el)) { toast('Click into the subject or body first'); return; }
  const s = el.selectionStart || el.value.length, en = el.selectionEnd || s, ins = '{{' + tag + '}}';
  el.value = el.value.slice(0, s) + ins + el.value.slice(en); el.focus(); el.setSelectionRange(s + ins.length, s + ins.length);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

/* drag and drop for the deal board */
document.addEventListener('dragstart', e => { const c = e.target.closest && e.target.closest('.dcard'); if (!c) return; e.dataTransfer.setData('text/plain', c.dataset.id); e.dataTransfer.effectAllowed = 'move'; c.classList.add('drag'); });
document.addEventListener('dragend', e => { const c = e.target.closest && e.target.closest('.dcard'); if (c) c.classList.remove('drag'); $$('.colm.over').forEach(x => x.classList.remove('over')); });
document.addEventListener('dragover', e => { const col = e.target.closest && e.target.closest('.colm'); if (!col) return; e.preventDefault(); $$('.colm.over').forEach(x => x !== col && x.classList.remove('over')); col.classList.add('over'); });
document.addEventListener('drop', e => {
  const col = e.target.closest && e.target.closest('.colm'); if (!col) return; e.preventDefault(); col.classList.remove('over');
  const id = e.dataTransfer.getData('text/plain'); if (id) moveDeal(id, col.dataset.stage).catch(err => toast(err.message, 'error'));
});

/* ---------- boot ---------- */
function subscribeAll() {
  const on = c => docs => {
    if (c === 'settings') { S.settings = {}; docs.forEach(d => S.settings[d.id] = d); }
    S.data[c] = docs; delete _idx[c]; schedule(true);
  };
  COLS.forEach(c => store.watch(c, on(c)));
  store.watch('activities', on('activities'), { orderBy: 'at', limit: 1500 });
  store.watch('jobs', on('jobs'), { orderBy: 'createdAt', limit: 400 });
  setInterval(() => schedule(true), 60000);
  setTimeout(() => { if (typeof syncAllAgreements === 'function') syncAllAgreements().catch(e => console.error(e)); }, 2500);
}
function renderLogin(msg) {
  $('#root').innerHTML = `<div class="login"><div class="box">${brandMark()}<p>Sign in with your firm Google account</p>
  <button class="btn primary" style="width:100%;justify-content:center;padding:11px" data-act="signIn">Continue with Google</button>
  ${msg ? `<p style="color:var(--red);margin:16px 0 0;font-size:12.5px">${esc(msg)}</p>` : ''}</div></div>`;
}
ACT.signIn = async () => { try { await store.signIn(); } catch (e) { renderLogin(e.message); } };
ACT.signOut = async () => { await store.signOut(); location.reload(); };
async function boot() {
  document.body.insertAdjacentHTML('beforeend', '<div id="drawerLayer"></div><div id="modalLayer"></div><div class="toasts" id="toasts"></div>');
  if (LOCAL) { if (MODE === 'mine' || MODE === 'sample') startLocal(); else renderWelcome(); return; }
  $('#root').innerHTML = '<div class="login"><div class="box">' + brandMark() + '<p>Loading…</p></div></div>';
  try { await store.init(); } catch (e) { renderLogin('Could not load Firebase: ' + e.message); return; }
  let subscribed = false;
  store.onUser(u => {
    if (!u) { S.user = null; renderLogin(); return; }
    S.user = { email: u.email, displayName: u.displayName };
    if (!subscribed) { subscribed = true; renderShell(); subscribeAll(); }
    schedule(false);
  });
}
