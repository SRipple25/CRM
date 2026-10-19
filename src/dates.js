/* ================= DATE-BASED WORKFLOW TRIGGERS =================
   Workflows that fire on the calendar instead of on an event:
   - before_quarter: N days before each new quarter starts
   - before_review:  N days before a client's next review date
   - after_signing:  N days after a client signs
   Each fires once per client per occurrence (per quarter, per review date). */
Object.assign(TRIGGERS, {
  before_quarter: 'Days before each new quarter (clients)',
  before_review: "Days before a client's review date",
  after_signing: 'Days after a client signs'
});
const DATE_TRIGGERS = new Set(['before_quarter', 'before_review', 'after_signing']);
const isDateTrigger = t => !!t && DATE_TRIGGERS.has(t.type);
const trigDays = t => (t.days === '' || t.days == null) ? 14 : Math.max(0, Number(t.days) || 0);
function dateTriggerSummary(t) {
  const n = trigDays(t), d = plural(n, 'day');
  let s = t.type === 'before_quarter' ? d + ' before each new quarter' : t.type === 'before_review' ? d + " before a client's review date" : d + ' after a client signs';
  const who = [];
  if (t.tier) who.push(lbl(TIERS, t.tier) + ' clients');
  if (t.quarterlyOnly) who.push('with a quarterly fee plan');
  if (t.currentOnly !== false) who.push('current clients only');
  return s + (who.length ? ' · ' + who.join(', ') : '');
}
function clientHasQuarterly(cl) { return (cl.feePlans || []).some(p => p.frequency === 'quarterly' && p.active !== false && (!p.end || p.end >= startOfDay())); }
/* Which clients should fire this workflow today, and the occurrence key for each. */
function dateTriggerHits(wf, clients, now) {
  const t = wf.trigger || {}, days = trigDays(t), today = startOfDay(now || Date.now()), out = [];
  clients.forEach(cl => {
    if (t.currentOnly !== false && (cl.status === 'former' || cl.status === 'paused')) return;
    if (t.tier && cl.tier !== t.tier) return;
    if (t.quarterlyOnly && !clientHasQuarterly(cl)) return;
    let key = null;
    if (t.type === 'before_quarter') {
      const Q = addMonths(quarterStart(today), 3);
      if (today >= Q - days * DAY) key = 'q:' + quarterKey(Q);
    } else if (t.type === 'before_review' && cl.nextReview) {
      const R = startOfDay(cl.nextReview);
      if (today >= R - days * DAY && today <= R) key = 'r:' + toDateInput(R);
    } else if (t.type === 'after_signing') {
      const F = startOfDay(cl.since || cl.createdAt || today) + days * DAY;
      if (today >= F && today <= F + 7 * DAY) key = 's';
    }
    if (key && !((cl.workflowRuns || {})[wf.id + '|' + key])) out.push({ client: cl, key });
  });
  return out;
}
/* The next date a date-based workflow would fire (for the editor preview). */
function nextDateFire(t) {
  if (t.type !== 'before_quarter') return null;
  const today = startOfDay(), days = trigDays(t);
  let Q = addMonths(quarterStart(today), 3);
  if (today > Q - days * DAY) return { fire: today, q: Q, now: true };
  return { fire: Q - days * DAY, q: Q };
}
/* Merge tags that come from the client record. */
function clientVars(cl) {
  const nq = addMonths(quarterStart(), 3);
  return {
    clientName: cl ? cl.name : '', tier: cl ? lbl(TIERS, cl.tier) : '', advisor: cl ? cl.owner || '' : '',
    nextQuarter: periodLabel(nq, 'quarterly'), quarterStartDate: new Date(nq).toLocaleDateString('en-US', { month: 'long', day: 'numeric' }),
    reviewDate: cl && cl.nextReview ? new Date(cl.nextReview).toLocaleDateString('en-US', { month: 'long', day: 'numeric' }) : ''
  };
}
['clientName', 'tier', 'advisor', 'nextQuarter', 'quarterStartDate', 'reviewDate'].forEach(k => { if (!MERGE_TAGS.includes(k)) MERGE_TAGS.push(k); });
const _mergeVarsBase = mergeVars;
mergeVars = function (contact, deal, client) {
  const v = _mergeVarsBase(contact, deal);
  const cl = client || (contact && clientOf(contact.id)) || null;
  return Object.assign(v, clientVars(cl));
};
