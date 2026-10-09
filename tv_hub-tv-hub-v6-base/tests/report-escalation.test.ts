import mongoose, { Types } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Channel } from '../src/models/channel.model.js';
import { escalateOldReports } from '../src/jobs/report-escalation.job.js';
import { Report } from '../src/models/report.model.js';
import { emitReportUpdated } from '../src/realtime/socket.js';
import { User } from '../src/models/user.model.js';

jest.mock('../src/realtime/socket.js', () => ({
  emitReportUpdated: jest.fn()
}));

let mongo: MongoMemoryServer;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
});

beforeEach(async () => {
  jest.clearAllMocks();
  await Report.deleteMany({});
  await Channel.deleteMany({});
  await User.deleteMany({});
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

async function createReport(createdAt: Date) {
  const user = await User.create({
    email: `escalation-${new Types.ObjectId()}@example.com`,
    passwordHash: 'test-password-hash',
    role: 'USER'
  });
  const channel = await Channel.create({
    name: 'Escalation Channel',
    logoUrl: 'https://example.com/logo.png',
    streamUrl: 'https://example.com/stream.m3u8',
    country: 'Mexico',
    categories: ['News'],
    isActive: true
  });
  const report = await Report.create({
    userId: user.id,
    channelId: channel.id,
    reason: 'VIDEO_PROBLEM',
    description: 'Needs escalation.'
  });
  await Report.collection.updateOne({ _id: report._id }, { $set: { createdAt } });
  return report;
}

test('escalates old OPEN reports and emits report:updated', async () => {
  const oldReport = await createReport(new Date(Date.now() - 3 * 60 * 1000));
  const recentReport = await createReport(new Date());

  const count = await escalateOldReports();

  expect(count).toBe(1);
  expect((await Report.findById(oldReport.id))?.status).toBe('ESCALATED');
  expect((await Report.findById(recentReport.id))?.status).toBe('OPEN');
  expect(emitReportUpdated).toHaveBeenCalledWith(
    oldReport.userId.toString(),
    expect.objectContaining({ status: 'ESCALATED', channelId: expect.objectContaining({ name: 'Escalation Channel' }) })
  );
});
