import cron from 'node-cron';
import fs from 'fs';
import templates from './message-templates.js';

class ReminderScheduler {
  constructor({ waClient, scanTracker, clinicData, logger, io }) {
    this.wa = waClient;
    this.tracker = scanTracker;
    this.clinicData = clinicData;
    this.logger = logger;
    this.io = io;
    this.jobs = [];
    this.activityLog = [];
    this.stats = { morningTotal: 0, followupTotal: 0, supervisorAlerts: 0, errors: 0 };
  }

  get clinics() { return this.clinicData.clinics; }

  log(level, message, data = {}) {
    const entry = { time: new Date().toISOString(), level, message, data };
    this.activityLog.unshift(entry);
    if (this.activityLog.length > 200) this.activityLog.pop();
    this.logger[level]?.(message, data);
    if (this.io) this.io.emit('activity', entry);
  }

  async sendMorningReminders() {
    this.log('info', '🌅 Starting morning reminder blast...');
    this.tracker.resetForToday();
    this.tracker.initializeClinics(this.clinics);

    let sent = 0, errors = 0;

    for (const clinic of this.clinics) {
      this.log('info', `📤 Sending to ${clinic.name} (${clinic.staff.length} staff)`);

      for (const emp of clinic.staff) {
        try {
          const result = await this.wa.sendMessage(
            emp.whatsapp,
            {
              image: fs.readFileSync("./public/phani.jpg"),
              caption: templates.morningReminder(emp.name, clinic.name)
            }
          );

          if (result.success) {
            this.tracker.markMorningReminderSent(emp.id);
            sent++;
          } else {
            errors++;
          }

          await new Promise(r => setTimeout(r, 1500));
        } catch (e) {
          errors++;
          this.log('error', `Error sending to ${emp.name}: ${e.message}`);
        }
      }
    }

    this.stats.morningTotal += sent;
    this.stats.errors += errors;
    this.log('info', `✅ Morning done: ${sent} sent, ${errors} errors`);
    this.emitDashboardUpdate();
    return { sent, errors };
  }

  async sendFollowupReminders() {
    this.log('info', '⏰ Sending follow-up reminders...');
    let sent = 0;

    for (const clinic of this.clinics) {
      const pending = this.tracker.getNeedingFollowup(clinic.id);

      for (const record of pending) {
        const emp = clinic.staff.find(e => e.id === record.empId);
        if (!emp) continue;

        try {
          const result = await this.wa.sendMessage(
            emp.whatsapp,
            {
              image: fs.readFileSync("./public/phani.jpg"),
              caption: templates.followupReminder(emp.name, clinic.name)
            }
          );

          if (result.success) {
            this.tracker.markFollowupSent(emp.id);
            sent++;
          }

          await new Promise(r => setTimeout(r, 1500));
        } catch (e) {
          this.log('error', `Followup error for ${record.empName}: ${e.message}`);
        }
      }

      if (pending.length > 0) {
        this.log('info', `⚠️ ${clinic.name}: ${pending.length} follow-ups sent`);
      }
    }

    this.stats.followupTotal += sent;
    this.log('info', `✅ Follow-up done: ${sent} sent`);
    this.emitDashboardUpdate();
    return { sent };
  }

  async sendSupervisorAlerts() {
    this.log('info', '🚨 Sending supervisor alerts...');
    let alertsSent = 0;

    for (const clinic of this.clinics) {
      const pendingRecords = this.tracker.getNeedingSupervisorAlert(clinic.id);

      if (pendingRecords.length === 0) {
        this.log('info', `✅ ${clinic.name}: all scanned`);
        continue;
      }

      const pendingStaff = pendingRecords.map(r => {
        const emp = clinic.staff.find(e => e.id === r.empId);
        return { name: r.empName, role: emp?.role || 'Staff' };
      });

      try {
        const result = await this.wa.sendMessage(
          clinic.supervisor.whatsapp,
          {
            image: fs.readFileSync("./public/phani.jpg"),
            caption: templates.supervisorAlert(
              clinic.supervisor.name,
              clinic.name,
              pendingStaff
            )
          }
        );

        if (result.success) {
          pendingRecords.forEach(r => this.tracker.markSupervisorAlerted(r.empId));
          alertsSent++;
          this.log('info', `🚨 Alert sent: ${clinic.name} (${pendingStaff.length} pending)`);
        }

        await new Promise(r => setTimeout(r, 2000));
      } catch (e) {
        this.log('error', `Supervisor alert error for ${clinic.name}: ${e.message}`);
      }
    }

    this.stats.supervisorAlerts += alertsSent;
    this.log('info', `✅ Supervisor alerts done: ${alertsSent} clinics alerted`);
    this.emitDashboardUpdate();
    return { alertsSent };
  }

  _actionFor(type) {
    const map = {
      morning: () => this.sendMorningReminders(),
      followup: () => this.sendFollowupReminders(),
      supervisor: () => this.sendSupervisorAlerts(),
    };
    return map[type] || null;
  }

  scheduleJobs(reminders) {
    this.jobs.forEach(j => j.destroy());
    this.jobs = [];

    const list = reminders || this._loadReminders();

    for (const r of list) {
      if (!r.enabled) continue;

      const action = this._actionFor(r.type);
      if (!action) continue;

      try {
        const job = cron.schedule(r.cron, async () => {
          this.log('info', `🕐 Cron triggered: ${r.label}`);
          await action();
        }, { timezone: 'Asia/Kolkata' });

        this.jobs.push(job);
        this.log('info', `📅 Scheduled: ${r.label} @ ${r.cron}`);
      } catch (e) {
        this.log('error', `Invalid cron for ${r.label}: ${e.message}`);
      }
    }
  }

  rescheduleJobs(reminders) {
    this.log('info', '🔄 Rescheduling jobs...');
    this.scheduleJobs(reminders);
  }

  _loadReminders() {
    try {
      return JSON.parse(fs.readFileSync('./data/schedule.json', 'utf8')).reminders || [];
    } catch {
      return [];
    }
  }

  stopAll() {
    this.jobs.forEach(j => j.destroy());
    this.jobs = [];
  }

  emitDashboardUpdate() {
    if (!this.io) return;
    this.io.emit('summary_update', {
      summary: this.tracker.getSummary(this.clinics),
      stats: this.stats
    });
  }

  getActivityLog(limit = 50) { return this.activityLog.slice(0, limit); }
  getStats() { return { ...this.stats }; }
}

export default ReminderScheduler;