/* ================= AI ASSISTANT =================
   A chat panel that calls Claude (Anthropic API) directly from the browser.
   The API key is kept in this browser only (never in the CRM database or backups).
   Claude never changes anything by itself: every change comes back as a proposal
   card, and nothing is saved until you click Approve. */
ICONS.spark = '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>';
const AI_KEY = 'phillipscrm_ai_key', AI_MODEL_KEY = 'phillipscrm_ai_model';
const AI_MODELS = [['claude-sonnet-5-5', 'Claude Sonnet 5.5 (recommended)'], ['claude-opus-5-5', 'Claude Opus 5.5 (most capable)'], ['claude-haiku-5-5', 'Claude Haiku 5.5 (fastest)']];
const DEFAULT_AI_STYLE = 'Write in Jaleel\'s voice: warm but direct, conversational opener, professional body. No hyphens and no em dashes. No hollow filler phrases. Closes invite a reply without pressure. Urgency should feel natural, never manufactured. Keep it short and non-redundant.';
const aiKey = () => { try { return localStorage.getItem(AI_KEY) || ''; } catch (e) { return AI.memKey || ''; } };
const aiModel = () => { try { return localStorage.getItem(AI_MODEL_KEY) || AI_MODELS[0][0]; } catch (e) { return AI_MODELS[0][0]; } };
const AI = { open: false, busy: false, messages: [], items: [], pending: [], memKey: '' };

/* ---------- tools Claude can use (all are proposals) ---------- */
const AI_TRIGGER_TYPES = ['contact_created', 'form_submitted', 'tag_added', 'deal_created', 'deal_stage_changed', 'before_quarter', 'before_review', 'after_signing'];
const AI_ACTION_TYPES = ['send_email', 'enroll_sequence', 'create_task', 'delay', 'add_tag', 'remove_tag', 'set_stage', 'notify', 'stop_sequences'];
const AI_TOOLS = [
  {
    name: 'propose_workflow',
    description: 'Propose a new automation workflow. The user reviews it and must approve before it is saved. For a send_email step, either reference an existing template by templateId or include newTemplate to have it created on approval.',
    input_schema: {
      type: 'object', required: ['name', 'trigger', 'actions'],
      properties: {
        name: { type: 'string' }, description: { type: 'string' },
        active: { type: 'boolean', description: 'Turn it on as soon as it is approved. Default false unless the user asked for it to start running.' },
        trigger: {
          type: 'object', required: ['type'],
          properties: {
            type: { type: 'string', enum: AI_TRIGGER_TYPES },
            days: { type: 'number', description: 'For before_quarter / before_review / after_signing' },
            tier: { type: 'string', enum: ['', 'platinum', 'gold', 'silver', 'special'], description: 'Date triggers: limit to one client tier' },
            quarterlyOnly: { type: 'boolean', description: 'Date triggers: only clients with an active quarterly fee plan' },
            currentOnly: { type: 'boolean', description: 'Date triggers: skip paused and former clients (default true)' },
            stage: { type: 'string', description: 'For deal_stage_changed: stage id' },
            tag: { type: 'string', description: 'For tag_added' },
            source: { type: 'string' }, requireTag: { type: 'string' }
          }
        },
        actions: {
          type: 'array',
          items: {
            type: 'object', required: ['type'],
            properties: {
              type: { type: 'string', enum: AI_ACTION_TYPES },
              templateId: { type: 'string' },
              newTemplate: { type: 'object', properties: { name: { type: 'string' }, subject: { type: 'string' }, body: { type: 'string' } }, required: ['name', 'subject', 'body'] },
              sequenceId: { type: 'string' },
              title: { type: 'string' }, assignee: { type: 'string', description: '"__owner" for the client or contact owner, or a team member name' }, dueDays: { type: 'number' },
              tag: { type: 'string' }, stage: { type: 'string' },
              to: { type: 'string', description: 'notify: "__owner" or a team email' }, subject: { type: 'string' }, body: { type: 'string' },
              days: { type: 'number' }, hours: { type: 'number' }
            }
          }
        }
      }
    }
  },
  {
    name: 'propose_template',
    description: 'Propose a reusable email template. Use merge tags like {{firstName|there}}, {{nextQuarter}}, {{quarterStartDate}}, {{advisor}}, {{senderFirstName}}, {{firmName}}.',
    input_schema: { type: 'object', required: ['name', 'subject', 'body'], properties: { name: { type: 'string' }, subject: { type: 'string' }, body: { type: 'string' } } }
  },
  {
    name: 'propose_task',
    description: 'Propose one task for a team member.',
    input_schema: { type: 'object', required: ['title'], properties: { title: { type: 'string' }, assignee: { type: 'string' }, dueInDays: { type: 'number' }, clientName: { type: 'string' }, contactName: { type: 'string' }, notes: { type: 'string' } } }
  },
  {
    name: 'propose_email',
    description: 'Draft a one-off email to a specific contact. On approval it opens as a draft in Gmail (nothing is sent automatically) and is logged on their timeline.',
    input_schema: { type: 'object', required: ['contactName', 'subject', 'body'], properties: { contactName: { type: 'string', description: 'Contact full name or email' }, subject: { type: 'string' }, body: { type: 'string' } } }
  }
];

/* ---------- what Claude knows about the CRM ---------- */
function aiSnapshot() {
  const g = S.settings.general || {}, days = t => t ? Math.round((Date.now() - t) / DAY) : null;
  const cl = list('clients').slice(0, 200).map(c => {
    const tp = tierPlanOf(c), lc = lastContact(c);
    return { name: c.name, tier: c.tier, status: c.status || 'active', advisor: c.owner || '', quarterlyFee: tp ? tp.amount : null, daysSinceContact: days(lc), designations: c.designations || [], strategies: (c.strategies || []).map(s => s.name + ' (' + s.status + ')'), openWork: (c.work || []).filter(w => w.status !== 'done').map(w => w.type), nextReview: c.nextReview ? toDateInput(c.nextReview) : null, people: clientContacts(c).map(fullName) };
  });
  const co = list('companies').slice(0, 150).map(c => ({ name: c.name, industry: c.industry || '', advisory: c.advisory && c.advisory.active !== false ? c.advisory.bps + ' bps, ' + (c.advisory.cashPct == null ? 50 : c.advisory.cashPct) + '% cash' : null }));
  const deals = list('deals').filter(d => stageKind(d.stage) === 'open').slice(0, 150).map(d => { const f = feeOf(d); return { name: d.name, pipeline: isCompanyDeal(d) ? 'company' : 'client', stage: stageOf(shownStage(d)).name, amount: d.amount, cash: f ? f.cash : d.amount, equity: f ? f.equity : 0, client: (byId('clients', d.clientId) || {}).name || null, company: (byId('companies', d.companyId) || {}).name || null, owner: d.owner }; });
  const m = firmMoney();
  return {
    today: toDateInput(Date.now()), firm: firmName(), me: meName(), team: team().map(t => t.name),
    tiers: TIERS.map(t => ({ id: t[0], name: t[1], quarterlyFee: t[0] === 'special' ? 'custom per client' : tierFee(t[0]), checkInEveryDays: cadenceDays(t[0]) })),
    clientStages: stages().map(s => ({ id: s.id, name: s.name })), companyStages: COMPANY_STAGES.map(s => ({ id: s.id, name: s.name })),
    sources: sources(),
    templates: list('templates').map(t => ({ id: t.id, name: t.name, subject: t.subject })),
    sequences: list('sequences').map(s => ({ id: s.id, name: s.name, emails: (s.steps || []).length })),
    workflows: list('workflows').map(w => ({ name: w.name, active: !!w.active, trigger: triggerSummary(w.trigger), steps: (w.actions || []).map(actionSummary) })),
    clients: cl, companies: co, openDeals: deals,
    contactsCount: list('contacts').length, contacts: list('contacts').slice(0, 300).map(c => ({ name: fullName(c), email: c.email || '', company: c.companyName || '', tags: c.tags || [] })),
    revenue: { collectedThisQuarter: round2(m.qtd), collectedYTD: round2(m.ytd), recurringPerYear: round2(m.arr), pastDue: round2(m.overdue) },
    openTasks: list('tasks').filter(t => !t.done).slice(0, 100).map(t => ({ title: t.title, assignee: t.assignee, due: t.due ? toDateInput(t.due) : null }))
  };
}
function aiSystem() {
  const g = S.settings.general || {};
  return `You are the built-in assistant for ${firmName()} CRM, used by ${meName()} at ${firmName()}, a tax strategy firm serving high net worth clients and real estate developers.

You help the team set up automations, write emails, and answer questions about their clients, companies, deals, and revenue.

Rules:
- You cannot change anything directly. To create or change something, call a propose_* tool. The user sees each proposal as a card and must click Approve before anything is saved. Never say something "has been created" until the tool result confirms approval.
- Prefer one complete proposal over many small ones. If a request needs a new email, put it in the workflow's send_email step as newTemplate rather than proposing the template separately.
- Ask a short clarifying question only when you truly cannot pick sensible defaults. Otherwise make reasonable choices and say what you chose in one or two sentences.
- For quarter timing use trigger type before_quarter with days. Quarterly clients are billed on Jan 1, Apr 1, Jul 1 and Oct 1. "Quarterly clients" means quarterlyOnly: true.
- Steps run with the client's primary contact. create_task with assignee "__owner" goes to the client's advisor.
- Merge tags available in emails: {{firstName}} {{lastName}} {{fullName}} {{company}} {{email}} {{clientName}} {{tier}} {{advisor}} {{nextQuarter}} {{quarterStartDate}} {{reviewDate}} {{dealName}} {{senderName}} {{senderFirstName}} {{firmName}}. Use a fallback like {{firstName|there}}.
- Writing style for any email: ${g.aiStyle || DEFAULT_AI_STYLE}
- Answer questions from the CRM data below. Be concise; use short lists when helpful. If the data does not contain the answer, say so.

CRM data (JSON):
${JSON.stringify(aiSnapshot())}`;
}

/* ---------- API ---------- */
async function aiCall() {
  const key = aiKey(); if (!key) throw new Error('Add your Anthropic API key first (Settings > AI assistant).');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json', 'anthropic-dangerous-direct-browser-access': 'true' },
    body: JSON.stringify({ model: aiModel(), max_tokens: 4000, system: aiSystem(), tools: AI_TOOLS, messages: AI.messages })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (data.error && data.error.message) || ('HTTP ' + res.status);
    if (res.status === 401) throw new Error('The API key was rejected. Check it in Settings > AI assistant.');
    throw new Error('Claude API error: ' + msg);
  }
  return data;
}
async function aiTurn() {
  AI.busy = true; renderAI();
  try {
    const data = await aiCall();
    AI.messages.push({ role: 'assistant', content: data.content });
    (data.content || []).forEach(b => {
      if (b.type === 'text' && b.text.trim()) AI.items.push({ who: 'ai', text: b.text });
      if (b.type === 'tool_use') { const p = { id: b.id, tool: b.name, input: b.input, status: 'pending' }; AI.pending.push(p); AI.items.push({ who: 'proposal', p }); }
    });
  } catch (e) { AI.items.push({ who: 'error', text: e.message }); }
  AI.busy = false; renderAI();
}
async function aiSend(text) {
  text = (text || '').trim(); if (!text || AI.busy) return;
  const content = [];
  // any open proposals the user skipped are answered first, so the conversation stays valid
  const open = AI.pending.filter(p => p.status === 'pending' || p.status === 'done' || p.status === 'discarded');
  open.forEach(p => { if (p.status === 'pending') p.status = 'skipped'; content.push({ type: 'tool_result', tool_use_id: p.id, content: p.result || (p.status === 'skipped' ? 'The user did not approve this proposal and moved on.' : 'Discarded by the user.') }); });
  AI.pending = [];
  content.push({ type: 'text', text });
  AI.messages.push({ role: 'user', content });
  AI.items.push({ who: 'me', text });
  await aiTurn();
}
async function aiResolve(p) {
  // when every proposal from the last reply is decided, report back so Claude can confirm
  if (AI.pending.some(x => x.status === 'pending')) { renderAI(); return; }
  const content = AI.pending.map(x => ({ type: 'tool_result', tool_use_id: x.id, content: x.result || 'Discarded by the user.' }));
  AI.pending = [];
  AI.messages.push({ role: 'user', content });
  await aiTurn();
}

/* ---------- applying proposals ---------- */
function findContact(q) {
  q = norm(q); if (!q) return null;
  return list('contacts').find(c => norm(c.email) === q) || list('contacts').find(c => norm(fullName(c)) === q) || list('contacts').find(c => norm(fullName(c)).includes(q)) || null;
}
function cleanWorkflow(inp) {
  const t = Object.assign({}, inp.trigger || {});
  if (!AI_TRIGGER_TYPES.includes(t.type)) throw new Error('Unknown trigger "' + t.type + '"');
  Object.keys(t).forEach(k => { if (t[k] === '' || t[k] == null) delete t[k]; });
  const actions = (inp.actions || []).map(a => {
    if (!AI_ACTION_TYPES.includes(a.type)) throw new Error('Unknown step "' + a.type + '"');
    const x = Object.assign({}, a); delete x.newTemplate;
    if (a.type === 'send_email' && !a.newTemplate && !byId('templates', a.templateId)) throw new Error('A send email step points to a template that does not exist');
    if (a.type === 'enroll_sequence' && !byId('sequences', a.sequenceId)) throw new Error('An enroll step points to a sequence that does not exist');
    Object.keys(x).forEach(k => { if (x[k] === '' || x[k] == null) delete x[k]; });
    return { x, newTemplate: a.newTemplate || null };
  });
  if (!actions.length) throw new Error('The workflow has no steps');
  return { trigger: t, actions };
}
async function applyProposal(p) {
  const i = p.input || {};
  if (p.tool === 'propose_workflow') {
    const w = cleanWorkflow(i), acts = [];
    for (const a of w.actions) {
      if (a.newTemplate) { a.x.templateId = await store.add('templates', { name: a.newTemplate.name, subject: a.newTemplate.subject, body: a.newTemplate.body, unsubscribe: false, createdAt: Date.now(), updatedAt: Date.now(), createdBy: 'AI assistant' }); }
      acts.push(a.x);
    }
    const active = p.activate != null ? p.activate : !!i.active;
    const id = await store.add('workflows', { name: i.name || 'New workflow', description: i.description || '', active, allowReenroll: false, trigger: w.trigger, actions: acts, runCount: 0, createdAt: Date.now(), updatedAt: Date.now(), createdBy: meName() + ' via AI assistant' });
    if (active && isDateTrigger(w.trigger) && LOCAL) { ENG.forceDates = true; localEngineKick(); }
    p.link = { act: 'editWf', id };
    return 'Approved and saved as workflow "' + (i.name || 'New workflow') + '"' + (active ? ', turned on.' : ', currently off.') + (w.actions.some(a => a.newTemplate) ? ' Its email template was saved too.' : '');
  }
  if (p.tool === 'propose_template') {
    const id = await store.add('templates', { name: i.name, subject: i.subject, body: i.body, unsubscribe: false, createdAt: Date.now(), updatedAt: Date.now(), createdBy: 'AI assistant' });
    p.link = { act: 'editTpl', id };
    return 'Approved and saved as template "' + i.name + '".';
  }
  if (p.tool === 'propose_task') {
    const cl = i.clientName && list('clients').find(c => norm(c.name) === norm(i.clientName));
    const c = findContact(i.contactName) || (cl && byId('contacts', (cl.contactIds || [])[0])) || null;
    const assignee = team().some(t => t.name === i.assignee) ? i.assignee : (cl && cl.owner) || meName();
    await store.add('tasks', { title: i.title, contactId: c ? c.id : null, contactName: c ? fullName(c) : '', clientId: cl ? cl.id : null, assignee, due: startOfDay() + (Number(i.dueInDays) || 0) * DAY + 10 * 3600000, notes: i.notes || '', done: false, createdAt: Date.now(), createdBy: 'AI assistant' });
    return 'Approved. Task created for ' + assignee + '.';
  }
  if (p.tool === 'propose_email') {
    const c = findContact(i.contactName); if (!c || !c.email) throw new Error('Could not find a contact with an email for "' + i.contactName + '"');
    const g = S.settings.general || {}, v = mergeVars(c, null);
    const subj = merge(i.subject, v), body = merge(i.body, v) + (g.signature ? '\n\n' + g.signature : '');
    window.open('https://mail.google.com/mail/?view=cm&fs=1&to=' + encodeURIComponent(c.email) + '&su=' + encodeURIComponent(subj) + '&body=' + encodeURIComponent(body), '_blank', 'noopener');
    await logAct({ type: 'email', contactId: c.id, subject: subj, preview: body.replace(/\s+/g, ' ').slice(0, 300), by: meName() + ' via Gmail (drafted by AI assistant)' });
    await store.update('contacts', c.id, { lastEmailedAt: Date.now() });
    p.link = { act: 'openContact', id: c.id };
    return 'Approved. The draft opened in Gmail for the user to review and send, and it was logged on ' + fullName(c) + "'s timeline.";
  }
  throw new Error('Unknown proposal');
}
ACT.aiApprove = async d => {
  const p = AI.pending.find(x => x.id === d.id); if (!p || p.status !== 'pending') return;
  const chk = $('#aiAct_' + d.id); if (chk) p.activate = chk.checked;
  try { p.result = await applyProposal(p); p.status = 'done'; toast('Saved'); }
  catch (e) { p.status = 'error'; p.error = e.message; p.result = 'Could not be applied: ' + e.message; }
  await aiResolve(p);
};
ACT.aiDiscard = async d => { const p = AI.pending.find(x => x.id === d.id); if (!p) return; p.status = 'discarded'; await aiResolve(p); };
ACT.aiOpenLink = d => { if (ACT[d.a]) { if (d.a === 'editWf' || d.a === 'editTpl') AI.open = false; renderAI(); ACT[d.a]({ id: d.id }); } };

/* ---------- panel ---------- */
const AI_EXAMPLES = [
  'Create a workflow so quarterly clients get an email 2 weeks before each new quarter asking to set up a meeting',
  'Which clients are overdue for a check-in?',
  'Draft a follow up email for everyone in Analysis Meeting',
  'When a company project closes, create a task to confirm the equity was issued'
];
function mdLite(t) {
  return esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code class="k">$1</code>')
    .split('\n').map(l => /^\s*[-*] /.test(l) ? '<li>' + l.replace(/^\s*[-*] /, '') + '</li>' : l).join('\n')
    .replace(/(<li>.*<\/li>\n?)+/g, m => '<ul>' + m.replace(/\n/g, '') + '</ul>').replace(/\n/g, '<br>');
}
function proposalCard(p) {
  const i = p.input || {}, st = p.status;
  let title = '', body = '';
  if (p.tool === 'propose_workflow') {
    title = 'Workflow: ' + (i.name || '');
    let trig = ''; try { trig = triggerSummary(i.trigger || {}); } catch (e) { }
    body = `<div class="aip-trig">${ic('zap')} When ${esc(trig.replace(/^./, c => c.toLowerCase()))}</div>
      ${(i.actions || []).map(a => `<div class="aip-step">→ ${esc(a.type === 'send_email' && a.newTemplate ? 'Send new email "' + a.newTemplate.subject + '"' : actionSummary(a))}</div>${a.newTemplate ? `<details class="aip-email"><summary>Preview email</summary><div class="preview" style="font-size:12.5px"><div class="ps">${esc(a.newTemplate.subject)}</div>${textToHtml(a.newTemplate.body)}</div></details>` : ''}`).join('')}
      ${st === 'pending' ? `<label class="check" style="margin:8px 0 0"><input type="checkbox" id="aiAct_${p.id}" ${i.active ? 'checked' : ''}> Turn it on when approved</label>` : ''}`;
  } else if (p.tool === 'propose_template') {
    title = 'Template: ' + (i.name || '');
    body = `<div class="preview" style="font-size:12.5px"><div class="ps">${esc(i.subject)}</div>${textToHtml(i.body)}</div>`;
  } else if (p.tool === 'propose_task') {
    title = 'Task: ' + (i.title || '');
    body = `<div class="sub">${esc([i.assignee ? 'for ' + i.assignee : '', i.clientName || i.contactName || '', i.dueInDays != null ? 'due in ' + plural(Number(i.dueInDays) || 0, 'day') : ''].filter(Boolean).join(' · '))}</div>`;
  } else if (p.tool === 'propose_email') {
    title = 'Email to ' + (i.contactName || '');
    body = `<div class="preview" style="font-size:12.5px"><div class="ps">${esc(i.subject)}</div>${textToHtml(i.body)}</div>`;
  }
  const foot = st === 'pending' ? `<div class="aip-acts"><button class="btn sm ghost" data-act="aiDiscard" data-id="${p.id}">Discard</button><button class="btn sm primary" data-act="aiApprove" data-id="${p.id}">${p.tool === 'propose_email' ? 'Approve and open in Gmail' : 'Approve'}</button></div>`
    : st === 'done' ? `<div class="aip-done">${ic('check')} Saved${p.link ? ` · <a href="#" data-act="aiOpenLink" data-a="${p.link.act}" data-id="${p.link.id}">Open</a>` : ''}</div>`
    : st === 'error' ? `<div class="aip-err">Could not save: ${esc(p.error)}</div>` : `<div class="aip-off">${st === 'skipped' ? 'Skipped' : 'Discarded'}</div>`;
  return `<div class="aiprop ${st}"><div class="aip-h">${ic('spark')}<span>${esc(title)}</span></div><div class="aip-b">${body}</div>${foot}</div>`;
}
function renderAI() {
  let L = $('#aiLayer');
  if (!L) { L = document.createElement('div'); L.id = 'aiLayer'; document.body.appendChild(L); }
  if (!S.user) { L.innerHTML = ''; return; }
  if (!AI.open) { L.innerHTML = `<button class="aifab" data-act="aiToggle" title="AI assistant">${ic('spark')}<span>Ask AI</span></button>`; return; }
  const hasKey = !!aiKey();
  const prevScroll = $('#aiMsgs');
  const kept = $('#aiInput') ? $('#aiInput').value : '';
  L.innerHTML = `<div class="aipanel">
    <div class="aihd">${ic('spark')}<b>Assistant</b><span class="sub">${esc((AI_MODELS.find(m => m[0] === aiModel()) || [0, aiModel()])[1].split(' (')[0])}</span><div style="margin-left:auto;display:flex;gap:4px">${AI.items.length ? '<button class="btn sm ghost" data-act="aiNew">New chat</button>' : ''}<button class="x" data-act="aiToggle">×</button></div></div>
    <div class="aimsgs" id="aiMsgs">
      ${!hasKey ? `<div class="aiwelcome"><b>Connect Claude</b><p>The assistant uses your Anthropic API key. It is saved in this browser only, never in the CRM data or backups.</p>
        <form data-submit="aiKeySave" class="row" style="gap:6px"><input type="password" name="key" placeholder="sk-ant-..." autocomplete="off"><button class="btn sm primary">Save</button></form>
        <p class="hint">Get a key at console.anthropic.com > API keys. Usage is billed by Anthropic per request.</p></div>`
      : !AI.items.length ? `<div class="aiwelcome"><b>What can I set up for you?</b><p>I can build workflows and emails, draft messages, and answer questions about your clients, deals, and revenue. Nothing is saved until you approve it.</p>
        ${AI_EXAMPLES.map(e => `<button class="aiex" data-act="aiExample" data-t="${esc(e)}">${esc(e)}</button>`).join('')}</div>` : ''}
      ${AI.items.map(it => it.who === 'me' ? `<div class="aim me">${esc(it.text)}</div>` : it.who === 'ai' ? `<div class="aim ai">${mdLite(it.text)}</div>` : it.who === 'error' ? `<div class="aim err">${esc(it.text)}</div>` : proposalCard(it.p)).join('')}
      ${AI.busy ? '<div class="aim ai typing"><span></span><span></span><span></span></div>' : ''}
    </div>
    ${hasKey ? `<form class="aiin" data-submit="aiAsk"><textarea id="aiInput" name="q" rows="2" placeholder="Ask or tell me what to set up…" data-keep="aiq">${esc(kept)}</textarea><button class="btn primary" ${AI.busy ? 'disabled' : ''}>${ic('send')}</button></form>` : ''}
  </div>`;
  const box = $('#aiMsgs'); if (box) box.scrollTop = box.scrollHeight;
  void prevScroll;
  const inp = $('#aiInput'); if (inp && !AI.busy) inp.focus();
}
ACT.aiToggle = () => { AI.open = !AI.open; renderAI(); };
ACT.aiNew = () => { AI.messages = []; AI.items = []; AI.pending = []; renderAI(); };
ACT.aiExample = d => aiSend(d.t);
SUBMIT.aiAsk = (o, f) => { const t = o.q; f.elements.q.value = ''; return aiSend(t); };
SUBMIT.aiKeySave = o => { const k = (o.key || '').trim(); if (!/^sk-/.test(k)) { toast('That does not look like an Anthropic API key', 'error'); return; } try { localStorage.setItem(AI_KEY, k); } catch (e) { AI.memKey = k; } toast('Key saved in this browser'); renderAI(); };
document.addEventListener('keydown', e => { if (e.target && e.target.id === 'aiInput' && e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); const f = e.target.closest('form'); if (f) runFormSubmit(f); } });

/* ---------- settings card ---------- */
function aiSettingsCard() {
  const k = aiKey();
  return `<div class="card"><div class="hd"><h3>AI assistant</h3>${k ? '<span class="pill green">Connected</span>' : '<span class="pill">Not connected</span>'}</div><div class="bd">
    <form data-submit="aiKeySave" class="row" style="gap:6px;margin-bottom:8px"><input type="password" name="key" placeholder="${k ? 'Key saved: ' + esc(k.slice(0, 10)) + '…' : 'Anthropic API key (sk-ant-...)'}" autocomplete="off"><button class="btn sm">${k ? 'Replace' : 'Save key'}</button>${k ? '<button type="button" class="btn sm ghost danger" data-act="aiKeyClear">Remove</button>' : ''}</form>
    <label class="f"><span>Model</span><select data-change="aiModelSel">${AI_MODELS.map(m => opt(m[0], m[1], aiModel())).join('')}</select></label>
    <label class="f"><span>Writing style for emails the assistant drafts</span><textarea data-bind="general.aiStyle" style="min-height:80px" placeholder="${esc(DEFAULT_AI_STYLE)}">${esc((S.draft && S.draft.general && S.draft.general.aiStyle) || '')}</textarea></label>
    <div class="hint">The key is stored in this browser only (each team member adds their own) and is not included in backups. When you ask something, the assistant sends a summary of your CRM data to Anthropic to answer. It only proposes changes; nothing is saved until you click Approve.</div>
  </div></div>`;
}
ACT.aiKeyClear = () => { try { localStorage.removeItem(AI_KEY); } catch (e) { } AI.memKey = ''; toast('Key removed'); renderMain(); renderAI(); };
CHANGE.aiModelSel = (d, t) => { try { localStorage.setItem(AI_MODEL_KEY, t.value); } catch (e) { } toast('Model updated'); renderAI(); };
