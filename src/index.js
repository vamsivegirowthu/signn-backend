import 'dotenv/config';
import pino from 'pino';
import fs from 'fs';


import WhatsAppClient from './whatsapp-client.js';
import ScanTracker from './scan-tracker.js';
import ReminderScheduler from './scheduler.js';
import { createDashboardServer } from './dashboard-server.js';

const logger = pino({
  transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:standard' } },
  level: 'info',
});

const CLINIC_FILE   = process.env.CLINIC_DATA_FILE || './data/clinics.json';
const SCHEDULE_FILE = './data/schedule.json';

// create files if not exist
if (!fs.existsSync(CLINIC_FILE)) {
  fs.writeFileSync(CLINIC_FILE, '{"clinics":[]}');
}

if (!fs.existsSync(SCHEDULE_FILE)) {
  fs.writeFileSync(SCHEDULE_FILE, JSON.stringify({
    reminders: [
      { id:'reminder-morning', type:'morning', cron:'0 8 * * 1-6', enabled:true },
      { id:'reminder-followup', type:'followup', cron:'0 9 * * 1-6', enabled:true },
      { id:'reminder-supervisor', type:'supervisor', cron:'0 10 * * 1-6', enabled:true },
    ]
  }, null, 2));
}

const clinicData = JSON.parse(fs.readFileSync(CLINIC_FILE, 'utf8'));

logger.info(`Loaded ${clinicData.clinics.length} clinics`);

const tracker = new ScanTracker(logger);
tracker.initializeClinics(clinicData.clinics);

const waClient = new WhatsAppClient();

// 🔥 STORE QR
let latestQR = null;

const tempScheduler = {
  wa: waClient,
  getStats: () => ({}),
  getActivityLog: () => [],
  sendMorningReminders: async () => ({ error: 'Not ready' }),
  sendFollowupReminders: async () => ({ error: 'Not ready' }),
  sendSupervisorAlerts: async () => ({ error: 'Not ready' }),
  rescheduleJobs: () => {},
  emitDashboardUpdate: () => {},
  io: null,
};

const PORT = process.env.PORT;

const { httpServer, io } = createDashboardServer({
  scheduler: tempScheduler,
  tracker,
  clinicData,
  logger
});

// ✅ when dashboard opens
io.on('connection', (socket) => {
  console.log("🌐 Dashboard connected");

  // resend QR if already exists
  if (latestQR) {
    socket.emit('qr_update', { qr: latestQR });
  }
});

httpServer.listen(PORT, '0.0.0.0', () => {
  logger.info(`🖥️ Server running on port ${PORT}`);
});

logger.info('🔐 Initializing WhatsApp...');
logger.info('📱 Open dashboard to scan QR code');

// ✅ QR event
waClient.onQR = (qr) => {
  console.log("📡 QR GENERATED");

  latestQR = qr;

  io.emit('qr_update', { qr }); // 🔥 send to frontend
};

// ✅ connected
waClient.onReady = () => {
  console.log("✅ WhatsApp READY");

  io.emit('wa_connected', { time: new Date().toISOString() });

  const scheduler = new ReminderScheduler({
    waClient,
    scanTracker: tracker,
    clinicData,
    logger,
    io
  });

  scheduler.io = io;

  Object.assign(tempScheduler, {
    sendMorningReminders: (...a) => scheduler.sendMorningReminders(...a),
    sendFollowupReminders: (...a) => scheduler.sendFollowupReminders(...a),
    sendSupervisorAlerts: (...a) => scheduler.sendSupervisorAlerts(...a),
    rescheduleJobs: (...a) => scheduler.rescheduleJobs(...a),
    getStats: () => scheduler.getStats(),
    getActivityLog: (...a) => scheduler.getActivityLog(...a),
    emitDashboardUpdate: () => scheduler.emitDashboardUpdate(),
    wa: waClient,
    io,
  });

  const reminders = JSON.parse(fs.readFileSync(SCHEDULE_FILE, 'utf8')).reminders;
  scheduler.scheduleJobs(reminders);
  scheduler.emitDashboardUpdate();

  console.log("🚀 SYSTEM LIVE");
};

// ❌ disconnected
waClient.onDisconnect = (reason) => {
  console.log("❌ WhatsApp disconnected");

  io.emit('wa_disconnected', { reason });
};

// start
await waClient.initialize();

// graceful shutdown
process.on('SIGINT', async () => {
  console.log("🛑 Shutting down...");
  await waClient.logout().catch(()=>{});
  process.exit(0);
});

setInterval(() => {
  console.log("Server alive...");
}, 10000);
