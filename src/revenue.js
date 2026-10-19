/* ================= REVENUE =================
   Every dollar is a ledger entry in `revenue`, tied to a client and optionally
   a company, contact and deal. Recurring fees (quarterly tier fees, retainers)
   are fee plans on the client; each installment is marked paid, which writes
   a ledger entry for that period. */
ICONS.dollar = '<path d="M12 2v20M17 6.5C16.2 5 14.4 4 12 4 9 4 7 5.5 7 7.75S9 11 12 11.5s5 1.5 5 3.75S15 19 12 19c-2.4 0-4.2-1-5-2.5"/>';
const REV_TYPES = [['quarterly', 'Quarterly strategy fee'], ['retainer', 'Monthly retainer'], ['startup', 'Startup fee'], ['deal', 'Deal / project fee'], ['consulting', 'Consulting (hourly)'], ['commission', 'Commission / referral fee'], ['other', 'Other']];
const REV_STATUS = [['paid', 'Paid'], ['invoiced', 'Invoiced'], ['expected', 'Expected'], ['waived', 'Waived / written off']];
const REV_PILL = { paid: 'green', invoiced: 'blue', expected: 'gold', waived: '' };
const FREQ = [['quarterly', 'Quarterly', 3], ['monthly', 'Monthly', 1], ['annual', 'Annually', 12]];
const REV_COLOR = { retainer: '#9C7A2E', quarterly: '#C8A24B', startup: '#2B5FA8', deal: '#2E7D4F', consulting: '#7A5BB0', commission: '#C2703D', other: '#98A1AF' };
const DEFAULT_TIER_FEES = { platinum: 8000, gold: 3900, silver: 2500 }; // per quarter

const amt = r => Number(r && r.amount) || 0;
const cash = n => { n = Math.round((Number(n) || 0) * 100) / 100; return (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 }); };
const total = arr => arr.reduce((a, r) => a + amt(r), 0);
const yearStart = (t = Date.now()) => new Date(new Date(t).getFullYear(), 0, 1).getTime();
const quarterStart = (t = Date.now()) => { const d = new Date(t); return new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3, 1).getTime(); };
function addMonths(ts, m) { const d = new Date(ts), day = d.getDate(); d.setDate(1); d.setMonth(d.getMonth() + m); d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate())); return d.getTime(); }
const periodKey = ts => { const d = new Date(ts); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); };
function periodLabel(ts, freq) {
  const d = new Date(ts);
  if (freq === 'quarterly') return 'Q' + (Math.floor(d.getMonth() / 3) + 1) + ' ' + d.getFullYear();
  if (freq === 'annual') return String(d.getFullYear());
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}
const freqStep = f => (FREQ.find(x => x[0] === f) || FREQ[0])[2];
const annualized = p => (Number(p.amount) || 0) * 12 / freqStep(p.frequency);
const planActive = p => p.active !== false && (!p.end || p.end >= startOfDay());
const payerOf = r => r.paidBy || 'Client';

/* ---------- billing type: how a dollar is billed ---------- */
const BILLING = [['project', 'Per project'], ['monthly', 'Monthly'], ['quarterly', 'Quarterly'], ['annual', 'Annual']];
const BILL_COLOR = { project: '#2E7D4F', monthly: '#9C7A2E', quarterly: '#C8A24B', annual: '#5B6B7C' };
const freqToBilling = f => f === 'annual' ? 'annual' : f === 'monthly' ? 'monthly' : 'quarterly';
let _planCache = { cl: null, co: null, map: null };
function allPlans() {
  const cl = list('clients'), co = list('companies');
  if (_planCache.cl === cl && _planCache.co === co && _planCache.list) return _planCache.list;
  const out = [];
  cl.forEach(x => (x.feePlans || []).forEach(p => out.push(withOwner(p, 'clients', x.id))));
  co.forEach(x => (x.feePlans || []).forEach(p => out.push(withOwner(p, 'companies', x.id))));
  _planCache = { cl, co, list: out, map: new Map(out.map(p => [p.id, p])) };
  return out;
}
const planById = id => { allPlans(); return _planCache.map.get(id) || null; };
function withOwner(p, col, id) { return Object.assign({}, p, { ownerCol: col, ownerId: id, clientId: col === 'clients' ? id : null }); }
const ownerOf = p => byId(p.ownerCol, p.ownerId);
function billingOf(r) {
  if (r.billing) return r.billing;
  if (r.planId) { const p = planById(r.planId); if (p) return freqToBilling(p.frequency); }
  if (r.type === 'quarterly') return 'quarterly';
  if (r.type === 'retainer') return 'monthly';
  return 'project';
}
/* Collected, recurring, outstanding and payers for each billing type. */
function billingBreakdown(entries, plans, due) {
  const now = Date.now(), t0 = startOfDay(), out = {};
  BILLING.forEach(b => out[b[0]] = { ytd: 0, last12: 0, lifetime: 0, arr: 0, overdue: 0, upcoming: 0, payers: new Set(), plans: 0 });
  entries.forEach(r => {
    if (r.status !== 'paid') return; const x = out[billingOf(r)]; if (!x) return;
    x.lifetime += amt(r); if (r.date >= yearStart()) x.ytd += amt(r); if (r.date >= now - 365 * DAY) x.last12 += amt(r);
    x.payers.add(r.clientId ? 'cl:' + r.clientId : r.companyId ? 'co:' + r.companyId : 'x:' + payerOf(r));
  });
  plans.forEach(p => { if (!planActive(p)) return; const x = out[freqToBilling(p.frequency)]; x.arr += annualized(p); x.plans++; x.payers.add(p.ownerCol === 'companies' ? 'co:' + p.ownerId : 'cl:' + p.ownerId); });
  (due || []).forEach(d => { const k = d.kind === 'plan' ? freqToBilling(d.plan.frequency) : billingOf(d.entry); const x = out[k]; if (!x) return; if (d.due < t0) x.overdue += d.amount; else x.upcoming += d.amount; });
  return out;
}
function billingTiles(bb, compact) {
  const keys = BILLING.map(b => b[0]).filter(k => k !== 'annual' || bb.annual.lifetime || bb.annual.arr);
  return `<div class="billtiles${compact ? ' compact' : ''}">${keys.map(k => { const x = bb[k], rec = k !== 'project';
    return `<div class="billtile"><div class="l"><i class="kdot" style="background:${BILL_COLOR[k]}"></i>${esc(lbl(BILLING, k))}</div>
      <div class="v">${cash(compact ? x.last12 : x.ytd)}</div><div class="sub">${compact ? 'last 12 months' : 'collected this year'}</div>
      ${rec ? `<div class="sub"><b style="color:var(--ink)">${cash(x.arr)}</b>/yr from ${plural(x.plans, 'plan')}</div>` : `<div class="sub">${compact ? cash(x.lifetime) + ' lifetime' : cash(x.last12) + ' last 12 months'}</div>`}
      ${x.overdue ? `<div class="sub" style="color:var(--red)">${cash(x.overdue)} past due</div>` : x.upcoming ? `<div class="sub">${cash(x.upcoming)} due next 90 days</div>` : ''}
      ${compact ? '' : `<div class="sub">${plural(x.payers.size, 'payer')}</div>`}</div>`; }).join('')}</div>`;
}

const quarterKey = ts => { const d = new Date(ts); return d.getFullYear() + '-Q' + (Math.floor(d.getMonth() / 3) + 1); };
const entryQuarter = r => { if (r.period && /^\d{4}-\d{2}$/.test(r.period)) { const [y, m] = r.period.split('-').map(Number); return y + '-Q' + Math.ceil(m / 3); } return quarterKey(r.dueDate || r.date); };
const nextQuarterStart = (t = Date.now()) => addMonths(quarterStart(t), 3);
/* Quarterly plans always bill on the first day of each quarter (Jan 1, Apr 1, Jul 1, Oct 1). */
function installments(plan, until) {
  const out = []; if (!plan.start) return out;
  const paid = list('revenue').filter(r => r.planId === plan.id);
  const qtr = plan.frequency === 'quarterly', first = qtr ? quarterStart(plan.start) : plan.start;
  for (let k = 0; k < 600; k++) {
    const due = addMonths(first, k * freqStep(plan.frequency));
    if (due > until || (plan.end && due > plan.end)) break;
    const key = periodKey(due), qk = qtr ? quarterKey(due) : null;
    out.push({ due, key, entry: paid.find(r => qtr ? entryQuarter(r) === qk : r.period === key) || null });
  }
  return out;
}
/* Sign-on rule: charge the startup fee and the current quarter at signing,
   unless the next quarter starts within 2 weeks; then the first quarterly
   charge is that next quarter's first day. */
function signOnPlan(signTs) {
  const nq = nextQuarterStart(signTs), chargeNow = nq - startOfDay(signTs) > 14 * DAY;
  return { chargeNow, planStart: chargeNow ? quarterStart(signTs) : nq, nextQ: nq };
}
/* Money summary for any set of entries + fee plans. */
function moneyFor(entries, plans, clientOfPlan) {
  const now = Date.now(), t0 = startOfDay(), horizon = now + 90 * DAY;
  const paid = entries.filter(r => r.status === 'paid');
  const byType = {}; paid.forEach(r => byType[r.type] = (byType[r.type] || 0) + amt(r));
  const due = [];
  plans.forEach(p => {
    if (p.active === false) return;
    installments(p, horizon).forEach(i => { if (!i.entry) due.push({ kind: 'plan', plan: p, client: ownerOf(p), due: i.due, key: i.key, amount: Number(p.amount) || 0, label: p.label + ' · ' + periodLabel(i.due, p.frequency) }); });
  });
  entries.filter(r => r.status === 'invoiced' || r.status === 'expected').forEach(r => { if ((r.date || 0) <= horizon) due.push({ kind: 'entry', entry: r, due: r.date || now, amount: amt(r), label: r.description || lbl(REV_TYPES, r.type) }); });
  due.sort((a, b) => a.due - b.due);
  return {
    lifetime: total(paid), last12: total(paid.filter(r => r.date >= now - 365 * DAY)), ytd: total(paid.filter(r => r.date >= yearStart())),
    qtd: total(paid.filter(r => r.date >= quarterStart())),
    arr: plans.filter(planActive).reduce((a, p) => a + annualized(p), 0),
    overdue: due.filter(x => x.due < t0).reduce((a, x) => a + x.amount, 0),
    upcoming: due.filter(x => x.due >= t0).reduce((a, x) => a + x.amount, 0),
    due, byType, paid
  };
}
const clientMoney = cl => moneyFor(list('revenue').filter(r => r.clientId === cl.id), (cl.feePlans || []).map(p => withOwner(p, 'clients', cl.id)));
function firmMoney() { return moneyFor(list('revenue'), allPlans()); }
function companyScope(co) {
  const clientIds = new Set(list('contacts').filter(c => c.companyId === co.id).map(c => clientOf(c.id)).filter(Boolean).map(cl => cl.id));
  const entries = list('revenue').filter(r => r.companyId === co.id || (r.clientId && clientIds.has(r.clientId)));
  const plans = allPlans().filter(p => (p.ownerCol === 'companies' && p.ownerId === co.id) || (p.ownerCol === 'clients' && (clientIds.has(p.ownerId) || p.companyId === co.id)));
  return { entries, plans };
}
function sourceName(r) { const cl = byId('clients', r.clientId); if (cl) return cl.name; const co = byId('companies', r.companyId); if (co) return co.name; const c = byId('contacts', r.contactId); return c ? fullName(c) : 'Unassigned'; }

/* ---------- little charts (plain CSS) ---------- */
function typeBar(byType) {
  const t = Object.values(byType).reduce((a, b) => a + b, 0); if (!t) return '';
  const keys = REV_TYPES.map(x => x[0]).filter(k => byType[k]);
  return `<div class="stack">${keys.map(k => `<span style="width:${byType[k] / t * 100}%;background:${REV_COLOR[k]}" title="${esc(lbl(REV_TYPES, k))}: ${cash(byType[k])}"></span>`).join('')}</div>
  <div class="legend">${keys.map(k => `<span><i style="background:${REV_COLOR[k]}"></i>${esc(lbl(REV_TYPES, k))} <b>${cash(byType[k])}</b></span>`).join('')}</div>`;
}
function monthChart(paid) {
  const months = []; for (let i = 11; i >= 0; i--) { const s = new Date(new Date().getFullYear(), new Date().getMonth() - i, 1).getTime(); months.push({ s, e: addMonths(s, 1), by: {} }); }
  paid.forEach(r => { const m = months.find(m => r.date >= m.s && r.date < m.e); if (m) m.by[r.type] = (m.by[r.type] || 0) + amt(r); });
  const max = Math.max(1, ...months.map(m => Object.values(m.by).reduce((a, b) => a + b, 0)));
  return `<div class="mchart">${months.map(m => { const t = Object.values(m.by).reduce((a, b) => a + b, 0); return `<div class="mcol" title="${new Date(m.s).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}: ${cash(t)}"><div class="mval">${t ? moneyShort(t) : ''}</div><div class="mbar">${REV_TYPES.map(x => x[0]).filter(k => m.by[k]).map(k => `<span style="height:${m.by[k] / max * 100}%;background:${REV_COLOR[k]}"></span>`).join('')}</div><div class="mlab">${new Date(m.s).toLocaleDateString('en-US', { month: 'short' })}</div></div>`; }).join('')}</div>`;
}
function rankBars(rows) {
  const max = Math.max(1, ...rows.map(r => r[1]));
  return `<div class="bars">${rows.map(r => `<div class="b"><div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r[2] ? `<a href="#" data-act="openClient" data-id="${r[2]}">${esc(r[0])}</a>` : esc(r[0])}</div><div class="track"><div class="fill" style="width:${r[1] / max * 100}%"></div></div><div class="amt">${cash(r[1])}</div></div>`).join('') || '<div class="muted">Nothing yet.</div>'}</div>`;
}
function dueRows(due, showClient) {
  const t0 = startOfDay();
  return due.map(x => {
    const od = x.due < t0, own = x.kind === 'plan' ? { col: x.plan.ownerCol, doc: ownerOf(x.plan) } : x.entry.clientId ? { col: 'clients', doc: byId('clients', x.entry.clientId) } : { col: 'companies', doc: byId('companies', x.entry.companyId) };
    const cl = own.doc, ownAttr = x.kind === 'plan' ? `data-own="${x.plan.ownerCol}" data-oid="${x.plan.ownerId}" data-plan="${x.plan.id}" data-due="${x.due}"` : '';
    const acts = x.kind === 'plan'
      ? `<button class="btn sm primary" data-act="payInst" ${ownAttr}>Mark paid</button><button class="btn sm ghost" data-act="waiveInst" ${ownAttr} title="Waive">Waive</button>`
      : `<button class="btn sm primary" data-act="payEntry" data-id="${x.entry.id}">Mark paid</button><button class="btn sm ghost" data-act="editRev" data-id="${x.entry.id}">Edit</button>`;
    return `<div class="taskrow"><span class="sdot ${od ? 'od' : 'up'}"></span><div style="flex:1;min-width:0"><div class="tt">${esc(x.label)}${x.kind === 'entry' && x.entry.paidBy ? ' <span class="sub">from ' + esc(x.entry.paidBy) + '</span>' : ''}</div>
      <div class="sub"><span class="billpill b-${x.kind === 'plan' ? freqToBilling(x.plan.frequency) : billingOf(x.entry)}">${esc(lbl(BILLING, x.kind === 'plan' ? freqToBilling(x.plan.frequency) : billingOf(x.entry)))}</span> ${showClient && cl ? `<a href="#" data-act="${own.col === 'companies' ? 'openCompany' : 'openClient'}" data-id="${cl.id}">${esc(cl.name)}</a> · ` : ''}<span style="${od ? 'color:var(--red);font-weight:600' : ''}">${od ? 'Overdue · due ' : 'Due '}${fmtDate(x.due)}</span>${x.kind === 'entry' ? ' · ' + esc(lbl(REV_STATUS, x.entry.status)) : ''}</div></div>
      <b style="margin-right:4px">${cash(x.amount)}</b>${acts}</div>`;
  }).join('');
}
function ledgerRows(entries, showSource) {
  return entries.slice().sort((a, b) => (b.date || 0) - (a.date || 0)).map(r => `<tr class="click" data-act="editRev" data-id="${r.id}">
    <td class="sub w0">${fmtDate(r.date)}</td>${showSource ? `<td>${esc(sourceName(r))}</td>` : ''}
    <td><span class="tdot" style="background:${REV_COLOR[r.type] || '#999'}"></span>${esc(lbl(REV_TYPES, r.type))} <span class="billpill b-${billingOf(r)}">${esc(lbl(BILLING, billingOf(r)))}</span><div class="sub">${esc(r.description || '')}${r.paidBy && r.paidBy !== 'Client' ? ' · paid by ' + esc(r.paidBy) : ''}</div></td>
    <td><span class="pill ${REV_PILL[r.status] || ''}">${esc(lbl(REV_STATUS, r.status))}</span></td>
    <td class="w0" style="text-align:right;font-weight:700;font-variant-numeric:tabular-nums${r.status === 'waived' ? ';color:var(--faint);text-decoration:line-through' : ''}">${cash(r.amount)}</td></tr>`).join('');
}

/* ---------- record / edit a payment ---------- */
function revForm(r) {
  const cls = list('clients').slice().sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  const cos = list('companies').slice().sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  const deals = list('deals').slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  return `<div class="grid2">
    <label class="f"><span>Client</span><select name="clientId">${opt('', 'No client', r.clientId)}${cls.map(c => opt(c.id, c.name, r.clientId)).join('')}</select></label>
    <label class="f"><span>Company (optional)</span><select name="companyId">${opt('', 'None', r.companyId)}${cos.map(c => opt(c.id, c.name, r.companyId)).join('')}</select></label>
    <label class="f"><span>Type</span><select name="type" data-change="revType">${REV_TYPES.map(t => opt(t[0], t[1], r.type || 'deal')).join('')}</select></label>
    <label class="f"><span>Amount</span><input type="text" inputmode="decimal" name="amount" value="${r.amount ? esc(r.amount) : ''}" placeholder="0.00" required></label>
    <label class="f"><span>Status</span><select name="status">${REV_STATUS.map(s => opt(s[0], s[1], r.status || 'paid')).join('')}</select></label>
    <label class="f"><span>Date (received, or expected)</span><input type="date" name="date" value="${toDateInput(r.date || Date.now())}"></label>
    <label class="f"><span>Paid by</span><input type="text" name="paidBy" list="payerList" value="${esc(r.paidBy || 'Client')}"><datalist id="payerList">${Array.from(new Set(['Client'].concat(list('revenue').map(payerOf)))).map(p => `<option value="${esc(p)}">`).join('')}</datalist></label>
    <label class="f"><span>Billed</span><select name="billing">${BILLING.map(b => opt(b[0], b[1], billingOf(r))).join('')}</select></label>
    <label class="f"><span>Deal (optional)</span><select name="dealId">${opt('', 'None', r.dealId)}${deals.map(d => opt(d.id, d.name, r.dealId)).join('')}</select></label>
  </div>
  <label class="f"><span>Description</span><input type="text" name="description" value="${esc(r.description)}" placeholder="e.g. Cost seg study, 412 Main St"></label>
  <label class="f"><span>Notes</span><textarea name="notes" style="min-height:60px" placeholder="Invoice number, how it was calculated, who referred it">${esc(r.notes)}</textarea></label>
  ${r.id ? '' : `<label class="check" id="splitRow" style="${r.type === 'startup' ? '' : 'display:none'}"><input type="checkbox" name="split" ${r.type === 'startup' ? 'checked' : ''}> Split into two equal invoices (second one expected 30 days later)</label>`}
  <div class="hint">Commissions and referral fees: set <b>Paid by</b> to the partner (fund, equipment program, lender) so you can see who pays you for what.</div>`;
}
CHANGE.revType = (d, t) => { const r = $('#splitRow'); if (r) { r.style.display = t.value === 'startup' ? '' : 'none'; r.querySelector('input').checked = t.value === 'startup'; } };
function revData(o) {
  const deal = byId('deals', o.dealId);
  return {
    clientId: o.clientId || null, companyId: o.companyId || null, dealId: o.dealId || null, contactId: deal ? deal.contactId || null : null,
    type: o.type, amount: Math.round((Number(String(o.amount).replace(/[^0-9.\-]/g, '')) || 0) * 100) / 100, status: o.status,
    date: fromDateInput(o.date) || Date.now(), paidBy: o.paidBy || 'Client', description: o.description || '', notes: o.notes || '', billing: o.billing || 'project', updatedAt: Date.now()
  };
}
ACT.newRev = d => {
  const deal = byId('deals', d.deal);
  const pre = { clientId: d.client || (deal && (deal.clientId || (deal.contactId && clientOf(deal.contactId) ? clientOf(deal.contactId).id : ''))), companyId: d.company || (deal && deal.companyId) || '', dealId: d.deal || '', type: d.type || 'deal', amount: d.amount || (deal && deal.amount) || '', description: deal ? deal.name : '' };
  openModal({
    title: 'Record revenue', wide: true, body: revForm(pre),
    foot: `<button type="button" class="btn" data-act="closeModal">Cancel</button><button class="btn primary">${ic('dollar')}Save</button>`,
    submit: async o => {
      const r = revData(o); if (!r.amount) { toast('Enter an amount', 'error'); return false; }
      r.createdAt = Date.now(); r.createdBy = meName();
      if (o.split && r.type === 'startup') {
        const half = Math.round(r.amount / 2 * 100) / 100;
        await store.add('revenue', Object.assign({}, r, { amount: half, description: (r.description || 'Startup fee') + ' (1 of 2)' }));
        await store.add('revenue', Object.assign({}, r, { amount: Math.round((r.amount - half) * 100) / 100, status: 'expected', date: r.date + 30 * DAY, description: (r.description || 'Startup fee') + ' (2 of 2)' }));
      } else await store.add('revenue', r);
      if (r.clientId) await logAct({ type: 'system', clientId: r.clientId, body: 'Revenue recorded: ' + cash(r.amount) + ' ' + lbl(REV_TYPES, r.type).toLowerCase() + ' (' + lbl(REV_STATUS, r.status).toLowerCase() + ')' });
      toast('Saved');
    }
  });
};
ACT.editRev = d => {
  const r = byId('revenue', d.id); if (!r) return;
  openModal({
    title: 'Edit revenue', wide: true, body: revForm(r) + (r.planId ? `<div class="hint" style="margin-top:6px">Installment of a fee plan (${esc(r.period)}). Deleting it puts that installment back on the due list.</div>` : ''),
    foot: `<button type="button" class="btn ghost danger" data-act="delRev" data-id="${r.id}" style="margin-right:auto">Delete</button><button type="button" class="btn" data-act="closeModal">Cancel</button><button class="btn primary">Save</button>`,
    submit: async o => { const x = revData(o); if (!x.amount && x.status !== 'waived') { toast('Enter an amount', 'error'); return false; } await store.update('revenue', r.id, x); toast('Saved'); }
  });
};
ACT.delRev = async d => { if (!(await ask('Delete this revenue entry?', 'Delete'))) return; await store.remove('revenue', d.id); closeModal(); };
ACT.payEntry = async d => { await store.update('revenue', d.id, { status: 'paid', date: Date.now(), updatedAt: Date.now() }); toast('Marked paid'); };
function planEntry(own, ownerDoc, p, due, status, notes) {
  const isCo = own === 'companies';
  const contactId = isCo ? ((list('contacts').find(c => c.companyId === ownerDoc.id) || {}).id || null) : ((ownerDoc.contactIds || [])[0] || null);
  return { clientId: isCo ? null : ownerDoc.id, companyId: isCo ? ownerDoc.id : (p.companyId || null), dealId: null, contactId, planId: p.id, period: periodKey(due), type: p.type || 'quarterly', billing: freqToBilling(p.frequency),
    amount: Number(p.amount) || 0, status, date: status === 'paid' && !notes ? Date.now() : due, dueDate: due, paidBy: isCo ? ownerDoc.name : 'Client', description: p.label + ' · ' + periodLabel(due, p.frequency), notes: notes || '', createdAt: Date.now(), createdBy: meName(), updatedAt: Date.now() };
}
async function instEntry(d, status) {
  const own = d.own || 'clients', doc = byId(own, d.oid || d.cl), p = (doc.feePlans || []).find(x => x.id === d.plan), due = Number(d.due);
  await store.add('revenue', planEntry(own, doc, p, due, status));
  if (status === 'paid') await logAct({ type: 'system', clientId: own === 'clients' ? doc.id : null, contactId: own === 'companies' ? ((list('contacts').find(c => c.companyId === doc.id) || {}).id || null) : null, body: 'Payment received: ' + cash(p.amount) + ' for ' + p.label + ' ' + periodLabel(due, p.frequency) });
}
async function patchPlans(own, id, fn, note) {
  if (own === 'clients') return patchList(id, 'feePlans', fn, note);
  const doc = byId(own, id); const arr = clone(doc.feePlans || []); fn(arr);
  await store.update(own, id, { feePlans: arr, updatedAt: Date.now() });
}
ACT.payInst = async d => { await instEntry(d, 'paid'); toast('Marked paid'); };
ACT.waiveInst = async d => { if (await ask('Waive this installment? It will not count toward revenue.', 'Waive')) await instEntry(d, 'waived'); };

/* ---------- fee plans ---------- */
function tierStartup(t) { const f = (S.settings.general || {}).tierStartup || {}; return Number(f[t]) || 0; }
function tierFee(t) { const f = (S.settings.general || {}).tierFees || {}; return Number(f[t]) || DEFAULT_TIER_FEES[t] || 0; }
const tierPlanOf = cl => (cl.feePlans || []).find(p => p.frequency === 'quarterly' && p.type === 'quarterly' && planActive(p)) || null;
const feeFor = cl => cl.tier === 'special' ? (Number(cl.customFee) || 0) : tierFee(cl.tier);
function newTierPlan(tier, start, amount) { return { id: uid(), label: lbl(TIERS, tier) + ' quarterly strategy fee', amount: amount != null ? amount : tierFee(tier), frequency: 'quarterly', type: 'quarterly', start, end: null, companyId: null, active: true, tierLinked: true, createdAt: Date.now() }; }
ACT.addTierPlan = async d => {
  const cl = byId('clients', d.id), so = signOnPlan(Date.now()), fee = feeFor(cl);
  if (!fee) { toast('Set their Special quarterly fee first: click Edit on the client', 'error'); return; }
  const p = newTierPlan(cl.tier, so.planStart, fee);
  await patchList(cl.id, 'feePlans', a => a.push(p), 'Fee plan added: ' + p.label + ', ' + cash(p.amount) + ' quarterly');
  toast(p.label + ' added. ' + (so.chargeNow ? 'This quarter (' + periodLabel(so.planStart, 'quarterly') + ') is due now.' : 'First charge ' + fmtDate(so.planStart) + '.'));
};
function planForm(p, cl) {
  return `<label class="f"><span>Name</span><input type="text" name="label" value="${esc(p.label)}" required></label>
  <div class="grid3">
    <label class="f"><span>Amount per payment</span><input type="text" inputmode="decimal" name="amount" value="${p.amount ? esc(p.amount) : ''}" required></label>
    <label class="f"><span>Frequency</span><select name="frequency">${FREQ.map(f => opt(f[0], f[1], p.frequency || 'quarterly')).join('')}</select></label>
    <label class="f"><span>Type</span><select name="type">${REV_TYPES.map(t => opt(t[0], t[1], p.type || 'quarterly')).join('')}</select></label>
    <label class="f"><span>First payment due</span><input type="date" name="start" value="${toDateInput(p.start || quarterStart())}"></label>
    <label class="f"><span>Ends (optional)</span><input type="date" name="end" value="${toDateInput(p.end)}"></label>
    <label class="f"><span>Company (optional)</span><select name="companyId">${opt('', 'None', p.companyId)}${list('companies').map(c => opt(c.id, c.name, p.companyId)).join('')}</select></label>
  </div>
  ${p.id ? `<label class="check"><input type="checkbox" name="active" ${p.active !== false ? 'checked' : ''}> Active (uncheck to stop billing)</label>` : `<label class="check"><input type="checkbox" name="backfill" checked> Payments due before today were already received (record them as paid)</label>`}
  <div class="hint">Each payment shows on the due list when it comes up. Click <b>Mark paid</b> to log it in the ledger. Monthly plans count as <b>Monthly</b> revenue, quarterly as <b>Quarterly</b>. Quarterly plans always bill on the first day of the quarter (Jan 1, Apr 1, Jul 1, Oct 1).</div>`;
}
ACT.newPlan = d => {
  const own = d.own || 'clients', cl = byId(own, d.oid || d.cl), isCo = own === 'companies', fee = isCo ? 0 : feeFor(cl);
  const pre = isCo ? { label: 'Monthly retainer', amount: '', frequency: 'monthly', type: 'retainer', start: new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime() }
    : { label: lbl(TIERS, cl.tier) + ' quarterly strategy fee', amount: fee || '', frequency: 'quarterly', type: 'quarterly', start: cl.since ? quarterStart(cl.since) : quarterStart() };
  openModal({
    title: 'Add fee plan for ' + cl.name, wide: true, body: planForm(pre, cl),
    submit: async o => {
      const p = { id: uid(), label: o.label, amount: Number(String(o.amount).replace(/[^0-9.]/g, '')) || 0, frequency: o.frequency, type: o.type, start: fromDateInput(o.start), end: fromDateInput(o.end), companyId: o.companyId || null, active: true, createdAt: Date.now() };
      if (p.frequency === 'quarterly' && p.start) p.start = quarterStart(p.start);
      if (!p.amount || !p.start) { toast('Enter an amount and first due date', 'error'); return false; }
      await patchPlans(own, cl.id, a => a.push(p), 'Fee plan added: ' + p.label + ', ' + cash(p.amount) + ' ' + lbl(FREQ, p.frequency).toLowerCase());
      if (o.backfill) {
        for (const i of installments(p, startOfDay() - 1)) await store.add('revenue', planEntry(own, cl, p, i.due, 'paid', 'Recorded as already paid when the plan was added'));
      }
      toast('Fee plan added');
    }
  });
};
ACT.editPlan = d => {
  const own = d.own || 'clients', cl = byId(own, d.oid || d.cl), p = (cl.feePlans || []).find(x => x.id === d.plan);
  openModal({
    title: 'Edit fee plan', wide: true, body: planForm(p, cl),
    foot: `<button type="button" class="btn ghost danger" data-act="delPlan" data-own="${own}" data-oid="${cl.id}" data-plan="${p.id}" style="margin-right:auto">Delete plan</button><button type="button" class="btn" data-act="closeModal">Cancel</button><button class="btn primary">Save</button>`,
    submit: o => patchPlans(own, cl.id, a => { const x = a.find(x => x.id === p.id); Object.assign(x, { label: o.label, amount: Number(String(o.amount).replace(/[^0-9.]/g, '')) || 0, frequency: o.frequency, type: o.type, start: o.frequency === 'quarterly' && fromDateInput(o.start) ? quarterStart(fromDateInput(o.start)) : fromDateInput(o.start), end: fromDateInput(o.end), companyId: o.companyId || null, active: !!o.active }); }, o.active ? null : 'Fee plan stopped: ' + o.label)
  });
};
ACT.delPlan = async d => {
  if (!(await ask('Delete this fee plan? Payments already recorded stay in the ledger.', 'Delete'))) return;
  await patchPlans(d.own || 'clients', d.oid || d.cl, a => { const i = a.findIndex(x => x.id === d.plan); if (i >= 0) a.splice(i, 1); }); closeModal();
};

/* ---------- client / company / deal cards ---------- */
function moneyGrid(m) {
  return `<div class="moneygrid">
    <div><div class="l">Lifetime</div><div class="v">${cash(m.lifetime)}</div></div>
    <div><div class="l">Last 12 months</div><div class="v">${cash(m.last12)}</div></div>
    <div><div class="l">Recurring / yr</div><div class="v">${cash(m.arr)}</div></div>
    <div><div class="l">Outstanding</div><div class="v" style="${m.overdue ? 'color:var(--red)' : ''}">${cash(m.overdue)}</div><div class="sub">${cash(m.upcoming)} due next 90 days</div></div></div>`;
}
function plansList(plans) {
  if (!plans.length) return '';
  return `<div class="secthd" style="padding:0 16px">Fee plans</div>${plans.map(p => {
    const next = installments(p, Date.now() + 400 * DAY).find(i => !i.entry), ok = planActive(p), owner = ownerOf(p);
    return `<div class="taskrow" style="cursor:pointer" data-act="editPlan" data-own="${p.ownerCol}" data-oid="${p.ownerId}" data-plan="${p.id}"><span class="sdot ${ok ? 's-implemented' : ''}"></span><div style="flex:1;min-width:0"><div class="tt">${esc(p.label)} <span class="billpill b-${freqToBilling(p.frequency)}">${esc(lbl(BILLING, freqToBilling(p.frequency)))}</span></div>
      <div class="sub">${cash(p.amount)} ${esc(lbl(FREQ, p.frequency).toLowerCase())} · ${cash(annualized(p))}/yr · since ${fmtDate(p.start)}${!ok ? ' · stopped' : next ? ' · next ' + esc(periodLabel(next.due, p.frequency)) : ''}${owner && arguments[1] && owner.id !== arguments[1] ? ' · ' + esc(owner.name) : ''}</div></div></div>`;
  }).join('')}`;
}
function revenueCard(own, doc, entries, plans, hint) {
  const m = moneyFor(entries, plans), bb = billingBreakdown(entries, plans, m.due);
  const recAttr = own === 'clients' ? `data-client="${doc.id}"` : `data-company="${doc.id}"`;
  return `<div class="card"><div class="hd"><h3>Revenue</h3><div class="row" style="gap:6px"><button class="btn sm" data-act="newPlan" data-own="${own}" data-oid="${doc.id}">${ic('plus')}Fee plan</button><button class="btn sm primary" data-act="newRev" ${recAttr} data-type="deal">${ic('dollar')}Record</button></div></div>
    <div class="bd">${moneyGrid(m)}${billingTiles(bb, true)}${typeBar(m.byType)}${hint ? `<div class="hint" style="margin-top:8px">${hint}</div>` : ''}</div>
    ${plansList(plans, doc.id)}
    ${m.due.length ? `<div class="secthd" style="padding:0 16px">Due</div>${dueRows(m.due, own === 'companies')}` : ''}
    ${entries.length ? `<div class="secthd" style="padding:0 16px">Ledger</div><div class="tblwrap"><table class="tbl">${ledgerRows(entries.slice().sort((a, b) => b.date - a.date).slice(0, 12), own === 'companies')}</table></div>
      ${entries.length > 12 && own === 'clients' ? `<div class="bd"><a href="#" data-act="revForClient" data-id="${doc.id}">See all ${entries.length} entries</a></div>` : ''}` : `<div class="bd muted">No revenue recorded yet. Add a fee plan for monthly or quarterly fees, or record a project payment.</div>`}
  </div>`;
}
function tierPrompt(cl) {
  if (tierPlanOf(cl) || cl.status === 'former') return '';
  const fee = feeFor(cl);
  if (!fee) return `<div class="tierprompt"><div><b>No Special fee set yet.</b> <span class="sub">Special clients pay a custom quarterly amount.</span></div><button class="btn sm primary" data-act="editClient" data-id="${cl.id}">Set the amount</button></div>`;
  return `<div class="tierprompt"><div><b>No ${esc(lbl(TIERS, cl.tier))} fee plan yet.</b> <span class="sub">${cl.tier === 'special' ? 'Their special pricing' : esc(lbl(TIERS, cl.tier))} is ${cash(fee)} per quarter.</span></div><button class="btn sm primary" data-act="addTierPlan" data-id="${cl.id}">${ic('plus')}Add ${cash(fee)}/quarter plan</button></div>`;
}
function clientRevenueCard(cl) { return tierPrompt(cl) + revenueCard('clients', cl, list('revenue').filter(r => r.clientId === cl.id), (cl.feePlans || []).map(p => withOwner(p, 'clients', cl.id))); }
ACT.revForClient = d => { S.f.rclient = d.id; S.drawer = null; go('revenue'); };
function companyRevenueCard(co) { const sc = companyScope(co); return revenueCard('companies', co, sc.entries, sc.plans, 'Includes payments tagged to this company and from clients whose people work here.'); }
function dealRevenueCard(d) {
  const entries = list('revenue').filter(r => r.dealId === d.id), fee = feeOf(d);
  const got = total(entries.filter(r => r.status === 'paid' && r.type !== 'equity')), owed = fee ? fee.cash : (+d.amount || 0);
  return `<div class="card"><div class="hd"><h3>Revenue</h3><button class="btn sm primary" data-act="newRev" data-deal="${d.id}">${ic('dollar')}Record</button></div>
    <div class="bd"><div class="row"><div style="flex:1"><div class="sub">Cash collected</div><b style="font-size:18px">${cash(got)}</b></div><div style="flex:1"><div class="sub">${fee ? 'Cash fee' : 'Deal amount'}</div><b style="font-size:18px">${cash(owed)}</b></div><div style="flex:1"><div class="sub">Remaining</div><b style="font-size:18px">${cash(Math.max(0, owed - got))}</b></div></div></div>
    ${entries.length ? `<div class="tblwrap"><table class="tbl">${ledgerRows(entries, false)}</table></div>` : ''}</div>`;
}

/* ---------- firm-wide revenue page ---------- */
VIEWS.revenue = () => {
  const f = S.f, m = firmMoney();
  let rs = list('revenue').slice();
  if (f.ryear) rs = rs.filter(r => new Date(r.date).getFullYear() === +f.ryear);
  if (f.rtype) rs = rs.filter(r => r.type === f.rtype);
  if (f.rstatus) rs = rs.filter(r => r.status === f.rstatus);
  if (f.rclient) rs = rs.filter(r => r.clientId === f.rclient);
  if (f.rpayer) rs = rs.filter(r => payerOf(r) === f.rpayer);
  if (f.rbill) rs = rs.filter(r => billingOf(r) === f.rbill);
  const q = norm(f.q); if (q) rs = rs.filter(r => [sourceName(r), r.description, r.notes, payerOf(r)].some(x => norm(x).includes(q)));
  const years = Array.from(new Set(list('revenue').map(r => new Date(r.date).getFullYear()))).sort((a, b) => b - a);
  const payers = Array.from(new Set(list('revenue').map(payerOf))).sort();
  const filteredPaid = rs.filter(r => r.status === 'paid');
  const byClient = {}; m.paid.filter(r => r.date >= Date.now() - 365 * DAY).forEach(r => { const k = r.clientId || ('x:' + sourceName(r)); byClient[k] = (byClient[k] || 0) + amt(r); });
  const top = Object.keys(byClient).map(k => [k.startsWith('x:') ? k.slice(2) : (byId('clients', k) || {}).name || 'Deleted client', byClient[k], k.startsWith('x:') ? null : k]).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const byPayer = {}; m.paid.filter(r => r.date >= yearStart()).forEach(r => byPayer[payerOf(r)] = (byPayer[payerOf(r)] || 0) + amt(r));
  const tierArr = TIERS.map(t => [t[1] + ' recurring', list('clients').filter(cl => cl.tier === t[0] && cl.status !== 'former').reduce((a, cl) => a + (cl.feePlans || []).filter(planActive).reduce((s, p) => s + annualized(p), 0), 0), null]);
  const ytdByType = {}; m.paid.filter(r => r.date >= yearStart()).forEach(r => ytdByType[r.type] = (ytdByType[r.type] || 0) + amt(r));
  const kpi = (l, v, s) => `<div class="card kpi"><div class="l">${l}</div><div class="v">${v}</div><div class="s">${s}</div></div>`;
  const qn = 'Q' + (Math.floor(new Date().getMonth() / 3) + 1);
  return {
    title: 'Revenue',
    actions: `<button class="btn" data-act="exportRev">${ic('download')}Export</button><button class="btn primary" data-act="newRev">${ic('dollar')}Record revenue</button>`,
    body: `<div class="kpis">
      ${kpi('Collected ' + qn, moneyShort(m.qtd), 'this quarter')}
      ${kpi('Collected YTD', moneyShort(m.ytd), new Date().getFullYear())}
      ${kpi('Recurring / yr', moneyShort(m.arr), 'active fee plans')}
      ${kpi('Outstanding', moneyShort(m.overdue), m.overdue ? '<span style="color:var(--red)">past due</span>' : 'nothing past due')}
      ${kpi('Next 90 days', moneyShort(m.upcoming), 'scheduled or expected')}
      ${(pt => `<div class="card kpi click-kpi" data-act="go" data-v="deals" title="Open deals if they all close"><div class="l">Potential revenue</div><div class="v">${moneyShort(pt.cash + pt.eq)}</div><div class="s">${moneyShort(pt.cash)} cash${pt.eq ? ` · <span class="eqc-t">${moneyShort(pt.eq)} equity</span>` : ''}</div><div class="s">${plural(pt.n, 'open deal')}</div></div>`)(potentialRevenue())}
      ${(p => p.ds.length ? kpi('Equity held', moneyShort(p.est), moneyShort(p.basis) + ' basis') : '')(equityPortfolio())}
    </div>
    <div class="card" style="margin-bottom:18px"><div class="hd"><h3>How we're paid</h3><span class="sub">per project vs. monthly vs. quarterly</span></div><div class="bd">${billingTiles(billingBreakdown(list('revenue'), allPlans(), m.due))}</div></div>
    <div class="dash"><div class="col">
      <div class="card"><div class="hd"><h3>Collected by month</h3><span class="sub">last 12 months</span></div><div class="bd">${monthChart(m.paid)}${typeBar(ytdByType) ? '<div class="secthd" style="margin-top:14px">This year by type</div>' + typeBar(ytdByType) : ''}</div></div>
      <div class="card"><div class="hd"><h3>Due and upcoming</h3><span class="sub">${m.due.length} items</span></div>${m.due.length ? dueRows(m.due.slice(0, 15), true) : '<div class="bd muted">Nothing due in the next 90 days.</div>'}</div>
    </div><div class="col">
      <div class="card"><div class="hd"><h3>Top clients &amp; companies</h3><span class="sub">last 12 months</span></div><div class="bd">${rankBars(top)}</div></div>
      <div class="card"><div class="hd"><h3>Who pays us</h3><span class="sub">this year</span></div><div class="bd">${rankBars(Object.keys(byPayer).map(k => [k, byPayer[k], null]).sort((a, b) => b[1] - a[1]))}</div></div>
      <div class="card"><div class="hd"><h3>Recurring by tier</h3></div><div class="bd">${rankBars(tierArr)}</div></div>
    </div></div>
    ${recurringPlansCard()}
    ${equityCard()}
    <div class="secthd" style="margin-top:22px">Ledger</div>
    <div class="toolbar">
      <input type="search" class="search" placeholder="Search client, description, payer" data-keep="cq" data-input="cq" value="${esc(f.q)}">
      <select data-change="cf" data-k="ryear">${opt('', 'All years', f.ryear)}${years.map(y => opt(y, y, f.ryear)).join('')}</select>
      <select data-change="cf" data-k="rbill">${opt('', 'Any billing', f.rbill)}${BILLING.map(b => opt(b[0], b[1], f.rbill)).join('')}</select>
      <select data-change="cf" data-k="rtype">${opt('', 'All types', f.rtype)}${REV_TYPES.map(t => opt(t[0], t[1], f.rtype)).join('')}</select>
      <select data-change="cf" data-k="rstatus">${opt('', 'Any status', f.rstatus)}${REV_STATUS.map(t => opt(t[0], t[1], f.rstatus)).join('')}</select>
      <select data-change="cf" data-k="rclient">${opt('', 'All clients', f.rclient)}${list('clients').slice().sort((a, b) => (a.name || '').localeCompare(b.name || '')).map(c => opt(c.id, c.name, f.rclient)).join('')}</select>
      <select data-change="cf" data-k="rpayer">${opt('', 'Any payer', f.rpayer)}${payers.map(p => opt(p, p, f.rpayer)).join('')}</select>
      <span class="muted">${plural(rs.length, 'entry').replace('entrys', 'entries')} · <b style="color:var(--ink)">${cash(total(filteredPaid))}</b> collected</span>
    </div>
    <div class="card tblwrap">${rs.length ? `<table class="tbl"><thead><tr><th>Date</th><th>Client / source</th><th>Type</th><th>Status</th><th style="text-align:right">Amount</th></tr></thead><tbody>${ledgerRows(rs, true)}</tbody></table>` : '<div class="empty">No revenue entries match.</div>'}</div>`
  };
};
ACT.exportRev = () => {
  const head = ['Date', 'Client', 'Company', 'Deal', 'Billed', 'Type', 'Description', 'Paid by', 'Status', 'Amount', 'Period', 'Notes'];
  const rows = list('revenue').slice().sort((a, b) => a.date - b.date).map(r => [toDateInput(r.date), (byId('clients', r.clientId) || {}).name || '', (byId('companies', r.companyId) || {}).name || '', (byId('deals', r.dealId) || {}).name || '',
    lbl(BILLING, billingOf(r)), lbl(REV_TYPES, r.type), r.description || '', payerOf(r), lbl(REV_STATUS, r.status), amt(r).toFixed(2), r.period || '', r.notes || '']);
  const csv = [head].concat(rows).map(r => r.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(',')).join('\n');
  downloadFile('phillips-crm-revenue-' + toDateInput(Date.now()) + '.csv', csv, 'text/csv');
};

function recurringPlansCard() {
  const plans = allPlans(); if (!plans.length) return '';
  const groups = ['monthly', 'quarterly', 'annual'].map(k => [k, plans.filter(p => freqToBilling(p.frequency) === k)]).filter(g => g[1].length);
  const row = p => {
    const o = ownerOf(p), next = installments(p, Date.now() + 400 * DAY).find(i => !i.entry), ok = planActive(p);
    const od = next && next.due < startOfDay();
    return `<tr class="click" data-act="editPlan" data-own="${p.ownerCol}" data-oid="${p.ownerId}" data-plan="${p.id}"><td><div class="name">${o ? esc(o.name) : 'Deleted'}</div><div class="sub">${p.ownerCol === 'companies' ? 'Company' : 'Client'}</div></td>
      <td>${esc(p.label)}</td><td class="numc">${cash(p.amount)}</td><td class="numc" style="font-weight:700">${ok ? cash(annualized(p)) : '<span class="faint">stopped</span>'}</td>
      <td class="sub">${ok && next ? `<span style="${od ? 'color:var(--red);font-weight:600' : ''}">${od ? 'overdue ' : ''}${fmtDate(next.due)}</span>` : '—'}</td></tr>`;
  };
  return `<div class="card" style="margin-top:18px"><div class="hd"><h3>Recurring fee plans</h3><span class="sub">${cash(plans.filter(planActive).reduce((s, p) => s + annualized(p), 0))}/yr across ${plural(plans.filter(planActive).length, 'active plan')}</span></div>
    <div class="tblwrap"><table class="tbl"><thead><tr><th>Who</th><th>Plan</th><th style="text-align:right">Per payment</th><th style="text-align:right">Per year</th><th>Next due</th></tr></thead>
    ${groups.map(([k, ps]) => `<tbody><tr class="grouphd"><td colspan="5"><i class="kdot" style="background:${BILL_COLOR[k]}"></i>${esc(lbl(BILLING, k))} <span class="sub">${plural(ps.length, 'plan')} · ${cash(ps.filter(planActive).reduce((s, p) => s + annualized(p), 0))}/yr</span></td></tr>${ps.sort((a, b) => annualized(b) - annualized(a)).map(row).join('')}</tbody>`).join('')}
    </table></div></div>`;
}

/* Open deals valued as if they all close: client deals at their amount, company projects split into cash and equity. */
function potentialRevenue() {
  const open = list('deals').filter(d => stageKind(d.stage) === 'open');
  return open.reduce((a, d) => { const x = dealSplit(d); a.cash += x.cash; a.eq += x.eq; a.n++; return a; }, { cash: 0, eq: 0, n: 0 });
}
