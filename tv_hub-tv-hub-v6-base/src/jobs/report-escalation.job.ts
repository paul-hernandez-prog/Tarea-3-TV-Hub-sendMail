import cron from 'node-cron';
import { env } from '../config/env.js';
import { Report } from '../models/report.model.js';
import { emitReportUpdated } from '../realtime/socket.js';

export async function escalateOldReports(): Promise<number> {
  const threshold = new Date(Date.now() - env.reportEscalationMinutes * 60_000);
  const overdueReports = await Report.find({
    status: 'OPEN',
    createdAt: { $lte: threshold }
  });

  let escalatedCount = 0;
  for (const report of overdueReports) {
    const updated = await Report.findOneAndUpdate(
      { _id: report._id, status: 'OPEN' },
      { $set: { status: 'ESCALATED' } },
      { new: true }
    ).populate([
      { path: 'channelId', select: 'name' },
      { path: 'userId', select: 'email' }
    ]);

    if (!updated) continue;
    const owner = updated.userId as unknown as { _id: { toString(): string } };
    emitReportUpdated(owner._id.toString(), updated.toObject());
    escalatedCount += 1;
  }

  return escalatedCount;
}

export function startReportEscalationJob(): void {
  cron.schedule(env.reportEscalationCron, async () => {
    try {
      const count = await escalateOldReports();
      if (count > 0) console.log(`Escalated ${count} overdue report(s).`);
    } catch (error) {
      console.error('Could not escalate overdue reports:', error);
    }
  }, { noOverlap: true });
}
