#!/usr/bin/env node
/**
 * Extracts the sample data from the v7 HTML prototype into JSON seed files.
 *
 *   node scripts/extract-prototype-data.mjs \
 *     "design_handoff_milife_service_desk/prototype/MiLife Service Desk v7.dc.html" \
 *     prisma/seed-data
 *
 * The prototype is evaluated in an isolated VM context with a frozen clock.
 * All times are written as minutes relative to "now" so prisma/seed.ts can
 * place them around the moment the seed runs. The prototype is never imported
 * by the app; this script is the only thing that reads it.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const [, , srcPath, outDir] = process.argv;
if (!srcPath || !outDir) {
  console.error('Usage: extract-prototype-data.mjs <prototype.html> <outDir>');
  process.exit(1);
}

const html = fs.readFileSync(srcPath, 'utf8');
const start = html.indexOf('const DEPTS=');
const end = html.indexOf('class Component extends DCLogic');
if (start < 0 || end < 0) throw new Error('Data section not found in prototype');
const code = html.slice(start, end);

const FROZEN = Date.UTC(2026, 9, 15, 10, 0, 0); // 15 Oct 2026 10:00 Africa/Accra (UTC+0)
const MIN = 60000;
const sandbox = {
  Date: class extends Date {
    static now() {
      return FROZEN;
    }
  },
  localStorage: { getItem: () => null, setItem: () => {} },
  console,
};
vm.createContext(sandbox);
const D = vm.runInContext(
  code +
    ';({DEPTS,ADMIN,BR,PR,ARTICLES,POL,CLAIMS,FORMS,TEMPLATES,CANNED,ASSETS,KW,CATK,CATD,CATPRI,APPR,RAW,T0})',
  sandbox,
);

// ---------- helpers ----------
const SLUG = {
  claims: 'claims',
  cs: 'customer-service',
  uw: 'underwriting',
  it: 'it',
  hr: 'hr',
  fin: 'finance',
  comp: 'compliance',
  ops: 'operations',
  sales: 'sales-distribution',
  legal: 'legal',
  fac: 'facilities',
  mkt: 'marketing',
};
const CONFIDENTIAL_BY_DEFAULT = new Set(['hr', 'legal', 'comp']);
const EMAIL_DOMAIN = 'milife.test'; // reserved TLD: seed can never email a real person
const email = (name) =>
  name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[^a-z ]/g, '')
    .trim()
    .split(/\s+/)
    .join('.') +
  '@' +
  EMAIL_DOMAIN;
const branch = (name) => D.BR[name] || 'Achimota HQ';
const BRANCH_ENUM = { 'Achimota HQ': 'ACHIMOTA_HQ', Kumasi: 'KUMASI', Takoradi: 'TAKORADI' };
const STATUS = {
  open: 'OPEN',
  progress: 'IN_PROGRESS',
  pending: 'AWAITING_REQUESTER',
  resolved: 'RESOLVED',
  closed: 'CLOSED',
};
const PRIORITY = { urgent: 'URGENT', high: 'HIGH', medium: 'MEDIUM', low: 'LOW' };
const CHANNEL = { Portal: 'PORTAL', Email: 'EMAIL', Teams: 'TEAMS', WhatsApp: 'WHATSAPP' };
const ago = (ms) => Math.round((D.T0 - ms) / MIN); // minutes before "now"
const num = (id) => Number(String(id).replace(/^MLT-/, ''));
const write = (file, data) => {
  fs.writeFileSync(path.join(outDir, file), JSON.stringify(data, null, 2) + '\n');
  console.log(`  ${file.padEnd(22)} ${Array.isArray(data) ? data.length + ' rows' : 'object'}`);
};
fs.mkdirSync(outDir, { recursive: true });

// ---------- departments + people ----------
const departments = D.DEPTS.map((d) => ({
  slug: SLUG[d.id],
  name: d.name,
  hue: d.hue,
  headEmail: email(d.head),
  emailAlias: `${SLUG[d.id]}@${EMAIL_DOMAIN}`,
  confidentialByDefault: CONFIDENTIAL_BY_DEFAULT.has(d.id),
}));

const people = [];
for (const d of D.DEPTS) {
  people.push({
    name: d.head,
    email: email(d.head),
    role: 'HEAD',
    department: SLUG[d.id],
    branch: BRANCH_ENUM[branch(d.head)],
  });
  for (const m of d.members)
    people.push({
      name: m,
      email: email(m),
      role: 'MEMBER',
      department: SLUG[d.id],
      branch: BRANCH_ENUM[branch(m)],
    });
}
people.push({
  name: D.ADMIN,
  email: email(D.ADMIN),
  role: 'ADMIN',
  department: 'it',
  branch: 'ACHIMOTA_HQ',
  title: 'Admin · COO office',
});
const byName = Object.fromEntries(people.map((p) => [p.name, p]));
const emailOf = (n) => {
  if (!n) return null;
  if (!byName[n]) throw new Error(`Unknown person in prototype data: ${n}`);
  return byName[n].email;
};

// ---------- service catalogue ----------
const serviceTypes = D.DEPTS.flatMap((d) =>
  d.cats.map((cat) => {
    const form = D.FORMS[cat];
    return {
      department: SLUG[d.id],
      name: cat,
      description: D.CATD[cat] || '',
      defaultPriority: PRIORITY[D.CATPRI[cat] || 'medium'],
      needsApproval: D.APPR.includes(cat),
      attachmentRequired: !!(form && form.attach),
      fields: form
        ? form.fields.map(([label, type, required, options]) => ({
            label,
            type,
            required: !!required,
            ...(options ? { options } : {}),
          }))
        : [],
    };
  }),
);

// ---------- routing suggestions for the New ticket wizard ----------
const classifier = {
  departmentKeywords: Object.fromEntries(Object.entries(D.KW).map(([k, v]) => [SLUG[k], v])),
  categoryKeywords: D.CATK,
};

// ---------- canned replies, templates, articles ----------
const canned = Object.entries(D.CANNED).flatMap(([k, list]) =>
  list.map(([title, body]) => ({ department: k === 'default' ? null : SLUG[k], title, body })),
);

const parseRepeat = (label) => {
  if (label === 'Never') return { repeat: 'NEVER' };
  const [freq, rule] = label.split(' · ');
  return { repeat: freq.toUpperCase(), repeatRule: rule || null };
};
const templates = D.TEMPLATES.map((t) => ({
  key: t.id,
  name: t.name,
  department: SLUG[t.dept],
  serviceType: t.cat,
  priority: PRIORITY[t.pri],
  subject: t.subject,
  body: t.desc,
  ...parseRepeat(t.repeat),
  active: ['tp2', 'tp3', 'tp4'].includes(t.id), // prototype state.recurOn
}));

const relDays = (s) => {
  const m = s.match(/(\d+)\s+(day|week|month)/);
  if (!m) return 0;
  return Number(m[1]) * { day: 1, week: 7, month: 30 }[m[2]];
};
const articles = D.ARTICLES.map((a) => ({
  key: a.id,
  department: SLUG[a.dept],
  title: a.title,
  excerpt: a.excerpt,
  body: a.body,
  tags: a.tags,
  views: a.views,
  updatedDaysAgo: relDays(a.updated),
}));

// ---------- assets, policy stub ----------
const assets = D.ASSETS.map((a) => ({
  code: a.id,
  type: a.type,
  model: a.model,
  ownerDepartment: SLUG[a.owner],
  holderEmail: emailOf(a.holder),
  location: a.loc,
  status: a.status,
  warranty: a.warranty,
}));
const policies = Object.entries(D.POL).map(
  ([number, [product, premium, payMethod, since, holder]]) => ({
    number,
    product,
    premium,
    payMethod,
    since,
    holder,
  }),
);
const claims = Object.entries(D.CLAIMS).map(([number, policyNumber]) => ({ number, policyNumber }));

// ---------- tickets ----------
// Due dates are NOT copied from the prototype: it overrides them per ticket to
// stage screenshots. The seed recomputes dueAt with lib/sla.ts so the data
// obeys the same invariant as production (dueAt derives from createdAt).
const tickets = D.RAW.map((t) => {
  const legs = t.legs.map((l) => ({
    department: SLUG[l.dept],
    inMinutesAgo: ago(l.in),
    outMinutesAgo: l.out ? ago(l.out) : null,
    byEmail: emailOf(l.by),
    reason: l.reason || null,
  }));
  const events = t.events.map((e) => {
    const base = {
      type: e.t.toUpperCase(),
      minutesAgo: ago(e.at),
      byEmail: e.by === 'System' ? null : emailOf(e.by),
    };
    switch (e.t) {
      case 'created':
        return { ...base, meta: { department: SLUG[e.to] } };
      case 'msg':
      case 'note':
        return {
          ...base,
          type: e.t === 'msg' ? 'MESSAGE' : 'NOTE',
          body: e.body,
          mentions: e.mentions
            ? {
                people: e.mentions.people.map(emailOf),
                departments: e.mentions.depts.map((d) => SLUG[d]),
              }
            : { people: [], departments: [] },
          attachments: (e.files || []).map((f) => ({ name: f.name, size: f.size, kind: f.kind })),
        };
      case 'forwarded':
        return { ...base, body: e.body, meta: { from: SLUG[e.from], to: SLUG[e.to] } };
      case 'assigned':
        return { ...base, meta: { assigneeEmail: emailOf(e.body) } };
      case 'escalated':
        return { ...base, body: e.body, meta: { level: e.level, manual: true } };
      case 'rated':
        return { ...base, meta: { stars: Number(e.body) } };
      default:
        return { ...base, body: e.body ?? null };
    }
  });
  return {
    number: num(t.id),
    subject: t.subject,
    description: t.events.find((e) => e.t === 'msg')?.body ?? t.subject,
    requesterEmail: emailOf(t.from),
    department: SLUG[t.dept],
    assigneeEmail: emailOf(t.as),
    serviceType: t.cat,
    priority: PRIORITY[t.pri],
    status: STATUS[t.st],
    channel: CHANNEL[t.ch] || 'PORTAL',
    confidential: t.conf,
    fields: t.fields || {},
    createdMinutesAgo: ago(t.created),
    resolvedMinutesAgo: t.doneAt ? ago(t.doneAt) : null,
    csat: t.csat,
    assetCode: t.asset,
    policyNumber: t.policy,
    parentNumber: t.parent ? num(t.parent) : null,
    links: t.links.map((l) => ({
      type: l.type.toUpperCase().replace(/ /g, '_'),
      toNumber: num(l.id),
    })),
    tasks: t.tasks.map((x, i) => ({ text: x.text, done: x.done, order: i })),
    time: t.time.map((x) => ({ userEmail: emailOf(x.by), minutes: x.mins, minutesAgo: ago(x.at) })),
    legs,
    events,
  };
});

// ---------- settings (prototype defaults + decisions D-01..D-05) ----------
const settings = {
  'sla.targets': Object.fromEntries(
    Object.entries(D.PR).map(([k, p]) => [
      PRIORITY[k],
      { firstResponseMinutes: p.fr, resolveMinutes: p.res },
    ]),
  ),
  'sla.calendar': { URGENT: '24x7', HIGH: '24x7', MEDIUM: '24x7', LOW: '24x7' },
  'sla.businessHours': {
    timezone: 'Africa/Accra',
    days: [1, 2, 3, 4, 5],
    start: '08:00',
    end: '17:00',
  },
  'sla.warningPercent': 75,
  'sla.pauseWhileAwaitingRequester': true,
  'escalation.level2AfterMinutes': 'RESOLVE_TARGET', // a further full resolution window after breach
  'rules.autoCloseResolvedAfterDays': 3,
  'rules.autoCloseEnabled': true,
  'rules.mentionedDepartmentsCanReply': true,
  'rules.reasonRequiredWhenForwarding': true,
  'rules.notifyRequesterOnForward': true,
  'rules.headReviewAfterForwards': 3,
  'confidentiality.defaultDepartments': ['hr', 'legal', 'compliance'],
  'retention.closedTicketsArchiveMonths': 12,
  'retention.confidentialDeleteYears': 7,
  'retention.attachmentsDeleteMonths': 24,
  'digest.sendAtLocalTime': '07:30',
};

const announcements = [
  {
    level: 'OUTAGE',
    title: 'Email is down at the Kumasi branch',
    body: 'IT is working with the provider. Use Microsoft Teams for urgent messages until it is back.',
    audience: { type: 'BRANCH', value: 'KUMASI' },
    byEmail: emailOf('Kojo Appiah'),
    minutesAgo: 50,
    ticketNumber: 24824,
  },
  {
    level: 'INFO',
    title: 'Generator maintenance on Saturday',
    body: 'Power will be off at Achimota HQ from 08:00 to 11:00 on Sat 17 Oct.',
    audience: { type: 'ALL' },
    byEmail: emailOf('Kwabena Asare'),
    minutesAgo: 1440,
    ticketNumber: null,
  },
];
const outOfOffice = [
  { userEmail: emailOf('Edem Kpeli'), untilDaysFromNow: 1, delegateEmail: emailOf('Yaw Mensah') },
];

console.log(`Writing seed data to ${outDir}`);
write('departments.json', departments);
write('people.json', people);
write('service-types.json', serviceTypes);
write('classifier.json', classifier);
write('canned-replies.json', canned);
write('templates.json', templates);
write('articles.json', articles);
write('assets.json', assets);
write('policies.json', policies);
write('claims.json', claims);
write('tickets.json', tickets);
write('settings.json', settings);
write('announcements.json', announcements);
write('out-of-office.json', outOfOffice);
