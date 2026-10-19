/**
 * PHILLIPS CRM: AUTOMATION ENGINE (Google Apps Script)
 *
 * Runs every 5 minutes under your Google Workspace account and:
 *   1. Turns CRM events (contact created, tag added, deal stage changed,
 *      website form) into workflow steps
 *   2. Runs due workflow steps (send email, enroll, create task, tag, notify…)
 *   3. Sends due sequence emails from Gmail, stopping when the contact
 *      replies, bounces, or unsubscribes
 *   4. Serves the website form endpoint and the unsubscribe link (web app)
 *
 * Setup: Project Settings > Script properties > add SERVICE_ACCOUNT_JSON
 * (the whole JSON key file). Optional: WEBAPP_URL after deploying.
 * Then run setup() once from the editor. See README for full steps.
 */
var VERSION = '1.0';
var CFG = {
  MAX_SENDS_PER_RUN: 40,   // keeps each run well inside Apps Script limits
  MIN_QUOTA: 10,           // stop sending when this few daily sends remain
  MAX_EVENT_DEPTH: 3,      // stops workflows from triggering each other forever
  RUN_BUDGET_MS: 270000    // 4.5 minutes; Apps Script hard limit is 6
};

/* =================== entry points =================== */

/** Run once from the editor: authorizes Gmail, tests Firestore, installs the 5 minute trigger. */
function setup() {
  secret_();
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'run') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('run').timeBased().everyMinutes(5).create();
  var g = fsGet_('settings', 'general');
  Logger.log('Firestore OK (project %s). Settings doc %s.', sa_().project_id, g ? 'found' : 'not created yet (save Settings in the CRM once)');
  Logger.log('Gmail OK. Sending as %s, %s sends left today. Aliases: %s', Session.getEffectiveUser().getEmail(), MailApp.getRemainingDailyQuota(), GmailApp.getAliases().join(', ') || 'none');
  run();
  Logger.log('First run complete. The engine now runs every 5 minutes.');
}

/** Sends a test email to yourself using your CRM signature. */
function sendTestEmail() {
  var ctx = ctx_();
  var me = Session.getEffectiveUser().getEmail();
  var html = toHtml_('This is a test from the Phillips CRM engine. If you are reading it, Gmail sending works.') + sig_(ctx);
  GmailApp.sendEmail(me, 'Phillips CRM test email', htmlToText_(html), { htmlBody: html, name: ctx.settings.senderName || undefined });
  Logger.log('Sent test email to %s', me);
}

/** Main loop, called by the time trigger. */
function run() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return;
  var ctx = null, stats = { events: 0, jobs: 0, sent: 0, stoppedReply: 0, bounced: 0, errors: [] };
  try {
    ctx = ctx_();
    processEvents_(ctx, stats);
    processDateTriggers_(ctx, stats);
    processJobs_(ctx, stats);
    processEnrollments_(ctx, stats);
  } catch (e) {
    stats.errors.push(String(e && e.message || e));
    console.error(e);
  } finally {
    try {
      stats.errors = stats.errors.slice(0, 5);
      fsSet_('settings', 'engine', {
        lastRunAt: Date.now(), durationMs: ctx ? Date.now() - ctx.started : 0, stats: stats,
        quotaLeft: MailApp.getRemainingDailyQuota(), account: Session.getEffectiveUser().getEmail(), version: VERSION
      });
    } catch (e2) { console.error('Could not write engine status: ' + e2); }
    lock.releaseLock();
  }
}

/** Web app GET: unsubscribe links. */
function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.a === 'unsub' && p.c && p.t) {
    if (p.t !== sign_(p.c)) return page_('This link is not valid.', 'If you meant to unsubscribe, reply to the email and we will take care of it.');
    var c = fsGet_('contacts', p.c);
    if (c && c.status !== 'unsubscribed') {
      fsUpdate_('contacts', c.id, { status: 'unsubscribed', unsubscribedAt: Date.now(), updatedAt: Date.now() });
      stopAllEnrollments_(c.id, 'unsubscribed', 'Unsubscribed via email link');
      activity_({ type: 'system', contactId: c.id, body: 'Unsubscribed via email link', by: 'Automation' });
    }
    return page_('You are unsubscribed.', 'You will not receive any more automated emails from us.');
  }
  return page_('Phillips CRM engine is running.', 'Version ' + VERSION);
}

/** Web app POST: website lead form. Accepts form fields or JSON. */
function doPost(e) {
  var p = {};
  try {
    if (e.postData && /json/.test(e.postData.type || '')) p = JSON.parse(e.postData.contents || '{}');
    else p = e.parameter || {};
  } catch (err) { return json_({ ok: false, error: 'Bad request' }); }
  if (p.website) return json_({ ok: true }); // honeypot field filled = bot
  var email = String(p.email || '').trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json_({ ok: false, error: 'A valid email is required' });

  var lock = LockService.getScriptLock(); lock.tryLock(10000);
  try {
    var lower = email.toLowerCase(), now = Date.now();
    var tags = String(p.tags || '').split(',').map(function (t) { return t.trim(); }).filter(String);
    var source = String(p.source || 'Website form').trim();
    var existing = fsQuery_('contacts', [['emailLower', 'EQUAL', lower]], { limit: 1 })[0];
    var id, isNew = !existing;
    if (existing) {
      id = existing.id;
      var patch = { updatedAt: now };
      ['firstName', 'lastName', 'phone', 'companyName', 'title'].forEach(function (k) { if (p[k] && !existing[k]) patch[k] = String(p[k]).trim(); });
      var cur = existing.tags || [], added = tags.filter(function (t) { return cur.map(norm_).indexOf(norm_(t)) < 0; });
      if (added.length) patch.tags = cur.concat(added);
      fsUpdate_('contacts', id, patch);
      added.forEach(function (t) { event_('tag_added', id, null, { tag: t }, 0); });
    } else {
      id = fsAdd_('contacts', {
        firstName: String(p.firstName || '').trim(), lastName: String(p.lastName || '').trim(), email: email, emailLower: lower,
        phone: String(p.phone || '').trim(), companyName: String(p.company || p.companyName || '').trim(), companyId: null, title: '',
        owner: String(p.owner || '').trim(), source: source, tags: tags, status: 'active', createdAt: now, updatedAt: now, createdBy: 'Website form'
      });
      activity_({ type: 'system', contactId: id, body: 'Contact created (source: ' + source + ')', by: 'Website form' });
      event_('contact_created', id, null, {}, 0);
      tags.forEach(function (t) { event_('tag_added', id, null, { tag: t }, 0); });
    }
    var msg = String(p.message || '').trim();
    activity_({ type: 'note', contactId: id, body: 'Website form submission' + (msg ? ':\n' + msg : ''), by: 'Website form' });
    event_('form_submitted', id, null, { source: source, isNew: isNew }, 0);
  } finally { lock.releaseLock(); }

  if (p.redirect) return HtmlService.createHtmlOutput('<p>Thanks! <a href="' + esc_(p.redirect) + '" target="_top">Continue</a></p><script>window.top.location.href=' + JSON.stringify(String(p.redirect)) + ';</script>');
  return json_({ ok: true });
}

/* =================== events -> workflow jobs =================== */

function processEvents_(ctx, stats) {
  var events = fsQuery_('events', [['processed', 'EQUAL', false]], { limit: 60 });
  if (!events.length) return;
  events.sort(function (a, b) { return (a.createdAt || 0) - (b.createdAt || 0); });
  var workflows = fsQuery_('workflows', [['active', 'EQUAL', true]]);
  events.forEach(function (ev) {
    if (!timeLeft_(ctx)) return;
    var matched = [];
    try {
      if ((ev.depth || 0) <= CFG.MAX_EVENT_DEPTH && workflows.length) {
        var deal = ev.dealId ? fsGet_('deals', ev.dealId) : null;
        var cid = ev.contactId || (deal && deal.contactId);
        var contact = cid ? fsGet_('contacts', cid) : null;
        workflows.forEach(function (wf) {
          if (!matches_(wf, ev, contact)) return;
          var subj = /^deal_/.test(ev.type) && deal ? { col: 'deals', doc: deal } : contact ? { col: 'contacts', doc: contact } : null;
          if (!wf.allowReenroll && subj && subj.doc.workflowRuns && subj.doc.workflowRuns[wf.id]) return;
          scheduleWorkflow_(wf, ev, contact, deal);
          matched.push(wf.name);
          var u = {}; u['workflowRuns.' + wf.id] = Date.now();
          if (subj) { fsUpdate_(subj.col, subj.doc.id, u); subj.doc.workflowRuns = subj.doc.workflowRuns || {}; subj.doc.workflowRuns[wf.id] = Date.now(); }
          wf.runCount = (wf.runCount || 0) + 1;
          fsUpdate_('workflows', wf.id, { runCount: wf.runCount, lastRunAt: Date.now() });
        });
      }
      fsUpdate_('events', ev.id, { processed: true, processedAt: Date.now(), matched: matched });
      stats.events++;
    } catch (e) {
      stats.errors.push('Event ' + ev.type + ': ' + e.message);
      try { fsUpdate_('events', ev.id, { processed: true, processedAt: Date.now(), error: String(e.message).slice(0, 300) }); } catch (e2) { }
    }
  });
}

function matches_(wf, ev, contact) {
  var t = wf.trigger || {};
  if (t.type !== ev.type) return false;
  var d = ev.data || {};
  if (ev.type === 'deal_stage_changed' && t.stage && t.stage !== d.to) return false;
  if (ev.type === 'tag_added' && t.tag && norm_(t.tag) !== norm_(d.tag)) return false;
  if (t.source && norm_(t.source) !== norm_(contact && contact.source)) return false;
  if (t.requireTag && !(contact && (contact.tags || []).map(norm_).indexOf(norm_(t.requireTag)) >= 0)) return false;
  return true;
}

function scheduleWorkflow_(wf, ev, contact, deal) {
  var at = Date.now();
  (wf.actions || []).forEach(function (a) {
    if (a.type === 'delay') { at += (Number(a.days) || 0) * 86400000 + (Number(a.hours) || 0) * 3600000; return; }
    fsAdd_('jobs', {
      type: a.type, params: a, contactId: contact ? contact.id : null, dealId: deal ? deal.id : (ev.dealId || null),
      workflowId: wf.id, workflowName: wf.name, runAt: at, dueAt: at, status: 'pending', createdAt: Date.now(), depth: (ev.depth || 0) + 1
    });
  });
}

/* =================== jobs =================== */

/* =================== date-based workflows =================== */
/* Checked hourly. Fires once per client per occurrence (per quarter, per review date). */
function processDateTriggers_(ctx, stats) {
  var props = PropertiesService.getScriptProperties(), last = Number(props.getProperty('LAST_DATE_CHECK')) || 0;
  if (Date.now() - last < 55 * 60000) return;
  props.setProperty('LAST_DATE_CHECK', String(Date.now()));
  var wfs = fsQuery_('workflows', [['active', 'EQUAL', true]]).filter(function (w) { return w.trigger && /^(before_quarter|before_review|after_signing)$/.test(w.trigger.type); });
  if (!wfs.length) return;
  var clients = fsQuery_('clients', []);
  wfs.forEach(function (wf) {
    dateHits_(wf, clients, Date.now()).forEach(function (hit) {
      var cl = hit.client, contactId = (cl.contactIds || [])[0] || null, at = Date.now();
      (wf.actions || []).forEach(function (a) {
        if (a.type === 'delay') { at += (Number(a.days) || 0) * 86400000 + (Number(a.hours) || 0) * 3600000; return; }
        fsAdd_('jobs', { type: a.type, params: a, contactId: contactId, clientId: cl.id, dealId: null, workflowId: wf.id, workflowName: wf.name, runAt: at, dueAt: at, status: 'pending', createdAt: Date.now(), depth: 1 });
      });
      var u = {}; u['workflowRuns.' + wf.id + '|' + hit.key] = Date.now(); fsUpdate_('clients', cl.id, u);
      cl.workflowRuns = cl.workflowRuns || {}; cl.workflowRuns[wf.id + '|' + hit.key] = Date.now();
      wf.runCount = (wf.runCount || 0) + 1; fsUpdate_('workflows', wf.id, { runCount: wf.runCount, lastRunAt: Date.now() });
      stats.events++;
    });
  });
}
function dayStart_(t) { var d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); }
function addMonths_(ts, m) { var d = new Date(ts), day = d.getDate(); d.setDate(1); d.setMonth(d.getMonth() + m); d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate())); return d.getTime(); }
function quarterStart_(t) { var d = new Date(t); return new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3, 1).getTime(); }
function quarterKey_(t) { var d = new Date(t); return d.getFullYear() + '-Q' + (Math.floor(d.getMonth() / 3) + 1); }
function ymd_(t) { var d = new Date(t); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
function hasQuarterlyPlan_(cl) { var t0 = dayStart_(Date.now()); return (cl.feePlans || []).some(function (p) { return p.frequency === 'quarterly' && p.active !== false && (!p.end || p.end >= t0); }); }
function dateHits_(wf, clients, now) {
  var t = wf.trigger || {}, days = (t.days === '' || t.days == null) ? 14 : Math.max(0, Number(t.days) || 0), today = dayStart_(now), out = [];
  clients.forEach(function (cl) {
    if (t.currentOnly !== false && (cl.status === 'former' || cl.status === 'paused')) return;
    if (t.tier && cl.tier !== t.tier) return;
    if (t.quarterlyOnly && !hasQuarterlyPlan_(cl)) return;
    var key = null;
    if (t.type === 'before_quarter') { var Q = addMonths_(quarterStart_(today), 3); if (today >= Q - days * 86400000) key = 'q:' + quarterKey_(Q); }
    else if (t.type === 'before_review' && cl.nextReview) { var R = dayStart_(cl.nextReview); if (today >= R - days * 86400000 && today <= R) key = 'r:' + ymd_(R); }
    else if (t.type === 'after_signing') { var F = dayStart_(cl.since || cl.createdAt || today) + days * 86400000; if (today >= F && today <= F + 7 * 86400000) key = 's'; }
    if (key && !((cl.workflowRuns || {})[wf.id + '|' + key])) out.push({ client: cl, key: key });
  });
  return out;
}

function processJobs_(ctx, stats) {
  var now = Date.now();
  // Only due items carry a numeric dueAt; finished jobs have it cleared, so they cost no reads.
  var jobs = fsQuery_('jobs', [['dueAt', 'LESS_THAN_OR_EQUAL', now]], { limit: 200, orderBy: 'dueAt' });
  for (var i = 0; i < jobs.length; i++) {
    var j = jobs[i];
    if (j.status !== 'pending') { fsUpdate_('jobs', j.id, { dueAt: null }); continue; }
    if (!timeLeft_(ctx) || ctx.sent >= CFG.MAX_SENDS_PER_RUN) break;
    try {
      var r = runJob_(ctx, j, stats) || {};
      if (r.defer) break; // out of quota; try again next run
      fsUpdate_('jobs', j.id, { status: r.skipped ? 'skipped' : 'done', doneAt: Date.now(), dueAt: null, result: r.note || '' });
      stats.jobs++;
    } catch (e) {
      stats.errors.push('Step "' + j.type + '": ' + e.message);
      fsUpdate_('jobs', j.id, { status: 'error', doneAt: Date.now(), dueAt: null, result: String(e.message).slice(0, 300) });
    }
  }
}

function runJob_(ctx, j, stats) {
  var p = j.params || {};
  var contact = j.contactId ? fsGet_('contacts', j.contactId) : null;
  var deal = j.dealId ? fsGet_('deals', j.dealId) : null;
  ctx.client = j.clientId ? fsGet_('clients', j.clientId) : null;
  var by = j.workflowName ? 'Workflow: ' + j.workflowName : (j.createdBy || 'CRM');
  switch (j.type) {
    case 'send_email': {
      if (!contact) return { skipped: true, note: 'Contact no longer exists' };
      if (!contact.email) return { skipped: true, note: 'Contact has no email' };
      if (contact.status === 'bounced') return { skipped: true, note: 'Contact email bounced' };
      if (contact.status === 'unsubscribed' && j.workflowName) return { skipped: true, note: 'Contact unsubscribed' };
      if (!hasQuota_()) return { defer: true };
      var tpl = p.templateId ? cached_(ctx, 'templates', p.templateId) : null;
      var subject = p.subject || (tpl && tpl.subject) || '', body = p.body || (tpl && tpl.body) || '';
      if (!subject && !body) return { skipped: true, note: 'Template not found' };
      var unsub = !!(p.unsubscribe || (j.workflowName && tpl && tpl.unsubscribe));
      var sent = send_(ctx, contact, deal, subject, body, { unsubscribe: unsub, by: by });
      stats.sent++;
      return { note: 'Sent "' + sent + '"' };
    }
    case 'enroll_sequence': return enroll_(ctx, contact, p.sequenceId, by);
    case 'create_task': {
      var assignee = p.assignee === '__owner' ? ((ctx.client && ctx.client.owner) || (contact && contact.owner) || (deal && deal.owner) || '') : (p.assignee || '');
      fsAdd_('tasks', {
        title: merge_(p.title || 'Follow up with {{fullName}}', vars_(ctx, contact, deal)), contactId: contact ? contact.id : null,
        contactName: contact ? fullName_(contact) : '', dealId: deal ? deal.id : null, assignee: assignee,
        due: dueAt_(Number(p.dueDays) || 0), done: false, notes: '', createdAt: Date.now(), createdBy: by
      });
      return { note: 'Task created' + (assignee ? ' for ' + assignee : '') };
    }
    case 'add_tag': {
      if (!contact) return { skipped: true, note: 'No contact' };
      var tags = contact.tags || [];
      if (tags.map(norm_).indexOf(norm_(p.tag)) >= 0) return { skipped: true, note: 'Already tagged' };
      fsUpdate_('contacts', contact.id, { tags: tags.concat([p.tag]), updatedAt: Date.now() });
      event_('tag_added', contact.id, null, { tag: p.tag }, j.depth || 1);
      return { note: 'Tagged "' + p.tag + '"' };
    }
    case 'remove_tag': {
      if (!contact) return { skipped: true, note: 'No contact' };
      var left = (contact.tags || []).filter(function (t) { return norm_(t) !== norm_(p.tag); });
      if (left.length === (contact.tags || []).length) return { skipped: true, note: 'Tag not present' };
      fsUpdate_('contacts', contact.id, { tags: left, updatedAt: Date.now() });
      return { note: 'Removed "' + p.tag + '"' };
    }
    case 'set_stage': {
      if (!deal) return { skipped: true, note: 'Not triggered by a deal' };
      if (deal.stage === p.stage) return { skipped: true, note: 'Already in that stage' };
      fsUpdate_('deals', deal.id, { stage: p.stage, stageChangedAt: Date.now(), updatedAt: Date.now() });
      activity_({ type: 'stage', contactId: deal.contactId || null, dealId: deal.id, body: deal.name + ': moved by workflow', by: by });
      event_('deal_stage_changed', deal.contactId || null, deal.id, { from: deal.stage, to: p.stage }, j.depth || 1);
      return { note: 'Moved deal' };
    }
    case 'stop_sequences': {
      if (!contact) return { skipped: true, note: 'No contact' };
      var n = stopAllEnrollments_(contact.id, 'stopped', 'Stopped by ' + by);
      return { note: n ? 'Stopped ' + n + ' sequence(s)' : 'Not in any sequence' };
    }
    case 'notify': {
      var to = p.to === '__owner' ? ownerEmail_(ctx, contact, deal) : p.to;
      if (!to) to = Session.getEffectiveUser().getEmail();
      if (!hasQuota_()) return { defer: true };
      var v = vars_(ctx, contact, deal);
      var html = toHtml_(merge_(p.body || '{{fullName}} ({{email}}) triggered the "' + (j.workflowName || '') + '" workflow.', v));
      GmailApp.sendEmail(to, merge_(p.subject || 'CRM alert: {{fullName}}', v) || 'CRM alert', htmlToText_(html), { htmlBody: html, name: firm_(ctx) + ' CRM' });
      return { note: 'Notified ' + to };
    }
  }
  return { skipped: true, note: 'Unknown step type ' + j.type };
}

function enroll_(ctx, contact, sequenceId, by) {
  if (!contact) return { skipped: true, note: 'No contact' };
  if (!contact.email) return { skipped: true, note: 'No email' };
  if (contact.status === 'unsubscribed' || contact.status === 'bounced') return { skipped: true, note: 'Contact is ' + contact.status };
  var seq = cached_(ctx, 'sequences', sequenceId);
  if (!seq) return { skipped: true, note: 'Sequence not found' };
  var active = fsQuery_('enrollments', [['contactId', 'EQUAL', contact.id], ['status', 'EQUAL', 'active']])
    .filter(function (e) { return e.sequenceId === sequenceId; });
  if (active.length) return { skipped: true, note: 'Already enrolled' };
  var first = (seq.steps || [])[0];
  fsAdd_('enrollments', {
    sequenceId: sequenceId, sequenceName: seq.name, contactId: contact.id, contactName: fullName_(contact), email: contact.email,
    stepIndex: 0, status: 'active', startedAt: Date.now(), nextSendAt: Date.now() + stepDelay_(first), sentCount: 0, enrolledBy: by
  });
  activity_({ type: 'system', contactId: contact.id, body: 'Enrolled in sequence "' + seq.name + '"', by: by });
  return { note: 'Enrolled in "' + seq.name + '"' };
}

/* =================== sequences =================== */

function processEnrollments_(ctx, stats) {
  var now = Date.now();
  // Ended enrollments have nextSendAt cleared, so only due, active ones are read.
  var due = fsQuery_('enrollments', [['nextSendAt', 'LESS_THAN_OR_EQUAL', now]], { limit: 200, orderBy: 'nextSendAt' });
  ctx.client = null;
  for (var i = 0; i < due.length; i++) {
    var en = due[i];
    if (en.status !== 'active') { fsUpdate_('enrollments', en.id, { nextSendAt: null }); continue; }
    if (!timeLeft_(ctx) || ctx.sent >= CFG.MAX_SENDS_PER_RUN) break;
    try {
      var seq = cached_(ctx, 'sequences', en.sequenceId);
      if (!seq) { endEnrollment_(en, 'stopped', 'Sequence deleted'); continue; }
      if (seq.paused) continue;
      var contact = fsGet_('contacts', en.contactId);
      if (!contact) { endEnrollment_(en, 'stopped', 'Contact deleted'); continue; }
      if (contact.status === 'unsubscribed') { endEnrollment_(en, 'unsubscribed', 'Contact unsubscribed'); continue; }
      if (contact.status === 'bounced') { endEnrollment_(en, 'bounced', 'Email bounced'); continue; }

      if (en.lastSentAt) {
        if (seq.stopOnReply !== false && hasReplied_(contact.email, en.startedAt)) {
          endEnrollment_(en, 'replied', 'Replied');
          activity_({ type: 'system', contactId: contact.id, body: 'Replied, removed from sequence "' + seq.name + '"', by: 'Automation' });
          stats.stoppedReply++;
          continue;
        }
        if (hasBounced_(contact.email, en.lastSentAt)) {
          fsUpdate_('contacts', contact.id, { status: 'bounced', updatedAt: Date.now() });
          endEnrollment_(en, 'bounced', 'Email bounced');
          activity_({ type: 'system', contactId: contact.id, body: 'Email to ' + contact.email + ' bounced. Marked as bounced and removed from "' + seq.name + '"', by: 'Automation' });
          stats.bounced++;
          continue;
        }
      }
      if (seq.weekdaysOnly) {
        var bt = businessTime_(Date.now());
        if (bt > Date.now() + 60000) { fsUpdate_('enrollments', en.id, { nextSendAt: bt }); continue; }
      }
      var steps = seq.steps || [], step = steps[en.stepIndex];
      if (!step) { endEnrollment_(en, 'completed', ''); continue; }
      if (!hasQuota_()) break;

      var tpl = step.templateId ? cached_(ctx, 'templates', step.templateId) : null;
      var subject = step.subject || (tpl && tpl.subject) || '';
      var body = step.body || (tpl && tpl.body) || '';
      if (!subject && en.firstSubject) subject = /^re:/i.test(en.firstSubject) ? en.firstSubject : 'Re: ' + en.firstSubject;
      if (!body) { endEnrollment_(en, 'error', 'Email ' + (en.stepIndex + 1) + ' has no content (template missing?)'); continue; }

      var sentSubject = send_(ctx, contact, null, subject, body, {
        unsubscribe: seq.unsubscribeLink !== false, from: seq.fromAlias,
        by: 'Sequence: ' + seq.name + ' (email ' + (en.stepIndex + 1) + ')'
      });
      stats.sent++;
      var next = en.stepIndex + 1, patch = { stepIndex: next, lastSentAt: Date.now(), sentCount: (en.sentCount || 0) + 1 };
      if (en.stepIndex === 0 || !en.firstSubject) patch.firstSubject = sentSubject;
      if (steps[next]) patch.nextSendAt = Date.now() + stepDelay_(steps[next]);
      else { patch.status = 'completed'; patch.endedAt = Date.now(); patch.nextSendAt = null; }
      fsUpdate_('enrollments', en.id, patch);
    } catch (e) {
      stats.errors.push('Sequence email to ' + en.email + ': ' + e.message);
      try { fsUpdate_('enrollments', en.id, { status: 'error', stopReason: String(e.message).slice(0, 300), endedAt: Date.now(), nextSendAt: null }); } catch (e2) { }
    }
  }
}

function endEnrollment_(en, status, reason) {
  fsUpdate_('enrollments', en.id, { status: status, stopReason: reason || '', endedAt: Date.now(), nextSendAt: null });
}
function stopAllEnrollments_(contactId, status, reason) {
  var act = fsQuery_('enrollments', [['contactId', 'EQUAL', contactId], ['status', 'EQUAL', 'active']]);
  act.forEach(function (e) { endEnrollment_(e, status, reason); });
  return act.length;
}
function stepDelay_(st) { return st ? (Number(st.delayDays) || 0) * 86400000 + (Number(st.delayHours) || 0) * 3600000 : 0; }

/** Next send time inside weekdays 8:30am to 5pm, in the script's time zone. */
function businessTime_(ts) {
  var d = new Date(ts);
  for (var i = 0; i < 10; i++) {
    var day = d.getDay(), mins = d.getHours() * 60 + d.getMinutes();
    if (day === 0 || day === 6 || mins >= 17 * 60) { d.setDate(d.getDate() + 1); d.setHours(8, 30, 0, 0); continue; }
    if (mins < 8 * 60 + 30) { d.setHours(8, 30, 0, 0); }
    return d.getTime();
  }
  return d.getTime();
}
function dueAt_(days) { var d = new Date(); d.setDate(d.getDate() + days); d.setHours(10, 0, 0, 0); return d.getTime(); }

/* =================== Gmail =================== */

function hasQuota_() { return MailApp.getRemainingDailyQuota() > CFG.MIN_QUOTA; }

function hasReplied_(email, since) {
  if (!email) return false;
  var q = 'from:' + email + ' after:' + Math.floor((since || 0) / 1000);
  return GmailApp.search(q, 0, 1).length > 0;
}
function hasBounced_(email, since) {
  if (!email) return false;
  var q = 'from:(mailer-daemon OR postmaster) after:' + Math.floor((since || 0) / 1000) + ' "' + email + '"';
  return GmailApp.search(q, 0, 1).length > 0;
}

/** Sends one email, logs it to the timeline. Returns the final subject. */
function send_(ctx, contact, deal, subject, body, o) {
  o = o || {};
  var v = vars_(ctx, contact, deal);
  var subj = merge_(subject, v).trim() || '(no subject)';
  var html = toHtml_(merge_(body, v)) + sig_(ctx);
  if (o.unsubscribe) {
    var url = unsubUrl_(contact.id);
    if (url) html += '<p style="font-size:11px;color:#8a8a8a;margin-top:28px">Prefer not to get these emails? <a href="' + url + '" style="color:#8a8a8a">Unsubscribe</a>.</p>';
  }
  html = '<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#222">' + html + '</div>';
  var s = ctx.settings, opts = { htmlBody: html };
  if (s.senderName) opts.name = s.senderName;
  var from = o.from || s.fromAlias;
  if (from && ctx.aliases().indexOf(from) >= 0) opts.from = from;
  if (s.bcc) opts.bcc = s.bcc;
  GmailApp.sendEmail(contact.email, subj, htmlToText_(html), opts);
  ctx.sent++;
  activity_({ type: 'email', contactId: contact.id, dealId: deal ? deal.id : null, subject: subj, preview: htmlToText_(toHtml_(merge_(body, v))).slice(0, 300), by: o.by || 'CRM' });
  fsUpdate_('contacts', contact.id, { lastEmailedAt: Date.now() });
  return subj;
}

function firm_(ctx) { return (ctx && ctx.settings && ctx.settings.firmName) || 'Phillips'; }
function sig_(ctx) { var s = ctx.settings.signature; return s ? '<div style="margin-top:4px">' + toHtml_(s) + '</div>' : ''; }

/* =================== templates / merge =================== */

function vars_(ctx, contact, deal) {
  var s = ctx.settings, sender = s.senderName || '';
  var company = '';
  if (contact) {
    company = contact.companyName || '';
    if (!company && contact.companyId) { var co = cached_(ctx, 'companies', contact.companyId); company = co ? co.name : ''; }
  }
  var v = {
    firstName: contact && contact.firstName || '', lastName: contact && contact.lastName || '', fullName: fullName_(contact),
    email: contact && contact.email || '', title: contact && contact.title || '', company: company,
    dealName: deal && deal.name || '', dealAmount: deal && deal.amount ? '$' + Math.round(deal.amount).toLocaleString('en-US') : '',
    senderName: sender, senderFirstName: String(sender).split(' ')[0], firmName: firm_(ctx)
  };
  var cl = ctx.client, nq = addMonths_(quarterStart_(Date.now()), 3), tiers = { platinum: 'Platinum', gold: 'Gold', silver: 'Silver', special: 'Special' };
  var md = function (t) { return Utilities.formatDate(new Date(t), Session.getScriptTimeZone(), 'MMMM d'); };
  v.clientName = cl ? cl.name || '' : ''; v.tier = cl ? tiers[cl.tier] || '' : ''; v.advisor = cl ? cl.owner || '' : '';
  v.nextQuarter = 'Q' + (Math.floor(new Date(nq).getMonth() / 3) + 1) + ' ' + new Date(nq).getFullYear();
  v.quarterStartDate = md(nq); v.reviewDate = cl && cl.nextReview ? md(cl.nextReview) : '';
  return v;
}
function merge_(str, v) {
  return String(str || '').replace(/\{\{\s*([\w.]+)\s*(?:\|([^}]*))?\}\}/g, function (m, k, def) {
    return (v[k] != null && v[k] !== '') ? v[k] : (def != null ? def.trim() : '');
  });
}
function toHtml_(t) {
  t = String(t || '');
  if (/^\s*</.test(t)) return t;
  return t.split(/\n{2,}/).map(function (p) {
    return '<p style="margin:0 0 12px">' + esc_(p).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>').replace(/\n/g, '<br>') + '</p>';
  }).join('');
}
function htmlToText_(h) {
  return String(h || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n\n').replace(/<a [^>]*href="([^"]+)"[^>]*>([^<]*)<\/a>/gi, '$2 ($1)')
    .replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n').trim();
}
function esc_(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function fullName_(c) { return c ? ([c.firstName, c.lastName].filter(String).join(' ') || c.email || '') : ''; }
function norm_(s) { return String(s || '').trim().toLowerCase(); }
function ownerEmail_(ctx, contact, deal) {
  var owner = (ctx.client && ctx.client.owner) || (contact && contact.owner) || (deal && deal.owner);
  var m = (ctx.settings.team || []).filter(function (t) { return t.name === owner && t.email; })[0];
  return m ? m.email : '';
}

/* =================== unsubscribe links =================== */

function secret_() {
  var p = PropertiesService.getScriptProperties(), s = p.getProperty('UNSUB_SECRET');
  if (!s) { s = Utilities.getUuid() + Utilities.getUuid(); p.setProperty('UNSUB_SECRET', s); }
  return s;
}
function sign_(id) {
  return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(String(id), secret_())).replace(/=+$/, '').slice(0, 24);
}
function unsubUrl_(id) {
  var base = PropertiesService.getScriptProperties().getProperty('WEBAPP_URL') || '';
  if (!base) { try { base = ScriptApp.getService().getUrl() || ''; } catch (e) { base = ''; } }
  if (!base) return '';
  return base + '?a=unsub&c=' + encodeURIComponent(id) + '&t=' + sign_(id);
}
function page_(title, sub) {
  var firm = 'Phillips';
  try { var g = fsGet_('settings', 'general'); if (g && g.firmName) firm = g.firmName; } catch (e) { }
  return HtmlService.createHtmlOutput('<div style="font-family:Georgia,serif;max-width:460px;margin:80px auto;text-align:center;color:#121110"><h2>' + esc_(title) + '</h2><p style="font-family:Arial,sans-serif;color:#555">' + esc_(sub) + '</p><p style="font-family:Arial,sans-serif;color:#A8862F;font-size:13px">' + esc_(firm) + '</p></div>').setTitle(firm);
}
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

/* =================== context / helpers =================== */

function ctx_() {
  var g = fsGet_('settings', 'general') || {};
  var aliases = null;
  return {
    started: Date.now(), settings: g, cache: {}, sent: 0,
    aliases: function () { if (!aliases) aliases = GmailApp.getAliases(); return aliases; }
  };
}
function cached_(ctx, col, id) {
  if (!id) return null;
  var k = col + '/' + id;
  if (!(k in ctx.cache)) ctx.cache[k] = fsGet_(col, id);
  return ctx.cache[k];
}
function timeLeft_(ctx) { return Date.now() - ctx.started < CFG.RUN_BUDGET_MS; }
function activity_(o) {
  o.at = Date.now(); o.by = o.by || 'Automation';
  if (!('dealId' in o)) o.dealId = null;
  return fsAdd_('activities', o);
}
function event_(type, contactId, dealId, data, depth) {
  return fsAdd_('events', { type: type, contactId: contactId || null, dealId: dealId || null, data: data || {}, processed: false, createdAt: Date.now(), depth: depth || 0, by: 'Automation' });
}

/* =================== Firestore REST (service account) =================== */

var _SA = null;
function sa_() {
  if (_SA) return _SA;
  var raw = PropertiesService.getScriptProperties().getProperty('SERVICE_ACCOUNT_JSON');
  if (!raw) throw new Error('Script property SERVICE_ACCOUNT_JSON is missing. See README step 5.');
  var sa = JSON.parse(raw);
  if (!sa.client_email || !sa.private_key || !sa.project_id) throw new Error('SERVICE_ACCOUNT_JSON is not a valid service account key file.');
  _SA = sa;
  return sa;
}
function token_() {
  var cache = CacheService.getScriptCache(), hit = cache.get('fs_token');
  if (hit) return hit;
  var sa = sa_(), now = Math.floor(Date.now() / 1000);
  var b64 = function (s) { return Utilities.base64EncodeWebSafe(s, Utilities.Charset.UTF_8).replace(/=+$/, ''); };
  var unsigned = b64(JSON.stringify({ alg: 'RS256', typ: 'JWT' })) + '.' +
    b64(JSON.stringify({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/datastore', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }));
  var sig = Utilities.base64EncodeWebSafe(Utilities.computeRsaSha256Signature(unsigned, sa.private_key)).replace(/=+$/, '');
  var res = UrlFetchApp.fetch('https://oauth2.googleapis.com/token', {
    method: 'post', muteHttpExceptions: true,
    payload: { grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: unsigned + '.' + sig }
  });
  if (res.getResponseCode() !== 200) throw new Error('Google auth failed: ' + res.getContentText().slice(0, 300));
  var t = JSON.parse(res.getContentText()).access_token;
  cache.put('fs_token', t, 3000);
  return t;
}
function fsBase_() { return 'https://firestore.googleapis.com/v1/projects/' + sa_().project_id + '/databases/(default)/documents'; }
function fsFetch_(url, method, body) {
  var o = { method: method || 'get', headers: { Authorization: 'Bearer ' + token_() }, muteHttpExceptions: true, contentType: 'application/json' };
  if (body) o.payload = JSON.stringify(body);
  var r = UrlFetchApp.fetch(url, o), code = r.getResponseCode();
  if (code === 404) return null;
  if (code >= 300) throw new Error('Firestore ' + (method || 'get') + ' ' + code + ': ' + r.getContentText().slice(0, 300));
  var t = r.getContentText();
  return t ? JSON.parse(t) : {};
}
function enc_(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return (isFinite(v) && Math.floor(v) === v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (v instanceof Date) return { integerValue: String(v.getTime()) };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(enc_) } };
  if (typeof v === 'object') return { mapValue: { fields: encFields_(v) } };
  return { stringValue: String(v) };
}
function encFields_(o) { var f = {}; Object.keys(o).forEach(function (k) { if (o[k] !== undefined && k !== 'id') f[k] = enc_(o[k]); }); return f; }
function dec_(v) {
  if (!v) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return new Date(v.timestampValue).getTime();
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(dec_);
  if ('mapValue' in v) return decFields_(v.mapValue.fields || {});
  if ('referenceValue' in v) return v.referenceValue;
  return null;
}
function decFields_(f) { var o = {}; Object.keys(f || {}).forEach(function (k) { o[k] = dec_(f[k]); }); return o; }
function docOf_(d) { if (!d || !d.name) return null; var o = decFields_(d.fields); o.id = d.name.split('/').pop(); return o; }
function fieldPath_(k) {
  return k.split('.').map(function (s) { return /^[A-Za-z_][A-Za-z0-9_]*$/.test(s) ? s : '`' + s.replace(/`/g, '\\`') + '`'; }).join('.');
}
function fsGet_(col, id) { return docOf_(fsFetch_(fsBase_() + '/' + col + '/' + encodeURIComponent(id))); }
function fsAdd_(col, data) { return fsFetch_(fsBase_() + '/' + col, 'post', { fields: encFields_(data) }).name.split('/').pop(); }
function fsSet_(col, id, data) { fsFetch_(fsBase_() + '/' + col + '/' + encodeURIComponent(id), 'patch', { fields: encFields_(data) }); }
/** Partial update. Keys may be dotted paths ("workflowRuns.abc"). */
function fsUpdate_(col, id, patch) {
  var nested = {};
  Object.keys(patch).forEach(function (k) {
    var parts = k.split('.'), o = nested;
    for (var i = 0; i < parts.length - 1; i++) { o[parts[i]] = o[parts[i]] || {}; o = o[parts[i]]; }
    o[parts[parts.length - 1]] = patch[k];
  });
  var mask = Object.keys(patch).map(function (k) { return 'updateMask.fieldPaths=' + encodeURIComponent(fieldPath_(k)); }).join('&');
  fsFetch_(fsBase_() + '/' + col + '/' + encodeURIComponent(id) + '?' + mask + '&currentDocument.exists=true', 'patch', { fields: encFields_(nested) });
}
/** Query. filters: [[field, 'EQUAL' | 'LESS_THAN_OR_EQUAL' | ..., value], ...] */
function fsQuery_(col, filters, opts) {
  opts = opts || {};
  var q = { from: [{ collectionId: col }] };
  var ff = (filters || []).map(function (f) { return { fieldFilter: { field: { fieldPath: f[0] }, op: f[1], value: enc_(f[2]) } }; });
  if (ff.length === 1) q.where = ff[0]; else if (ff.length > 1) q.where = { compositeFilter: { op: 'AND', filters: ff } };
  if (opts.orderBy) q.orderBy = [{ field: { fieldPath: opts.orderBy }, direction: 'ASCENDING' }];
  if (opts.limit) q.limit = opts.limit;
  var res = fsFetch_(fsBase_() + ':runQuery', 'post', { structuredQuery: q }) || [];
  return res.filter(function (r) { return r.document; }).map(function (r) { return docOf_(r.document); });
}
