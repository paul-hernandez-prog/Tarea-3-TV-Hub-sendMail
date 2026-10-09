// Dependency-light behavioral checks for V6. Run after npm install: node tests/verify-v6-isolated.cjs
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const notes = [];
const log = { error: (...items) => notes.push(items.map(String).join(' ')), log: () => undefined };

function loadTypeScript(relativePath, mocks) {
  const fullPath = path.join(root, relativePath);
  const { outputText, diagnostics } = ts.transpileModule(fs.readFileSync(fullPath, 'utf8'), {
    fileName: fullPath,
    reportDiagnostics: true,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true }
  });
  assert.equal((diagnostics || []).filter(x => x.category === ts.DiagnosticCategory.Error).length, 0, `TS syntax failed: ${relativePath}`);
  const module = { exports: {} };
  new Function('require', 'module', 'exports', 'console', outputText)(
    name => { if (name in mocks) return mocks[name]; throw Error(`Unexpected dependency: ${name}`); },
    module, module.exports, log
  );
  return module.exports;
}

async function main() {
  // Test 1: mail subject, recipient and content. No actual mail is sent.
  const messages = [];
  const { sendReportCreatedEmail, sendReportResolvedEmail } = loadTypeScript('src/notifications/report-email.ts', {
    nodemailer: { createTransport: () => ({ sendMail: async message => { messages.push(message); return {}; } }), createTestAccount: async () => { throw Error('test must not use Ethereal'); } },
    '../config/env.js': { env: { nodeEnv: 'test', smtpFrom: 'TV Hub <demo@example.org>', reportNotificationEmail: 'support@example.org' } }
  });
  const emailReport = { id: 'report-123', reason: 'VIDEO_PROBLEM', description: 'Video is frozen', status: 'OPEN', createdAt: new Date('2026-10-08T12:00:00Z'), evidenceUrls: ['/img.png'] };
  await sendReportCreatedEmail(emailReport, 'Canal Demo');
  await sendReportResolvedEmail({ ...emailReport, status: 'RESOLVED', resolvedAt: new Date('2026-10-08T12:05:00Z'), resolvedBy: 'admin-1' }, 'Canal Demo', 'reporter@example.org');
  assert.equal(messages.length, 2);
  assert.equal(messages[0].to, 'support@example.org');
  assert.match(messages[0].text, /Canal Demo/);
  assert.match(messages[0].text, /Video is frozen/);
  assert.equal(messages[1].to, 'reporter@example.org');
  assert.match(messages[1].text, /report-123/);
  assert.match(messages[1].text, /admin-1/);
  console.log('PASS MAIL 1-2: creation and resolution message payloads');

  // Test 2: escalation thresholds, status persistence, emitted payload, no duplicate escalation, scheduled callback handling.
  const reports = [
    { _id: 'old', status: 'OPEN', createdAt: new Date(Date.now() - 5 * 60_000) },
    { _id: 'new', status: 'OPEN', createdAt: new Date() },
    { _id: 'resolved', status: 'RESOLVED', createdAt: new Date(Date.now() - 5 * 60_000) }
  ];
  const events = [];
  let scheduled = null;
  let failFind = false;
  const { escalateOldReports, startReportEscalationJob } = loadTypeScript('src/jobs/report-escalation.job.ts', {
    'node-cron': { schedule: (schedule, callback, options) => { scheduled = { schedule, callback, options }; } },
    '../config/env.js': { env: { reportEscalationMinutes: 2, reportEscalationCron: '*/1 * * * *' } },
    '../models/report.model.js': { Report: {
      find: async query => { if (failFind) throw Error('temporary DB error'); return reports.filter(r => r.status === query.status && r.createdAt <= query.createdAt.$lte); },
      findOneAndUpdate: (query, update) => ({ populate: async () => {
        const r = reports.find(x => x._id === query._id && x.status === query.status);
        if (!r) return null;
        r.status = update.$set.status;
        return { userId: { _id: { toString: () => 'owner-1' } }, toObject: () => ({ _id: r._id, status: r.status, channelId: { name: 'Canal Demo' } }) };
      } })
    } },
    '../realtime/socket.js': { emitReportUpdated: (owner, payload) => events.push({ owner, payload }) }
  });
  assert.equal(await escalateOldReports(), 1);
  assert.deepEqual(reports.map(r => r.status), ['ESCALATED', 'OPEN', 'RESOLVED']);
  assert.equal(events[0].owner, 'owner-1');
  assert.equal(events[0].payload.status, 'ESCALATED');
  assert.equal(await escalateOldReports(), 0);
  startReportEscalationJob();
  assert.equal(scheduled.schedule, '*/1 * * * *');
  assert.equal(scheduled.options.noOverlap, true);
  failFind = true;
  await scheduled.callback();
  assert.ok(notes.some(x => x.includes('Could not escalate overdue reports')));
  console.log('PASS CRON 1-2: correct threshold, one-time persistence, event, schedule and error handling');

  // Test 3: controller continues after creation and resolution SMTP failure.
  let saved = null;
  let creationNotices = 0, resolutionNotices = 0;
  const socketEvents = [];
  const ownerId = '507f1f77bcf86cd799439011';
  const channelId = '507f191e810c19729de860ea';
  const user = { _id: { toString: () => ownerId }, email: 'reporter@example.org' };
  const channel = { id: channelId, name: 'Canal Demo' };
  const helpers = loadTypeScript('src/controllers/report.controller.ts', {
    'node:fs/promises': { unlink: async () => undefined },
    'node:path': path,
    mongoose: { isValidObjectId: x => /^[a-f0-9]{24}$/i.test(x), Types: { ObjectId: class { constructor(id) { this.id=id; } toString() { return this.id; } } } },
    '../models/channel.model.js': { Channel: { findOne: async () => channel } },
    '../models/report.model.js': { reportReasons: ['VIDEO_PROBLEM'], reportStatuses: ['OPEN','RESOLVED'], Report: {
      create: async doc => {
        saved = {
          ...doc, id: 'new-report-id', status: 'OPEN', createdAt: new Date(),
          toObject() { return { ...this }; },
          async save() { return this; },
          async populate() { this.userId = user; this.channelId = channel; return this; }
        };
        return saved;
      },
      findById: async () => saved
    } },
    '../models/user.model.js': { User: { findById: () => ({ select: async () => user }) } },
    '../middleware/upload.js': { reportUploadsDirectory: '/tmp/reports' },
    '../notifications/report-email.js': {
      sendReportCreatedEmail: async () => { creationNotices++; throw Error('Simulated SMTP offline'); },
      sendReportResolvedEmail: async () => { resolutionNotices++; throw Error('Simulated SMTP offline'); }
    },
    '../realtime/socket.js': {
      emitReportCreated: (id, payload) => socketEvents.push(['created',id,payload]),
      emitReportUpdated: (id, payload) => socketEvents.push(['updated',id,payload])
    },
    '../utils/app-error.js': { AppError: class extends Error { constructor(status,code,message) { super(message); this.status=status; this.code=code; } } }
  });
  const response = () => ({ code: 200, status(n) { this.code=n; return this; }, json(body) { this.body=body; return this; } });
  const created = response();
  await helpers.createReport({ auth: { userId: ownerId }, files: [], body: { channelId, reason: 'VIDEO_PROBLEM', description: 'Se congela' } }, created);
  assert.equal(created.code, 201);
  assert.equal(saved.status, 'OPEN');
  assert.equal(creationNotices, 1);
  assert.equal(socketEvents[0][0], 'created');
  const closed = response();
  await helpers.closeSupportReport({ auth: { userId: ownerId }, params: { id: ownerId } }, closed);
  assert.equal(closed.code, 200);
  assert.equal(saved.status, 'RESOLVED');
  assert.ok(saved.resolvedAt instanceof Date);
  assert.equal(resolutionNotices, 1);
  assert.equal(socketEvents[1][0], 'updated');
  await helpers.closeSupportReport({ auth: { userId: ownerId }, params: { id: ownerId } }, response());
  assert.equal(resolutionNotices, 1);
  console.log('PASS MAIL 3-4: simulated SMTP failures leave stored reports intact; no duplicate closure email');

  // Check all changed TS sources can be transpiled for syntax.
  for (const file of ['src/jobs/report-escalation.job.ts','src/notifications/report-email.ts','src/controllers/report.controller.ts','src/server.ts','src/realtime/socket.ts','tests/reports.test.ts']) {
    const result = ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'), { fileName: file, reportDiagnostics: true, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } });
    const errors = (result.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error);
    assert.equal(errors.length, 0, `${file}: syntax issues`);
  }
  console.log('PASS TYPE SCRIPT SYNTAX: 6 changed files transpile without syntax diagnostics');
  console.log('RESULT: 4 isolated verification groups passed (mocked services; not a MongoDB integration test).');
}
main().catch(error => { console.error(error); process.exitCode=1; });
