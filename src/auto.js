/* ================= TEMPLATES ================= */
let _tplSample = null;
VIEWS.templates = () => {
  const ts = list('templates').slice().sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  const usedIn = id => list('sequences').filter(s => (s.steps || []).some(st => st.templateId === id)).length + list('workflows').filter(w => (w.actions || []).some(a => a.templateId === id)).length;
  return {
    title: 'Templates', actions: `<button class="btn primary" data-act="editTpl">${ic('plus')}New template</button>`,
    body: ts.length ? `<div class="tiles">${ts.map(t => `<div class="card tile" data-act="editTpl" data-id="${t.id}"><h4>${esc(t.name)}</h4><div class="sub" style="margin-bottom:8px">${esc(t.subject || '(no subject)')}</div>
      <div class="hint" style="display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden">${esc(t.body || '')}</div>
      <div class="stats"><span>Used in <b style="display:inline">${usedIn(t.id)}</b></span><span>Updated ${ago(t.updatedAt || t.createdAt)}</span></div></div>`).join('')}</div>`
      : `<div class="card empty"><h4>No templates yet</h4><p>Templates are reusable emails with merge tags like {{firstName}}. Use them in one-off emails, sequences, and workflows.</p>
        <div class="row" style="justify-content:center"><button class="btn" data-act="loadStarters">Load starter templates, sequence & workflow</button><button class="btn primary" data-act="editTpl">${ic('plus')}New template</button></div></div>`
  };
};
ACT.editTpl = d => {
  const t = d.id ? byId('templates', d.id) : { unsubscribe: false };
  _tplSample = list('contacts').find(c => c.firstName) || { firstName: 'Alex', lastName: 'Rivera', email: 'alex@example.com', companyName: 'Rivera Holdings' };
  openModal({
    title: d.id ? 'Edit template' : 'New template', wide: true,
    body: `<div class="edgrid" style="grid-template-columns:minmax(0,1fr) minmax(0,1fr)"><div>
      <label class="f"><span>Template name (internal)</span><input type="text" name="name" value="${esc(t.name)}" required></label>
      <label class="f"><span>Subject</span><input type="text" name="subject" value="${esc(t.subject)}" data-merge data-input="tplPreview"></label>
      ${chips()}
      <label class="f"><span>Body</span><textarea name="body" data-merge data-input="tplPreview" style="min-height:260px">${esc(t.body)}</textarea></label>
      <label class="check"><input type="checkbox" name="unsubscribe" ${t.unsubscribe ? 'checked' : ''}> Add an unsubscribe link when sent as a one-off or from a workflow</label>
      <div class="hint">Write plain text; blank lines become paragraphs. Give a merge tag a fallback with a pipe: <code class="k">{{firstName|there}}</code>. Sequences always add the unsubscribe link unless you turn it off on the sequence.</div>
    </div><div><div class="secthd">Preview</div><div class="preview" id="tplPrev"></div><div class="hint" style="margin-top:8px">Shown for ${esc(fullName(_tplSample))}. Your signature from Settings is added below the body when sent.</div></div></div>`,
    foot: `${d.id ? `<button type="button" class="btn ghost danger" data-act="delTpl" data-id="${d.id}" style="margin-right:auto">Delete</button>` : ''}<button type="button" class="btn" data-act="closeModal">Cancel</button><button class="btn primary">Save template</button>`,
    submit: async o => {
      if (!o.name) { toast('Name the template', 'error'); return false; }
      const data = { name: o.name, subject: o.subject, body: $('#mform').elements.body.value, unsubscribe: !!o.unsubscribe, updatedAt: Date.now() };
      if (d.id) await store.update('templates', d.id, data); else await store.add('templates', Object.assign(data, { createdAt: Date.now() }));
      toast('Template saved');
    },
    onMount: () => INPUT.tplPreview()
  });
};
INPUT.tplPreview = () => {
  const f = $('#mform'), p = $('#tplPrev'); if (!f || !p) return;
  const v = mergeVars(_tplSample, null), g = S.settings.general || {};
  p.innerHTML = `<div class="ps">${esc(merge(f.elements.subject.value, v)) || '<span class="muted">(no subject)</span>'}</div>${textToHtml(merge(f.elements.body.value, v))}${g.signature ? textToHtml(g.signature) : ''}`;
};
ACT.delTpl = async d => {
  const inUse = list('sequences').some(s => (s.steps || []).some(st => st.templateId === d.id)) || list('workflows').some(w => (w.actions || []).some(a => a.templateId === d.id));
  if (inUse) { toast('This template is used in a sequence or workflow. Remove it there first.', 'error'); return; }
  if (!await ask('Delete this template?')) return;
  await store.remove('templates', d.id); closeModal();
};

/* ================= SEQUENCES ================= */
function seqStats(id) {
  const e = list('enrollments').filter(x => x.sequenceId === id), c = s => e.filter(x => x.status === s).length;
  return { total: e.length, active: c('active'), replied: c('replied'), completed: c('completed'), stopped: c('stopped') + c('error') + c('bounced') + c('unsubscribed') };
}
VIEWS.sequences = () => {
  const ss = list('sequences').slice().sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  return {
    title: 'Sequences', actions: `<button class="btn primary" data-act="editSeq">${ic('plus')}New sequence</button>`,
    body: ss.length ? `<div class="tiles">${ss.map(s => {
      const st = seqStats(s.id), rate = st.total ? Math.round(st.replied / st.total * 100) : 0;
      return `<div class="card tile" data-act="editSeq" data-id="${s.id}"><div class="row" style="justify-content:space-between"><h4>${esc(s.name)}</h4>${s.paused ? '<span class="pill amber">Paused</span>' : '<span class="pill green">Live</span>'}</div>
      <div class="sub">${plural((s.steps || []).length, 'email')} over ${(s.steps || []).reduce((a, x) => a + (Number(x.delayDays) || 0), 0)} days${s.stopOnReply !== false ? ' · stops on reply' : ''}${s.weekdaysOnly ? ' · weekdays' : ''}</div>
      <div class="stats"><span><b>${st.active}</b>active</span><span><b>${st.replied}</b>replied</span><span><b>${rate}%</b>reply rate</span><span><b>${st.completed}</b>finished</span></div></div>`;
    }).join('')}</div>`
      : `<div class="card empty"><h4>No sequences yet</h4><p>A sequence is a series of timed emails that stops automatically when the contact replies.</p><div class="row" style="justify-content:center"><button class="btn" data-act="loadStarters">Load starters</button><button class="btn primary" data-act="editSeq">${ic('plus')}New sequence</button></div></div>`
  };
};
ACT.editSeq = d => {
  S.draftId = d.id || null;
  S.draft = d.id ? clone(byId('sequences', d.id)) : { name: '', steps: [{ delayDays: 0, templateId: '', subject: '', body: '' }], stopOnReply: true, weekdaysOnly: true, unsubscribeLink: true, paused: false, fromAlias: '' };
  delete S.draft.id; S.view = 'sequence-edit'; schedule(false); window.scrollTo(0, 0);
};
VIEWS['sequence-edit'] = () => {
  const s = S.draft, tpls = list('templates').slice().sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  const steps = (s.steps || []).map((st, i) => {
    const tp = st.templateId && byId('templates', st.templateId);
    return `${i ? '<div class="link"></div>' : ''}<div class="node"><div class="nh"><span class="badge">${ic('mail')}</span>Email ${i + 1}
      <div class="tools"><button data-act="stepMove" data-i="${i}" data-d="-1" title="Move up">↑</button><button data-act="stepMove" data-i="${i}" data-d="1" title="Move down">↓</button><button data-act="stepDel" data-i="${i}" title="Remove">✕</button></div></div>
      <div class="nb"><div class="row" style="margin-bottom:12px;flex-wrap:wrap"><span class="muted">${i ? 'Wait' : 'Send'}</span><input type="number" min="0" style="width:76px" data-bind="steps.${i}.delayDays" value="${esc(st.delayDays || 0)}"><span class="muted">${i ? 'days after email ' + i : 'days after enrollment (0 sends on the next engine run)'}</span></div>
      <label class="f"><span>Content</span><select data-bind="steps.${i}.templateId" data-rerender>${opt('', 'Write it here', st.templateId)}${tpls.map(t => opt(t.id, 'Template: ' + t.name, st.templateId)).join('')}</select></label>
      ${tp ? `<div class="preview" style="font-size:13px"><div class="ps">${esc(tp.subject)}</div>${textToHtml(tp.body)}</div>` : `
      <label class="f"><span>Subject</span><input type="text" data-merge data-bind="steps.${i}.subject" value="${esc(st.subject)}" placeholder="${i ? 'Leave blank to send as Re: email 1 subject' : ''}"></label>${chips()}
      <label class="f"><span>Body</span><textarea data-merge data-bind="steps.${i}.body" style="min-height:150px">${esc(st.body)}</textarea></label>`}
      </div></div>`;
  }).join('');
  const ens = S.draftId ? list('enrollments').filter(e => e.sequenceId === S.draftId).sort((a, b) => b.startedAt - a.startedAt) : [];
  const n = (s.steps || []).length;
  return {
    title: S.draftId ? 'Edit sequence' : 'New sequence',
    actions: `<button class="btn" data-act="go" data-v="sequences">Cancel</button>${S.draftId ? `<button class="btn danger" data-act="delSeq">${ic('trash')}Delete</button>` : ''}<button class="btn primary" data-act="saveSeq">Save sequence</button>`,
    body: `<div class="edgrid"><div class="flow">${steps}<div class="link"></div><button class="addstep" data-act="stepAdd">+ Add email</button></div>
    <div style="display:flex;flex-direction:column;gap:14px">
      <div class="card"><div class="hd"><h3>Settings</h3></div><div class="bd">
        <label class="f"><span>Sequence name</span><input type="text" data-bind="name" value="${esc(s.name)}" placeholder="e.g. Website lead nurture"></label>
        <label class="check"><input type="checkbox" data-bind="stopOnReply" ${s.stopOnReply !== false ? 'checked' : ''}> Stop when the contact replies</label>
        <label class="check"><input type="checkbox" data-bind="weekdaysOnly" ${s.weekdaysOnly ? 'checked' : ''}> Only send weekdays, 8:30am to 5pm</label>
        <label class="check"><input type="checkbox" data-bind="unsubscribeLink" ${s.unsubscribeLink !== false ? 'checked' : ''}> Add unsubscribe link</label>
        <label class="check"><input type="checkbox" data-bind="paused" ${s.paused ? 'checked' : ''}> Paused (no emails send while checked)</label>
        <label class="f"><span>Send as (optional)</span><input type="email" data-bind="fromAlias" value="${esc(s.fromAlias)}" placeholder="todd@legacytax.us"><div class="hint" style="margin-top:4px">Must be a Send-As alias on the engine's Gmail account. Blank uses the default.</div></label>
      </div></div>
      ${S.draftId ? `<div class="card"><div class="hd"><h3>Enrolled (${ens.length})</h3></div>${ens.slice(0, 40).map(e => `<div class="taskrow"><div style="flex:1;min-width:0;cursor:pointer" data-act="openContact" data-id="${e.contactId}"><div class="tt">${esc(e.contactName || e.email)}</div><div class="sub">${e.status === 'active' ? 'Email ' + Math.min(e.stepIndex + 1, n) + ' of ' + n + ' · ' + ago(e.nextSendAt) : esc(e.stopReason || e.status) + ' · ' + ago(e.endedAt || e.startedAt)}</div></div><span class="pill ${emailStatusLabel(e)}">${esc(e.status)}</span></div>`).join('') || '<div class="bd muted">Nobody yet. Enroll contacts from the Contacts list or a workflow.</div>'}</div>` : ''}
    </div></div>`
  };
};
ACT.stepAdd = () => { S.draft.steps.push({ delayDays: 3, templateId: '', subject: '', body: '' }); renderMain(); };
ACT.stepDel = d => { if (S.draft.steps.length < 2) return toast('A sequence needs at least one email', 'error'); S.draft.steps.splice(+d.i, 1); renderMain(); };
ACT.stepMove = d => { const i = +d.i, j = i + (+d.d), a = S.draft.steps; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; renderMain(); };
ACT.saveSeq = async () => {
  const s = S.draft;
  if (!s.name) return toast('Name the sequence', 'error');
  for (let i = 0; i < s.steps.length; i++) {
    const st = s.steps[i]; st.delayDays = Number(st.delayDays) || 0;
    if (!st.templateId && !st.body) return toast('Email ' + (i + 1) + ' needs a body or a template', 'error');
    if (i === 0 && !st.templateId && !st.subject) return toast('Email 1 needs a subject', 'error');
  }
  s.updatedAt = Date.now();
  if (S.draftId) { await store.update('sequences', S.draftId, s); for (const e of list('enrollments').filter(e => e.sequenceId === S.draftId && e.sequenceName !== s.name)) await store.update('enrollments', e.id, { sequenceName: s.name }); }
  else { s.createdAt = Date.now(); S.draftId = await store.add('sequences', s); }
  toast('Sequence saved'); go('sequences');
};
ACT.delSeq = async () => {
  const act = list('enrollments').filter(e => e.sequenceId === S.draftId && e.status === 'active');
  if (list('workflows').some(w => (w.actions || []).some(a => a.sequenceId === S.draftId))) return toast('A workflow enrolls into this sequence. Remove that step first.', 'error');
  if (!await ask('Delete this sequence?' + (act.length ? ' ' + plural(act.length, 'active contact') + ' will be stopped.' : ''))) return;
  for (const e of act) await stopEnrollment(e.id, 'Sequence deleted');
  await store.remove('sequences', S.draftId); go('sequences');
};

/* ================= WORKFLOWS ================= */
const TRIGGERS = { contact_created: 'Contact is created', form_submitted: 'Website form is submitted', tag_added: 'Tag is added to a contact', deal_created: 'Deal is created', deal_stage_changed: 'Deal moves to a stage' };
const ACTIONS = {
  send_email: ['Send email', 'mail'], enroll_sequence: ['Enroll in sequence', 'seq'], create_task: ['Create task', 'check'], delay: ['Wait', 'clock'],
  add_tag: ['Add tag', 'tag'], remove_tag: ['Remove tag', 'tag'], set_stage: ['Move deal to stage', 'kanban'], notify: ['Notify team member', 'bell'], stop_sequences: ['Stop all sequences', 'pause']
};
function triggerSummary(t) {
  t = t || {};
  if (isDateTrigger(t)) return dateTriggerSummary(t);
  let s = TRIGGERS[t.type] || 'No trigger set';
  if (t.type === 'deal_stage_changed') s = t.stage ? 'Deal moves to ' + stageOf(t.stage).name : 'Deal changes stage';
  if (t.type === 'tag_added' && t.tag) s = 'Tag "' + t.tag + '" is added';
  if (t.source) s += ', source is ' + t.source;
  if (t.requireTag) s += ', has tag "' + t.requireTag + '"';
  return s;
}
function actionSummary(a) {
  const tp = byId('templates', a.templateId), sq = byId('sequences', a.sequenceId);
  switch (a.type) {
    case 'send_email': return 'Send "' + (tp ? tp.name : 'pick a template') + '"';
    case 'enroll_sequence': return 'Enroll in "' + (sq ? sq.name : 'pick a sequence') + '"';
    case 'create_task': return 'Task: ' + (a.title || 'Follow up');
    case 'delay': return 'Wait ' + [a.days ? plural(+a.days, 'day') : '', a.hours ? plural(+a.hours, 'hour') : ''].filter(Boolean).join(' ') || 'Wait';
    case 'add_tag': return 'Add tag "' + (a.tag || '') + '"';
    case 'remove_tag': return 'Remove tag "' + (a.tag || '') + '"';
    case 'set_stage': return 'Move deal to ' + stageOf(a.stage).name;
    case 'notify': return 'Notify ' + (a.to === '__owner' ? 'owner' : (a.to || 'team'));
    case 'stop_sequences': return 'Stop all sequences';
  }
  return a.type;
}
function jobLabel(j) { return j.type === 'send_email' ? 'Email: ' + (j.params && (j.params.subject || (byId('templates', j.params.templateId) || {}).name) || 'email') : actionSummary(Object.assign({ type: j.type }, j.params || {})); }
VIEWS.workflows = () => {
  const ws = list('workflows').slice().sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  return {
    title: 'Workflows', actions: `${list('workflows').some(w => w.trigger && w.trigger.type === 'before_quarter') ? '' : `<button class="btn" data-act="recipeQuarterly">${ic('zap')}Quarterly meeting invite</button>`}<button class="btn primary" data-act="editWf">${ic('plus')}New workflow</button>`,
    body: ws.length ? `<div class="tiles">${ws.map(w => `<div class="card tile" data-act="editWf" data-id="${w.id}">
      <div class="row" style="justify-content:space-between"><h4>${esc(w.name)}</h4><label class="switch" data-act="noop"><input type="checkbox" data-act="toggleWf" data-id="${w.id}" ${w.active ? 'checked' : ''}><span></span></label></div>
      <div class="sub" style="margin-bottom:8px">${ic('zap').replace('<svg', '<svg width="12" height="12"')} When ${esc(triggerSummary(w.trigger).replace(/^./, c => c.toLowerCase()))}</div>
      ${(w.actions || []).slice(0, 4).map(a => `<div class="hint">→ ${esc(actionSummary(a))}</div>`).join('')}${(w.actions || []).length > 4 ? `<div class="hint">+${w.actions.length - 4} more</div>` : ''}
      <div class="stats"><span><b>${w.runCount || 0}</b>runs</span><span><b>${w.lastRunAt ? ago(w.lastRunAt) : 'never'}</b>last run</span></div></div>`).join('')}</div>`
      : `<div class="card empty"><h4>No workflows yet</h4><p>Workflows run actions automatically when something happens: a lead fills out your website form, a deal moves to Signed, a tag is added.</p><div class="row" style="justify-content:center"><button class="btn" data-act="loadStarters">Load starters</button><button class="btn primary" data-act="editWf">${ic('plus')}New workflow</button></div></div>`
  };
};
ACT.toggleWf = async (d, t) => { await store.update('workflows', d.id, { active: t.checked, updatedAt: Date.now() }); toast(t.checked ? 'Workflow on' : 'Workflow off'); };
ACT.editWf = d => {
  S.draftId = d.id || null;
  const w = d.id ? byId('workflows', d.id) : null;
  S.draft = w ? { name: w.name || '', active: !!w.active, allowReenroll: !!w.allowReenroll, description: w.description || '', trigger: clone(w.trigger || {}), actions: clone(w.actions || []) }
    : { name: '', active: true, allowReenroll: false, description: '', trigger: { type: 'contact_created' }, actions: [] };
  S.view = 'workflow-edit'; schedule(false); window.scrollTo(0, 0);
};
function actionFields(a, i) {
  const b = k => `data-bind="actions.${i}.${k}"`;
  const tpls = list('templates'), seqs = list('sequences');
  switch (a.type) {
    case 'send_email': return `<label class="f"><span>Template</span><select ${b('templateId')} data-rerender>${opt('', 'Choose a template', a.templateId)}${tpls.map(t => opt(t.id, t.name, a.templateId)).join('')}</select></label>${tpls.length ? '' : '<div class="hint">Create a template first.</div>'}<div class="hint">Skipped if the contact is unsubscribed, bounced, or has no email.</div>`;
    case 'enroll_sequence': return `<label class="f"><span>Sequence</span><select ${b('sequenceId')} data-rerender>${opt('', 'Choose a sequence', a.sequenceId)}${seqs.map(s => opt(s.id, s.name, a.sequenceId)).join('')}</select></label>`;
    case 'create_task': return `<label class="f"><span>Task title</span><input type="text" ${b('title')} value="${esc(a.title)}" placeholder="Call {{fullName}}"></label>
      <div class="grid2"><label class="f"><span>Assign to</span><select ${b('assignee')}>${opt('__owner', 'Advisor / owner', a.assignee)}${team().map(t => opt(t.name, t.name, a.assignee)).join('')}</select></label>
      <label class="f"><span>Due in (days)</span><input type="number" min="0" ${b('dueDays')} value="${esc(a.dueDays == null ? 1 : a.dueDays)}"></label></div>`;
    case 'delay': return `<div class="row"><input type="number" min="0" style="width:80px" ${b('days')} value="${esc(a.days || 0)}"><span class="muted">days</span><input type="number" min="0" max="23" style="width:80px" ${b('hours')} value="${esc(a.hours || 0)}"><span class="muted">hours, then continue</span></div>`;
    case 'add_tag': case 'remove_tag': return `<label class="f"><span>Tag</span><input type="text" ${b('tag')} value="${esc(a.tag)}"></label>`;
    case 'set_stage': return `<label class="f"><span>Stage</span><select ${b('stage')}>${stages().map(s => opt(s.id, s.name, a.stage)).join('')}<optgroup label="Company deals">${COMPANY_STAGES.map(s => opt(s.id, 'Company deal: ' + s.name, a.stage)).join('')}</optgroup></select></label><div class="hint">Only applies when the workflow was triggered by a deal.</div>`;
    case 'notify': return `<label class="f"><span>Send to</span><select ${b('to')}>${opt('__owner', 'Advisor / owner', a.to)}${team().filter(t => t.email).map(t => opt(t.email, t.name + ' · ' + t.email, a.to)).join('')}</select></label>
      ${team().some(t => t.email) ? '' : '<div class="hint" style="margin-bottom:10px">Add team emails in Settings to pick a person.</div>'}
      <label class="f"><span>Subject</span><input type="text" ${b('subject')} value="${esc(a.subject)}" placeholder="New lead: {{fullName}}"></label>
      <label class="f"><span>Message</span><textarea ${b('body')} placeholder="{{fullName}} ({{email}}) just came in.">${esc(a.body)}</textarea></label>`;
    case 'stop_sequences': return `<div class="hint">Removes the contact from every active sequence.</div>`;
  }
  return '';
}
VIEWS['workflow-edit'] = () => {
  const w = S.draft, t = w.trigger;
  const runs = S.draftId ? list('jobs').filter(j => j.workflowId === S.draftId).sort((a, b) => b.createdAt - a.createdAt).slice(0, 12) : [];
  const actions = w.actions.map((a, i) => {
    const m = ACTIONS[a.type] || ['Step', 'zap'];
    return `<div class="link"></div><div class="node ${a.type === 'delay' ? 'delay' : ''}"><div class="nh"><span class="badge">${ic(m[1])}</span>${m[0]}
      <div class="tools"><button data-act="actMove" data-i="${i}" data-d="-1">↑</button><button data-act="actMove" data-i="${i}" data-d="1">↓</button><button data-act="actDel" data-i="${i}">✕</button></div></div>
      <div class="nb">${actionFields(a, i)}</div></div>`;
  }).join('');
  return {
    title: S.draftId ? 'Edit workflow' : 'New workflow',
    actions: `<button class="btn" data-act="go" data-v="workflows">Cancel</button>${S.draftId ? `<button class="btn danger" data-act="delWf">${ic('trash')}Delete</button>` : ''}<button class="btn primary" data-act="saveWf">Save workflow</button>`,
    body: `<div class="edgrid"><div class="flow">
      <div class="node trigger"><div class="nh"><span class="badge">${ic('zap')}</span>Trigger</div><div class="nb">
        <label class="f"><span>When</span><select data-bind="trigger.type" data-rerender><optgroup label="When something happens">${Object.keys(TRIGGERS).filter(k => !DATE_TRIGGERS.has(k)).map(k => opt(k, TRIGGERS[k], t.type)).join('')}</optgroup><optgroup label="On a schedule (clients)">${Object.keys(TRIGGERS).filter(k => DATE_TRIGGERS.has(k)).map(k => opt(k, TRIGGERS[k], t.type)).join('')}</optgroup></select></label>
        ${isDateTrigger(t) ? (() => { if (t.days == null) t.days = 14; const nf = nextDateFire(t); return `
        <div class="row" style="margin-bottom:12px;flex-wrap:wrap"><input type="number" min="0" style="width:90px" data-bind="trigger.days" value="${esc(t.days)}" data-rerender><span class="muted">${t.type === 'after_signing' ? 'days after the client signs' : t.type === 'before_review' ? 'days before their review date' : 'days before each quarter starts (Jan 1, Apr 1, Jul 1, Oct 1)'}</span></div>
        <div class="grid2"><label class="f"><span>Only these clients</span><select data-bind="trigger.tier">${opt('', 'Every tier', t.tier)}${TIERS.map(x => opt(x[0], x[1] + ' clients', t.tier)).join('')}</select></label>
        <div style="padding-top:22px"><label class="check"><input type="checkbox" data-bind="trigger.quarterlyOnly" ${t.quarterlyOnly ? 'checked' : ''}> Only clients with a quarterly fee plan</label>
        <label class="check"><input type="checkbox" data-bind="trigger.currentOnly" ${t.currentOnly !== false ? 'checked' : ''}> Skip paused and former clients</label></div></div>
        <div class="hint">Runs once per client ${t.type === 'before_quarter' ? 'per quarter' : t.type === 'before_review' ? 'per review date' : ''}. Steps use the client's primary contact.${nf ? ` Next run: <b>${nf.now ? 'today' : fmtDate(nf.fire)}</b> for ${esc(periodLabel(nf.q, 'quarterly'))}.` : ''}</div>`; })() : ''}
        ${t.type === 'deal_stage_changed' ? `<label class="f"><span>Stage</span><select data-bind="trigger.stage">${opt('', 'Any stage', t.stage)}${stages().map(s => opt(s.id, s.name, t.stage)).join('')}<optgroup label="Company deals">${COMPANY_STAGES.map(s => opt(s.id, 'Company deal: ' + s.name, t.stage)).join('')}</optgroup></select></label>` : ''}
        ${t.type === 'tag_added' ? `<label class="f"><span>Tag</span><input type="text" data-bind="trigger.tag" value="${esc(t.tag)}" placeholder="Leave blank for any tag"></label>` : ''}
        ${isDateTrigger(t) ? '' : `<div class="grid2"><label class="f"><span>Only if source is</span><select data-bind="trigger.source">${opt('', 'Any source', t.source)}${sources().map(s => opt(s, s, t.source)).join('')}</select></label>
        <label class="f"><span>Only if contact has tag</span><input type="text" data-bind="trigger.requireTag" value="${esc(t.requireTag)}" placeholder="Optional"></label></div>
        <label class="check" style="margin:0"><input type="checkbox" data-bind="allowReenroll" ${w.allowReenroll ? 'checked' : ''}> Allow the same ${/^deal/.test(t.type) ? 'deal' : 'contact'} to run this workflow more than once</label>`}
      </div></div>
      ${actions}<div class="link"></div>
      <select class="addstep" data-change="actAdd" style="width:auto;text-align:center"><option value="">+ Add a step</option>${Object.keys(ACTIONS).map(k => opt(k, ACTIONS[k][0])).join('')}</select>
    </div><div style="display:flex;flex-direction:column;gap:14px">
      <div class="card"><div class="hd"><h3>Workflow</h3></div><div class="bd">
        <label class="f"><span>Name</span><input type="text" data-bind="name" value="${esc(w.name)}" placeholder="e.g. Website lead follow up"></label>
        <label class="check"><input type="checkbox" data-bind="active" ${w.active ? 'checked' : ''}> Active</label>
        <label class="f"><span>Notes</span><textarea data-bind="description" style="min-height:60px">${esc(w.description)}</textarea></label>
        <div class="hint">Steps run in order. A Wait step delays everything after it. The engine checks every 5 minutes, so actions land within a few minutes of the trigger.</div>
      </div></div>
      ${S.draftId ? `<div class="card"><div class="hd"><h3>Recent runs</h3></div>${runs.map(j => { const c = byId('contacts', j.contactId); return `<div class="taskrow"><div style="flex:1;min-width:0"><div class="tt" style="font-weight:500">${esc(jobLabel(j))}</div><div class="sub">${c ? esc(fullName(c)) + ' · ' : ''}${j.status === 'pending' ? 'runs ' + ago(j.runAt) : ago(j.doneAt || j.createdAt)}${j.result ? ' · ' + esc(j.result) : ''}</div></div><span class="pill ${{ done: 'green', error: 'red', pending: 'blue', skipped: '', cancelled: '' }[j.status]}">${esc(j.status)}</span></div>`; }).join('') || '<div class="bd muted">No runs yet.</div>'}</div>` : ''}
    </div></div>`
  };
};
CHANGE.actAdd = (d, t) => {
  if (!t.value) return;
  const a = { type: t.value };
  if (a.type === 'delay') a.days = 1;
  if (a.type === 'create_task') { a.assignee = '__owner'; a.dueDays = 1; a.title = 'Follow up with {{fullName}}'; }
  if (a.type === 'set_stage') a.stage = stages()[0].id;
  if (a.type === 'notify') a.to = '__owner';
  S.draft.actions.push(a); renderMain();
};
ACT.actDel = d => { S.draft.actions.splice(+d.i, 1); renderMain(); };
ACT.actMove = d => { const i = +d.i, j = i + (+d.d), a = S.draft.actions; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; renderMain(); };
ACT.saveWf = async () => {
  const w = S.draft;
  if (!w.name) return toast('Name the workflow', 'error');
  if (!w.actions.filter(a => a.type !== 'delay').length) return toast('Add at least one step', 'error');
  for (const a of w.actions) {
    if (a.type === 'send_email' && !a.templateId) return toast('Pick a template for the Send email step', 'error');
    if (a.type === 'enroll_sequence' && !a.sequenceId) return toast('Pick a sequence for the Enroll step', 'error');
    if ((a.type === 'add_tag' || a.type === 'remove_tag') && !a.tag) return toast('Fill in the tag', 'error');
  }
  if (w.trigger.type === 'tag_added' && w.actions.some(a => a.type === 'add_tag' && norm(a.tag) === norm(w.trigger.tag || a.tag)) && !await ask('This workflow adds the same tag that triggers it. Save anyway?')) return;
  w.updatedAt = Date.now();
  if (S.draftId) await store.update('workflows', S.draftId, w);
  else await store.add('workflows', Object.assign(w, { createdAt: Date.now(), runCount: 0, createdBy: meName() }));
  toast('Workflow saved'); go('workflows');
};
ACT.delWf = async () => {
  if (!await ask('Delete this workflow? Steps already scheduled will be cancelled.')) return;
  for (const j of list('jobs').filter(j => j.workflowId === S.draftId && j.status === 'pending')) await store.update('jobs', j.id, { status: 'cancelled', dueAt: null, result: 'Workflow deleted' });
  await store.remove('workflows', S.draftId); go('workflows');
};

/* ================= AUTOMATION LOG ================= */
VIEWS.log = () => {
  const tab = S.f.logTab;
  const jobs = list('jobs'), ens = list('enrollments');
  const pending = jobs.filter(j => j.status === 'pending').sort((a, b) => a.runAt - b.runAt);
  const upcoming = ens.filter(e => e.status === 'active').sort((a, b) => a.nextSendAt - b.nextSendAt);
  const emails = list('activities').filter(a => a.type === 'email').sort((a, b) => b.at - a.at).slice(0, 200);
  const errs = jobs.filter(j => j.status === 'error').concat(ens.filter(e => e.status === 'error'));
  const tabs = [['queue', 'Scheduled (' + (pending.length + upcoming.length) + ')'], ['emails', 'Sent emails'], ['errors', 'Errors (' + errs.length + ')']];
  const cname = id => { const c = byId('contacts', id); return c ? `<a href="#" data-act="openContact" data-id="${c.id}">${esc(fullName(c))}</a>` : '<span class="muted">deleted</span>'; };
  let body = '';
  if (tab === 'queue') body = `<div class="secthd">Sequence emails up next</div>
    <div class="card tblwrap">${upcoming.length ? `<table class="tbl"><thead><tr><th>Sends</th><th>Contact</th><th>Sequence</th><th>Email</th><th></th></tr></thead><tbody>${upcoming.slice(0, 150).map(e => { const s = byId('sequences', e.sequenceId); return `<tr><td>${fmtDT(e.nextSendAt)} <span class="sub">${ago(e.nextSendAt)}</span></td><td>${cname(e.contactId)}</td><td>${esc(e.sequenceName)}${s && s.paused ? ' <span class="pill amber">paused</span>' : ''}</td><td>${e.stepIndex + 1} of ${s ? (s.steps || []).length : '?'}</td><td class="w0">${LOCAL ? `<button class="btn sm" data-act="runEnNow" data-id="${e.id}">Run now</button>` : ''}</td></tr>`; }).join('')}</tbody></table>` : '<div class="empty">Nothing scheduled.</div>'}</div>
    <div class="secthd">Workflow steps and one-off emails</div>
    <div class="card tblwrap">${pending.length ? `<table class="tbl"><thead><tr><th>Runs</th><th>Action</th><th>Contact</th><th>From</th><th></th></tr></thead><tbody>${pending.map(j => `<tr><td>${fmtDT(j.runAt)} <span class="sub">${ago(j.runAt)}</span></td><td>${esc(jobLabel(j))}</td><td>${cname(j.contactId)}</td><td class="sub">${esc(j.workflowName ? 'Workflow: ' + j.workflowName : j.createdBy || '')}</td><td class="w0">${LOCAL ? `<button class="btn sm" data-act="runJobNow" data-id="${j.id}">Run now</button> ` : ''}<button class="btn sm" data-act="cancelJob" data-id="${j.id}">Cancel</button></td></tr>`).join('')}</tbody></table>` : '<div class="empty">Queue is empty.</div>'}</div>`;
  if (tab === 'emails') body = `<div class="card tblwrap">${emails.length ? `<table class="tbl"><thead><tr><th>Sent</th><th>To</th><th>Subject</th><th>Via</th></tr></thead><tbody>${emails.map(a => `<tr><td class="sub">${fmtDT(a.at)}</td><td>${cname(a.contactId)}</td><td>${esc(a.subject)}</td><td class="sub">${esc(a.by)}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">No emails sent yet.</div>'}</div>`;
  if (tab === 'errors') body = `<div class="card tblwrap">${errs.length ? `<table class="tbl"><thead><tr><th>When</th><th>What</th><th>Contact</th><th>Error</th><th></th></tr></thead><tbody>${errs.map(x => x.sequenceId ? `<tr><td class="sub">${fmtDT(x.lastSentAt || x.startedAt)}</td><td>Sequence: ${esc(x.sequenceName)}</td><td>${cname(x.contactId)}</td><td style="color:var(--red)">${esc(x.stopReason)}</td><td class="w0"><button class="btn sm" data-act="retryEn" data-id="${x.id}">Retry</button></td></tr>`
    : `<tr><td class="sub">${fmtDT(x.doneAt)}</td><td>${esc(jobLabel(x))}</td><td>${cname(x.contactId)}</td><td style="color:var(--red)">${esc(x.result)}</td><td class="w0"><button class="btn sm" data-act="retryJob" data-id="${x.id}">Retry</button></td></tr>`).join('')}</tbody></table>` : '<div class="empty">No errors. Nice.</div>'}</div>`;
  return {
    title: 'Automation log',
    body: `<div class="card" style="margin-bottom:16px"><div class="bd">${engineCard()}</div></div>
    <div class="toolbar">${tabs.map(t => `<button class="btn ${tab === t[0] ? 'primary' : ''}" data-act="logTab" data-v="${t[0]}">${t[1]}</button>`).join('')}</div>${body}`
  };
};
ACT.logTab = d => { S.f.logTab = d.v; renderMain(); };
ACT.retryJob = d => store.update('jobs', d.id, { status: 'pending', runAt: Date.now(), dueAt: Date.now(), result: '' });
ACT.retryEn = d => store.update('enrollments', d.id, { status: 'active', nextSendAt: Date.now(), stopReason: '' });

/* ================= SETTINGS ================= */
function settingsDraft() {
  const g = S.settings.general || {};
  return { general: { aiStyle: g.aiStyle || '', me: g.me || (team()[0] || {}).name || '', firmName: g.firmName || DEFAULT_FIRM, senderName: g.senderName || '', signature: g.signature || '', fromAlias: g.fromAlias || '', bcc: g.bcc || '', webhookUrl: g.webhookUrl || '', team: clone(team()), sources: clone(sources()), cadence: Object.assign({}, DEFAULT_CADENCE, g.cadence || {}), tierFees: Object.assign({}, DEFAULT_TIER_FEES, Object.fromEntries(Object.entries(g.tierFees || {}).filter(e => Number(e[1]) > 0))), tierStartup: Object.assign({}, g.tierStartup || {}) }, stages: clone(stages()) };
}
function formSnippet(url) {
  return `<form id="lead-form">
  <input name="firstName" placeholder="First name" required>
  <input name="lastName" placeholder="Last name">
  <input name="email" type="email" placeholder="Email" required>
  <input name="phone" placeholder="Phone">
  <textarea name="message" placeholder="How can we help?"></textarea>
  <input type="hidden" name="source" value="Website form">
  <input type="hidden" name="tags" value="website lead">
  <input name="website" style="display:none" tabindex="-1" autocomplete="off">
  <button type="submit">Send</button>
</form>
<script>
document.getElementById('lead-form').addEventListener('submit', function (e) {
  e.preventDefault();
  var f = this;
  fetch('${url || 'PASTE_ENGINE_WEB_APP_URL'}', { method: 'POST', mode: 'no-cors', body: new URLSearchParams(new FormData(f)) })
    .then(function () { f.innerHTML = '<p>Thanks! We will be in touch shortly.</p>'; });
});
<\/script>`;
}
VIEWS.settings = () => {
  const d = S.draft || (S.draft = settingsDraft()), g = d.general;
  return {
    title: 'Settings', actions: `<button class="btn primary" data-act="saveSettings">Save settings</button>`,
    body: `<div class="dash"><div class="col">
      <div class="card"><div class="hd"><h3>Email sending</h3></div><div class="bd">
        <label class="f"><span>Firm name</span><input type="text" data-bind="general.firmName" value="${esc(g.firmName)}" placeholder="Phillips"><div class="hint" style="margin-top:4px">Shown in the app and available in emails as <code class="k">{{firmName}}</code>.</div></label>
        <div class="grid2"><label class="f"><span>Sender name</span><input type="text" data-bind="general.senderName" value="${esc(g.senderName)}" placeholder="Jaleel at Phillips"></label>
        <label class="f"><span>Default send-as alias (optional)</span><input type="email" data-bind="general.fromAlias" value="${esc(g.fromAlias)}"></label></div>
        <label class="f"><span>Signature</span><textarea data-bind="general.signature" style="min-height:110px" placeholder="Jaleel\nDirector of Strategic Partnerships\nPhillips | legacytax.us">${esc(g.signature)}</textarea></label>
        <label class="f"><span>BCC every automated email to (optional)</span><input type="email" data-bind="general.bcc" value="${esc(g.bcc)}"></label>
        <div class="hint">Emails send from the Google Workspace account that owns the Apps Script engine. Workspace allows about 1,500 recipients a day; the engine pauses sending if you get close.</div>
      </div></div>
      <div class="card"><div class="hd"><h3>Pipeline stages</h3><button class="btn sm" data-act="stageAdd">${ic('plus')}Stage</button></div><div class="bd stagelist">
        ${d.stages.map((s, i) => `<div class="r"><input type="text" data-bind="stages.${i}.name" value="${esc(s.name)}"><select data-bind="stages.${i}.kind" style="width:110px">${opt('', 'Open', s.kind || '')}${opt('won', 'Won', s.kind)}${opt('lost', 'Lost', s.kind)}</select>
          <button class="btn sm ghost" data-act="stageMove" data-i="${i}" data-d="-1">↑</button><button class="btn sm ghost" data-act="stageMove" data-i="${i}" data-d="1">↓</button><button class="btn sm ghost danger" data-act="stageDel" data-i="${i}">✕</button></div>`).join('')}
        <div class="hint">Won stages count toward "Signed this month". Renaming is safe; deals and workflows follow the stage.</div>
      </div></div>
      <div class="card"><div class="hd"><h3>Website form</h3></div><div class="bd">
        <label class="f"><span>Engine web app URL</span><input type="url" data-bind="general.webhookUrl" value="${esc(g.webhookUrl)}" placeholder="https://script.google.com/macros/s/.../exec"><div class="hint" style="margin-top:4px">From setup step 6. Paste it here and copy the snippet below into legacytax.us.</div></label>
        <pre class="snip">${esc(formSnippet(g.webhookUrl))}</pre>
        <div class="hint">New submissions create the contact (or update an existing one by email), log the message, and fire "Contact is created" and "Website form is submitted" workflows.</div>
      </div></div>
    </div><div class="col">
      <div class="card"><div class="hd"><h3>Team</h3><button class="btn sm" data-act="teamAdd">${ic('plus')}Person</button></div><div class="bd stagelist">
        ${g.team.map((t, i) => `<div class="r"><input type="text" data-bind="general.team.${i}.name" value="${esc(t.name)}" placeholder="Name"><input type="email" data-bind="general.team.${i}.email" value="${esc(t.email)}" placeholder="email@legacytax.us"><button class="btn sm ghost danger" data-act="teamDel" data-i="${i}">✕</button></div>`).join('')}
        ${LOCAL ? `<label class="f" style="margin-top:10px"><span>You are</span><select data-bind="general.me">${g.team.filter(t => t.name).map(t => opt(t.name, t.name, g.me)).join('')}</select></label>` : ''}
        <div class="hint">Names fill the owner and assignee lists. Emails link sign-ins to names and receive workflow notifications. Anyone who signs in must also be listed in the Firestore rules.</div>
      </div></div>
      <div class="card"><div class="hd"><h3>Client tiers</h3></div><div class="bd">
        <div class="secthd">Check in every (days)</div>
        <div class="grid3">${TIERS.map(t => `<label class="f"><span>${t[1]}</span><input type="number" min="1" data-bind="general.cadence.${t[0]}" value="${esc(g.cadence[t[0]])}"></label>`).join('')}</div>
        <div class="secthd">Quarterly fee (built in for new clients)</div>
        <div class="grid3">${STD_TIERS.map(t => `<label class="f"><span>${t[1]} ($)</span><input type="number" min="0" step="50" data-bind="general.tierFees.${t[0]}" value="${esc(g.tierFees[t[0]] || '')}"></label>`).join('')}</div>
        <div class="secthd">Startup fee (charged at sign-on)</div>
        <div class="grid3">${STD_TIERS.map(t => `<label class="f"><span>${t[1]} ($)</span><input type="number" min="0" step="50" data-bind="general.tierStartup.${t[0]}" value="${esc((g.tierStartup || {})[t[0]] || '')}" placeholder="0"></label>`).join('')}</div>
        <div class="hint">Clients past their check-in window show as overdue. New clients are charged the startup fee and the current quarter at signing (unless the next quarter starts within 2 weeks), then every quarter on Jan 1, Apr 1, Jul 1 and Oct 1.</div></div></div>
      <div class="card"><div class="hd"><h3>Lead sources</h3></div><div class="bd">
        <textarea data-change="sourcesTxt" style="min-height:120px">${esc(g.sources.join('\n'))}</textarea><div class="hint">One per line. Workflows can filter on source.</div></div></div>
      ${aiSettingsCard()}
      <div class="card"><div class="hd"><h3>Automation engine</h3></div><div class="bd">${engineCard()}</div></div>
      ${LOCAL ? localDataCard() : `<div class="card"><div class="hd"><h3>Data</h3></div><div class="bd row" style="flex-wrap:wrap">
        <button class="btn" data-act="backup">${ic('download')}Download backup</button><button class="btn" data-act="restore">Import a backup</button>
        <button class="btn" data-act="exportCsv">${ic('download')}Contacts CSV</button><button class="btn" data-act="loadStarters">Load starter templates</button></div></div>`}
      ${LOCAL ? `<div class="card"><div class="hd"><h3>Templates</h3></div><div class="bd row" style="flex-wrap:wrap"><button class="btn" data-act="exportCsv">${ic('download')}Contacts CSV</button><button class="btn" data-act="loadStarters">Load starter templates</button></div></div>` : ''}
    </div></div>`
  };
};
CHANGE.sourcesTxt = (d, t) => { S.draft.general.sources = t.value.split('\n').map(s => s.trim()).filter(Boolean); };
ACT.stageAdd = () => { S.draft.stages.splice(S.draft.stages.findIndex(s => s.kind) < 0 ? S.draft.stages.length : S.draft.stages.findIndex(s => s.kind), 0, { id: 'st_' + uid().slice(-6), name: 'New stage' }); renderMain(); };
ACT.stageMove = d => { const i = +d.i, j = i + (+d.d), a = S.draft.stages; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; renderMain(); };
ACT.stageDel = d => {
  const s = S.draft.stages[+d.i], n = list('deals').filter(x => x.stage === s.id).length;
  if (n) return toast(plural(n, 'deal') + ' are in ' + s.name + '. Move them first.', 'error');
  if (list('workflows').some(w => (w.trigger && w.trigger.stage === s.id) || (w.actions || []).some(a => a.stage === s.id))) return toast('A workflow uses this stage. Update it first.', 'error');
  S.draft.stages.splice(+d.i, 1); renderMain();
};
ACT.teamAdd = () => { S.draft.general.team.push({ name: '', email: '' }); renderMain(); };
ACT.teamDel = d => { S.draft.general.team.splice(+d.i, 1); renderMain(); };
ACT.saveSettings = async () => {
  const d = S.draft;
  d.stages.forEach(s => { s.name = (s.name || '').trim(); if (!s.kind) delete s.kind; });
  if (d.stages.some(s => !s.name)) return toast('Every stage needs a name', 'error');
  if (!d.stages.some(s => !s.kind)) return toast('Keep at least one open stage', 'error');
  d.general.tierStartup = d.general.tierStartup || {}; STD_TIERS.forEach(t => { d.general.tierStartup[t[0]] = Math.max(0, Number(d.general.tierStartup[t[0]]) || 0); });
  STD_TIERS.forEach(t => { d.general.tierFees[t[0]] = Math.max(0, Number(d.general.tierFees[t[0]]) || DEFAULT_TIER_FEES[t[0]]); });
  TIERS.forEach(t => { d.general.cadence[t[0]] = Math.max(1, Number(d.general.cadence[t[0]]) || DEFAULT_CADENCE[t[0]]); });
  d.general.team = d.general.team.filter(t => (t.name || '').trim()).map(t => ({ name: t.name.trim(), email: (t.email || '').trim().toLowerCase() }));
  await store.set('settings', 'general', d.general, true);
  await store.set('settings', 'pipeline', { stages: d.stages }, true);
  toast('Settings saved');
};

/* ================= STARTERS + DEMO DATA ================= */
function starterContent() {
  const templates = [
    { key: 'welcome', name: 'Website lead welcome', unsubscribe: false, subject: 'Thanks for reaching out, {{firstName|there}}', body: 'Hi {{firstName|there}},\n\nThanks for reaching out to {{firmName}}. I saw your note come through and wanted to connect personally.\n\nMost of the people we work with are paying more than they need to simply because nobody has looked at the full picture: how their entities are set up, how their real estate is depreciated, and which planning moves are still open this year.\n\nWould you be open to a quick 20 minute call this week so I can learn more about your situation? Just reply with a couple of times that work.\n\n{{senderFirstName}}' },
    { key: 'engagement', name: 'Engagement letter follow up', unsubscribe: false, subject: 'Your engagement letter', body: 'Hi {{firstName}},\n\nFollowing up on the engagement letter I sent after our analysis meeting. Happy to walk through any part of it with you or answer questions before you sign.\n\nIf the timing has changed on your end, just let me know and we can plan around it.\n\n{{senderFirstName}}' },
    { key: 'equipment', name: 'Equipment rental program intro', unsubscribe: true, subject: 'A planning idea for {{company|your business}}', body: 'Hi {{firstName|there}},\n\nI work with business owners who want a clear plan for their tax picture this year and next. One strategy we have been using is an equipment rental program that can create meaningful deductions when it is structured correctly.\n\nIt is not a fit for everyone, so I would rather walk you through how it works and see if it makes sense for you. Open to a short call next week?\n\n{{senderFirstName}}' }
  ];
  const sequence = (ids) => ({
    name: 'Website lead nurture', stopOnReply: true, weekdaysOnly: true, unsubscribeLink: true, paused: false, fromAlias: '',
    steps: [
      { delayDays: 0, templateId: ids.welcome, subject: '', body: '' },
      { delayDays: 3, templateId: '', subject: '', body: 'Hi {{firstName|there}},\n\nWanted to bump this to the top of your inbox. If a phone call is easier, reply with the best number and time to reach you and I will call.\n\n{{senderFirstName}}' },
      { delayDays: 5, templateId: '', subject: 'One more idea for you', body: 'Hi {{firstName|there}},\n\nI will leave this here so I am not crowding your inbox. Whenever you are ready to look at your planning for this year, reply to this email and we will find a time that works.\n\nAll the best,\n{{senderFirstName}}' }
    ]
  });
  const workflow = (seqId, active) => ({
    name: 'New website lead', active, allowReenroll: false, description: 'Every website form lead gets the nurture sequence and a call task for the owner.',
    trigger: { type: 'contact_created', source: 'Website form' },
    actions: [{ type: 'enroll_sequence', sequenceId: seqId }, { type: 'create_task', title: 'Call {{fullName}} about their website inquiry', assignee: '__owner', dueDays: 1 }, { type: 'notify', to: '__owner', subject: 'New website lead: {{fullName}}', body: '{{fullName}} ({{email}}) just came in from the website and is enrolled in the nurture sequence.' }]
  });
  return { templates, sequence, workflow };
}
ACT.loadStarters = async () => {
  if (list('templates').some(t => t.name === 'Website lead welcome') && !await ask('Starter templates look like they are already loaded. Add another copy?')) return;
  const sc = starterContent(), ids = {};
  for (const t of sc.templates) { const k = t.key; const d = Object.assign({}, t); delete d.key; ids[k] = await store.add('templates', Object.assign(d, { createdAt: Date.now(), updatedAt: Date.now() })); }
  const seqId = await store.add('sequences', Object.assign(sc.sequence(ids), { createdAt: Date.now(), updatedAt: Date.now() }));
  await store.add('workflows', Object.assign(sc.workflow(seqId, false), { createdAt: Date.now(), updatedAt: Date.now(), runCount: 0 }));
  toast('Loaded 3 templates, 1 sequence, and 1 workflow (turned off until you review it)');
};
function demoData() {
  const now = Date.now(), D = {}, id = () => uid();
  const put = (c, o) => { const k = id(); (D[c] = D[c] || {})[k] = o; return k; };
  D.settings = { general: { firmName: 'Phillips', senderName: 'Jaleel', signature: 'Jaleel\nDirector of Strategic Partnerships\nPhillips | legacytax.us', team: DEFAULT_TEAM, sources: DEFAULT_SOURCES, tierFees: { platinum: 8000, gold: 3900, silver: 2500 } }, pipeline: { stages: DEFAULT_STAGES } };
  const co = {
    bell: put('companies', { name: 'Bell Dental Group', industry: 'Healthcare', domain: 'belldental.example', createdAt: now - 40 * DAY }),
    ortega: put('companies', { name: 'Ortega Excavating', industry: 'Construction', createdAt: now - 25 * DAY }),
    lake: put('companies', { name: 'Lakeshore STR Holdings', industry: 'Real estate', createdAt: now - 20 * DAY }),
    moss: put('companies', { name: 'Moss Family Office', industry: 'Investments', createdAt: now - 12 * DAY })
  };
  const P = [
    ['Marcus', 'Bell', 'bell', 'Owner', 'Todd', 'Referral', ['dentist', 'cost seg'], 38],
    ['Priya', 'Nair', null, '', 'Jaleel', 'Website form', ['website lead', 'STR investor'], 2],
    ['Luis', 'Ortega', 'ortega', 'President', 'Jaleel', 'CPA referral', ['equipment program'], 24],
    ['Kim', 'Tran', 'lake', 'Managing member', 'Jackson', 'Website form', ['website lead', 'STR investor'], 6],
    ['Robert', 'Hale', null, '', 'Todd', 'Event', ['HNW'], 15],
    ['Angela', 'Moss', 'moss', 'Principal', 'Jaleel', 'Referral', ['HNW', 'entity review'], 11],
    ['Derek', 'Lund', null, '', 'Sam', 'Cold outreach', ['cannabis'], 4],
    ['Sofia', 'Reyes', null, '', 'Sam', 'Cold outreach', ['cannabis'], 4],
    ['Carla', 'Jensen', null, '', 'Jaleel', 'CPA referral', ['client'], 320],
    ['Ben', 'Okafor', null, 'Founder', 'Todd', 'Referral', ['client'], 410],
    ['Tara', 'Okafor', null, '', 'Todd', 'Referral', ['client'], 410],
    ['Nate', 'Lindgren', null, '', 'Jackson', 'Website form', ['client'], 150]
  ];
  const cid = {};
  P.forEach(p => {
    const email = (p[0] + '.' + p[1]).toLowerCase() + '@example.com';
    cid[p[0]] = put('contacts', { firstName: p[0], lastName: p[1], email, emailLower: email, phone: '(612) 555-01' + String(10 + Object.keys(cid).length), companyId: p[2] ? co[p[2]] : null, companyName: p[2] ? D.companies[co[p[2]]].name : '', title: p[3], owner: p[4], source: p[5], tags: p[6], status: 'active', createdAt: now - p[7] * DAY, updatedAt: now - p[7] * DAY, createdBy: p[4] });
  });
  D.contacts[cid.Sofia].status = 'unsubscribed';
  const deal = (name, c, amt, stage, owner, daysIn) => put('deals', { name, contactId: cid[c], companyId: D.contacts[cid[c]].companyId, amount: amt, stage, owner, createdAt: now - (daysIn + 5) * DAY, stageChangedAt: now - daysIn * DAY, updatedAt: now - daysIn * DAY, closeDate: now + 20 * DAY });
  deal('Bell Dental: cost segregation study', 'Marcus', 12500, 'engagement', 'Todd', 3);
  deal('Ortega: equipment rental program', 'Luis', 18000, 'analysis', 'Jaleel', 6);
  deal('Lakeshore STR: depreciation plan', 'Kim', 7500, 'discovery', 'Jackson', 2);
  deal('Hale family: entity structuring', 'Robert', 22000, 'won', 'Todd', 4);
  deal('Moss Family Office: full planning', 'Angela', 35000, 'analysis', 'Jaleel', 9);
  deal('Priya Nair: STR review', 'Priya', 6000, 'lead', 'Jaleel', 1);
  const t = (title, c, dueDays, who, done) => put('tasks', { title, contactId: cid[c], contactName: c, assignee: who, due: startOfDay() + dueDays * DAY + 10 * 3600000, done: !!done, doneAt: done ? now - DAY : null, createdAt: now - 3 * DAY, createdBy: 'Jaleel' });
  t('Call Priya Nair about their website inquiry', 'Priya', 0, 'Jaleel');
  t('Send Ortega the equipment program summary', 'Luis', -1, 'Jaleel');
  t('Prep analysis meeting deck for Moss', 'Angela', 2, 'Jaleel');
  t('Check in on Bell engagement letter', 'Marcus', 1, 'Todd');
  t('Intro call with Kim Tran', 'Kim', -3, 'Jackson', true);
  const a = (type, c, body, hrs, by, extra) => put('activities', Object.assign({ type, contactId: cid[c], dealId: null, body, by: by || 'Jaleel', at: now - hrs * 3600000 }, extra || {}));
  a('system', 'Priya', 'Contact created (source: Website form)', 48, 'Website form');
  a('email', 'Priya', '', 47.9, 'Sequence: Website lead nurture (email 1)', { subject: 'Thanks for reaching out, Priya', preview: 'Hi Priya, Thanks for reaching out to Phillips. I saw your note come through and wanted to connect personally.' });
  a('call', 'Luis', 'Walked through the program. Wants to see numbers for two excavators and a skid steer before the analysis meeting.', 30);
  a('stage', 'Robert', 'Hale family: entity structuring: Engagement Sent → Signed', 96, 'Todd');
  a('note', 'Angela', 'Referred by Char. Has three LLCs and a family partnership; wants one plan that covers all of it.', 70);
  a('email', 'Kim', '', 120, 'Sequence: Website lead nurture (email 1)', { subject: 'Thanks for reaching out, Kim', preview: 'Hi Kim, Thanks for reaching out to Phillips.' });
  a('system', 'Kim', 'Replied, removed from sequence "Website lead nurture"', 100, 'Automation');
  const sc = starterContent(), ids = {};
  sc.templates.forEach(tp => { const d = Object.assign({}, tp); delete d.key; ids[tp.key] = put('templates', Object.assign(d, { createdAt: now - 30 * DAY, updatedAt: now - 30 * DAY })); });
  const seq = put('sequences', Object.assign(sc.sequence(ids), { createdAt: now - 30 * DAY }));
  put('workflows', Object.assign(sc.workflow(seq, true), { createdAt: now - 30 * DAY, runCount: 14, lastRunAt: now - 48 * 3600000 }));
  put('workflows', { name: 'Deal signed: onboarding', active: true, trigger: { type: 'deal_stage_changed', stage: 'won' }, allowReenroll: false, description: '', runCount: 3, lastRunAt: now - 96 * 3600000, createdAt: now - 20 * DAY,
    actions: [{ type: 'stop_sequences' }, { type: 'create_task', title: 'Schedule kickoff with {{fullName}}', assignee: '__owner', dueDays: 1 }, { type: 'add_tag', tag: 'client' }] });
  put('enrollments', { sequenceId: seq, sequenceName: 'Website lead nurture', contactId: cid.Priya, contactName: 'Priya Nair', email: D.contacts[cid.Priya].email, stepIndex: 1, status: 'active', startedAt: now - 48 * 3600000, lastSentAt: now - 47.9 * 3600000, nextSendAt: now + 24 * 3600000, sentCount: 1, firstSubject: 'Thanks for reaching out, Priya' });
  put('enrollments', { sequenceId: seq, sequenceName: 'Website lead nurture', contactId: cid.Kim, contactName: 'Kim Tran', email: D.contacts[cid.Kim].email, stepIndex: 1, status: 'replied', startedAt: now - 120 * 3600000, endedAt: now - 100 * 3600000, nextSendAt: null, sentCount: 1 });
  const touch = (c, ch, daysAgo, body, by) => { const at = now - daysAgo * DAY; put('activities', { type: 'contact', channel: ch, contactId: cid[c], dealId: null, body, by: by || 'Jaleel', at }); D.contacts[cid[c]].lastContactAt = Math.max(D.contacts[cid[c]].lastContactAt || 0, at); };
  touch('Carla', 'call', 52, 'Q3 check-in. Cost seg study delivered; she is looking at a fourth STR in Duluth.');
  touch('Ben', 'meeting', 12, 'Annual review with Ben and Tara. Equipment program performing as planned. Kicking off estate plan update.', 'Todd');
  touch('Nate', 'email', 70, 'Sent the REPS hour log template.', 'Jackson');
  touch('Robert', 'meeting', 4, 'Signing meeting. Reviewed entity reorg timeline.', 'Todd');
  const client = o => put('clients', Object.assign({ status: 'active', designations: [], strategies: [], work: [], createdAt: now - 30 * DAY, updatedAt: now }, o));
  const S_ = (name, status, note, imp) => ({ id: uid(), name, status, note: note || '', updatedAt: now, implementedAt: imp ? now - imp * DAY : null });
  const W_ = (type, status, by, dueDays, doneDays, note) => ({ id: uid(), type, status, by, due: dueDays != null ? now + dueDays * DAY : null, doneAt: doneDays != null ? now - doneDays * DAY : null, note: note || '', createdAt: now - 60 * DAY });
  const cl_okafor = client({ name: 'Okafor Family', tier: 'platinum', owner: 'Todd', since: now - 400 * DAY, nextReview: now + 80 * DAY, contactIds: [cid.Ben, cid.Tara], designations: ['str', 'bizowner'],
    notes: 'Ben owns a logistics company; Tara manages their three STR properties. Two kids, both in college.',
    strategies: [S_('Equipment rental program', 'implemented', 'Fleet of 6 trucks placed in 2025.', 300), S_('Short-term rental strategy', 'implemented', 'Tara tracks material participation hours monthly.', 280), S_('Cost segregation', 'progress', 'Study ordered on the Stillwater property.'), S_('Retirement plan design', 'planned')],
    work: [W_('Estate and will planning', 'progress', 'Providence Law', 21, null, 'Updating wills and adding a revocable trust.'), W_('Company reorganization', 'done', 'Phillips', null, 200, 'Converted to S corp with holding LLC.'), W_('Tax projection', 'todo', 'Phillips', 45)] });
  const cl_carla = client({ name: 'Carla Jensen', tier: 'gold', owner: 'Jaleel', since: now - 320 * DAY, contactIds: [cid.Carla], designations: ['reps', 'str'],
    strategies: [S_('Real estate professional status', 'implemented', '', 250), S_('Cost segregation', 'implemented', 'Three properties studied.', 90), S_('Entity structuring', 'planned', 'Move properties into series LLC?')],
    work: [W_('Cost segregation study', 'done', 'Phillips', null, 90), W_('Entity formation', 'todo', 'Providence Law', 30)] });
  const cl_hale = client({ name: 'Hale Family', tier: 'platinum', status: 'onboarding', owner: 'Todd', since: now - 4 * DAY, nextReview: now + 30 * DAY, contactIds: [cid.Robert], designations: ['bizowner'],
    strategies: [S_('Entity structuring', 'progress', 'Holding company over the two operating LLCs.'), S_('Investment planning', 'planned')],
    work: [W_('Company reorganization', 'progress', 'Phillips', 25), W_('Estate and will planning', 'todo', 'Providence Law', 60), W_('Engagement letter', 'done', 'Phillips', null, 4)] });
  const cl_nate = client({ name: 'Nate Lindgren', tier: 'silver', owner: 'Jackson', since: now - 150 * DAY, contactIds: [cid.Nate], designations: ['reps'],
    strategies: [S_('Real estate professional status', 'progress', 'Needs to document 750 hours.'), S_('Investment planning', 'paused')],
    work: [W_('Quarterly review', 'todo', 'Phillips', -5)] });
  // redevelopment advisory: basis points, half cash at closing, half equity
  const ng = put('companies', { name: 'Northgate Redevelopment Partners', industry: 'Real estate development', domain: 'northgate.example', location: 'Minneapolis, MN', createdAt: now - 120 * DAY, updatedAt: now,
    advisory: { active: true, bps: 150, cashPct: 50, since: now - 110 * DAY, scope: 'Redevelopment projects', notes: 'Project value = total capitalization at closing. Equity issued as Class B units within 60 days of closing.' } });
  const elena = put('contacts', { firstName: 'Elena', lastName: 'Voss', email: 'elena.voss@example.com', emailLower: 'elena.voss@example.com', phone: '(612) 555-0190', companyId: ng, companyName: 'Northgate Redevelopment Partners', title: 'Managing Partner', owner: 'Jaleel', source: 'Referral', tags: ['developer'], status: 'active', createdAt: now - 120 * DAY, updatedAt: now });
  const adeal = (name, pv, stage, daysIn, extra) => put('deals', Object.assign({ pipeline: 'company', name, contactId: elena, companyId: ng, clientId: null, fee: { structure: 'bps', projectValue: pv, bps: 150, cashPct: 50, entity: name.split(':')[1].trim() + ' Owner LLC' }, amount: pv * 0.015, stage, owner: 'Jaleel', createdAt: now - (daysIn + 20) * DAY, stageChangedAt: now - daysIn * DAY, updatedAt: now - daysIn * DAY, closeDate: now + 45 * DAY, description: '' }, extra || {}));
  const rl = adeal('Northgate: Riverside Lofts', 18000000, 'co_closed', 40, { closeDate: now - 40 * DAY, equity: { status: 'issued', basis: 135000, estValue: 152000, entity: 'Riverside Lofts Owner LLC', ownership: '0.9% Class B units', issuedAt: now - 20 * DAY, notes: 'Pref return 8%, then 70/30.', updatedAt: now } });
  adeal('Northgate: Mill District Mixed Use', 32000000, 'co_open', 6);
  adeal('Northgate: Eastgate Retail Conversion', 9500000, 'co_open', 3);
  adeal('Northgate: Lakeview Townhomes', 6000000, 'co_lost', 60);
  put('revenue', { clientId: null, companyId: ng, dealId: rl, contactId: elena, type: 'advisory', feeRole: 'closing_cash', amount: 135000, status: 'paid', date: now - 38 * DAY, paidBy: 'Northgate Redevelopment Partners', description: 'Northgate: Riverside Lofts closing fee (50% cash)', notes: '150 bps of $18,000,000 = $270,000 total fee; $135,000 taken as equity. Wired at closing.', createdAt: now, createdBy: 'Jaleel', updatedAt: now });
  put('activities', { type: 'stage', contactId: elena, dealId: rl, body: 'Northgate: Riverside Lofts: Open → Closed', by: 'Jaleel', at: now - 40 * DAY });
  // company retainers (monthly) and a company quarterly plan
  const coPlan = (coId, label, amount, freq, start, type) => { const p = { id: uid(), label, amount, frequency: freq, type, start, end: null, companyId: null, active: true, createdAt: start }; D.companies[coId].feePlans = (D.companies[coId].feePlans || []).concat([p]); return p; };
  const coPay = (coId, p, skipLast) => { const step = p.frequency === 'monthly' ? 1 : 3, ins = []; for (let k = 0; ; k++) { const due = addMonths(p.start, k * step); if (due > now) break; ins.push(due); } (skipLast ? ins.slice(0, -1) : ins).forEach(due => put('revenue', { clientId: null, companyId: coId, dealId: null, contactId: null, planId: p.id, period: periodKey(due), type: p.type, billing: p.frequency === 'monthly' ? 'monthly' : 'quarterly', amount: p.amount, status: 'paid', date: due + 3 * DAY, dueDate: due, paidBy: D.companies[coId].name, description: p.label + ' · ' + periodLabel(due, p.frequency), notes: '', createdAt: now, createdBy: 'Jaleel', updatedAt: now })); };
  coPay(ng, coPlan(ng, 'Development advisory retainer', 2500, 'monthly', new Date(new Date(now).getFullYear(), new Date(now).getMonth() - 5, 1).getTime(), 'retainer'));
  coPay(co.ortega, coPlan(co.ortega, 'Monthly tax advisory retainer', 1500, 'monthly', new Date(new Date(now).getFullYear(), new Date(now).getMonth() - 3, 1).getTime(), 'retainer'), true);
  coPay(co.bell, coPlan(co.bell, 'Practice tax planning', 1800, 'quarterly', addMonths(quarterStart(now), -6), 'quarterly'));
  // concurrent deals on one client / one company
  const cdeal = (name, clId, contact, coId, amt, stage, owner, daysIn) => put('deals', { name, clientId: clId, contactId: contact, companyId: coId, amount: amt, stage, owner, createdAt: now - (daysIn + 5) * DAY, stageChangedAt: now - daysIn * DAY, updatedAt: now - daysIn * DAY, closeDate: now + 30 * DAY, description: '' });
  cdeal('Okafor: cost seg, Stillwater property', cl_okafor, cid.Ben, null, 9500, 'analysis', 'Todd', 8);
  cdeal('Okafor: retirement plan design', cl_okafor, cid.Tara, null, 6000, 'discovery', 'Todd', 3);
  cdeal('Okafor: logistics co. entity cleanup', cl_okafor, cid.Ben, null, 12000, 'won', 'Todd', 200);
  cdeal('Moss Family Office: trust and estate review', null, cid.Angela, co.moss, 15000, 'engagement', 'Jaleel', 5);
  cdeal('Jensen: series LLC setup', cl_carla, cid.Carla, null, 4000, 'lead', 'Jaleel', 2);
  // ---- demo revenue: fee plans with installment history, plus one-off fees and commissions
  const plan = (clId, label, amount, start) => { const p = { id: uid(), label, amount, frequency: 'quarterly', type: 'quarterly', start, end: null, companyId: null, active: true, createdAt: start }; D.clients[clId].feePlans = (D.clients[clId].feePlans || []).concat([p]); return p; };
  const rev = (clId, o) => put('revenue', Object.assign({ clientId: clId, companyId: null, dealId: null, contactId: D.clients[clId].contactIds[0], paidBy: 'Client', status: 'paid', notes: '', createdAt: now, createdBy: 'Jaleel', updatedAt: now }, o));
  const payAll = (clId, p, skipLast) => { const ins = []; for (let k = 0; ; k++) { const due = addMonths(p.start, k * 3); if (due > now) break; ins.push(due); } (skipLast ? ins.slice(0, -1) : ins).forEach(due => rev(clId, { planId: p.id, period: periodKey(due), type: 'quarterly', amount: p.amount, date: due + 2 * DAY, dueDate: due, description: p.label + ' · ' + periodLabel(due, 'quarterly') })); };
  const pO = plan(cl_okafor, 'Platinum quarterly strategy fee', 8000, addMonths(quarterStart(now), -12)); payAll(cl_okafor, pO);
  rev(cl_okafor, { type: 'startup', amount: 3750, date: addMonths(quarterStart(now), -12) - 10 * DAY, description: 'Startup fee (1 of 2)' });
  rev(cl_okafor, { type: 'startup', amount: 3750, date: addMonths(quarterStart(now), -12) + 20 * DAY, description: 'Startup fee (2 of 2)' });
  rev(cl_okafor, { type: 'commission', amount: 4200, date: now - 300 * DAY, paidBy: 'Equipment program partner', description: 'Equipment rental program placement, 6 trucks' });
  rev(cl_okafor, { type: 'commission', amount: 6000, status: 'expected', date: now + 20 * DAY, paidBy: 'Partner fund', description: 'Investment funding, real estate fund allocation' });
  const pC = plan(cl_carla, 'Gold quarterly strategy fee', 3900, addMonths(quarterStart(now), -9)); payAll(cl_carla, pC);
  rev(cl_carla, { type: 'deal', amount: 4500, date: now - 90 * DAY, description: 'Cost seg studies, 3 STR properties' });
  rev(cl_carla, { type: 'consulting', amount: 1000, date: now - 40 * DAY, description: '2 hours, series LLC planning call' });
  const haleDeal = Object.keys(D.deals).find(k => D.deals[k].name.indexOf('Hale') === 0);
  rev(cl_hale, { type: 'startup', amount: 5500, date: now - 4 * DAY, dealId: haleDeal, description: 'Startup fee (1 of 2)' });
  rev(cl_hale, { type: 'startup', amount: 5500, status: 'invoiced', date: now + 26 * DAY, dealId: haleDeal, description: 'Startup fee (2 of 2)' });
  plan(cl_hale, 'Platinum quarterly strategy fee', 8000, addMonths(quarterStart(now), 3));
  const pN = plan(cl_nate, 'Silver quarterly strategy fee', 2500, addMonths(quarterStart(now), -6)); payAll(cl_nate, pN, true);
  put('jobs', { type: 'send_email', params: { templateId: ids.engagement }, contactId: cid.Marcus, runAt: now + 26 * 3600000, dueAt: now + 26 * 3600000, status: 'pending', createdAt: now - 2 * 3600000, createdBy: 'Todd' });
  return D;
}

/* Recipe: email quarterly clients 2 weeks before each new quarter to set up a meeting, plus a task for their advisor. */
ACT.recipeQuarterly = async () => {
  const tid = await store.add('templates', { name: 'Quarterly planning meeting invite', unsubscribe: false, createdAt: Date.now(), updatedAt: Date.now(),
    subject: 'Planning for {{nextQuarter}}, {{firstName|there}}',
    body: 'Hi {{firstName|there}},\n\n{{nextQuarter}} starts {{quarterStartDate}}, and it is a good time to look at where things stand and what is coming up.\n\nWould you be open to a short planning meeting with {{advisor|our team}} in the next couple of weeks? Reply with a few times that work and we will get it on the calendar.\n\n{{senderFirstName}}' });
  const id = await store.add('workflows', { name: 'Quarterly planning meeting invite', active: false, allowReenroll: false, description: 'Two weeks before each new quarter, every client on a quarterly fee plan gets a meeting invite and their advisor gets a task to book it.',
    trigger: { type: 'before_quarter', days: 14, quarterlyOnly: true, currentOnly: true },
    actions: [{ type: 'send_email', templateId: tid }, { type: 'create_task', title: 'Book {{clientName}} {{nextQuarter}} planning meeting', assignee: '__owner', dueDays: 5 }],
    runCount: 0, createdAt: Date.now(), updatedAt: Date.now(), createdBy: meName() });
  toast('Added. Review the email, then switch it on.');
  ACT.editWf({ id });
};
