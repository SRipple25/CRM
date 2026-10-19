/* ================= LOCAL MODE =================
   When no Firebase config is pasted in, the CRM runs entirely in this browser:
   - "My data" (starts blank) or "Sample data" (the demo), kept under separate keys
   - backup / restore to a JSON file (the same file imports into the live version)
   - emails open as a pre-filled Gmail draft and are logged
   - a preview automation engine runs workflows and sequences in the browser;
     everything happens for real except that emails are logged, not sent */

/* ---------- start screen ---------- */
function renderWelcome() {
  $('#root').innerHTML = `<div class="login"><div class="box" style="width:min(460px,calc(100vw - 32px));text-align:left">
    ${brandMark()}
    <p style="margin:10px 0 22px">Runs right here in your browser. Everything you enter is saved on this computer, and you can download a backup any time.</p>
    ${STORAGE_OK ? '' : `<div class="banner" style="margin:0 0 16px;background:var(--red-soft);border-color:#E8C3BE;color:var(--red)">This window can't save data (it's a preview). Download the file and open it in Chrome, Edge, or Safari to keep what you enter.</div>`}
    <button class="btn primary" style="width:100%;justify-content:center;padding:12px;margin-bottom:10px" data-act="chooseMode" data-v="mine">Start with my own data</button>
    <button class="btn" style="width:100%;justify-content:center;padding:12px;margin-bottom:10px" data-act="chooseMode" data-v="sample">Explore with sample data first</button>
    <button class="btn ghost" style="width:100%;justify-content:center" data-act="restore">Restore from a backup</button>
    <p class="hint" style="margin:18px 0 0">Email automation runs as a preview here: workflows, tasks, and sequences all work, and emails are logged as "would send" instead of going out.</p>
  </div></div>`;
}
const DATA_KEYS = { mine: 'legacycrm_local_v1', sample: 'legacycrm_demo_v10' };
function freshData() {
  return { settings: { general: { firmName: DEFAULT_FIRM, senderName: '', signature: '', team: clone(DEFAULT_TEAM), sources: clone(DEFAULT_SOURCES), me: DEFAULT_TEAM[0].name }, pipeline: { stages: clone(DEFAULT_STAGES) } } };
}
function startLocal(seed) {
  store = new LocalStore(DATA_KEYS[MODE] || DATA_KEYS.mine);
  if (seed) { store.data = seed; store.save(); }
  if (!store.data) { store.data = MODE === 'sample' ? demoData() : freshData(); store.save(); }
  S.user = { email: '', displayName: '' };
  renderShell(); subscribeAll(); schedule(false);
  try { if (navigator.storage && navigator.storage.persist) Promise.resolve(navigator.storage.persist()).catch(() => { }); } catch (e) { }
  localEngineStart();
}
function setMode(m, seed) {
  MODE = m;
  try { localStorage.setItem(MODE_KEY, m); } catch (e) { }
  startLocal(seed);
}
ACT.chooseMode = d => setMode(d.v);
ACT.switchMode = async d => {
  const to = d.v;
  const msg = to === 'sample' ? 'Switch to the sample data? Your own data stays saved and you can switch back any time.' : 'Switch back to your own data?';
  if (!(await ask(msg, 'Switch'))) return;
  try { localStorage.setItem(MODE_KEY, to); } catch (e) { }
  if (STORAGE_OK) location.reload(); else toast('Switching needs a browser that can save. Open the file in Chrome, Edge, or Safari.', 'error');
};
ACT.eraseLocal = async () => {
  if (!(await ask('Erase everything in "' + (MODE === 'sample' ? 'Sample data' : 'My data') + '" from this browser? This cannot be undone. Download a backup first if you might want it.', 'Erase'))) return;
  try { localStorage.removeItem(DATA_KEYS[MODE]); localStorage.removeItem(MODE_KEY); } catch (e) { }
  location.reload();
};

/* ---------- backup & restore ---------- */
const BACKUP_KEY = 'legacycrm_lastbackup';
const lastBackup = () => { try { return Number(localStorage.getItem(BACKUP_KEY + '_' + (MODE || 'live'))) || 0; } catch (e) { return 0; } };
function backupObject() {
  let data;
  if (LOCAL) data = clone(store.data);
  else {
    data = {};
    COLS.concat(['activities', 'jobs']).forEach(c => { data[c] = {}; list(c).forEach(d => { const o = Object.assign({}, d); delete o.id; data[c][d.id] = o; }); });
  }
  return { app: 'phillips-crm', version: 1, exportedAt: Date.now(), source: LOCAL ? 'local-' + MODE : 'live', data };
}
ACT.backup = () => {
  let text;
  try { text = JSON.stringify(backupObject(), null, 1); } catch (e) { console.error(e); toast('Could not build the backup: ' + e.message, 'error'); return; }
  if (!downloadFile('phillips-crm-backup-' + toDateInput(Date.now()) + '.json', text, 'application/json')) return;
  try { localStorage.setItem(BACKUP_KEY + '_' + (MODE || 'live'), String(Date.now())); } catch (e) { }
  toast('Backup downloaded. Keep it somewhere safe, like Google Drive.'); schedule(false);
};
ACT.restore = () => {
  openModal({
    title: 'Restore from a backup', wide: true,
    body: `<p class="hint" style="margin-top:0">Pick the backup file you downloaded, or paste the backup text you copied (for example from the preview window).</p>
      <div class="row" style="margin-bottom:12px"><button type="button" class="btn" data-act="restorePick">Choose backup file</button></div>
      <label class="f"><span>Or paste backup text</span><textarea id="restoreText" placeholder='Paste here. It starts with {"app": "phillips-crm"' style="width:100%;height:200px;font-family:ui-monospace,monospace;font-size:12px"></textarea></label>`,
    foot: `<button type="button" class="btn" data-act="closeModal">Cancel</button><button type="button" class="btn primary" data-act="restorePaste">Restore pasted text</button>`
  });
};
ACT.restorePaste = () => {
  const t = ($('#restoreText') || {}).value || '';
  if (!t.trim()) { toast('Paste the backup text first', 'error'); return; }
  closeModal(); applyBackupText(t.trim());
};
ACT.restorePick = () => {
  let inp = $('#restoreFile');
  if (!inp) {
    inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json,.txt,text/plain'; inp.id = 'restoreFile'; inp.style.display = 'none';
    document.body.appendChild(inp);
    inp.addEventListener('change', () => { const f = inp.files[0]; inp.value = ''; if (f) { closeModal(); readBackup(f); } });
  }
  inp.click();
};
function readBackup(file) {
  const r = new FileReader();
  r.onload = () => applyBackupText(r.result);
  r.readAsText(file);
}
async function applyBackupText(text) {
  {
    let obj; try { obj = JSON.parse(text); } catch (e) { toast('That is not a valid backup. Make sure you copied all of it.', 'error'); return; }
    if (!obj || !/^(phillips|legacy)-crm$/.test(obj.app) || !obj.data) { toast('That is not a CRM backup.', 'error'); return; }
    const n = Object.keys(obj.data.contacts || {}).length, k = Object.keys(obj.data.clients || {}).length;
    const when = obj.exportedAt ? fmtDT(obj.exportedAt) : 'unknown date';
    if (LOCAL) {
      if (!S.user) { setMode('mine', obj.data); toast('Restored ' + plural(n, 'contact') + ' and ' + plural(k, 'client')); return; }
      if (!(await ask('Replace everything in this browser with the backup from ' + when + ' (' + plural(n, 'contact') + ', ' + plural(k, 'client') + ')?', 'Replace'))) return;
      store.data = obj.data; store.save(); Object.keys(store.subs).forEach(c => store.emit(c));
      toast('Backup restored');
    } else {
      if (!(await ask('Import the backup from ' + when + ' into the shared database (' + plural(n, 'contact') + ', ' + plural(k, 'client') + ')? Records with the same ID are overwritten; nothing else is deleted.', 'Import'))) return;
      let done = 0, totalDocs = 0;
      Object.keys(obj.data).forEach(c => totalDocs += Object.keys(obj.data[c] || {}).length);
      toast('Importing ' + totalDocs + ' records…');
      for (const c of Object.keys(obj.data)) {
        for (const id of Object.keys(obj.data[c] || {})) {
          if (c === 'settings' && id === 'engine') continue;
          await store.set(c, id, obj.data[c][id]); done++;
          if (done % 100 === 0) toast(done + ' of ' + totalDocs + ' imported…');
        }
      }
      toast('Import finished: ' + done + ' records');
    }
  }
}
function localBanner() {
  if (MODE === 'sample') return `<div class="banner row" style="justify-content:space-between;flex-wrap:wrap"><span><b>Sample data.</b> Click around freely. Your own data is kept separately.</span><button class="btn sm primary" data-act="switchMode" data-v="mine">Go to my data</button></div>`;
  if (!STORAGE_OK) return `<div class="banner" style="background:var(--red-soft);border-color:#E8C3BE;color:var(--red)"><b>Not saving.</b> This window can't store data. Download index.html and open it in Chrome, Edge, or Safari. Use <a href="#" data-act="backup">Download backup</a> to keep what you entered here.</div>`;
  const lb = lastBackup(), stale = !lb || Date.now() - lb > 7 * DAY, has = list('contacts').length + list('clients').length > 0;
  return `<div class="banner row" style="justify-content:space-between;flex-wrap:wrap;${stale && has ? '' : 'background:var(--card);border-color:var(--line);color:var(--muted)'}">
    <span><b style="color:var(--ink)">Local mode.</b> Saved in this browser on this computer. Emails open in Gmail; automations run as a preview. <span style="${stale && has ? 'font-weight:600' : ''}">Last backup: ${lb ? ago(lb) : 'never'}.</span></span>
    <button class="btn sm ${stale && has ? 'primary' : ''}" data-act="backup">${ic('download')}Back up now</button></div>`;
}
function localDataCard() {
  return `<div class="card"><div class="hd"><h3>Data in this browser</h3><span class="pill ${MODE === 'sample' ? 'gold' : 'green'}">${MODE === 'sample' ? 'Sample data' : 'My data'}</span></div><div class="bd">
    <div class="row" style="flex-wrap:wrap;margin-bottom:10px"><button class="btn primary" data-act="backup">${ic('download')}Download backup</button><button class="btn" data-act="restore">Restore from backup</button></div>
    <div class="row" style="flex-wrap:wrap">${MODE === 'sample' ? '<button class="btn" data-act="switchMode" data-v="mine">Go to my data</button>' : '<button class="btn" data-act="switchMode" data-v="sample">Look at sample data</button>'}
      <button class="btn danger" data-act="eraseLocal">Erase ${MODE === 'sample' ? 'sample' : 'my'} data</button></div>
    <div class="hint" style="margin-top:10px">Your data lives in this browser only. Clearing browsing data, or using a different browser or computer, will not show it. Back up weekly. When you go live with Firebase, sign in and use <b>Restore from backup</b> there to bring everything over.</div>
  </div></div>`;
}

/* ---------- email in local mode: open a Gmail draft and log it ---------- */
function localEmailModal(c) {
  const tpls = list('templates').slice().sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  openModal({
    title: 'Email ' + fullName(c), wide: true,
    body: `<label class="f"><span>Start from a template</span><select data-change="pickTpl">${opt('', 'Blank email')}${tpls.map(t => opt(t.id, t.name)).join('')}</select></label>
      <label class="f"><span>To</span><input type="text" value="${esc(c.email)}" disabled></label>
      <label class="f"><span>Subject</span><input type="text" name="subject" data-merge></label>${chips()}
      <label class="f"><span>Message</span><textarea name="body" data-merge style="min-height:220px"></textarea></label>
      <div class="hint">Merge tags are filled in and your signature is added, then the email opens as a draft for you to review and send. It is logged on the timeline when you open it.</div>`,
    foot: `<button type="button" class="btn" data-act="closeModal">Cancel</button><button type="button" class="btn" data-act="mailGo" data-how="log" data-id="${c.id}">Just log it</button><button type="button" class="btn" data-act="mailGo" data-how="app" data-id="${c.id}">Mail app</button><button type="button" class="btn primary" data-act="mailGo" data-how="gmail" data-id="${c.id}">${ic('send')}Open in Gmail</button>`
  });
}
ACT.mailGo = async d => {
  const f = $('#mform'), c = byId('contacts', d.id); if (!f || !c) return;
  const v = mergeVars(c, null), g = S.settings.general || {};
  const subj = merge(f.elements.subject.value, v).trim();
  if (!subj) { toast('Add a subject', 'error'); return; }
  let body = merge(f.elements.body.value, v).replace(/<[^>]+>/g, '');
  if (g.signature && d.how !== 'log') body += '\n\n' + g.signature;
  if (d.how === 'gmail') window.open('https://mail.google.com/mail/?view=cm&fs=1&to=' + encodeURIComponent(c.email) + '&su=' + encodeURIComponent(subj) + '&body=' + encodeURIComponent(body), '_blank', 'noopener');
  if (d.how === 'app' && EMBEDDED) { toast("The mail app can't open from this preview window. Use Open in Gmail, or open the CRM in a full browser.", 'error'); return; }
  if (d.how === 'app') { const a =document.createElement('a'); a.href = 'mailto:' + encodeURIComponent(c.email) + '?subject=' + encodeURIComponent(subj) + '&body=' + encodeURIComponent(body); a.click(); }
  await logAct({ type: 'email', contactId: c.id, subject: subj, preview: body.replace(/\s+/g, ' ').slice(0, 300), by: meName() + (d.how === 'log' ? '' : d.how === 'gmail' ? ' via Gmail' : ' via mail app') });
  await store.update('contacts', c.id, { lastEmailedAt: Date.now() });
  closeModal(); toast('Logged on the timeline');
};

/* ---------- preview automation engine (browser port of apps-script/Code.gs) ---------- */
const ENG = { timer: null, running: false, again: false, started: false };
function localEngineKick() { if (!LOCAL || !store || !store.data || !ENG.started) return; clearTimeout(ENG.timer); ENG.timer = setTimeout(localEngineRun, 700); }
function localEngineStart() { if (ENG.started) return; ENG.started = true; setInterval(localEngineRun, 20000); localEngineKick(); }
const rawCol = c => Object.keys(store.col(c)).map(id => Object.assign({ id }, clone(store.col(c)[id])));
const rawGet = (c, id) => id && store.col(c)[id] ? Object.assign({ id }, clone(store.col(c)[id])) : null;
async function localEngineRun() {
  if (!store || !store.data) return;
  if (ENG.running) { ENG.again = true; return; }
  ENG.running = true;
  const st = { events: 0, jobs: 0, sent: 0, stoppedReply: 0, bounced: 0, errors: [] };
  try { await engEvents(st); await engDates(st); await engJobs(st); await engEnrollments(st); }
  catch (e) { console.error(e); st.errors.push(e.message || String(e)); }
  ENG.running = false;
  const prev = store.col('settings').engine || {};
  if (st.events || st.jobs || st.sent || st.errors.length || !prev.lastRunAt || Date.now() - prev.lastRunAt > 60000)
    await store.set('settings', 'engine', { lastRunAt: Date.now(), stats: st, local: true, account: 'preview' });
  if (ENG.again) { ENG.again = false; localEngineKick(); }
}
function engMatches(wf, ev, contact) {
  const t = wf.trigger || {}, d = ev.data || {};
  if (t.type !== ev.type) return false;
  if (ev.type === 'deal_stage_changed' && t.stage && t.stage !== d.to) return false;
  if (ev.type === 'tag_added' && t.tag && norm(t.tag) !== norm(d.tag)) return false;
  if (t.source && norm(t.source) !== norm(contact && contact.source)) return false;
  if (t.requireTag && !(contact && (contact.tags || []).map(norm).includes(norm(t.requireTag)))) return false;
  return true;
}
async function engEvents(st) {
  const evs = rawCol('events').filter(e => !e.processed).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  if (!evs.length) return;
  const wfs = rawCol('workflows').filter(w => w.active);
  for (const ev of evs) {
    const matched = [];
    if ((ev.depth || 0) <= 3) {
      const deal = rawGet('deals', ev.dealId), contact = rawGet('contacts', ev.contactId || (deal && deal.contactId));
      for (const wf of wfs) {
        if (!engMatches(wf, ev, contact)) continue;
        const subj = /^deal_/.test(ev.type) && deal ? ['deals', deal] : contact ? ['contacts', contact] : null;
        if (!wf.allowReenroll && subj && subj[1].workflowRuns && subj[1].workflowRuns[wf.id]) continue;
        let at = Date.now();
        for (const a of (wf.actions || [])) {
          if (a.type === 'delay') { at += (Number(a.days) || 0) * DAY + (Number(a.hours) || 0) * 3600000; continue; }
          await store.add('jobs', { type: a.type, params: clone(a), contactId: contact ? contact.id : null, dealId: deal ? deal.id : (ev.dealId || null), workflowId: wf.id, workflowName: wf.name, runAt: at, dueAt: at, status: 'pending', createdAt: Date.now(), depth: (ev.depth || 0) + 1 });
        }
        if (subj) { await store.update(subj[0], subj[1].id, { ['workflowRuns.' + wf.id]: Date.now() }); subj[1].workflowRuns = Object.assign({}, subj[1].workflowRuns, { [wf.id]: Date.now() }); }
        wf.runCount = (wf.runCount || 0) + 1;
        await store.update('workflows', wf.id, { runCount: wf.runCount, lastRunAt: Date.now() });
        matched.push(wf.name);
      }
    }
    await store.update('events', ev.id, { processed: true, processedAt: Date.now(), matched });
    st.events++;
  }
}
async function engDates(st) {
  if (ENG.lastDates && Date.now() - ENG.lastDates < 10 * 60000 && !ENG.forceDates) return;
  ENG.lastDates = Date.now(); ENG.forceDates = false;
  const wfs = rawCol('workflows').filter(w => w.active && isDateTrigger(w.trigger));
  if (!wfs.length) return;
  const clients = rawCol('clients');
  for (const wf of wfs) {
    for (const hit of dateTriggerHits(wf, clients, Date.now())) {
      const cl = hit.client, contactId = (cl.contactIds || [])[0] || null;
      let at = Date.now();
      for (const a of (wf.actions || [])) {
        if (a.type === 'delay') { at += (Number(a.days) || 0) * DAY + (Number(a.hours) || 0) * 3600000; continue; }
        await store.add('jobs', { type: a.type, params: clone(a), contactId, clientId: cl.id, dealId: null, workflowId: wf.id, workflowName: wf.name, runAt: at, dueAt: at, status: 'pending', createdAt: Date.now(), depth: 1 });
      }
      await store.update('clients', cl.id, { ['workflowRuns.' + wf.id + '|' + hit.key]: Date.now() });
      cl.workflowRuns = Object.assign({}, cl.workflowRuns, { [wf.id + '|' + hit.key]: Date.now() });
      wf.runCount = (wf.runCount || 0) + 1;
      await store.update('workflows', wf.id, { runCount: wf.runCount, lastRunAt: Date.now() });
      st.events++;
    }
  }
}
async function engJobs(st) {
  const now = Date.now();
  const jobs = rawCol('jobs').filter(j => j.status === 'pending' && (j.dueAt || j.runAt || 0) <= now).sort((a, b) => (a.runAt || 0) - (b.runAt || 0));
  for (const j of jobs) {
    try {
      const r = (await engJob(j, st)) || {};
      await store.update('jobs', j.id, { status: r.skipped ? 'skipped' : 'done', doneAt: Date.now(), dueAt: null, result: r.note || '' });
      st.jobs++;
    } catch (e) {
      st.errors.push('Step "' + j.type + '": ' + e.message);
      await store.update('jobs', j.id, { status: 'error', doneAt: Date.now(), dueAt: null, result: String(e.message).slice(0, 300) });
    }
  }
}
async function previewSend(contact, deal, subject, body, by, client) {
  const v = mergeVars(contact, deal, client), subj = merge(subject, v).trim() || '(no subject)';
  const text = merge(body, v).replace(/<[^>]+>/g, ' ');
  await logAct({ type: 'email', simulated: true, contactId: contact.id, dealId: deal ? deal.id : null, subject: subj, preview: text.replace(/\s+/g, ' ').trim().slice(0, 300), by });
  return subj;
}
async function engEnroll(contact, seqId, by) {
  if (!contact) return { skipped: true, note: 'No contact' };
  if (!contact.email) return { skipped: true, note: 'No email' };
  if (contact.status === 'unsubscribed' || contact.status === 'bounced') return { skipped: true, note: 'Contact is ' + contact.status };
  const seq = rawGet('sequences', seqId); if (!seq) return { skipped: true, note: 'Sequence not found' };
  if (rawCol('enrollments').some(e => e.contactId === contact.id && e.sequenceId === seqId && e.status === 'active')) return { skipped: true, note: 'Already enrolled' };
  await store.add('enrollments', { sequenceId: seqId, sequenceName: seq.name, contactId: contact.id, contactName: fullName(contact), email: contact.email, stepIndex: 0, status: 'active', startedAt: Date.now(), nextSendAt: Date.now() + stepDelay((seq.steps || [])[0]), sentCount: 0, enrolledBy: by });
  await logAct({ type: 'system', contactId: contact.id, body: 'Enrolled in sequence "' + seq.name + '"', by });
  return { note: 'Enrolled in "' + seq.name + '"' };
}
async function engJob(j, st) {
  const p = j.params || {}, contact = rawGet('contacts', j.contactId), deal = rawGet('deals', j.dealId), client = rawGet('clients', j.clientId);
  const by = j.workflowName ? 'Workflow: ' + j.workflowName : (j.createdBy || 'CRM');
  switch (j.type) {
    case 'send_email': {
      if (!contact) return { skipped: true, note: 'Contact no longer exists' };
      if (!contact.email) return { skipped: true, note: 'Contact has no email' };
      if (contact.status === 'bounced' || (contact.status === 'unsubscribed' && j.workflowName)) return { skipped: true, note: 'Contact is ' + contact.status };
      const tpl = rawGet('templates', p.templateId);
      const subject = p.subject || (tpl && tpl.subject) || '', body = p.body || (tpl && tpl.body) || '';
      if (!subject && !body) return { skipped: true, note: 'Template not found' };
      const s = await previewSend(contact, deal, subject, body, by + ' · preview, not sent', client); st.sent++;
      return { note: 'Would send "' + s + '"' };
    }
    case 'enroll_sequence': return engEnroll(contact, p.sequenceId, by);
    case 'create_task': {
      const assignee = p.assignee === '__owner' ? ((client && client.owner) || (contact && contact.owner) || (deal && deal.owner) || '') : (p.assignee || '');
      const due = new Date(); due.setDate(due.getDate() + (Number(p.dueDays) || 0)); due.setHours(10, 0, 0, 0);
      await store.add('tasks', { title: merge(p.title || 'Follow up with {{fullName}}', mergeVars(contact, deal, client)), contactId: contact ? contact.id : null, contactName: contact ? fullName(contact) : '', dealId: deal ? deal.id : null, clientId: client ? client.id : null, assignee, due: due.getTime(), done: false, notes: '', createdAt: Date.now(), createdBy: by });
      return { note: 'Task created' + (assignee ? ' for ' + assignee : '') };
    }
    case 'add_tag': {
      if (!contact) return { skipped: true, note: 'No contact' };
      const tags = contact.tags || [];
      if (tags.map(norm).includes(norm(p.tag))) return { skipped: true, note: 'Already tagged' };
      await store.update('contacts', contact.id, { tags: tags.concat([p.tag]), updatedAt: Date.now() });
      await store.add('events', { type: 'tag_added', contactId: contact.id, dealId: null, data: { tag: p.tag }, processed: false, createdAt: Date.now(), depth: j.depth || 1, by: 'Automation' });
      return { note: 'Tagged "' + p.tag + '"' };
    }
    case 'remove_tag': {
      if (!contact) return { skipped: true, note: 'No contact' };
      const left = (contact.tags || []).filter(t => norm(t) !== norm(p.tag));
      if (left.length === (contact.tags || []).length) return { skipped: true, note: 'Tag not present' };
      await store.update('contacts', contact.id, { tags: left, updatedAt: Date.now() });
      return { note: 'Removed "' + p.tag + '"' };
    }
    case 'set_stage': {
      if (!deal) return { skipped: true, note: 'Not triggered by a deal' };
      if (deal.stage === p.stage) return { skipped: true, note: 'Already in that stage' };
      await store.update('deals', deal.id, { stage: p.stage, stageChangedAt: Date.now(), updatedAt: Date.now() });
      await logAct({ type: 'stage', contactId: deal.contactId || null, dealId: deal.id, body: deal.name + ': ' + stageOf(deal.stage).name + ' → ' + stageOf(p.stage).name, by });
      await store.add('events', { type: 'deal_stage_changed', contactId: deal.contactId || null, dealId: deal.id, data: { from: deal.stage, to: p.stage }, processed: false, createdAt: Date.now(), depth: j.depth || 1, by: 'Automation' });
      return { note: 'Moved deal' };
    }
    case 'stop_sequences': {
      if (!contact) return { skipped: true, note: 'No contact' };
      const act = rawCol('enrollments').filter(e => e.contactId === contact.id && e.status === 'active');
      for (const e of act) await store.update('enrollments', e.id, { status: 'stopped', stopReason: 'Stopped by ' + by, endedAt: Date.now(), nextSendAt: null });
      return { note: act.length ? 'Stopped ' + act.length + ' sequence(s)' : 'Not in any sequence' };
    }
    case 'notify': {
      const owner = (client && client.owner) || (contact && contact.owner) || (deal && deal.owner);
      const to = p.to === '__owner' ? ((team().find(t => t.name === owner) || {}).email || owner || 'owner') : p.to;
      const v = mergeVars(contact, deal, client);
      await logAct({ type: 'system', contactId: contact ? contact.id : null, clientId: client ? client.id : null, dealId: deal ? deal.id : null, body: 'Would notify ' + (to || 'team') + ': ' + merge(p.subject || 'CRM alert: {{fullName}}', v), by: by + ' · preview' });
      return { note: 'Would notify ' + (to || 'team') };
    }
  }
  return { skipped: true, note: 'Unknown step ' + j.type };
}
function businessTimeLocal(ts) {
  const d = new Date(ts);
  for (let i = 0; i < 10; i++) {
    const day = d.getDay(), mins = d.getHours() * 60 + d.getMinutes();
    if (day === 0 || day === 6 || mins >= 17 * 60) { d.setDate(d.getDate() + 1); d.setHours(8, 30, 0, 0); continue; }
    if (mins < 8 * 60 + 30) d.setHours(8, 30, 0, 0);
    return d.getTime();
  }
  return d.getTime();
}
async function engEnrollments(st) {
  const now = Date.now();
  const due = rawCol('enrollments').filter(e => e.status === 'active' && e.nextSendAt != null && e.nextSendAt <= now).sort((a, b) => a.nextSendAt - b.nextSendAt);
  for (const en of due) {
    const end = (status, reason) => store.update('enrollments', en.id, { status, stopReason: reason || '', endedAt: Date.now(), nextSendAt: null, forceNow: false });
    const seq = rawGet('sequences', en.sequenceId);
    if (!seq) { await end('stopped', 'Sequence deleted'); continue; }
    if (seq.paused && !en.forceNow) continue;
    const contact = rawGet('contacts', en.contactId);
    if (!contact) { await end('stopped', 'Contact deleted'); continue; }
    if (contact.status === 'unsubscribed') { await end('unsubscribed', 'Contact unsubscribed'); continue; }
    if (contact.status === 'bounced') { await end('bounced', 'Email bounced'); continue; }
    if (seq.weekdaysOnly && !en.forceNow) { const bt = businessTimeLocal(Date.now()); if (bt > Date.now() + 60000) { await store.update('enrollments', en.id, { nextSendAt: bt }); continue; } }
    const steps = seq.steps || [], step = steps[en.stepIndex];
    if (!step) { await end('completed', ''); continue; }
    const tpl = rawGet('templates', step.templateId);
    let subject = step.subject || (tpl && tpl.subject) || '';
    const body = step.body || (tpl && tpl.body) || '';
    if (!subject && en.firstSubject) subject = /^re:/i.test(en.firstSubject) ? en.firstSubject : 'Re: ' + en.firstSubject;
    if (!body) { await end('error', 'Email ' + (en.stepIndex + 1) + ' has no content (template missing?)'); continue; }
    const s = await previewSend(contact, null, subject, body, 'Sequence: ' + seq.name + ' (email ' + (en.stepIndex + 1) + ') · preview, not sent');
    st.sent++;
    const next = en.stepIndex + 1, patch = { stepIndex: next, lastSentAt: Date.now(), sentCount: (en.sentCount || 0) + 1, forceNow: false };
    if (en.stepIndex === 0 || !en.firstSubject) patch.firstSubject = s;
    if (steps[next]) patch.nextSendAt = Date.now() + stepDelay(steps[next]); else { patch.status = 'completed'; patch.endedAt = Date.now(); patch.nextSendAt = null; }
    await store.update('enrollments', en.id, patch);
  }
}
/* Step through automations without waiting days */
ACT.runJobNow = async d => { await store.update('jobs', d.id, { runAt: Date.now(), dueAt: Date.now() }); toast('Running…'); localEngineKick(); };
ACT.runEnNow = async d => { await store.update('enrollments', d.id, { nextSendAt: Date.now(), forceNow: true }); toast('Sending the next email (preview)…'); localEngineKick(); };
ACT.markReplied = async d => {
  const e = byId('enrollments', d.id); if (!e) return;
  await store.update('enrollments', d.id, { status: 'replied', stopReason: 'Replied (marked by ' + meName() + ')', endedAt: Date.now(), nextSendAt: null });
  await logAct({ type: 'system', contactId: e.contactId, body: 'Replied, removed from sequence "' + e.sequenceName + '"' });
  toast('Marked as replied');
};

ACT.copyDl = async () => {
  const t = $('#dlText'); if (!t) return;
  t.select();
  let ok = false;
  try { await navigator.clipboard.writeText(t.value); ok = true; } catch (e) { try { ok = document.execCommand('copy'); } catch (e2) { } }
  toast(ok ? 'Copied. Paste it into a file and save it somewhere safe.' : 'Select all the text and copy it with Ctrl+C (Cmd+C on a Mac).', ok ? '' : 'error');
};
