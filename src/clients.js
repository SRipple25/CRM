/* ================= CLIENTS =================
   Households and people the firm is actively serving: tier, designations,
   strategies being implemented, work in progress/done, and check-in cadence. */
ICONS.client = '<path d="M12 3 4 6v6c0 4.5 3.4 8.2 8 9 4.6-.8 8-4.5 8-9V6z"/><path d="m9 12 2 2 4-4"/>';
const TIERS = [['platinum', 'Platinum'], ['gold', 'Gold'], ['silver', 'Silver'], ['special', 'Special']];
const STD_TIERS = TIERS.filter(t => t[0] !== 'special');
const TIER_RANK = { platinum: 0, gold: 1, silver: 2, special: 3 };
const DESIGNATIONS = [['reps', 'Real estate professional (REPS)', 'REPS'], ['str', 'Short-term rental (material participation)', 'STR'], ['bizowner', 'Business owner', 'Business owner'], ['w2', 'W-2 employee', 'W-2']];
const STRATEGY_PRESETS = ['Cost segregation', 'Short-term rental strategy', 'Real estate professional status', 'Entity structuring', 'Equipment rental program', 'Investment planning', 'Retirement plan design', 'Charitable planning'];
const WORK_PRESETS = ['Estate and will planning', 'Trust drafting', 'Company reorganization', 'Entity formation', 'Cost segregation study', 'Tax projection', 'Quarterly review', 'Engagement letter'];
const STRAT_STATUS = [['planned', 'Planned'], ['progress', 'In progress'], ['implemented', 'Implemented'], ['paused', 'On hold']];
const WORK_STATUS = [['todo', 'Not started'], ['progress', 'In progress'], ['done', 'Done']];
const CLIENT_STATUS = [['onboarding', 'Onboarding'], ['active', 'Active'], ['paused', 'Paused'], ['former', 'Former']];
const handledBy = () => [firmName(), 'Providence Law'];
const CHANNELS = { call: ['Call', 'phone'], meeting: ['Meeting', 'users'], email: ['Email', 'mail'], text: ['Text', 'phone'] };
const DEFAULT_CADENCE = { platinum: 30, gold: 45, silver: 60, special: 45 };
const lbl = (arr, v) => (arr.find(x => x[0] === v) || [v, v])[1];

function cadenceDays(tier) { const c = (S.settings.general || {}).cadence || {}; return Number(c[tier]) || DEFAULT_CADENCE[tier] || 60; }
function clientContacts(cl) { return (cl.contactIds || []).map(id => byId('contacts', id)).filter(Boolean); }
function clientOf(contactId) { return list('clients').find(cl => (cl.contactIds || []).includes(contactId)) || null; }
function lastContact(cl) {
  let t = cl.lastContactAt || 0;
  clientContacts(cl).forEach(c => { t = Math.max(t, c.lastContactAt || 0, c.lastEmailedAt || 0); });
  return t || null;
}
function checkin(cl) {
  const last = lastContact(cl), days = cadenceDays(cl.tier);
  const due = (last || cl.since || cl.createdAt || Date.now()) + days * DAY;
  const left = Math.ceil((due - Date.now()) / DAY);
  return { last, due, left, days, cls: left < 0 ? 'red' : left <= 7 ? 'amber' : 'green' };
}
function daysAgo(t) { if (!t) return 'Never'; const d = Math.round((startOfDay() - startOfDay(t)) / DAY); return d <= 0 ? 'Today' : d === 1 ? 'Yesterday' : d + ' days ago'; }
function checkinText(ck) { return ck.left < 0 ? plural(-ck.left, 'day') + ' overdue' : ck.left === 0 ? 'due today' : 'due in ' + plural(ck.left, 'day'); }
const tierPill = t => t ? `<span class="pill tier-${esc(t)}">${esc(lbl(TIERS, t))}</span>` : '';
const desigChips = cl => (cl.designations || []).map(d => `<span class="tag desig">${esc((DESIGNATIONS.find(x => x[0] === d) || [d, d, d])[2])}</span>`).join('');
const stratChip = s => `<span class="schip s-${esc(s.status || 'planned')}" title="${esc(lbl(STRAT_STATUS, s.status))}">${esc(s.name)}</span>`;

VIEWS.clients = () => {
  const f = S.f; let cls = list('clients').slice();
  const q = norm(f.q);
  if (q) cls = cls.filter(cl => [cl.name].concat(clientContacts(cl).map(fullName), (cl.strategies || []).map(s => s.name), (cl.work || []).map(w => w.type)).some(x => norm(x).includes(q)));
  if (f.tier) cls = cls.filter(cl => cl.tier === f.tier);
  if (f.desig) cls = cls.filter(cl => (cl.designations || []).includes(f.desig));
  if (f.cstatus === 'due') cls = cls.filter(cl => cl.status !== 'former' && checkin(cl).left <= 7);
  else if (f.cstatus) cls = cls.filter(cl => (cl.status || 'active') === f.cstatus);
  else cls = cls.filter(cl => cl.status !== 'former');
  if (f.owner) cls = cls.filter(cl => cl.owner === f.owner);
  const sort = f.csort || 'checkin';
  if (sort === 'revenue') { const v = {}; cls.forEach(cl => { const m = clientMoney(cl); v[cl.id] = m.last12 + m.arr; }); cls.sort((a, b) => v[b.id] - v[a.id]); }
  else cls.sort((a, b) => sort === 'name' ? (a.name || '').localeCompare(b.name || '') : sort === 'tier' ? (TIER_RANK[a.tier] ?? 9) - (TIER_RANK[b.tier] ?? 9) || (a.name || '').localeCompare(b.name || '') : checkin(a).due - checkin(b).due);
  const live = list('clients').filter(cl => cl.status !== 'former');
  const n = t => live.filter(cl => cl.tier === t).length;
  const overdue = live.filter(cl => checkin(cl).left < 0).length;
  const openWork = live.reduce((a, cl) => a + (cl.work || []).filter(w => w.status !== 'done').length, 0);
  const implemented = live.reduce((a, cl) => a + (cl.strategies || []).filter(s => s.status === 'implemented').length, 0);
  const kpi = (l, v, s) => `<div class="card kpi"><div class="l">${l}</div><div class="v">${v}</div><div class="s">${s}</div></div>`;
  return {
    title: 'Clients',
    actions: `<button class="btn" data-act="exportClients">${ic('download')}Export</button><button class="btn primary" data-act="newClient">${ic('plus')}New client</button>`,
    body: `<div class="kpis">
      ${kpi('Active clients', live.length, `${n('platinum')} Platinum · ${n('gold')} Gold · ${n('silver')} Silver${n('special') ? ' · ' + n('special') + ' Special' : ''}`)}
      ${kpi('Check-ins overdue', overdue, overdue ? '<span style="color:var(--red)">needs a call</span>' : 'everyone is current')}
      ${kpi('Strategies implemented', implemented, 'across active clients')}
      ${kpi('Open work items', openWork, 'estate, reorgs, studies…')}
      ${(fm => kpi('Recurring / yr', moneyShort(fm.arr), moneyShort(fm.last12) + ' collected in 12 mo'))(firmMoney())}
    </div>
    <div class="toolbar">
      <input type="search" class="search" placeholder="Search clients, people, strategies, work" data-keep="cq" data-input="cq" value="${esc(f.q)}">
      <select data-change="cf" data-k="tier">${opt('', 'All tiers', f.tier)}${TIERS.map(t => opt(t[0], t[1], f.tier)).join('')}</select>
      <select data-change="cf" data-k="desig">${opt('', 'Any designation', f.desig)}${DESIGNATIONS.map(d => opt(d[0], d[2], f.desig)).join('')}</select>
      <select data-change="cf" data-k="cstatus">${opt('', 'Current clients', f.cstatus)}${opt('due', 'Check-in due soon', f.cstatus)}${CLIENT_STATUS.map(s => opt(s[0], s[1], f.cstatus)).join('')}</select>
      <select data-change="cf" data-k="owner">${opt('', 'Any advisor', f.owner)}${team().map(t => opt(t.name, t.name, f.owner)).join('')}</select>
      <select data-change="cf" data-k="csort">${opt('checkin', 'Sort: check-in due', sort)}${opt('tier', 'Sort: tier', sort)}${opt('revenue', 'Sort: revenue', sort)}${opt('name', 'Sort: name', sort)}</select>
    </div>
    ${list('clients').length ? `<div class="card tblwrap"><table class="tbl"><thead><tr><th>Client</th><th>Tier</th><th class="hide-m">Strategies</th><th class="hide-m">Work</th><th style="text-align:right">Revenue</th><th>Last contact</th><th class="hide-m">Advisor</th></tr></thead><tbody>
      ${cls.map(cl => {
        const ck = checkin(cl), pc = clientContacts(cl)[0], st = cl.strategies || [], wk = cl.work || [];
        const open = wk.filter(w => w.status !== 'done').length, done = wk.length - open;
        return `<tr class="click" data-act="openClient" data-id="${cl.id}">
          <td><div class="name">${esc(cl.name)}</div><div class="sub">${pc ? (norm(fullName(pc)) === norm(cl.name) ? esc(pc.email || '') : esc(fullName(pc))) : 'No contact linked'}${cl.status && cl.status !== 'active' ? ' · ' + esc(lbl(CLIENT_STATUS, cl.status)) : ''}</div><div style="margin-top:4px">${desigChips(cl)}</div></td>
          <td>${tierPill(cl.tier)}<div class="sub" style="margin-top:3px">${(tp => tp ? cash(tp.amount) + '/qtr' : '<span style="color:var(--amber)">no fee plan</span>')(tierPlanOf(cl))}</div></td>
          <td class="hide-m">${st.slice(0, 3).map(stratChip).join('')}${st.length > 3 ? `<span class="sub">+${st.length - 3}</span>` : ''}${st.length ? '' : '<span class="sub">None yet</span>'}</td>
          <td class="hide-m sub">${wk.length ? (open ? `<b style="color:var(--ink)">${open} open</b>` : '') + (open && done ? ' · ' : '') + (done ? done + ' done' : '') : 'None'}</td>
          <td style="text-align:right;white-space:nowrap">${(mm => `<div style="font-weight:700">${cash(mm.last12)}</div><div class="sub">${mm.arr ? cash(mm.arr) + '/yr recurring' : 'last 12 mo'}</div>${mm.overdue ? `<div class="sub" style="color:var(--red)">${cash(mm.overdue)} past due</div>` : ''}${(n => n ? `<div class="sub">${plural(n, 'open deal')}</div>` : '')(dealsForClient(cl).filter(d => stageKind(d.stage) === 'open').length)}`)(clientMoney(cl))}</td>
          <td><div>${daysAgo(ck.last)}</div><div class="sub" style="color:var(--${ck.cls === 'green' ? 'muted' : ck.cls})">${checkinText(ck)}</div></td>
          <td class="hide-m">${esc(cl.owner || '')}</td></tr>`;
      }).join('')}
    </tbody></table>${cls.length ? '' : '<div class="empty">No clients match these filters.</div>'}</div>`
      : `<div class="card empty"><h4>No clients yet</h4><p>Add the people you are taking care of, or open a contact and click <b>Make client</b>. Each client tracks tier, strategies, work, and when you last talked.</p><button class="btn primary" data-act="newClient">${ic('plus')}New client</button></div>`}`
  };
};
ACT.openClient = d => openDrawer('client', d.id);
ACT.exportClients = () => {
  const head = ['Client', 'Tier', 'Status', 'Advisor', 'Designations', 'Strategies', 'Open work', 'Done work', 'Last contact', 'Next review', 'People'];
  const rows = list('clients').map(cl => [cl.name, lbl(TIERS, cl.tier), lbl(CLIENT_STATUS, cl.status || 'active'), cl.owner || '',
    (cl.designations || []).map(d => lbl(DESIGNATIONS, d)).join('; '), (cl.strategies || []).map(s => s.name + ' (' + lbl(STRAT_STATUS, s.status) + ')').join('; '),
    (cl.work || []).filter(w => w.status !== 'done').map(w => w.type).join('; '), (cl.work || []).filter(w => w.status === 'done').map(w => w.type).join('; '),
    lastContact(cl) ? toDateInput(lastContact(cl)) : '', cl.nextReview ? toDateInput(cl.nextReview) : '', clientContacts(cl).map(fullName).join('; ')]);
  const csv = [head].concat(rows).map(r => r.map(v => '"' + String(v || '').replace(/"/g, '""') + '"').join(',')).join('\n');
  downloadFile('phillips-crm-clients-' + toDateInput(Date.now()) + '.csv', csv, 'text/csv');
};

/* ---------- client form ---------- */
function clientForm(cl = {}) {
  const ds = cl.designations || [];
  return `<label class="f"><span>Client name</span><input type="text" name="name" value="${esc(cl.name)}" placeholder="e.g. Hale Family or Bell Dental Group" required></label>
  <div class="grid3">
    <label class="f"><span>Tier</span><select name="tier" data-change="tierPick">${TIERS.map(t => opt(t[0], t[0] === 'special' ? 'Special · custom amount' : t[1] + ' · ' + cash(tierFee(t[0])) + '/qtr', cl.tier || 'gold')).join('')}</select></label>
    <label class="f" id="specialFeeRow" style="${cl.tier === 'special' ? '' : 'display:none'}"><span>Special quarterly fee ($)</span><input type="text" inputmode="decimal" name="customFee" value="${cl.customFee ? esc(cl.customFee) : ''}" placeholder="e.g. 5,500" data-input="signSum"></label>
    <label class="f"><span>Status</span><select name="status">${CLIENT_STATUS.map(s => opt(s[0], s[1], cl.status || 'onboarding')).join('')}</select></label>
    <label class="f"><span>Advisor</span><select name="owner">${teamOpts(cl.id ? cl.owner : (cl.owner || meName()))}</select></label>
    <label class="f"><span>${cl.id ? 'Client since' : 'Signing date'}</span><input type="date" name="since" value="${toDateInput(cl.since || Date.now())}" data-change="sinceDate"></label>
    <label class="f"><span>Next review</span><input type="date" name="nextReview" value="${toDateInput(cl.nextReview)}"></label>
    <label class="f"><span>Primary contact</span><select name="primary">${contactOpts((cl.contactIds || [])[0])}</select></label>
  </div>
  <div class="secthd">Designations</div>
  ${DESIGNATIONS.map(d => `<label class="check"><input type="checkbox" name="d_${d[0]}" ${ds.includes(d[0]) ? 'checked' : ''}> ${esc(d[1])}</label>`).join('')}
  <label class="f" style="margin-top:6px"><span>Notes</span><textarea name="notes" placeholder="Goals, family situation, entities, anything the team should know">${esc(cl.notes)}</textarea></label>
  ${cl.id ? '' : `<div class="feebox" style="padding-bottom:12px"><div class="secthd" style="margin-top:2px">Billing at sign-on</div>
    <div class="grid3"><label class="f"><span>Startup fee ($)</span><input type="text" inputmode="decimal" name="startup" value="${tierStartup(cl.tier || 'gold') || ''}" placeholder="0" data-input="signSum"></label>
      <label class="check" style="align-self:end;margin-bottom:20px"><input type="checkbox" name="splitStartup" checked data-change="signSum"> Split into two invoices</label>
      <label class="check" style="align-self:end;margin-bottom:20px"><input type="checkbox" name="tierPlan" checked data-change="signSum"> Bill the quarterly tier fee</label></div>
    <div id="signSum" class="signsum"></div></div>
    <div class="hint">Add strategies and work items from the client page after saving.</div>`}`;
}
function clientFromForm(o, existing) {
  const ids = (existing && existing.contactIds || []).filter(id => id !== o.primary);
  return {
    name: o.name, tier: o.tier, customFee: o.tier === 'special' ? num(o.customFee) : null, status: o.status, owner: o.owner, since: fromDateInput(o.since), nextReview: fromDateInput(o.nextReview),
    designations: DESIGNATIONS.map(d => d[0]).filter(k => o['d_' + k]), notes: o.notes || '',
    contactIds: o.primary ? [o.primary].concat(ids) : ids, updatedAt: Date.now()
  };
}
CHANGE.tierPick = (d, t) => {
  const f = $('#mform'), row = $('#specialFeeRow');
  if (row) row.style.display = t.value === 'special' ? '' : 'none';
  if (t.value === 'special' && f) setTimeout(() => f.elements.customFee.focus());
  if (f && f.elements.startup && t.value !== 'special') f.elements.startup.value = tierStartup(t.value) || f.elements.startup.value || '';
  INPUT.signSum();
};
const formFee = f => f.elements.tier.value === 'special' ? num(f.elements.customFee.value) : tierFee(f.elements.tier.value);
CHANGE.signSum = () => INPUT.signSum();
CHANGE.sinceDate = () => INPUT.signSum();
INPUT.signSum = () => {
  const f = $('#mform'), out = $('#signSum'); if (!f || !out || !f.elements.startup) return;
  const tier = f.elements.tier.value, fee = formFee(f), sign = fromDateInput(f.elements.since.value) || Date.now(), so = signOnPlan(sign);
  const st = num(f.elements.startup.value), split = f.elements.splitStartup.checked, bill = f.elements.tierPlan.checked;
  const rows = [];
  if (st) rows.push(split ? `<li>Startup fee <b>${cash(st)}</b> in two invoices: ${cash(st / 2)} at signing, ${cash(st / 2)} 30 days later</li>` : `<li>Startup fee <b>${cash(st)}</b> invoiced at signing</li>`);
  if (bill) {
    if (so.chargeNow) rows.push(`<li>${esc(periodLabel(so.planStart, 'quarterly'))} quarterly fee <b>${cash(fee)}</b> invoiced at signing</li>`);
    rows.push(`<li>Then <b>${cash(fee)}</b> every quarter starting <b>${fmtDate(so.nextQ)}</b>${so.chargeNow ? '' : ' <span class="sub">(next quarter starts within 2 weeks, so this quarter is not charged)</span>'}</li>`);
  }
  out.innerHTML = rows.length ? `<div class="l">Signing ${fmtDate(sign)}</div><ul>${rows.join('')}</ul>` : '<span class="muted">Nothing will be billed at signing.</span>';
};
ACT.newClient = d => {
  const c = d.contact && byId('contacts', d.contact);
  const pre = c ? { name: fullName(c), contactIds: [c.id], owner: c.owner } : {};
  if (c && c.companyName && !c.lastName) pre.name = c.companyName;
  openModal({
    title: c ? 'Make ' + fullName(c) + ' a client' : 'New client', wide: true, body: clientForm(pre), onMount: () => INPUT.signSum(),
    submit: async o => {
      if (!o.name) return false;
      const data = Object.assign(clientFromForm(o, pre), { strategies: [], work: [], feePlans: [], createdAt: Date.now(), createdBy: meName() });
      const sign = data.since || Date.now(), so = signOnPlan(sign), fee = feeFor(data);
      if (o.tierPlan && data.tier === 'special' && !fee) { toast('Enter the Special quarterly fee, or uncheck "Bill the quarterly tier fee"', 'error'); return false; }
      const tp = o.tierPlan ? newTierPlan(data.tier, so.planStart, fee) : null;
      if (tp) data.feePlans.push(tp);
      const id = await store.add('clients', data);
      const base = { clientId: id, companyId: null, dealId: null, contactId: data.contactIds[0] || null, paidBy: 'Client', notes: '', createdAt: Date.now(), createdBy: meName(), updatedAt: Date.now() };
      const st = num(o.startup);
      if (st) {
        if (o.splitStartup) {
          const half = round2(st / 2);
          await store.add('revenue', Object.assign({}, base, { type: 'startup', billing: 'project', amount: half, status: 'invoiced', date: sign, description: 'Startup fee (1 of 2)' }));
          await store.add('revenue', Object.assign({}, base, { type: 'startup', billing: 'project', amount: round2(st - half), status: 'expected', date: sign + 30 * DAY, description: 'Startup fee (2 of 2)' }));
        } else await store.add('revenue', Object.assign({}, base, { type: 'startup', billing: 'project', amount: st, status: 'invoiced', date: sign, description: 'Startup fee' }));
      }
      if (tp && so.chargeNow) await store.add('revenue', Object.assign({}, base, { type: 'quarterly', billing: 'quarterly', planId: tp.id, period: periodKey(so.planStart), dueDate: sign, amount: fee, status: 'invoiced', date: sign, description: tp.label + ' · ' + periodLabel(so.planStart, 'quarterly') + ' (first quarter, at signing)' }));
      await logAct({ type: 'system', clientId: id, contactId: data.contactIds[0] || null, body: 'Became a ' + lbl(TIERS, data.tier) + ' client' + (o.tierPlan ? ' at ' + cash(fee) + ' per quarter' : '') + (st ? '. Startup fee ' + cash(st) + ' invoiced' : '') + (tp && so.chargeNow ? '. ' + periodLabel(so.planStart, 'quarterly') + ' fee invoiced at signing' : tp ? '. First quarterly charge ' + fmtDate(so.nextQ) : '') });
      toast('Client added'); openDrawer('client', id);
    }
  });
};
ACT.editClient = d => {
  const cl = byId('clients', d.id);
  openModal({
    title: 'Edit client', wide: true, body: clientForm(cl),
    submit: async o => {
      const data = clientFromForm(o, cl);
      await store.update('clients', cl.id, data);
      const specialChanged = data.tier === 'special' && cl.tier === 'special' && Number(data.customFee) !== Number(cl.customFee);
      if (data.tier === 'special' && !data.customFee) toast('Add the Special quarterly fee amount so it can be billed', 'error');
      if (data.tier !== cl.tier || specialChanged) {
        if (data.tier !== cl.tier) await logAct({ type: 'system', clientId: cl.id, body: 'Tier changed: ' + lbl(TIERS, cl.tier) + ' → ' + lbl(TIERS, data.tier) });
        const tp = tierPlanOf(cl), newAmt = feeFor(data);
        if (tp && newAmt && Number(tp.amount) !== newAmt && await ask('Update their quarterly fee from ' + cash(tp.amount) + ' to ' + cash(newAmt) + ' (' + (data.tier === 'special' ? 'special pricing' : lbl(TIERS, data.tier) + ' price') + ')? Payments already recorded stay as they are.', 'Update fee')) {
          await patchList(cl.id, 'feePlans', a => { const x = a.find(x => x.id === tp.id); x.amount = newAmt; x.label = String(x.label || '').replace(lbl(TIERS, cl.tier), lbl(TIERS, data.tier)) || lbl(TIERS, data.tier) + ' quarterly strategy fee'; }, 'Quarterly fee updated to ' + cash(newAmt) + ' (' + lbl(TIERS, data.tier) + ')');
        } else if (!tp) toast('Tier changed. Add their ' + lbl(TIERS, data.tier) + ' fee plan from the Revenue section.');
      }
      if (data.status !== cl.status) await logAct({ type: 'system', clientId: cl.id, body: 'Status changed to ' + lbl(CLIENT_STATUS, data.status) });
      toast('Saved');
    }
  });
};
ACT.delClient = async d => {
  const cl = byId('clients', d.id);
  if (!(await ask('Delete the client record for ' + cl.name + '? Their contacts, deals, and history stay. Tip: set status to Former instead to keep the record.', 'Delete'))) return;
  await store.remove('clients', cl.id); S.drawer = null; schedule(false);
};

/* ---------- log contact ---------- */
ACT.logContact = d => {
  const cl = byId('clients', d.id), people = clientContacts(cl);
  openModal({
    title: 'Log contact with ' + cl.name,
    body: `<div class="grid2"><label class="f"><span>How</span><select name="channel">${Object.keys(CHANNELS).map(k => opt(k, CHANNELS[k][0], 'call')).join('')}</select></label>
      <label class="f"><span>When</span><input type="date" name="date" value="${toDateInput(Date.now())}"></label></div>
      ${people.length ? `<label class="f"><span>With</span><select name="contactId">${people.map(c => opt(c.id, fullName(c), people[0].id)).join('')}</select></label>` : ''}
      <label class="f"><span>Summary</span><textarea name="body" placeholder="What did you cover? Any follow ups?"></textarea></label>
      <div class="hint">Resets the check-in clock. ${lbl(TIERS, cl.tier)} clients are due every ${cadenceDays(cl.tier)} days.</div>`,
    foot: `<button type="button" class="btn" data-act="closeModal">Cancel</button><button class="btn primary">Log contact</button>`,
    submit: async o => {
      const day = fromDateInput(o.date), at = day && startOfDay(day) === startOfDay() ? Date.now() : (day || Date.now());
      await logAct({ type: 'contact', channel: o.channel, clientId: cl.id, contactId: o.contactId || null, body: o.body || '', at });
      toast('Logged');
    }
  });
};

/* ---------- strategies & work (stored as arrays on the client) ---------- */
async function patchList(clId, key, fn, note) {
  const cl = byId('clients', clId); if (!cl) return;
  const arr = clone(cl[key] || []); fn(arr);
  await store.update('clients', clId, { [key]: arr, updatedAt: Date.now() });
  if (note) await logAct({ type: 'system', clientId: clId, body: note });
}
SUBMIT.addStrategy = async (o, f) => {
  if (!o.name) return;
  await patchList(f.dataset.client, 'strategies', a => a.push({ id: uid(), name: o.name, status: o.status || 'planned', note: o.note || '', updatedAt: Date.now() }), 'Strategy added: ' + o.name + ' (' + lbl(STRAT_STATUS, o.status) + ')');
  f.reset();
};
CHANGE.stratStatus = (d, t) => {
  const s = (byId('clients', d.cl).strategies || []).find(x => x.id === d.sid);
  return patchList(d.cl, 'strategies', a => { const x = a.find(x => x.id === d.sid); if (x) { x.status = t.value; x.updatedAt = Date.now(); if (t.value === 'implemented') x.implementedAt = Date.now(); } }, s ? s.name + ': ' + lbl(STRAT_STATUS, t.value) : null);
};
ACT.stratDel = async d => { if (await ask('Remove this strategy?', 'Remove')) await patchList(d.cl, 'strategies', a => { const i = a.findIndex(x => x.id === d.sid); if (i >= 0) a.splice(i, 1); }); };
ACT.stratNote = d => {
  const s = (byId('clients', d.cl).strategies || []).find(x => x.id === d.sid);
  openModal({ title: s.name, body: `<label class="f"><span>Notes</span><textarea name="note" style="min-height:120px">${esc(s.note)}</textarea></label>`, submit: o => patchList(d.cl, 'strategies', a => { const x = a.find(x => x.id === d.sid); if (x) x.note = o.note; }) });
};
SUBMIT.addWork = async (o, f) => {
  if (!o.type) return;
  await patchList(f.dataset.client, 'work', a => a.push({ id: uid(), type: o.type, by: o.by || handledBy()[0], status: 'todo', due: fromDateInput(o.due), note: '', createdAt: Date.now() }), 'Work added: ' + o.type);
  f.reset();
};
CHANGE.workStatus = (d, t) => {
  const w = (byId('clients', d.cl).work || []).find(x => x.id === d.wid);
  return patchList(d.cl, 'work', a => { const x = a.find(x => x.id === d.wid); if (x) { x.status = t.value; x.doneAt = t.value === 'done' ? Date.now() : null; } }, w ? w.type + ': ' + lbl(WORK_STATUS, t.value) : null);
};
ACT.workDel = async d => { if (await ask('Remove this work item?', 'Remove')) await patchList(d.cl, 'work', a => { const i = a.findIndex(x => x.id === d.wid); if (i >= 0) a.splice(i, 1); }); };
ACT.workEdit = d => {
  const w = (byId('clients', d.cl).work || []).find(x => x.id === d.wid);
  openModal({
    title: w.type, body: `<div class="grid2"><label class="f"><span>Handled by</span><select name="by">${Array.from(new Set(handledBy().concat(w.by ? [w.by] : []))).map(h => opt(h, h, w.by)).join('')}</select></label>
      <label class="f"><span>Due</span><input type="date" name="due" value="${toDateInput(w.due)}"></label></div>
      <label class="f"><span>Notes</span><textarea name="note" style="min-height:110px">${esc(w.note)}</textarea></label>`,
    submit: o => patchList(d.cl, 'work', a => { const x = a.find(x => x.id === d.wid); if (x) { x.by = o.by; x.due = fromDateInput(o.due); x.note = o.note; } })
  });
};
SUBMIT.linkContact = async (o, f) => {
  if (!o.contactId) return;
  const other = clientOf(o.contactId);
  if (other && other.id !== f.dataset.client) { toast(fullName(byId('contacts', o.contactId)) + ' is already on ' + other.name, 'error'); return; }
  await patchList(f.dataset.client, 'contactIds', a => { if (!a.includes(o.contactId)) a.push(o.contactId); });
};
ACT.unlinkContact = d => patchList(d.cl, 'contactIds', a => { const i = a.indexOf(d.id); if (i >= 0) a.splice(i, 1); });

/* ---------- drawer ---------- */
DRAWERS.client = cl => {
  const ck = checkin(cl), people = clientContacts(cl), ids = new Set(people.map(c => c.id));
  const deals = dealsForClient(cl);
  const acts = list('activities').filter(a => a.clientId === cl.id || (a.contactId && ids.has(a.contactId))).sort((a, b) => b.at - a.at).slice(0, 100);
  const tasks = list('tasks').filter(t => !t.done && (t.clientId === cl.id || ids.has(t.contactId)));
  const st = cl.strategies || [];
  const wk = (cl.work || []).slice().sort((a, b) => (a.status === 'done') - (b.status === 'done') || (a.due || 9e15) - (b.due || 9e15));
  const pc = people[0];
  const others = list('contacts').filter(c => !ids.has(c.id)).sort((a, b) => fullName(a).localeCompare(fullName(b)));
  return `<div class="dh"><span class="avatar lg tier-av-${esc(cl.tier)}">${initials(cl.name)}</span><div style="min-width:0"><h2>${esc(cl.name)}</h2>
    <div class="sub">${esc(lbl(CLIENT_STATUS, cl.status || 'active'))} · client since ${fmtDate(cl.since || cl.createdAt)}${cl.owner ? ' · ' + esc(cl.owner) : ''}</div>
    <div style="margin-top:6px">${tierPill(cl.tier)} <span class="sub">${(tp => tp ? cash(tp.amount) + '/qtr' : feeFor(cl) ? cash(feeFor(cl)) + '/qtr (no plan yet)' : 'no fee set')(tierPlanOf(cl))}</span> ${desigChips(cl)}</div></div><button class="x" data-act="closeDrawer">×</button></div>
  <div class="acts">
    <button class="btn sm primary" data-act="logContact" data-id="${cl.id}">${ic('phone')}Log contact</button>
    ${pc ? `<button class="btn sm" data-act="emailContact" data-id="${pc.id}">${ic('mail')}Email</button>` : ''}
    <button class="btn sm" data-act="newTask" data-contact="${pc ? pc.id : ''}" data-client="${cl.id}">${ic('check')}Task</button>
    <button class="btn sm" data-act="editClient" data-id="${cl.id}">Edit</button>
    <button class="btn sm ghost danger" data-act="delClient" data-id="${cl.id}">${ic('trash')}</button>
  </div>
  <div class="db">
    <div class="card"><div class="bd"><div class="checkin ${ck.cls}">
      <div><div class="l">Last contacted</div><div class="v">${daysAgo(ck.last)}</div><div class="sub">${ck.last ? fmtDate(ck.last) : 'Log your first touchpoint'}</div></div>
      <div><div class="l">Next check-in</div><div class="v" style="color:var(--${ck.cls === 'green' ? 'ink' : ck.cls})">${esc(checkinText(ck))}</div><div class="sub">every ${ck.days} days for ${esc(lbl(TIERS, cl.tier))}</div></div>
      <div><div class="l">Next review</div><div class="v">${cl.nextReview ? fmtDate(cl.nextReview) : '—'}</div><div class="sub">${cl.nextReview ? ago(cl.nextReview) : 'not scheduled'}</div></div>
    </div>${cl.notes ? `<div class="hint" style="margin-top:12px;white-space:pre-wrap;color:var(--ink)">${esc(cl.notes)}</div>` : ''}</div></div>

    ${dealsCard(deals, 'data-client="' + cl.id + '"')}
    ${clientRevenueCard(cl)}

    <div class="card"><div class="hd"><h3>Strategies</h3><span class="sub">${st.filter(s => s.status === 'implemented').length} of ${st.length} implemented</span></div>
      ${st.map(s => `<div class="taskrow"><span class="sdot s-${esc(s.status)}"></span><div style="flex:1;min-width:0;cursor:pointer" data-act="stratNote" data-cl="${cl.id}" data-sid="${s.id}"><div class="tt">${esc(s.name)}</div><div class="sub">${s.note ? esc(s.note.length > 120 ? s.note.slice(0, 120) + '…' : s.note) : 'Add notes'}${s.implementedAt && s.status === 'implemented' ? ' · implemented ' + fmtDate(s.implementedAt) : ''}</div></div>
        <select data-change="stratStatus" data-cl="${cl.id}" data-sid="${s.id}" style="width:auto;padding:5px 8px;font-size:12px">${STRAT_STATUS.map(x => opt(x[0], x[1], s.status)).join('')}</select>
        <button class="btn sm ghost" data-act="stratDel" data-cl="${cl.id}" data-sid="${s.id}" title="Remove">✕</button></div>`).join('')}
      <form data-submit="addStrategy" data-client="${cl.id}" class="row addrow"><input type="text" name="name" list="stratList" placeholder="Add a strategy" data-keep="st-${cl.id}">
        <select name="status" style="width:auto">${STRAT_STATUS.map(x => opt(x[0], x[1], 'planned')).join('')}</select><button class="btn sm primary">Add</button></form>
      <datalist id="stratList">${STRATEGY_PRESETS.map(s => `<option value="${esc(s)}">`).join('')}</datalist></div>

    <div class="card"><div class="hd"><h3>Work</h3><span class="sub">${wk.filter(w => w.status !== 'done').length} open · ${wk.filter(w => w.status === 'done').length} done</span></div>
      ${wk.map(w => { const od = w.due && w.status !== 'done' && w.due < startOfDay(); return `<div class="taskrow${w.status === 'done' ? ' done' : ''}"><span class="sdot w-${esc(w.status)}"></span>
        <div style="flex:1;min-width:0;cursor:pointer" data-act="workEdit" data-cl="${cl.id}" data-wid="${w.id}"><div class="tt">${esc(w.type)}</div>
        <div class="sub">${esc(w.by || '')}${w.status === 'done' && w.doneAt ? ' · done ' + fmtDate(w.doneAt) : w.due ? ` · <span style="${od ? 'color:var(--red);font-weight:600' : ''}">${od ? 'overdue ' : 'due '}${fmtDate(w.due)}</span>` : ''}${w.note ? ' · ' + esc(w.note.length > 80 ? w.note.slice(0, 80) + '…' : w.note) : ''}</div></div>
        <select data-change="workStatus" data-cl="${cl.id}" data-wid="${w.id}" style="width:auto;padding:5px 8px;font-size:12px">${WORK_STATUS.map(x => opt(x[0], x[1], w.status)).join('')}</select>
        <button class="btn sm ghost" data-act="workDel" data-cl="${cl.id}" data-wid="${w.id}" title="Remove">✕</button></div>`; }).join('')}
      <form data-submit="addWork" data-client="${cl.id}" class="row addrow" style="flex-wrap:wrap"><input type="text" name="type" list="workList" placeholder="Add work, e.g. Estate and will planning" data-keep="wk-${cl.id}" style="flex:2 1 200px">
        <select name="by" style="width:auto">${handledBy().map(h => opt(h, h)).join('')}</select><input type="date" name="due" style="width:auto" title="Due date"><button class="btn sm primary">Add</button></form>
      <datalist id="workList">${WORK_PRESETS.map(s => `<option value="${esc(s)}">`).join('')}</datalist></div>

    <div class="card"><div class="hd"><h3>People</h3></div>
      ${people.map((c, i) => `<div class="taskrow"><span class="avatar">${initials(fullName(c))}</span><div style="flex:1;min-width:0;cursor:pointer" data-act="openContact" data-id="${c.id}"><div class="tt">${esc(fullName(c))}${i === 0 ? ' <span class="pill">Primary</span>' : ''}</div><div class="sub">${esc([c.title, c.email, c.phone].filter(Boolean).join(' · '))}</div></div>
        <button class="btn sm ghost" data-act="unlinkContact" data-cl="${cl.id}" data-id="${c.id}" title="Unlink">✕</button></div>`).join('') || '<div class="bd muted">No contacts linked.</div>'}
      <form data-submit="linkContact" data-client="${cl.id}" class="row addrow"><select name="contactId">${opt('', 'Link a contact (spouse, partner, CFO…)')}${others.map(c => opt(c.id, fullName(c) + (c.email ? ' · ' + c.email : ''))).join('')}</select><button class="btn sm">Link</button></form></div>


    <div class="card"><div class="hd"><h3>Open tasks</h3><button class="btn sm ghost" data-act="newTask" data-contact="${pc ? pc.id : ''}" data-client="${cl.id}">${ic('plus')}</button></div>${tasks.length ? tasks.map(taskRow).join('') : '<div class="bd muted">None</div>'}</div>
    ${noteBox('data-client="' + cl.id + '" data-contact="' + (pc ? pc.id : '') + '"', 'cnote-' + cl.id)}
    <div class="card"><div class="hd"><h3>History</h3></div><div class="bd feed">${acts.length ? acts.map(a => feedItem(a, true)).join('') : '<div class="muted">No activity yet.</div>'}</div></div>
  </div>`;
};

/* ---------- dashboard card ---------- */
function checkinsCard() {
  const due = list('clients').filter(cl => cl.status !== 'former').map(cl => ({ cl, ck: checkin(cl) })).filter(x => x.ck.left <= 7).sort((a, b) => a.ck.due - b.ck.due);
  if (!list('clients').length) return '';
  return `<div class="card"><div class="hd"><h3>Client check-ins</h3><a href="#" data-act="go" data-v="clients">All clients</a></div>
    ${due.length ? due.slice(0, 6).map(({ cl, ck }) => `<div class="taskrow"><div style="flex:1;min-width:0;cursor:pointer" data-act="openClient" data-id="${cl.id}"><div class="tt">${esc(cl.name)} ${tierPill(cl.tier)}</div>
      <div class="sub">Last contact ${daysAgo(ck.last).toLowerCase()} · <span style="color:var(--${ck.cls})">${esc(checkinText(ck))}</span>${cl.owner ? ' · ' + esc(cl.owner) : ''}</div></div>
      <button class="btn sm" data-act="logContact" data-id="${cl.id}">Log</button></div>`).join('') : '<div class="bd muted">Every client is current.</div>'}</div>`;
}
