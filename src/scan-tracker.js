import fs from 'fs';
import path from 'path';
import dayjs from 'dayjs';

const LOG_FILE = process.env.SCAN_LOG_FILE || './data/scan-log.json';

class ScanTracker {
  constructor(logger) {
    this.logger = logger;
    this.todayScans = new Map(); // empId -> { scanned, timestamp, reminderSent, supervisorAlerted }
    this.dailyStats = {};
    this.loadTodayState();
  }

  getTodayKey() {
    return dayjs().format('YYYY-MM-DD');
  }

  loadTodayState() {
    try {
      if (fs.existsSync(LOG_FILE)) {
        const data = JSON.parse(fs.readFileSync(LOG_FILE, 'utf8'));
        const today = this.getTodayKey();
        const todayLog = data.logs?.find(l => l.date === today);
        if (todayLog) {
          this.todayScans = new Map(Object.entries(todayLog.scans || {}));
          this.dailyStats = todayLog.stats || {};
          this.logger.info(`Loaded ${this.todayScans.size} scan records for today`);
        }
      }
    } catch (err) {
      this.logger.warn('Could not load scan log:', err.message);
    }
  }

  saveState() {
    try {
      let data = { logs: [] };
      if (fs.existsSync(LOG_FILE)) {
        data = JSON.parse(fs.readFileSync(LOG_FILE, 'utf8'));
      }

      const today = this.getTodayKey();
      const idx = data.logs.findIndex(l => l.date === today);
      const entry = {
        date: today,
        scans: Object.fromEntries(this.todayScans),
        stats: this.dailyStats,
        lastUpdated: new Date().toISOString(),
      };

      if (idx >= 0) {
        data.logs[idx] = entry;
      } else {
        data.logs.push(entry);
      }

      // Keep last 30 days
      data.logs = data.logs.slice(-30);
      fs.writeFileSync(LOG_FILE, JSON.stringify(data, null, 2));
    } catch (err) {
      this.logger.error('Failed to save scan log:', err.message);
    }
  }

  initializeEmployee(empId, empName, clinicId) {
    if (!this.todayScans.has(empId)) {
      this.todayScans.set(empId, {
        empId,
        empName,
        clinicId,
        scanned: false,
        scanTime: null,
        morningReminderSent: false,
        morningReminderTime: null,
        followupReminderSent: false,
        followupReminderTime: null,
        supervisorAlerted: false,
        supervisorAlertTime: null,
      });
    }
  }

  initializeClinics(clinics) {
    for (const clinic of clinics) {
      for (const emp of clinic.staff) {
        this.initializeEmployee(emp.id, emp.name, clinic.id);
      }
    }
    this.saveState();
  }

  markScanned(empId, timestamp = new Date().toISOString()) {
    const record = this.todayScans.get(empId);
    if (record) {
      record.scanned = true;
      record.scanTime = timestamp;
      this.todayScans.set(empId, record);
      this.saveState();
      return true;
    }
    return false;
  }

  markMorningReminderSent(empId) {
    const record = this.todayScans.get(empId);
    if (record) {
      record.morningReminderSent = true;
      record.morningReminderTime = new Date().toISOString();
      this.todayScans.set(empId, record);
    }
  }

  markFollowupSent(empId) {
    const record = this.todayScans.get(empId);
    if (record) {
      record.followupReminderSent = true;
      record.followupReminderTime = new Date().toISOString();
      this.todayScans.set(empId, record);
    }
  }

  markSupervisorAlerted(empId) {
    const record = this.todayScans.get(empId);
    if (record) {
      record.supervisorAlerted = true;
      record.supervisorAlertTime = new Date().toISOString();
      this.todayScans.set(empId, record);
    }
  }

  getNotScanned(clinicId = null) {
    const results = [];
    for (const [, record] of this.todayScans) {
      if (!record.scanned) {
        if (!clinicId || record.clinicId === clinicId) {
          results.push(record);
        }
      }
    }
    return results;
  }

  getScanned(clinicId = null) {
    const results = [];
    for (const [, record] of this.todayScans) {
      if (record.scanned) {
        if (!clinicId || record.clinicId === clinicId) {
          results.push(record);
        }
      }
    }
    return results;
  }

  getNeedingFollowup(clinicId = null) {
    return this.getNotScanned(clinicId).filter(r => !r.followupReminderSent);
  }

  getNeedingSupervisorAlert(clinicId = null) {
    return this.getNotScanned(clinicId).filter(r => !r.supervisorAlerted);
  }

  getSummary(clinics) {
    const summary = [];
    for (const clinic of clinics) {
      const total = clinic.staff.length;
      const scanned = this.getScanned(clinic.id).length;
      const notScanned = this.getNotScanned(clinic.id);
      summary.push({
        clinicId: clinic.id,
        clinicName: clinic.name,
        total,
        scanned,
        notScanned: notScanned.length,
        pendingNames: notScanned.map(r => r.empName),
        complianceRate: total > 0 ? Math.round((scanned / total) * 100) : 0,
      });
    }
    return summary;
  }

  resetForToday() {
    this.todayScans = new Map();
    this.dailyStats = {};
    this.logger.info('Scan tracker reset for new day');
  }

  getAllRecords() {
    return Array.from(this.todayScans.values());
  }
}

export default ScanTracker;
