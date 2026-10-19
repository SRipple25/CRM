/* ================= ADVISORY AGREEMENTS (basis points, cash + equity) =================
   A company can have an advisory agreement: we advise on their redevelopment
   projects for X basis points of each project's value, split between cash at
   closing and equity in the project. Each project is a deal with
   fee.structure = 'bps'. When the deal is Signed, the cash half becomes an
   invoice in the revenue ledger and the equity half is tracked on the deal
   (owed → issued → realized). Distributions and exit proceeds are recorded as
   revenue of type "Equity distribution / exit". */
REV_TYPES.splice(3, 0, ['advisory', 'Advisory fee (at closing)'], ['equity', 'Equity distribution / exit']);
REV_COLOR.advisory = '#7D5F1A'; REV_COLOR.equity = '#4F6B3A';
const EQ_STATUS = [['pending', 'Owed, not issued yet'], ['issued', 'Issued, held'], ['realized', 'Realized (sold or cashed out)'], ['forfeited', 'Forfeited']];
const EQ_PILL = { pending: 'gold', issued: 'green', realized: '', forfeited: 'red' };
const round2 = n => Math.round((Number(n) || 0) * 100) / 100;
const num = s => Number(String(s == null ? '' : s).replace(/[^0-9.\-]/g, '')) || 0;
const bpsText = b => (Number(b) || 0) + ' bps (' + ((Number(b) || 0) / 100).toFixed(2).replace(/\.?0+$/, '') + '%)';

/* A company's advisory agreement drives the terms of its open projects,
   unless a deal is explicitly set to custom terms. Closed and lost projects
   keep the terms they had when they closed. */
function agreementFor(d) {
  const co = d && d.companyId && byId('companies', d.companyId);
  return co && co.advisory && co.advisory.active !== false && co.advisory.bps ? co.advisory : null;
}
function followsAgreement(d) {
  const f = d && d.fee || {};
  return f.structure === 'bps' && f.followAgreement !== false && (!d.stage || stageKind(d.stage) === 'open') && !!agreementFor(d);
}
function feeOf(d) {
  const f = d && d.fee || {};
  if (f.structure !== 'bps') return null;
  const ag = followsAgreement(d) ? agreementFor(d) : null;
  const pv = Number(f.projectValue) || 0, bps = Number(ag ? ag.bps : f.bps) || 0, src = ag ? ag.cashPct : f.cashPct, cashPct = src == null || src === '' ? 50 : Number(src);
  const total = round2(pv * bps / 10000), cashAmt = round2(total * cashPct / 100);
  return { pv, bps, cashPct, total, cash: cashAmt, equity: round2(total - cashAmt), entity: f.entity || '' };
}
function feeSummary(fee) { return bpsText(fee.bps) + ' of ' + money(fee.pv) + ' = ' + cash(fee.total) + ': ' + cash(fee.cash) + ' cash at closing, ' + cash(fee.equity) + ' in equity'; }

/* ---------- deal form section ---------- */
function agreeRow(d, coId) {
  const co = byId('companies', coId != null ? coId : d.companyId), a = co && co.advisory && co.advisory.active !== false && co.advisory.bps ? co.advisory : null;
  if (!a) return '';
  const on = !(d.fee && d.fee.followAgreement === false);
  const closed = d.stage && stageKind(d.stage) !== 'open';
  return `<label class="check agree"><input type="checkbox" name="followAgreement" ${on ? 'checked' : ''} data-change="followAgree" data-bps="${esc(a.bps)}" data-cash="${esc(a.cashPct == null ? 50 : a.cashPct)}">
    <span>Use ${esc(co.name)}'s advisory agreement: <b>${esc(a.bps)} bps</b>, ${esc(a.cashPct == null ? 50 : a.cashPct)}% cash at closing${closed ? ' <span class="sub">(this deal is closed, so its terms stay as they were unless you save it with this checked)</span>' : ''}</span></label>`;
}
CHANGE.followAgree = (d, t) => applyAgree(t);
function applyAgree(cb) {
  const f = $('#mform'); if (!f) return;
  const on = cb && cb.checked;
  ['bps', 'cashPct'].forEach(k => { const el = f.elements[k]; if (!el) return; el.readOnly = !!on; el.closest('label').classList.toggle('locked', !!on); });
  if (on) { f.elements.bps.value = cb.dataset.bps; f.elements.cashPct.value = cb.dataset.cash; }
  INPUT.feeCalc();
}
CHANGE.dealCompany = (d, t) => {
  const box = $('#agreeRow'), f = $('#mform'); if (!box || !f) return;
  box.innerHTML = agreeRow({ fee: { followAgreement: true } }, t.value);
  const cb = f.elements.followAgreement;
  if (cb) { if (f.elements.feeStructure.value !== 'bps') { f.elements.feeStructure.value = 'bps'; CHANGE.feeStruct({}, f.elements.feeStructure); } applyAgree(cb); }
};
function feeFormSection(d) {
  const f = d.fee || {}, isBps = f.structure === 'bps';
  return `<div class="feebox">
    <label class="f"><span>How we get paid</span><select name="feeStructure" data-change="feeStruct">${opt('flat', 'Flat fee', isBps ? 'bps' : 'flat')}${opt('bps', 'Basis points of project value (cash + equity)', isBps ? 'bps' : 'flat')}</select></label>
    <div id="bpsFields" style="${isBps ? '' : 'display:none'}">
      <div id="agreeRow">${agreeRow(d)}</div>
      <div class="grid3">
        <label class="f"><span>Project value ($)</span><input type="text" inputmode="decimal" name="projectValue" value="${f.projectValue ? esc(f.projectValue) : ''}" placeholder="12,000,000" data-input="feeCalc"></label>
        <label class="f"><span>Basis points</span><input type="text" inputmode="decimal" name="bps" value="${f.bps != null ? esc(f.bps) : ''}" placeholder="150" data-input="feeCalc"></label>
        <label class="f"><span>Cash at closing (%)</span><input type="text" inputmode="decimal" name="cashPct" value="${f.cashPct != null ? esc(f.cashPct) : '50'}" data-input="feeCalc"></label>
      </div>
      <label class="f"><span>Equity received in (project entity)</span><input type="text" name="entity" value="${esc(f.entity)}" placeholder="e.g. Riverside Lofts Owner LLC"></label>
      <div class="feecalc" id="feeCalc"></div>
    </div></div>`;
}
CHANGE.feeStruct = (d, t) => {
  const on = t.value === 'bps', box = $('#bpsFields'), amtRow = $('#mform [name=amount]');
  if (box) box.style.display = on ? '' : 'none';
  if (amtRow) { amtRow.closest('label').style.display = on ? 'none' : ''; }
  INPUT.feeCalc();
};
INPUT.feeCalc = () => {
  const f = $('#mform'), out = $('#feeCalc'); if (!f || !out || !f.elements.feeStructure) return;
  const fee = feeOf({ fee: { structure: 'bps', projectValue: num(f.elements.projectValue.value), bps: num(f.elements.bps.value), cashPct: f.elements.cashPct.value === '' ? 50 : num(f.elements.cashPct.value) } });
  out.innerHTML = fee.total ? `<div class="fc"><div><div class="l">Total fee</div><b>${cash(fee.total)}</b></div><div><div class="l">Cash at closing</div><b>${cash(fee.cash)}</b></div><div><div class="l">Equity</div><b>${cash(fee.equity)}</b></div></div>` : '<span class="muted">Enter project value and basis points to see the fee.</span>';
};
function feeFromForm(o) {
  if (o.feeStructure !== 'bps') return { fee: { structure: 'flat' } };
  const fee = { structure: 'bps', projectValue: num(o.projectValue), bps: num(o.bps), cashPct: o.cashPct === '' || o.cashPct == null ? 50 : num(o.cashPct), entity: o.entity || '' };
  if ('followAgreement' in o) {
    fee.followAgreement = !!o.followAgreement;
    const a = fee.followAgreement && agreementFor({ companyId: o.companyId });
    if (a) { fee.bps = Number(a.bps) || 0; fee.cashPct = a.cashPct == null ? 50 : Number(a.cashPct); }
  }
  return { fee, amount: feeOf({ fee }).total };
}
/* Push the agreement's terms into every open project that follows it. */
async function syncAgreementDeals(coId) {
  const co = byId('companies', coId), a = co && co.advisory; if (!a) return 0;
  let n = 0;
  for (const d of list('deals').filter(d => d.companyId === coId && d.fee && d.fee.structure === 'bps' && d.fee.followAgreement !== false && stageKind(d.stage) === 'open')) {
    const fee = Object.assign({}, d.fee, { bps: Number(a.bps) || 0, cashPct: a.cashPct == null ? 50 : Number(a.cashPct) });
    const total = round2((Number(fee.projectValue) || 0) * fee.bps / 10000);
    if (Number(d.fee.bps) !== fee.bps || Number(d.fee.cashPct) !== fee.cashPct || Number(d.amount) !== total) { await store.update('deals', d.id, { fee, amount: total, updatedAt: Date.now() }); n++; }
  }
  return n;
}

/* ---------- when a bps deal is Signed ---------- */
async function onDealWon(id) {
  const d0 = byId('deals', id);
  const ag = d0 && d0.fee && d0.fee.structure === 'bps' && d0.fee.followAgreement !== false && agreementFor(d0);
  if (ag) { const f = Object.assign({}, d0.fee, { bps: Number(ag.bps), cashPct: ag.cashPct == null ? 50 : Number(ag.cashPct) }); await store.update('deals', id, { fee: f, amount: round2((Number(f.projectValue) || 0) * f.bps / 10000) }); }
  const d = Object.assign({}, byId('deals', id), ag ? { fee: Object.assign({}, d0.fee, { bps: Number(ag.bps), cashPct: ag.cashPct == null ? 50 : Number(ag.cashPct) }) } : {});
  const fee = feeOf(Object.assign({}, d, { stage: 'co_closed' })); if (!fee) return;
  const has = list('revenue').some(r => r.dealId === id && r.feeRole === 'closing_cash');
  const co = byId('companies', d.companyId);
  if (!has && fee.cash > 0) {
    await store.add('revenue', { clientId: d.clientId || null, companyId: d.companyId || null, dealId: id, contactId: d.contactId || null, type: 'advisory', feeRole: 'closing_cash', amount: fee.cash, status: 'invoiced', date: d.closeDate && d.closeDate > Date.now() - 30 * DAY ? d.closeDate : Date.now(), paidBy: co ? co.name : 'Client', description: d.name + ' closing fee (' + fee.cashPct + '% cash)', notes: bpsText(fee.bps) + ' of ' + money(fee.pv) + ' = ' + cash(fee.total) + ' total fee; ' + cash(fee.equity) + ' taken as equity', createdAt: Date.now(), createdBy: meName(), updatedAt: Date.now() });
  }
  if (!d.equity && fee.equity > 0) await store.update('deals', id, { equity: { status: 'pending', basis: fee.equity, estValue: fee.equity, entity: fee.entity, ownership: '', issuedAt: null, notes: '', updatedAt: Date.now() } });
  if ((!has && fee.cash > 0) || (!d.equity && fee.equity > 0)) {
    await logAct({ type: 'system', contactId: d.contactId || null, dealId: id, clientId: d.clientId || null, body: 'Closed: ' + cash(fee.cash) + ' closing fee invoiced, ' + cash(fee.equity) + ' equity owed' + (fee.entity ? ' in ' + fee.entity : '') });
    toast(cash(fee.cash) + ' closing invoice created; ' + cash(fee.equity) + ' equity tracked');
  }
}
ACT.closingInvoice = async d => { await onDealWon(d.id); };

/* ---------- equity on a deal ---------- */
ACT.editEquity = d => {
  const deal = byId('deals', d.id), fee = feeOf(deal) || {}, e = deal.equity || { status: 'pending', basis: fee.equity || 0, estValue: fee.equity || 0, entity: fee.entity || '' };
  openModal({
    title: 'Equity: ' + deal.name, wide: true,
    body: `<div class="grid2">
      <label class="f"><span>Held in (entity)</span><input type="text" name="entity" value="${esc(e.entity)}" placeholder="Project LLC"></label>
      <label class="f"><span>Status</span><select name="status">${EQ_STATUS.map(s => opt(s[0], s[1], e.status)).join('')}</select></label>
      <label class="f"><span>Basis (fee value taken as equity)</span><input type="text" inputmode="decimal" name="basis" value="${esc(e.basis)}"></label>
      <label class="f"><span>Estimated current value</span><input type="text" inputmode="decimal" name="estValue" value="${esc(e.estValue)}"></label>
      <label class="f"><span>Ownership (%, units, or class)</span><input type="text" name="ownership" value="${esc(e.ownership)}" placeholder="e.g. 0.9% Class B units"></label>
      <label class="f"><span>Issued on</span><input type="date" name="issuedAt" value="${toDateInput(e.issuedAt)}"></label></div>
      <label class="f"><span>Notes</span><textarea name="notes" placeholder="Operating agreement section, vesting, waterfall position, expected exit">${esc(e.notes)}</textarea></label>
      <div class="hint">Cash you receive from this equity (distributions, refinance proceeds, sale) is recorded as revenue with <b>Record distribution</b>, so it counts toward what you've collected.</div>`,
    submit: async o => {
      const x = { status: o.status, entity: o.entity, basis: num(o.basis), estValue: num(o.estValue), ownership: o.ownership, issuedAt: fromDateInput(o.issuedAt), notes: o.notes, updatedAt: Date.now() };
      if (x.status === 'issued' && !x.issuedAt) x.issuedAt = Date.now();
      if (x.status === 'realized') x.realizedAt = (deal.equity && deal.equity.realizedAt) || Date.now();
      await store.update('deals', deal.id, { equity: x });
      if (!deal.equity || deal.equity.status !== x.status) await logAct({ type: 'system', dealId: deal.id, contactId: deal.contactId || null, clientId: deal.clientId || null, body: 'Equity in ' + (x.entity || deal.name) + ': ' + lbl(EQ_STATUS, x.status).toLowerCase() });
      toast('Equity saved');
    }
  });
};
function dealFeeCard(d) {
  const fee = feeOf(d); if (!fee) return '';
  const rs = list('revenue').filter(r => r.dealId === d.id);
  const closing = rs.find(r => r.feeRole === 'closing_cash');
  const dist = total(rs.filter(r => r.type === 'equity' && r.status === 'paid'));
  const e = d.equity, won = stageKind(d.stage) === 'won';
  const ag = agreementFor(d), src = followsAgreement(d) ? `Following ${esc((byId('companies', d.companyId) || {}).name || 'company')}'s advisory agreement` : stageKind(d.stage) !== 'open' ? 'Terms as of closing' : ag ? '<span style="color:var(--amber)">Custom terms for this deal</span> (agreement is ' + esc(ag.bps) + ' bps)' : 'Terms set on this deal';
  return `<div class="card"><div class="hd"><h3>Advisory fee</h3><span class="sub">${esc(bpsText(fee.bps))}</span></div><div class="bd"><div class="sub" style="margin:-4px 0 10px">${src}</div>
    <div class="fc"><div><div class="l">Project value</div><b>${money(fee.pv)}</b></div><div><div class="l">Total fee</div><b>${cash(fee.total)}</b></div><div><div class="l">Cash at closing (${fee.cashPct}%)</div><b>${cash(fee.cash)}</b></div><div><div class="l">Equity (${round2(100 - fee.cashPct)}%)</div><b>${cash(fee.equity)}</b></div></div></div>
    <div class="taskrow"><span class="sdot ${closing ? (closing.status === 'paid' ? 's-implemented' : 'up') : ''}"></span><div style="flex:1"><div class="tt">Closing fee</div>
      <div class="sub">${closing ? `${esc(lbl(REV_STATUS, closing.status))} · ${fmtDate(closing.date)}` : won ? 'No invoice yet' : 'Invoiced automatically when the deal is Signed'}</div></div><b>${cash(fee.cash)}</b>
      ${closing ? (closing.status !== 'paid' ? `<button class="btn sm primary" data-act="payEntry" data-id="${closing.id}">Mark paid</button>` : '') + `<button class="btn sm ghost" data-act="editRev" data-id="${closing.id}">Edit</button>` : won ? `<button class="btn sm primary" data-act="closingInvoice" data-id="${d.id}">Create invoice</button>` : ''}</div>
    <div class="taskrow"><span class="sdot ${e ? (e.status === 'issued' ? 's-implemented' : e.status === 'pending' ? 'up' : '') : ''}"></span><div style="flex:1;min-width:0"><div class="tt">Equity${e && e.entity ? ' in ' + esc(e.entity) : fee.entity ? ' in ' + esc(fee.entity) : ''}</div>
      <div class="sub">${e ? `<span class="pill ${EQ_PILL[e.status] || ''}">${esc(lbl(EQ_STATUS, e.status))}</span>${e.ownership ? ' ' + esc(e.ownership) : ''}${e.issuedAt ? ' · issued ' + fmtDate(e.issuedAt) : ''} · est. value ${cash(e.estValue)}${dist ? ' · ' + cash(dist) + ' distributed' : ''}` : won ? 'Not tracked yet' : 'Tracked automatically when the deal is Signed'}</div></div><b>${cash(e ? e.basis : fee.equity)}</b>
      ${e || won ? `<button class="btn sm" data-act="editEquity" data-id="${d.id}">${e ? 'Update' : 'Track'}</button>` : ''}${e ? `<button class="btn sm ghost" data-act="newRev" data-deal="${d.id}" data-type="equity">Distribution</button>` : ''}</div>
  </div>`;
}

/* ---------- company advisory agreement ---------- */
function companyDeals(co) { return dealsForCompany(co); }
ACT.editAdvisory = d => {
  const co = byId('companies', d.id), a = co.advisory || { active: true, bps: '', cashPct: 50, scope: 'Redevelopment projects', since: Date.now() };
  openModal({
    title: 'Advisory agreement: ' + co.name, wide: true,
    body: `<label class="check"><input type="checkbox" name="active" ${a.active !== false ? 'checked' : ''}> Active agreement</label>
      <div class="grid3"><label class="f"><span>Basis points per project</span><input type="text" inputmode="decimal" name="bps" value="${esc(a.bps)}" placeholder="150" required></label>
      <label class="f"><span>Cash at closing (%)</span><input type="text" inputmode="decimal" name="cashPct" value="${esc(a.cashPct == null ? 50 : a.cashPct)}"></label>
      <label class="f"><span>Agreement date</span><input type="date" name="since" value="${toDateInput(a.since)}"></label></div>
      <label class="f"><span>Scope</span><input type="text" name="scope" value="${esc(a.scope)}" placeholder="Redevelopment projects"></label>
      <label class="f"><span>Notes</span><textarea name="notes" placeholder="How project value is defined (total capitalization? hard costs?), when equity is issued, any caps">${esc(a.notes)}</textarea></label>
      <div class="hint">Every open ${esc(co.name)} project follows these terms${(n => n ? ' (' + plural(n, 'open project') + ' now)' : '')(list('deals').filter(dd => dd.companyId === co.id && dd.fee && dd.fee.structure === 'bps' && dd.fee.followAgreement !== false && stageKind(dd.stage) === 'open').length)}. Saving a new rate updates them all. Closed projects keep the terms they closed at, and a single project can be switched to custom terms from its Edit screen.</div>`,
    foot: `${co.advisory ? `<button type="button" class="btn ghost danger" data-act="delAdvisory" data-id="${co.id}" style="margin-right:auto">Remove</button>` : ''}<button type="button" class="btn" data-act="closeModal">Cancel</button><button class="btn primary">Save agreement</button>`,
    submit: async o => {
      const x = { active: !!o.active, bps: num(o.bps), cashPct: o.cashPct === '' ? 50 : num(o.cashPct), since: fromDateInput(o.since), scope: o.scope || '', notes: o.notes || '', updatedAt: Date.now() };
      if (!x.bps) { toast('Enter the basis points', 'error'); return false; }
      await store.update('companies', co.id, { advisory: x });
      const n = await syncAgreementDeals(co.id);
      toast('Advisory agreement saved' + (n ? '. Updated ' + plural(n, 'open project') + ' to ' + x.bps + ' bps' : ''));
    }
  });
};
ACT.delAdvisory = async d => { if (!(await ask('Remove the advisory agreement? Existing deals keep their fee terms.', 'Remove'))) return; await store.update('companies', d.id, { advisory: DEL }); closeModal(); };
function advisoryCard(co) {
  const a = co.advisory;
  if (!a) return `<div class="card"><div class="bd row" style="justify-content:space-between;flex-wrap:wrap"><div><b>Advisory agreement</b><div class="sub">Advising this company on projects for basis points, cash and equity?</div></div><button class="btn sm" data-act="editAdvisory" data-id="${co.id}">${ic('plus')}Set up</button></div></div>`;
  const deals = companyDeals(co).filter(d => feeOf(d));
  const won = deals.filter(d => stageKind(d.stage) === 'won'), open = deals.filter(d => stageKind(d.stage) === 'open');
  const rs = list('revenue').filter(r => deals.some(d => d.id === r.dealId));
  const cashIn = total(rs.filter(r => r.status === 'paid' && r.type !== 'equity')), dist = total(rs.filter(r => r.status === 'paid' && r.type === 'equity'));
  const held = won.filter(d => d.equity && (d.equity.status === 'pending' || d.equity.status === 'issued'));
  const pipeFee = open.reduce((s, d) => s + feeOf(d).total, 0);
  return `<div class="card advisory"><div class="hd"><h3>Advisory agreement</h3><div class="row" style="gap:8px">${a.active === false ? '<span class="pill">Inactive</span>' : '<span class="pill gold">Active</span>'}<button class="btn sm" data-act="editAdvisory" data-id="${co.id}">Edit</button></div></div>
    <div class="bd"><div style="font-size:15px;margin-bottom:12px"><b>${esc(bpsText(a.bps))}</b> of each project · <b>${a.cashPct}%</b> cash at closing, <b>${round2(100 - a.cashPct)}%</b> equity<div class="sub">${esc(a.scope || '')}${a.since ? ' · since ' + fmtDate(a.since) : ''}</div></div>
    <div class="moneygrid">
      <div><div class="l">Projects</div><div class="v">${deals.length}</div><div class="sub">${won.length} closed · ${open.length} in progress</div></div>
      <div><div class="l">Cash collected</div><div class="v">${cash(cashIn)}</div><div class="sub">${money(won.reduce((s, d) => s + feeOf(d).pv, 0))} closed</div></div>
      <div><div class="l">Equity held</div><div class="v">${cash(held.reduce((s, d) => s + (+d.equity.estValue || 0), 0))}</div><div class="sub">${cash(held.reduce((s, d) => s + (+d.equity.basis || 0), 0))} basis · ${held.length} stake${held.length === 1 ? '' : 's'}</div></div>
      <div><div class="l">Fees in pipeline</div><div class="v">${cash(pipeFee)}</div><div class="sub">${dist ? cash(dist) + ' distributions received' : 'half cash, half equity'}</div></div>
    </div>${a.notes ? `<div class="hint" style="white-space:pre-wrap">${esc(a.notes)}</div>` : ''}</div></div>`;
}

/* ---------- firm-wide equity portfolio (Revenue page) ---------- */
function equityPortfolio() {
  const ds = list('deals').filter(d => d.equity);
  const live = ds.filter(d => d.equity.status === 'pending' || d.equity.status === 'issued');
  return { ds, live, basis: live.reduce((s, d) => s + (+d.equity.basis || 0), 0), est: live.reduce((s, d) => s + (+d.equity.estValue || 0), 0), owed: live.filter(d => d.equity.status === 'pending').reduce((s, d) => s + (+d.equity.basis || 0), 0) };
}
function equityCard() {
  const p = equityPortfolio(); if (!p.ds.length) return '';
  const rows = p.ds.slice().sort((a, b) => (b.equity.estValue || 0) - (a.equity.estValue || 0)).map(d => {
    const co = byId('companies', d.companyId), dist = total(list('revenue').filter(r => r.dealId === d.id && r.type === 'equity' && r.status === 'paid'));
    return `<tr class="click" data-act="openDeal" data-id="${d.id}"><td><div class="name">${esc(d.equity.entity || d.name)}</div><div class="sub">${esc(d.name)}${co ? ' · ' + esc(co.name) : ''}</div></td>
      <td><span class="pill ${EQ_PILL[d.equity.status] || ''}">${esc(lbl(EQ_STATUS, d.equity.status).split(',')[0])}</span>${d.equity.ownership ? `<div class="sub">${esc(d.equity.ownership)}</div>` : ''}</td>
      <td style="text-align:right">${cash(d.equity.basis)}</td><td style="text-align:right;font-weight:700">${cash(d.equity.estValue)}</td><td style="text-align:right" class="sub">${dist ? cash(dist) : '—'}</td></tr>`;
  }).join('');
  return `<div class="card" style="margin-top:18px"><div class="hd"><h3>Equity portfolio</h3><span class="sub">${cash(p.est)} est. value · ${cash(p.basis)} basis${p.owed ? ' · ' + cash(p.owed) + ' not issued yet' : ''}</span></div>
    <div class="tblwrap"><table class="tbl"><thead><tr><th>Stake</th><th>Status</th><th style="text-align:right">Basis</th><th style="text-align:right">Est. value</th><th style="text-align:right">Distributed</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
}

/* On startup, bring every open project in line with its company's agreement (once per session). */
let _agreeSynced = false;
async function syncAllAgreements() {
  if (_agreeSynced) return; _agreeSynced = true;
  let n = 0;
  for (const co of list('companies').filter(c => c.advisory && c.advisory.active !== false && c.advisory.bps)) n += await syncAgreementDeals(co.id);
  if (n) toast('Updated ' + plural(n, 'open project') + ' to match their advisory agreements');
}
