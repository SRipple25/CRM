/* ---------- icons ---------- */
const ICONS = {
  home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.5 3.3-5.5 6.5-5.5s5.9 2 6.5 5.5M16 4.5a3.5 3.5 0 0 1 0 7M18 14.8c2 .7 3.2 2.5 3.5 5.2"/>',
  building: '<rect x="4" y="3" width="11" height="18" rx="1"/><path d="M15 9h4a1 1 0 0 1 1 1v11h-5M8 7h3M8 11h3M8 15h3"/>',
  kanban: '<rect x="3" y="4" width="5" height="16" rx="1"/><rect x="10" y="4" width="5" height="10" rx="1"/><rect x="17" y="4" width="4" height="13" rx="1"/>',
  check: '<rect x="3.5" y="3.5" width="17" height="17" rx="3"/><path d="m8 12 3 3 5-6"/>',
  seq: '<rect x="3" y="4" width="8" height="6" rx="1.5"/><rect x="13" y="14" width="8" height="6" rx="1.5"/><path d="M7 10v4a3 3 0 0 0 3 3h3"/>',
  zap: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  file: '<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z"/><path d="M14 3v5h5M8 13h8M8 17h5"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3.5 6.5 8.5 6.5 8.5-6.5"/>',
  note: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/>',
  phone: '<path d="M5 3h3l2 5-2.5 1.5a11 11 0 0 0 7 7L16 14l5 2v3a2 2 0 0 1-2 2A16 16 0 0 1 3 5a2 2 0 0 1 2-2"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  tag: '<path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
  send: '<path d="M21 3 10 14M21 3l-7 18-4-7-7-4z"/>',
  pause: '<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>',
  bell: '<path d="M6 16v-5a6 6 0 1 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  stage: '<path d="M4 12h12M12 6l6 6-6 6"/>',
  system: '<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>'
};
const ic = n => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[n] || ''}</svg>`;

const VIEWS = {}, DRAWERS = {};
const greet = () => { const h = new Date().getHours(); return h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening'; };
function statusPill(c) {
  if (c.status === 'unsubscribed') return '<span class="pill red">Unsubscribed</span>';
  if (c.status === 'bounced') return '<span class="pill amber">Bounced</span>';
  const en = list('enrollments').find(e => e.contactId === c.id && e.status === 'active');
  return en ? `<span class="pill blue">${ic('seq').replace('<svg', '<svg width="11" height="11"')} ${esc(en.sequenceName || 'In sequence')}</span>` : '';
}
const teamOpts = (sel, blank = 'Unassigned') => opt('', blank, sel) + team().map(t => opt(t.name, t.name, sel)).join('');
const chips = () => `<div class="chips">${MERGE_TAGS.map(k => `<button type="button" class="chip" data-act="chip" data-k="${k}">{{${k}}}</button>`).join('')}</div>`;
ACT.chip = d => insertAtCursor(d.k);
ACT.go = d => go(d.v);
ACT.noop = () => { };
ACT.closeDrawer = () => { S.drawer = null; schedule(false); };
ACT.closeModal = () => closeModal();
ACT.openContact = d => openDrawer('contact', d.id);
ACT.openDeal = d => openDrawer('deal', d.id);
ACT.openCompany = d => openDrawer('company', d.id);

function feedItem(a, showContact) {
  const c = showContact && a.contactId ? byId('contacts', a.contactId) : null;
  const ch = a.type === 'contact' && CHANNELS[a.channel] ? CHANNELS[a.channel] : null;
  const icon = ch ? ch[1] : ({ email: 'mail', note: 'note', call: 'phone', stage: 'stage', system: 'system' }[a.type] || 'system');
  let head = '', body = a.body || '';
  if (a.type === 'email') { head = (a.simulated ? 'Email preview <span class="pill gold">not sent</span> ' : 'Email sent: ') + '<b>' + esc(a.subject || '(no subject)') + '</b>'; body = a.preview || ''; }
  else if (a.type === 'call') head = '<b>Call logged</b>';
  else if (ch) head = '<b>' + ch[0] + '</b>' + (a.at < Date.now() - 36e5 && startOfDay(a.at) !== startOfDay() ? ' on ' + fmtDate(a.at) : '');
  else if (a.type === 'note') head = '<b>Note</b>';
  if (body.length > 400) body = body.slice(0, 400) + '…';
  const who = c ? `<a href="#" class="name" data-act="openContact" data-id="${c.id}">${esc(fullName(c))}</a>${head ? ' · ' : ''}` : '';
  return `<div class="it"><div class="ic ${esc(ch ? 'call' : a.type)}">${ic(icon)}</div><div class="tx">${who}${head}${body ? `<div class="b">${esc(body)}</div>` : ''}<div class="t">${esc(a.by || '')} · ${ago(a.at)}</div></div></div>`;
}
function lastActMap() { const m = {}; list('activities').forEach(a => { if (a.contactId && (!m[a.contactId] || a.at > m[a.contactId])) m[a.contactId] = a.at; }); return m; }

/* ================= DASHBOARD ================= */
function engineCard() {
  if (LOCAL) { const e = S.settings.engine || {}, s = e.stats || {}; return `<div class="engine"><span class="dot ok"></span><div><b>Preview engine running in this browser</b>${e.lastRunAt ? ' <span class="muted">· last check ' + ago(e.lastRunAt) + '</span>' : ''}<div class="hint">Workflows, tasks, tags, and sequences run for real here. Emails are logged as previews instead of being sent. Use <b>Run now</b> in the Automation log to skip the waiting.</div>${(s.errors || []).length ? `<div class="hint" style="color:var(--red)">${s.errors.slice(0, 3).map(esc).join('<br>')}</div>` : ''}</div></div>`; }
  const e = S.settings.engine;
  if (!e || !e.lastRunAt) return `<div class="engine"><span class="dot bad"></span><div><b>Engine not connected</b><div class="hint">Finish setup step 5 (Apps Script). Workflows and sequences will not send until the engine checks in.</div></div></div>`;
  const age = Date.now() - e.lastRunAt, cls = age < 15 * 60000 ? 'ok' : age < 3600000 ? 'warn' : 'bad';
  const st = e.stats || {};
  return `<div class="engine"><span class="dot ${cls}"></span><div style="flex:1"><b>${cls === 'ok' ? 'Running' : cls === 'warn' ? 'Delayed' : 'Stopped'}</b> <span class="muted">· last check ${ago(e.lastRunAt)}</span>
    <div class="hint">Sending as ${esc(e.account || '?')} · ${e.quotaLeft != null ? esc(e.quotaLeft) + ' sends left today' : ''}</div>
    <div class="hint">Last run: ${st.sent || 0} sent, ${st.jobs || 0} actions, ${st.stoppedReply || 0} replies caught${st.bounced ? ', ' + st.bounced + ' bounced' : ''}</div>
    ${(st.errors || []).length ? `<div class="hint" style="color:var(--red)">${st.errors.slice(0, 3).map(esc).join('<br>')}</div>` : ''}</div></div>`;
}
VIEWS.dashboard = () => {
  const deals = list('deals'), acts = list('activities');
  const open = deals.filter(d => stageKind(d.stage) === 'open');
  const pipe = open.reduce((a, d) => a + (+d.amount || 0), 0);
  const m0 = new Date(); m0.setDate(1); m0.setHours(0, 0, 0, 0);
  const won = deals.filter(d => stageKind(d.stage) === 'won' && (d.stageChangedAt || 0) >= m0.getTime());
  const newC = list('contacts').filter(c => (c.createdAt || 0) > Date.now() - 30 * DAY).length;
  const sent7 = acts.filter(a => a.type === 'email' && a.at > Date.now() - 7 * DAY).length;
  const en = list('enrollments'), activeEn = en.filter(e => e.status === 'active').length;
  const replied = en.filter(e => e.status === 'replied' && (e.endedAt || 0) > Date.now() - 30 * DAY).length;
  const tasks = list('tasks').filter(t => !t.done).sort((a, b) => (a.due || 9e15) - (b.due || 9e15));
  const overdue = tasks.filter(t => t.due && t.due < startOfDay()).length;
  const openStages = stages().filter(s => (s.kind || 'open') === 'open');
  const byStage = openStages.map(s => { const ds = open.filter(d => !isCompanyDeal(d) && shownStage(d) === s.id); return { s, n: ds.length, amt: ds.reduce((a, d) => a + (+d.amount || 0), 0) }; });
  const coOpen = open.filter(isCompanyDeal);
  if (coOpen.length) byStage.push({ s: { name: 'Company deals (open)' }, n: coOpen.length, amt: coOpen.reduce((a, d) => a + (+d.amount || 0), 0) });
  const max = Math.max(1, ...byStage.map(b => b.amt));
  const feed = acts.slice().sort((a, b) => b.at - a.at).slice(0, 12);
  const kpi = (l, v, s) => `<div class="card kpi"><div class="l">${l}</div><div class="v">${v}</div><div class="s">${s}</div></div>`;
  return {
    title: 'Good ' + greet() + ', ' + meName(),
    actions: `<button class="btn" data-act="newContact">${ic('plus')}Contact</button><button class="btn primary" data-act="newDeal">${ic('plus')}Deal</button>`,
    body: `<div class="kpis">
      ${(fm => kpi('Collected this quarter', moneyShort(fm.qtd), fm.overdue ? `<span style="color:var(--red)">${moneyShort(fm.overdue)} past due</span>` : moneyShort(fm.arr) + '/yr recurring'))(firmMoney())}
      ${kpi('Open pipeline', moneyShort(pipe), plural(open.length, 'open deal'))}
      ${kpi('Signed this month', moneyShort(won.reduce((a, d) => a + (+d.amount || 0), 0)), plural(won.length, 'deal'))}
      ${kpi('New contacts', newC, 'last 30 days')}
      ${kpi('Emails sent', sent7, 'last 7 days')}
      ${kpi('In sequences', activeEn, replied + ' replied in 30 days')}
      ${kpi('Open tasks', tasks.length, overdue ? `<span style="color:var(--red)">${overdue} overdue</span>` : 'none overdue')}
    </div>
    <div class="dash"><div class="col">
      <div class="card"><div class="hd"><h3>Pipeline by stage</h3><a href="#" data-act="go" data-v="deals">Open board</a></div><div class="bd bars">
        ${byStage.map(b => `<div class="b"><div>${esc(b.s.name)} <span class="muted">(${b.n})</span></div><div class="track"><div class="fill" style="width:${Math.round(b.amt / max * 100)}%"></div></div><div class="amt">${money(b.amt)}</div></div>`).join('')}
      </div></div>
      <div class="card"><div class="hd"><h3>Recent activity</h3></div><div class="bd feed">${feed.length ? feed.map(a => feedItem(a, true)).join('') : '<div class="muted">Nothing yet.</div>'}</div></div>
    </div><div class="col">
      <div class="card"><div class="hd"><h3>Automation engine</h3><a href="#" data-act="go" data-v="log">Log</a></div><div class="bd">${engineCard()}</div></div>
      ${checkinsCard()}
      <div class="card"><div class="hd"><h3>Open tasks</h3><a href="#" data-act="go" data-v="tasks">All tasks</a></div>
        ${tasks.length ? tasks.slice(0, 8).map(taskRow).join('') : '<div class="bd muted">You are all caught up.</div>'}</div>
    </div></div>`
  };
};

/* ================= CONTACTS ================= */
VIEWS.contacts = () => {
  const f = S.f; let cs = list('contacts').slice();
  const q = norm(f.q);
  if (q) cs = cs.filter(c => [fullName(c), c.email, c.companyName, c.phone, (c.tags || []).join(' ')].some(x => norm(x).includes(q)));
  if (f.tag) cs = cs.filter(c => (c.tags || []).includes(f.tag));
  if (f.status === 'insequence') cs = cs.filter(c => list('enrollments').some(e => e.contactId === c.id && e.status === 'active'));
  else if (f.status) cs = cs.filter(c => (c.status || 'active') === f.status);
  if (f.owner) cs = cs.filter(c => c.owner === f.owner);
  cs.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  S._visible = cs.map(c => c.id);
  const last = lastActMap();
  const tags = Array.from(new Set(list('contacts').reduce((a, c) => a.concat(c.tags || []), []))).sort();
  const allSel = cs.length && cs.every(c => S.sel.has(c.id));
  const total = list('contacts').length;
  return {
    title: 'Contacts',
    actions: `<button class="btn" data-act="exportCsv">${ic('download')}Export</button><button class="btn primary" data-act="newContact">${ic('plus')}New contact</button>`,
    body: `<div class="toolbar">
      <input type="search" class="search" placeholder="Search name, email, company, tag" data-keep="cq" data-input="cq" value="${esc(f.q)}">
      <select data-change="cf" data-k="tag">${opt('', 'All tags', f.tag)}${tags.map(t => opt(t, t, f.tag)).join('')}</select>
      <select data-change="cf" data-k="status">${opt('', 'Any status', f.status)}${opt('active', 'Active', f.status)}${opt('insequence', 'In a sequence', f.status)}${opt('unsubscribed', 'Unsubscribed', f.status)}${opt('bounced', 'Bounced', f.status)}</select>
      <select data-change="cf" data-k="owner">${opt('', 'Any owner', f.owner)}${team().map(t => opt(t.name, t.name, f.owner)).join('')}</select>
      <span class="muted">${cs.length === total ? plural(total, 'contact') : cs.length + ' of ' + total}</span>
    </div>
    ${total ? `<div class="card tblwrap"><table class="tbl"><thead><tr><th class="w0"><input type="checkbox" data-act="selAll" ${allSel ? 'checked' : ''}></th><th>Name</th><th class="hide-m">Company</th><th class="hide-m">Tags</th><th>Owner</th><th class="hide-m">Last activity</th><th></th></tr></thead><tbody>
      ${cs.map(c => `<tr class="click${S.sel.has(c.id) ? ' sel' : ''}" data-act="openContact" data-id="${c.id}">
        <td class="w0"><input type="checkbox" data-act="sel" data-id="${c.id}" ${S.sel.has(c.id) ? 'checked' : ''}></td>
        <td><div class="row" style="gap:10px"><span class="avatar">${initials(fullName(c))}</span><div><div class="name">${esc(fullName(c))}</div><div class="sub">${esc(c.email || 'no email')}</div></div></div></td>
        <td class="hide-m">${esc(c.companyName || '')}</td>
        <td class="hide-m">${(c.tags || []).slice(0, 3).map(t => `<span class="tag">${esc(t)}</span>`).join('')}${(c.tags || []).length > 3 ? `<span class="sub">+${c.tags.length - 3}</span>` : ''}</td>
        <td>${esc(c.owner || '')}</td><td class="hide-m sub">${ago(last[c.id] || c.createdAt)}</td><td class="w0">${statusPill(c)}</td></tr>`).join('')}
    </tbody></table>${cs.length ? '' : '<div class="empty">No contacts match these filters.</div>'}</div>`
        : `<div class="card empty"><h4>No contacts yet</h4><p>Add your first contact, or connect your website form in Settings so leads land here automatically.</p><button class="btn primary" data-act="newContact">${ic('plus')}New contact</button></div>`}
    ${S.sel.size ? `<div class="bulk"><b>${S.sel.size} selected</b><div class="spacer" style="flex:1"></div>
      <button class="btn sm" data-act="bulkEnroll">${ic('seq')}Enroll in sequence</button><button class="btn sm" data-act="bulkTag">${ic('tag')}Add tag</button><button class="btn sm" data-act="bulkOwner">Assign owner</button><button class="btn sm" data-act="bulkDel">${ic('trash')}Delete</button><button class="btn sm" data-act="selNone">Clear</button></div>` : ''}`
  };
};
INPUT.cq = (d, t) => { S.f.q = t.value; renderMain(); };
CHANGE.cf = (d, t) => { S.f[d.k] = t.value; S.sel.clear(); renderMain(); };
ACT.sel = (d, t) => { t.checked ? S.sel.add(d.id) : S.sel.delete(d.id); renderMain(); };
ACT.selAll = (d, t) => { (S._visible || []).forEach(id => t.checked ? S.sel.add(id) : S.sel.delete(id)); renderMain(); };
ACT.selNone = () => { S.sel.clear(); renderMain(); };
ACT.bulkEnroll = () => enrollModal(Array.from(S.sel));
ACT.bulkTag = () => openModal({
  title: 'Add a tag to ' + plural(S.sel.size, 'contact'), body: `<label class="f"><span>Tag</span><input type="text" name="tag" list="tagList"></label><datalist id="tagList">${Array.from(new Set(list('contacts').reduce((a, c) => a.concat(c.tags || []), []))).map(t => `<option value="${esc(t)}">`).join('')}</datalist><div class="hint">Workflows triggered by this tag will run for each contact.</div>`,
  submit: async o => { if (!o.tag) return false; for (const id of S.sel) await addTag(id, o.tag); toast('Tagged ' + plural(S.sel.size, 'contact')); S.sel.clear(); renderMain(); }
});
ACT.bulkOwner = () => openModal({
  title: 'Assign owner', body: `<label class="f"><span>Owner</span><select name="owner">${teamOpts('')}</select></label>`,
  submit: async o => { for (const id of S.sel) await store.update('contacts', id, { owner: o.owner, updatedAt: Date.now() }); S.sel.clear(); renderMain(); }
});
ACT.bulkDel = async () => {
  if (!await ask('Delete ' + plural(S.sel.size, 'contact') + '? Their timeline stays in the log but the records are removed.')) return;
  for (const id of S.sel) { await stopAllFor(id, 'Contact deleted'); await store.remove('contacts', id); }
  S.sel.clear(); renderMain(); toast('Deleted');
};
ACT.exportCsv = () => {
  const cols = ['firstName', 'lastName', 'email', 'phone', 'title', 'companyName', 'owner', 'source', 'status', 'tags', 'createdAt'];
  const rows = [cols.join(',')].concat(list('contacts').map(c => cols.map(k => {
    let v = k === 'tags' ? (c.tags || []).join('; ') : k === 'createdAt' ? (c.createdAt ? new Date(c.createdAt).toISOString().slice(0, 10) : '') : (c[k] || '');
    return '"' + String(v).replace(/"/g, '""') + '"';
  }).join(',')));
  downloadFile('phillips-crm-contacts-' + toDateInput(Date.now()) + '.csv', rows.join('\n'), 'text/csv');
};

function contactForm(c = {}) {
  return `<div class="grid2">
    <label class="f"><span>First name</span><input type="text" name="firstName" value="${esc(c.firstName)}"></label>
    <label class="f"><span>Last name</span><input type="text" name="lastName" value="${esc(c.lastName)}"></label>
    <label class="f"><span>Email</span><input type="email" name="email" value="${esc(c.email)}"></label>
    <label class="f"><span>Phone</span><input type="tel" name="phone" value="${esc(c.phone)}"></label>
    <label class="f"><span>Company</span><input type="text" name="companyName" list="coList" value="${esc(c.companyName)}"></label>
    <label class="f"><span>Title</span><input type="text" name="title" value="${esc(c.title)}"></label>
    <label class="f"><span>Owner</span><select name="owner">${teamOpts(c.id ? c.owner : (c.owner || meName()))}</select></label>
    <label class="f"><span>Source</span><select name="source">${opt('', 'Unknown', c.source)}${sources().map(s => opt(s, s, c.source)).join('')}</select></label>
  </div><datalist id="coList">${list('companies').map(x => `<option value="${esc(x.name)}">`).join('')}</datalist>
  <label class="f"><span>Tags</span><input type="text" name="tags" value="${esc((c.tags || []).join(', '))}" placeholder="e.g. STR investor, cost seg"><div class="hint" style="margin-top:4px">Comma separated. New tags can trigger workflows.</div></label>
  ${c.id ? `<label class="f"><span>Email status</span><select name="status">${opt('active', 'Active', c.status || 'active')}${opt('unsubscribed', 'Unsubscribed (no automated email)', c.status)}${opt('bounced', 'Bounced', c.status)}</select></label>` : ''}`;
}
ACT.newContact = d => openModal({
  title: 'New contact', body: contactForm({ companyName: d.company ? (byId('companies', d.company) || {}).name : '' }),
  submit: async o => { if (!o.email && !o.firstName && !o.lastName) { toast('Add a name or email', 'error'); return false; } const id = await saveContact(o); toast('Contact added'); openDrawer('contact', id); }
});
ACT.editContact = d => { const c = byId('contacts', d.id); openModal({ title: 'Edit contact', body: contactForm(c), submit: async o => { await saveContact(o, c.id); toast('Saved'); } }); };
ACT.delContact = async d => {
  const c = byId('contacts', d.id); if (!await ask('Delete ' + fullName(c) + '?')) return;
  await stopAllFor(c.id, 'Contact deleted'); await store.remove('contacts', c.id); S.drawer = null; schedule(false); toast('Deleted');
};
SUBMIT.tag = async (o, f) => { await addTag(f.dataset.contact, o.tag); f.reset(); };
ACT.rmTag = d => removeTag(d.id, d.tag);
SUBMIT.note = async (o, f) => {
  if (!o.body) return;
  const touch = o.type === 'call' || o.type === 'meeting';
  await logAct({ type: touch ? 'contact' : 'note', channel: touch ? o.type : null, contactId: f.dataset.contact || null, dealId: f.dataset.deal || null, clientId: f.dataset.client || null, body: o.body });
  f.reset(); toast(touch ? (o.type === 'call' ? 'Call' : 'Meeting') + ' logged' : 'Note saved');
};
function noteBox(attrs, key) {
  return `<div class="card"><div class="bd"><form data-submit="note" ${attrs}><textarea name="body" data-keep="${key}" placeholder="Add a note or log a call" style="min-height:62px"></textarea>
    <div class="row" style="margin-top:8px;justify-content:flex-end"><select name="type" style="width:auto">${opt('note', 'Note')}${opt('call', 'Call')}${opt('meeting', 'Meeting')}</select><button class="btn sm primary">Save</button></div></form></div></div>`;
}
function emailStatusLabel(e) {
  return { active: 'blue', replied: 'green', completed: 'gold', stopped: '', error: 'red', unsubscribed: 'red', bounced: 'amber' }[e.status];
}
DRAWERS.contact = c => {
  const co = byId('companies', c.companyId);
  const deals = list('deals').filter(d => d.contactId === c.id);
  const ens = list('enrollments').filter(e => e.contactId === c.id).sort((a, b) => b.startedAt - a.startedAt);
  const tasks = list('tasks').filter(t => t.contactId === c.id && !t.done);
  const acts = list('activities').filter(a => a.contactId === c.id).sort((a, b) => b.at - a.at).slice(0, 100);
  const pend = list('jobs').filter(j => j.contactId === c.id && j.status === 'pending');
  return `<div class="dh"><span class="avatar lg">${initials(fullName(c))}</span><div style="min-width:0"><h2>${esc(fullName(c))}</h2>
    <div class="sub">${[c.title, co ? co.name : c.companyName].filter(Boolean).map(esc).join(' at ')}</div><div style="margin-top:6px">${statusPill(c)}</div></div>
    <button class="x" data-act="closeDrawer">×</button></div>
  <div class="acts">
    <button class="btn sm primary" data-act="emailContact" data-id="${c.id}">${ic('mail')}Email</button>
    <button class="btn sm" data-act="enrollOne" data-id="${c.id}">${ic('seq')}Enroll</button>
    <button class="btn sm" data-act="newTask" data-contact="${c.id}">${ic('check')}Task</button>
    <button class="btn sm" data-act="newDeal" data-contact="${c.id}">${ic('kanban')}Deal</button>
    ${clientOf(c.id) ? '' : `<button class="btn sm gold" data-act="newClient" data-contact="${c.id}">${ic('client')}Make client</button>`}
    <button class="btn sm" data-act="editContact" data-id="${c.id}">Edit</button>
    <button class="btn sm ghost danger" data-act="delContact" data-id="${c.id}">${ic('trash')}</button>
  </div>
  <div class="db">
    ${(cl => cl ? `<div class="card clientlink" data-act="openClient" data-id="${cl.id}"><div class="bd row">${ic('client')}<div style="flex:1"><b>${esc(cl.name)}</b> ${tierPill(cl.tier)}<div class="sub">Client · last contact ${daysAgo(lastContact(cl)).toLowerCase()} · ${esc(checkinText(checkin(cl)))}</div></div><span class="sub">Open →</span></div></div>` : '')(clientOf(c.id))}
    ${noteBox('data-contact="' + c.id + '" data-client="' + ((clientOf(c.id) || {}).id || '') + '"', 'note-' + c.id)}
    <div class="card"><div class="hd"><h3>Details</h3></div><div class="bd"><dl class="kv">
      <dt>Email</dt><dd>${c.email ? `<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : '—'}</dd>
      <dt>Phone</dt><dd>${c.phone ? `<a href="tel:${esc(c.phone)}">${esc(c.phone)}</a>` : '—'}</dd>
      <dt>Company</dt><dd>${co ? `<a href="#" data-act="openCompany" data-id="${co.id}">${esc(co.name)}</a>` : esc(c.companyName || '—')}</dd>
      <dt>Owner</dt><dd>${esc(c.owner || 'Unassigned')}</dd><dt>Source</dt><dd>${esc(c.source || '—')}</dd>
      <dt>Created</dt><dd>${fmtDate(c.createdAt)}${c.createdBy ? ' by ' + esc(c.createdBy) : ''}</dd>
      <dt>Last emailed</dt><dd>${c.lastEmailedAt ? ago(c.lastEmailedAt) : 'Never'}</dd></dl>
      <div class="secthd" style="margin-top:14px">Tags</div>
      <div>${(c.tags || []).map(t => `<span class="tag">${esc(t)}<button data-act="rmTag" data-id="${c.id}" data-tag="${esc(t)}" title="Remove">×</button></span>`).join('') || '<span class="muted">No tags</span>'}</div>
      <form data-submit="tag" data-contact="${c.id}" class="row" style="margin-top:8px"><input type="text" name="tag" data-keep="tag-${c.id}" placeholder="Add a tag and press Enter"></form>
    </div></div>
    <div class="card"><div class="hd"><h3>Deals</h3><button class="btn sm ghost" data-act="newDeal" data-contact="${c.id}">${ic('plus')}</button></div>
      ${deals.length ? deals.map(d => `<div class="taskrow" style="cursor:pointer" data-act="openDeal" data-id="${d.id}"><div style="flex:1"><div class="tt">${esc(d.name)}</div><div class="sub">${esc(stageOf(d.stage).name)}</div></div><b>${money(d.amount)}</b></div>`).join('') : '<div class="bd muted">No deals</div>'}</div>
    <div class="card"><div class="hd"><h3>Sequences & scheduled email</h3></div>
      ${ens.length || pend.length ? ens.map(e => {
        const seq = byId('sequences', e.sequenceId), n = seq ? (seq.steps || []).length : '?';
        return `<div class="taskrow"><div style="flex:1"><div class="tt">${esc(e.sequenceName)}</div><div class="sub">${e.status === 'active' ? 'Step ' + Math.min(e.stepIndex + 1, n) + ' of ' + n + ' sends ' + ago(e.nextSendAt) : esc(e.status) + (e.stopReason ? ': ' + esc(e.stopReason) : '') + ' · ' + ago(e.endedAt || e.startedAt)}</div></div>
        <span class="pill ${emailStatusLabel(e)}">${esc(e.status)}</span>${e.status === 'active' ? `${LOCAL ? `<button class="btn sm" data-act="runEnNow" data-id="${e.id}" title="Send the next email now (preview)">Run now</button>` : ''}<button class="btn sm" data-act="markReplied" data-id="${e.id}" title="They replied">Replied</button><button class="btn sm" data-act="stopEn" data-id="${e.id}">Stop</button>` : ''}</div>`;
      }).join('') + pend.map(j => `<div class="taskrow"><div style="flex:1"><div class="tt">${esc(jobLabel(j))}</div><div class="sub">Scheduled ${fmtDT(j.runAt)}${j.workflowName ? ' by workflow ' + esc(j.workflowName) : ''}</div></div><button class="btn sm" data-act="cancelJob" data-id="${j.id}">Cancel</button></div>`).join('') : '<div class="bd muted">Not in any sequence</div>'}</div>
    <div class="card"><div class="hd"><h3>Open tasks</h3><button class="btn sm ghost" data-act="newTask" data-contact="${c.id}">${ic('plus')}</button></div>${tasks.length ? tasks.map(taskRow).join('') : '<div class="bd muted">None</div>'}</div>
    <div class="card"><div class="hd"><h3>Timeline</h3></div><div class="bd feed">${acts.length ? acts.map(a => feedItem(a, false)).join('') : '<div class="muted">No activity yet.</div>'}</div></div>
  </div>`;
};
ACT.stopEn = async d => { if (await ask('Remove from this sequence? No more emails will send.')) await stopEnrollment(d.id); };
ACT.cancelJob = async d => { await store.update('jobs', d.id, { status: 'cancelled', doneAt: Date.now(), dueAt: null, result: 'Cancelled by ' + meName() }); toast('Cancelled'); };

ACT.emailContact = async d => {
  const c = byId('contacts', d.id);
  if (!c.email) return toast('This contact has no email address', 'error');
  if (c.status === 'unsubscribed' && !await ask(fullName(c) + ' unsubscribed from automated email. Send a personal email anyway?')) return;
  if (LOCAL) return localEmailModal(c);
  const tpls = list('templates').slice().sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  openModal({
    title: 'Email ' + fullName(c), wide: true,
    body: `<label class="f"><span>Start from a template</span><select data-change="pickTpl">${opt('', 'Blank email')}${tpls.map(t => opt(t.id, t.name)).join('')}</select></label>
      <label class="f"><span>To</span><input type="text" value="${esc(c.email)}" disabled></label>
      <label class="f"><span>Subject</span><input type="text" name="subject" data-merge></label>${chips()}
      <label class="f"><span>Message</span><textarea name="body" data-merge style="min-height:220px"></textarea></label>
      <div class="grid2"><label class="f"><span>Send</span><select name="when" data-change="whenSel">${opt('now', 'As soon as possible')}${opt('later', 'Schedule for later')}</select></label>
      <label class="f" id="whenAt" style="visibility:hidden"><span>Send at</span><input type="datetime-local" name="at" value="${toDTInput(Date.now() + DAY)}"></label></div>
      <div class="hint">Goes out from the engine's Gmail account within about 5 minutes, with your signature added. It will show in the timeline once sent.</div>`,
    foot: `<button type="button" class="btn" data-act="closeModal">Cancel</button><button class="btn primary">${ic('send')}Queue email</button>`,
    submit: async o => {
      if (!o.subject) { toast('Add a subject', 'error'); return false; }
      const runAt = o.when === 'later' && o.at ? new Date(o.at).getTime() : Date.now();
      await queueEmail(c.id, { subject: o.subject, body: $('#mform').elements.body.value, runAt });
      toast(runAt > Date.now() + 60000 ? 'Scheduled for ' + fmtDT(runAt) : 'Queued to send');
    }
  });
};
CHANGE.pickTpl = (d, t) => { const tp = byId('templates', t.value), f = $('#mform'); if (tp) { f.elements.subject.value = tp.subject || ''; f.elements.body.value = tp.body || ''; } };
CHANGE.whenSel = (d, t) => { $('#whenAt').style.visibility = t.value === 'later' ? 'visible' : 'hidden'; };
ACT.enrollOne = d => enrollModal([d.id]);
function enrollModal(ids) {
  const seqs = list('sequences').filter(s => !s.paused);
  if (!seqs.length) { toast('Create a sequence first (Automation > Sequences)', 'error'); return; }
  const who = ids.length > 1 ? plural(ids.length, 'contact') : fullName(byId('contacts', ids[0]));
  openModal({
    title: 'Enroll ' + who,
    body: `<div class="secthd">Choose a sequence</div>${seqs.map((s, i) => `<label class="check" style="align-items:flex-start;padding:10px;border:1px solid var(--line);border-radius:8px"><input type="radio" name="seq" value="${s.id}" ${i ? '' : 'checked'}><div><b>${esc(s.name)}</b><div class="hint">${plural((s.steps || []).length, 'email')} over ${(s.steps || []).reduce((a, st) => a + (Number(st.delayDays) || 0), 0)} days${s.stopOnReply !== false ? ' · stops on reply' : ''}</div></div></label>`).join('')}
      <div class="hint">Contacts who are unsubscribed, bounced, or already in the sequence are skipped. The first email goes out on the next engine run.</div>`,
    foot: `<button type="button" class="btn" data-act="closeModal">Cancel</button><button class="btn primary">${ic('seq')}Enroll</button>`,
    submit: async o => { await enroll(ids, o.seq); S.sel.clear(); schedule(false); }
  });
}

/* ================= COMPANIES ================= */
function dealSplit(d) { const fee = feeOf(d); return fee ? { cash: fee.cash, eq: fee.equity } : { cash: +d.amount || 0, eq: 0 }; }
VIEWS.companies = () => {
  const q = norm(S.f.q);
  let cos = list('companies').slice().sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  if (q) cos = cos.filter(c => [c.name, c.domain, c.industry].some(x => norm(x).includes(q)));
  const cc = {}, m = {};
  list('contacts').forEach(c => { if (c.companyId) cc[c.companyId] = (cc[c.companyId] || 0) + 1; });
  cos.forEach(c => {
    const ds = dealsForCompany(c), open = ds.filter(d => stageKind(d.stage) === 'open');
    const x = { n: open.length, cash: 0, eq: 0, held: 0 };
    open.forEach(d => { const sp = dealSplit(d); x.cash += sp.cash; x.eq += sp.eq; });
    ds.forEach(d => { if (d.equity && (d.equity.status === 'pending' || d.equity.status === 'issued')) x.held += +d.equity.estValue || 0; });
    m[c.id] = x;
  });
  const T = cos.reduce((a, c) => { const x = m[c.id]; a.n += x.n; a.cash += x.cash; a.eq += x.eq; a.held += x.held; return a; }, { n: 0, cash: 0, eq: 0, held: 0 });
  const num = (v, cls) => v ? `<span class="${cls || ''}">${money(v)}</span>` : '<span class="faint">—</span>';
  return {
    title: 'Companies', actions: `<button class="btn primary" data-act="newCompany">${ic('plus')}New company</button>`,
    body: `<div class="toolbar"><input type="search" class="search" placeholder="Search companies" data-keep="cq" data-input="cq" value="${esc(S.f.q)}"><span class="muted">${plural(cos.length, 'company').replace('companys', 'companies')}</span></div>
    ${cos.length ? `<div class="pipesum card"><div><div class="l">Open pipeline</div><div class="v">${money(T.cash + T.eq)}</div><div class="sub">${plural(T.n, 'open deal')}</div></div>
      <div><div class="l"><i class="kdot cashc"></i>Cash</div><div class="v">${money(T.cash)}</div><div class="sub">paid at closing</div></div>
      <div><div class="l"><i class="kdot eqc"></i>Equity</div><div class="v eqc-t">${money(T.eq)}</div><div class="sub">received as ownership</div></div>
      <div><div class="l">Equity held</div><div class="v">${money(T.held)}</div><div class="sub">est. value of closed stakes</div></div>
      ${T.cash + T.eq ? `<div class="splitbar" title="${money(T.cash)} cash · ${money(T.eq)} equity"><span class="cashc" style="width:${T.cash / (T.cash + T.eq) * 100}%"></span><span class="eqc" style="width:${T.eq / (T.cash + T.eq) * 100}%"></span></div>` : ''}</div>
    <div class="card tblwrap"><table class="tbl"><thead><tr><th>Company</th><th class="hide-m">Industry</th><th class="hide-m">Contacts</th><th style="text-align:right">Open deals</th><th style="text-align:right"><i class="kdot cashc"></i>Pipeline cash</th><th style="text-align:right"><i class="kdot eqc"></i>Pipeline equity</th><th class="hide-m" style="text-align:right">Equity held</th></tr></thead><tbody>
    ${cos.map(c => { const x = m[c.id]; return `<tr class="click" data-act="openCompany" data-id="${c.id}"><td><div class="name">${esc(c.name)}${c.advisory && c.advisory.active !== false ? ` <span class="pill gold">Advisory · ${esc(c.advisory.bps)} bps</span>` : ''}</div><div class="sub">${esc(c.domain || '')}</div></td><td class="hide-m">${esc(c.industry || '')}</td><td class="hide-m">${cc[c.id] || 0}</td>
      <td style="text-align:right">${x.n || '<span class="faint">0</span>'}</td><td class="numc">${num(x.cash)}</td><td class="numc">${num(x.eq, 'eqc-t')}</td><td class="numc hide-m">${num(x.held)}</td></tr>`; }).join('')}
    </tbody><tfoot><tr><td>Total</td><td class="hide-m"></td><td class="hide-m"></td><td style="text-align:right">${T.n}</td><td class="numc">${money(T.cash)}</td><td class="numc eqc-t">${money(T.eq)}</td><td class="numc hide-m">${money(T.held)}</td></tr></tfoot></table></div>` : `<div class="card empty"><h4>No companies yet</h4><p>Companies are created automatically when you add a contact with a company name.</p></div>`}`
  };
};
function companyForm(c = {}) {
  return `<label class="f"><span>Name</span><input type="text" name="name" value="${esc(c.name)}" required></label>
  <div class="grid2"><label class="f"><span>Website / domain</span><input type="text" name="domain" value="${esc(c.domain)}"></label>
  <label class="f"><span>Industry</span><input type="text" name="industry" value="${esc(c.industry)}"></label>
  <label class="f"><span>Phone</span><input type="tel" name="phone" value="${esc(c.phone)}"></label>
  <label class="f"><span>City / state</span><input type="text" name="location" value="${esc(c.location)}"></label></div>
  <label class="f"><span>Notes</span><textarea name="notes">${esc(c.notes)}</textarea></label>`;
}
ACT.newCompany = () => openModal({ title: 'New company', body: companyForm(), submit: async o => { const id = await store.add('companies', Object.assign(o, { createdAt: Date.now(), updatedAt: Date.now() })); openDrawer('company', id); } });
ACT.editCompany = d => openModal({
  title: 'Edit company', body: companyForm(byId('companies', d.id)),
  submit: async o => {
    o.updatedAt = Date.now(); await store.update('companies', d.id, o);
    for (const c of list('contacts').filter(c => c.companyId === d.id)) if (c.companyName !== o.name) await store.update('contacts', c.id, { companyName: o.name });
  }
});
ACT.delCompany = async d => {
  if (!await ask('Delete this company? Contacts stay but lose the link.')) return;
  for (const c of list('contacts').filter(c => c.companyId === d.id)) await store.update('contacts', c.id, { companyId: null });
  await store.remove('companies', d.id); S.drawer = null; schedule(false);
};
DRAWERS.company = co => {
  const cs = list('contacts').filter(c => c.companyId === co.id), ids = new Set(cs.map(c => c.id));
  const deals = dealsForCompany(co);
  const acts = list('activities').filter(a => ids.has(a.contactId)).sort((a, b) => b.at - a.at).slice(0, 50);
  return `<div class="dh"><span class="avatar lg">${ic('building').replace('<svg', '<svg width="20" height="20"')}</span><div><h2>${esc(co.name)}</h2><div class="sub">${esc([co.industry, co.location].filter(Boolean).join(' · '))}</div></div><button class="x" data-act="closeDrawer">×</button></div>
  <div class="acts"><button class="btn sm" data-act="newContact" data-company="${co.id}">${ic('plus')}Contact</button><button class="btn sm" data-act="editCompany" data-id="${co.id}">Edit</button><button class="btn sm ghost danger" data-act="delCompany" data-id="${co.id}">${ic('trash')}</button></div>
  <div class="db">
    <div class="card"><div class="bd"><dl class="kv"><dt>Website</dt><dd>${co.domain ? `<a href="${esc(/^https?:/.test(co.domain) ? co.domain : 'https://' + co.domain)}" target="_blank" rel="noopener">${esc(co.domain)}</a>` : '—'}</dd><dt>Phone</dt><dd>${esc(co.phone || '—')}</dd><dt>Notes</dt><dd style="white-space:pre-wrap">${esc(co.notes || '—')}</dd></dl></div></div>
    ${advisoryCard(co)}
    ${companyRevenueCard(co)}
    <div class="card"><div class="hd"><h3>Contacts (${cs.length})</h3></div>${cs.map(c => `<div class="taskrow" style="cursor:pointer" data-act="openContact" data-id="${c.id}"><span class="avatar">${initials(fullName(c))}</span><div style="flex:1"><div class="tt">${esc(fullName(c))}</div><div class="sub">${esc(c.title || c.email || '')}</div></div></div>`).join('') || '<div class="bd muted">None</div>'}</div>
    ${dealsCard(deals, 'data-company="' + co.id + '"')}
    <div class="card"><div class="hd"><h3>Activity</h3></div><div class="bd feed">${acts.map(a => feedItem(a, true)).join('') || '<div class="muted">None</div>'}</div></div>
  </div>`;
};

/* ================= DEALS ================= */
function dealCard(d) {
  const c = byId('contacts', d.contactId), cl = byId('clients', d.clientId), co = byId('companies', d.companyId), fee = feeOf(d);
  const who = isCompanyDeal(d)
    ? (co ? ic('building').replace('<svg', '<svg width="11" height="11" style="vertical-align:-1px;color:var(--gold-2)"') + ' ' + esc(co.name) : esc(c ? fullName(c) : 'No company'))
    : (cl ? ic('client').replace('<svg', '<svg width="11" height="11" style="vertical-align:-1px;color:var(--gold-2)"') + ' ' + esc(cl.name) : esc(co ? co.name : c ? fullName(c) : 'No contact'));
  const amtLine = fee ? `<span class="amt">${money(fee.cash)}</span> <span class="eqc-t" style="font-weight:600">+ ${money(fee.equity)} eq</span>` : `<span class="amt">${money(d.amount)}</span>`;
  return `<div class="dcard" draggable="true" data-id="${d.id}" data-act="openDeal"><div class="dn">${esc(d.name)}</div><div class="sub">${who}</div>
    ${fee ? `<div class="sub" style="margin-top:3px">${money(fee.pv)} project · ${esc(fee.bps)} bps</div>` : ''}
    <div class="dm"><span>${amtLine}</span><span>${esc(d.owner || '')} · ${ago(d.stageChangedAt).replace(' ago', '')}</span></div></div>`;
}
function boardColumns(stageList, ds) {
  return `<div class="board${stageList.length <= 3 ? ' wide3' : ''}">${stageList.map(s => {
    const cards = ds.filter(d => shownStage(d) === s.id).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    const sp = cards.reduce((a, d) => { const x = dealSplit(d); a.cash += x.cash; a.eq += x.eq; return a; }, { cash: 0, eq: 0 });
    return `<div class="colm ${s.kind || ''}" data-stage="${esc(s.id)}"><div class="ch"><div class="n"><span>${esc(s.name)}</span><span class="muted">${cards.length}</span></div><div class="t">${money(sp.cash)}${sp.eq ? ` <span class="eqc-t">+ ${money(sp.eq)} equity</span>` : ''}</div></div>
      <div class="cards">${cards.map(dealCard).join('')}</div></div>`;
  }).join('')}</div>`;
}
VIEWS.deals = () => {
  const f = S.f, tab = f.dealTab || 'client';
  let all = list('deals');
  if (f.owner) all = all.filter(d => d.owner === f.owner);
  const q = norm(f.q);
  if (q) all = all.filter(d => [d.name, fullName(byId('contacts', d.contactId)), (byId('clients', d.clientId) || {}).name, (byId('companies', d.companyId) || {}).name].some(x => norm(x).includes(q)));
  const coDeals = all.filter(isCompanyDeal), clDeals = all.filter(d => !isCompanyDeal(d));
  const sum = ds => { const o = ds.filter(d => stageKind(d.stage) === 'open'); const sp = o.reduce((a, d) => { const x = dealSplit(d); a.cash += x.cash; a.eq += x.eq; return a; }, { cash: 0, eq: 0 }); return { n: o.length, cash: sp.cash, eq: sp.eq }; };
  const sc = sum(clDeals), sco = sum(coDeals);
  const tabBtn = (k, label, s) => `<button class="dtab${tab === k ? ' on' : ''}" data-act="dealTab" data-v="${k}"><span class="dtl">${ic(k === 'client' ? 'client' : 'building')}${label}</span><span class="dts">${plural(s.n, 'open deal')} · ${money(s.cash)}${s.eq ? ` <span class="eqc-t">+ ${money(s.eq)} equity</span>` : ''}</span></button>`;
  return {
    title: 'Deals', actions: `<button class="btn primary" data-act="newDeal" data-pipeline="${tab}">${ic('plus')}New ${tab === 'company' ? 'company' : 'client'} deal</button>`,
    body: `<div class="dtabs">${tabBtn('client', 'Client deals', sc)}${tabBtn('company', 'Company deals', sco)}</div>
    <div class="toolbar"><input type="search" class="search" placeholder="Search deals, clients, companies" data-keep="cq" data-input="cq" value="${esc(f.q)}">
      <select data-change="cf" data-k="owner">${opt('', 'All owners', f.owner)}${team().map(t => opt(t.name, t.name, f.owner)).join('')}</select>
      <span class="hint hide-m">${tab === 'company' ? 'Company projects are Open until they close. Moving one to Closed invoices the cash fee and tracks the equity.' : 'Drag cards between stages. Stage changes can trigger workflows.'}</span></div>
    ${tab === 'company' ? boardColumns(COMPANY_STAGES, coDeals) : boardColumns(stages(), clDeals)}`
  };
};
ACT.dealTab = d => { S.f.dealTab = d.v; renderMain(); };
function contactOpts(sel) { return opt('', 'No contact', sel) + list('contacts').slice().sort((a, b) => fullName(a).localeCompare(fullName(b))).map(c => opt(c.id, fullName(c) + (c.email ? ' · ' + c.email : ''), sel)).join(''); }
function stageOptions(company, sel) { const l = company ? COMPANY_STAGES : stages(); const v = sel ? mapStage(sel, company) : l[0].id; return l.map(s => opt(s.id, s.name, v)).join(''); }
CHANGE.dealPipeline = (d, t) => { const sel = $('#dealStageSel'); if (sel) sel.innerHTML = stageOptions(t.value === 'company', sel.value); };
function dealForm(d = {}) {
  const isCo = isCompanyDeal(d);
  return `<div class="segpick"><label><input type="radio" name="pipeline" value="client" data-change="dealPipeline" ${isCo ? '' : 'checked'}><span>${ic('client')}Client deal</span></label><label><input type="radio" name="pipeline" value="company" data-change="dealPipeline" ${isCo ? 'checked' : ''}><span>${ic('building')}Company deal</span></label></div>
  <label class="f"><span>Deal name</span><input type="text" name="name" value="${esc(d.name)}" placeholder="e.g. Hale family: cost seg + entity review" required></label>
  <div class="grid2"><label class="f"><span>Client</span><select name="clientId" data-change="dealClient">${opt('', 'Not a client (yet)', d.clientId)}${list('clients').slice().sort((a, b) => (a.name || '').localeCompare(b.name || '')).map(x => opt(x.id, x.name, d.clientId)).join('')}</select></label>
  <label class="f"><span>Company</span><select name="companyId" data-change="dealCompany">${opt('', 'None', d.companyId)}${list('companies').slice().sort((a, b) => (a.name || '').localeCompare(b.name || '')).map(x => opt(x.id, x.name, d.companyId)).join('')}</select></label>
  <label class="f"><span>Contact</span><select name="contactId" data-change="dealContact">${contactOpts(d.contactId)}</select></label>
  <label class="f" style="${d.fee && d.fee.structure === 'bps' ? 'display:none' : ''}"><span>Amount (fee)</span><input type="text" name="amount" inputmode="decimal" value="${d.amount ? esc(d.amount) : ''}" placeholder="0"></label>
  <label class="f"><span>Stage</span><select name="stage" id="dealStageSel">${stageOptions(isCompanyDeal(d), d.stage)}</select></label>
  <label class="f"><span>Owner</span><select name="owner">${teamOpts(d.id ? d.owner : (d.owner || meName()))}</select></label>
  <label class="f"><span>Expected close</span><input type="date" name="closeDate" value="${toDateInput(d.closeDate)}"></label></div>
  ${feeFormSection(d)}
  <label class="f"><span>Description</span><textarea name="description">${esc(d.description)}</textarea></label>`;
}
CHANGE.dealContact = (d, t) => {
  const f = $('#mform'), c = byId('contacts', t.value); if (!f || !c) return;
  if (!f.elements.companyId.value && c.companyId) f.elements.companyId.value = c.companyId;
  const cl = clientOf(c.id); if (!f.elements.clientId.value && cl) f.elements.clientId.value = cl.id;
};
CHANGE.dealClient = (d, t) => {
  const f = $('#mform'), cl = byId('clients', t.value); if (!f || !cl) return;
  const pc = byId('contacts', (cl.contactIds || [])[0]);
  if (!f.elements.contactId.value && pc) f.elements.contactId.value = pc.id;
  if (!f.elements.companyId.value && pc && pc.companyId) f.elements.companyId.value = pc.companyId;
};
ACT.newDeal = d => {
  const cl = byId('clients', d.client), co = byId('companies', d.company);
  const c = byId('contacts', d.contact) || (cl && byId('contacts', (cl.contactIds || [])[0])) || (co && list('contacts').find(x => x.companyId === co.id)) || null;
  const pre = { contactId: c ? c.id : '', clientId: cl ? cl.id : (c && clientOf(c.id) ? clientOf(c.id).id : ''), companyId: co ? co.id : (c && c.companyId) || '', name: (cl ? cl.name : co ? co.name : c ? fullName(c) : '') ? (cl ? cl.name : co ? co.name : fullName(c)) + ': ' : '' };
  const adv = co && co.advisory && co.advisory.active !== false ? co.advisory : null;
  if (adv) pre.fee = { structure: 'bps', bps: adv.bps, cashPct: adv.cashPct };
  pre.pipeline = d.pipeline || (co && !cl ? 'company' : 'client');
  if (pre.pipeline === 'company') pre.stage = 'co_open';
  openModal({ title: 'New deal' + (cl ? ' for ' + cl.name : co ? ' for ' + co.name : ''), body: dealForm(pre), wide: true, onMount: () => { const cb = $('#mform').elements.followAgreement; if (cb) applyAgree(cb); INPUT.feeCalc(); }, submit: async o => { if (!o.name) return false; const id = await saveDeal(o); toast('Deal created'); openDrawer('deal', id); } });
};
ACT.editDeal = d => openModal({ title: 'Edit deal', wide: true, onMount: () => { const cb = $('#mform').elements.followAgreement; if (cb) applyAgree(cb); INPUT.feeCalc(); }, body: dealForm(byId('deals', d.id)), submit: async o => { await saveDeal(o, d.id); toast('Saved'); } });
ACT.delDeal = async d => { if (!await ask('Delete this deal?')) return; await store.remove('deals', d.id); S.drawer = null; schedule(false); };
CHANGE.dealStage = (d, t) => moveDeal(d.id, t.value);
DRAWERS.deal = d => {
  const c = byId('contacts', d.contactId);
  const acts = list('activities').filter(a => a.dealId === d.id).sort((a, b) => b.at - a.at);
  const tasks = list('tasks').filter(t => t.dealId === d.id && !t.done);
  return `<div class="dh"><span class="avatar lg">${ic('kanban').replace('<svg', '<svg width="20" height="20"')}</span><div style="min-width:0"><h2>${esc(d.name)}</h2><div class="sub">${money(d.amount)} · ${esc(d.owner || 'Unassigned')}</div></div><button class="x" data-act="closeDrawer">×</button></div>
  <div class="acts"><select data-change="dealStage" data-id="${d.id}" style="width:auto">${stagesFor(d).map(s => opt(s.id, s.name, shownStage(d))).join('')}</select><span class="pill ${isCompanyDeal(d) ? 'gold' : ''}">${isCompanyDeal(d) ? 'Company deal' : 'Client deal'}</span>
    ${c ? `<button class="btn sm" data-act="emailContact" data-id="${c.id}">${ic('mail')}Email</button>` : ''}
    <button class="btn sm" data-act="newTask" data-contact="${d.contactId || ''}" data-deal="${d.id}">${ic('check')}Task</button>
    ${c && stageKind(d.stage) === 'won' && !clientOf(c.id) && !d.clientId ? `<button class="btn sm gold" data-act="newClient" data-contact="${c.id}">${ic('client')}Make client</button>` : ''}
    <button class="btn sm" data-act="editDeal" data-id="${d.id}">Edit</button><button class="btn sm ghost danger" data-act="delDeal" data-id="${d.id}">${ic('trash')}</button></div>
  <div class="db">
    ${noteBox('data-deal="' + d.id + '" data-contact="' + (d.contactId || '') + '"', 'dnote-' + d.id)}
    <div class="card"><div class="bd"><dl class="kv">
      ${(cl => `<dt>Client</dt><dd>${cl ? `<a href="#" data-act="openClient" data-id="${cl.id}">${esc(cl.name)}</a> ${tierPill(cl.tier)}` : '—'}</dd>`)(byId('clients', d.clientId) || (c && clientOf(c.id)))}
      ${(co => `<dt>Company</dt><dd>${co ? `<a href="#" data-act="openCompany" data-id="${co.id}">${esc(co.name)}</a>` : '—'}</dd>`)(byId('companies', d.companyId))}
      <dt>Contact</dt><dd>${c ? `<a href="#" data-act="openContact" data-id="${c.id}">${esc(fullName(c))}</a>` : '—'}</dd>
      <dt>Stage</dt><dd>${esc(stageOf(shownStage(d)).name)} <span class="muted">since ${fmtDate(d.stageChangedAt)}</span></dd>
      <dt>Expected close</dt><dd>${fmtDate(d.closeDate)}</dd><dt>Created</dt><dd>${fmtDate(d.createdAt)}</dd>
      <dt>Description</dt><dd style="white-space:pre-wrap">${esc(d.description || '—')}</dd></dl></div></div>
    ${dealFeeCard(d)}
    ${dealRevenueCard(d)}
    <div class="card"><div class="hd"><h3>Open tasks</h3></div>${tasks.length ? tasks.map(taskRow).join('') : '<div class="bd muted">None</div>'}</div>
    <div class="card"><div class="hd"><h3>Timeline</h3></div><div class="bd feed">${acts.length ? acts.map(a => feedItem(a, false)).join('') : '<div class="muted">No activity yet.</div>'}</div></div>
  </div>`;
};

/* ---------- deals attached to clients & companies ---------- */
function dealsForClient(cl) {
  const ids = new Set(cl.contactIds || []);
  return list('deals').filter(d => d.clientId === cl.id || (!d.clientId && d.contactId && ids.has(d.contactId)));
}
function dealsForCompany(co) {
  const ids = new Set(list('contacts').filter(c => c.companyId === co.id).map(c => c.id));
  const cls = new Set(list('clients').filter(cl => (cl.contactIds || []).some(id => ids.has(id))).map(cl => cl.id));
  return list('deals').filter(d => d.companyId === co.id || (!d.companyId && ((d.contactId && ids.has(d.contactId)) || (d.clientId && cls.has(d.clientId)))));
}
function dealsCard(deals, attrs) {
  const open = deals.filter(d => stageKind(d.stage) === 'open').sort((a, b) => (+b.amount || 0) - (+a.amount || 0));
  const closed = deals.filter(d => stageKind(d.stage) !== 'open').sort((a, b) => (b.stageChangedAt || 0) - (a.stageChangedAt || 0));
  const won = closed.filter(d => stageKind(d.stage) === 'won');
  const row = d => {
    const c = byId('contacts', d.contactId), k = stageKind(d.stage);
    const got = list('revenue').filter(r => r.dealId === d.id && r.status === 'paid').reduce((a, r) => a + (+r.amount || 0), 0);
    return `<div class="taskrow" style="cursor:pointer" data-act="openDeal" data-id="${d.id}"><span class="sdot ${k === 'won' ? 's-implemented' : k === 'lost' ? '' : 'up'}"></span>
      <div style="flex:1;min-width:0"><div class="tt">${esc(d.name)}</div><div class="sub"><span class="pill ${k === 'won' ? 'green' : ''}">${esc(stageOf(shownStage(d)).name)}</span> ${c ? esc(fullName(c)) + ' · ' : ''}${esc(d.owner || '')}${k === 'open' && d.closeDate ? ' · close ' + fmtDate(d.closeDate) : k !== 'open' ? ' · ' + fmtDate(d.stageChangedAt) : ''}</div></div>
      <div style="text-align:right;white-space:nowrap"><b>${money(d.amount)}</b>${got ? `<div class="sub">${money(got)} collected</div>` : ''}</div></div>`;
  };
  return `<div class="card"><div class="hd"><h3>Deals</h3><div class="row" style="gap:10px"><span class="sub">${open.length} open · ${money(open.reduce((a, d) => a + (+d.amount || 0), 0))}${won.length ? ' · ' + won.length + ' signed' : ''}</span><button class="btn sm primary" data-act="newDeal" ${attrs}>${ic('plus')}Deal</button></div></div>
    ${open.map(row).join('') || '<div class="bd muted">No open deals.</div>'}
    ${closed.length ? `<details class="closed"><summary>Signed and lost (${closed.length})</summary>${closed.map(row).join('')}</details>` : ''}</div>`;
}

/* ================= TASKS ================= */
function taskRow(t) {
  const c = byId('contacts', t.contactId), od = t.due && !t.done && t.due < startOfDay();
  return `<div class="taskrow${t.done ? ' done' : ''}"><input type="checkbox" data-act="toggleTask" data-id="${t.id}" ${t.done ? 'checked' : ''}>
    <div style="flex:1;min-width:0;cursor:pointer" data-act="editTask" data-id="${t.id}"><div class="tt">${esc(t.title)}</div>
    <div class="sub">${c ? `<a href="#" data-act="openContact" data-id="${c.id}">${esc(fullName(c))}</a> · ` : ''}${t.due ? `<span style="${od ? 'color:var(--red);font-weight:600' : ''}">${od ? 'Overdue · ' : 'Due '}${fmtDate(t.due)}</span>` : 'No due date'}${t.assignee ? ' · ' + esc(t.assignee) : ''}${t.createdBy && /^Workflow/.test(t.createdBy) ? ' · ' + ic('zap').replace('<svg', '<svg width="11" height="11"') : ''}</div></div></div>`;
}
ACT.toggleTask = async (d, t) => { await store.update('tasks', d.id, { done: t.checked, doneAt: t.checked ? Date.now() : null }); };
function taskForm(t = {}) {
  return `<label class="f"><span>Task</span><input type="text" name="title" value="${esc(t.title)}" required></label>
  <div class="grid2"><label class="f"><span>Contact</span><select name="contactId">${contactOpts(t.contactId)}</select></label>
  <label class="f"><span>Assignee</span><select name="assignee">${teamOpts(t.id ? t.assignee : (t.assignee || meName()))}</select></label>
  <label class="f"><span>Due</span><input type="date" name="due" value="${toDateInput(t.due)}"></label></div>
  <label class="f"><span>Notes</span><textarea name="notes">${esc(t.notes)}</textarea></label>`;
}
ACT.newTask = d => openModal({
  title: 'New task', body: taskForm({ contactId: d.contact || '', due: startOfDay() + DAY + 9 * 3600000 }),
  submit: async o => { if (!o.title) return false; const c = byId('contacts', o.contactId); await store.add('tasks', { title: o.title, contactId: o.contactId || null, contactName: c ? fullName(c) : '', dealId: d.deal || null, clientId: d.client || null, assignee: o.assignee, due: fromDateInput(o.due), notes: o.notes, done: false, createdAt: Date.now(), createdBy: meName() }); toast('Task added'); }
});
ACT.editTask = d => {
  const t = byId('tasks', d.id);
  openModal({
    title: 'Edit task', body: taskForm(t), foot: `<button type="button" class="btn ghost danger" data-act="delTask" data-id="${t.id}" style="margin-right:auto">Delete</button><button type="button" class="btn" data-act="closeModal">Cancel</button><button class="btn primary">Save</button>`,
    submit: async o => { const c = byId('contacts', o.contactId); await store.update('tasks', t.id, { title: o.title, contactId: o.contactId || null, contactName: c ? fullName(c) : '', assignee: o.assignee, due: fromDateInput(o.due), notes: o.notes }); }
  });
};
ACT.delTask = async d => { await store.remove('tasks', d.id); closeModal(); };
VIEWS.tasks = () => {
  const a = S.f.assignee;
  let ts = list('tasks');
  if (a === 'me') ts = ts.filter(t => !t.assignee || t.assignee === meName()); else if (a) ts = ts.filter(t => t.assignee === a);
  const t0 = startOfDay(), t1 = t0 + DAY;
  const openT = ts.filter(t => !t.done).sort((x, y) => (x.due || 9e15) - (y.due || 9e15));
  const groups = [['Overdue', openT.filter(t => t.due && t.due < t0)], ['Today', openT.filter(t => t.due && t.due >= t0 && t.due < t1)], ['Upcoming', openT.filter(t => t.due && t.due >= t1)], ['No due date', openT.filter(t => !t.due)],
    ['Completed recently', ts.filter(t => t.done && (t.doneAt || 0) > Date.now() - 14 * DAY).sort((x, y) => y.doneAt - x.doneAt)]];
  return {
    title: 'Tasks', actions: `<button class="btn primary" data-act="newTask">${ic('plus')}New task</button>`,
    body: `<div class="toolbar"><select data-change="cf" data-k="assignee">${opt('me', 'My tasks', a)}${opt('', 'Everyone', a)}${team().map(t => opt(t.name, t.name, a)).join('')}</select><span class="muted">${plural(openT.length, 'open task')}</span></div>
    ${groups.filter(g => g[1].length).map(g => `<div class="secthd">${g[0]} (${g[1].length})</div><div class="card">${g[1].map(taskRow).join('')}</div>`).join('') || '<div class="card empty"><h4>Nothing on the list</h4><p>Tasks you create, or that workflows create, show up here.</p></div>'}`
  };
};
