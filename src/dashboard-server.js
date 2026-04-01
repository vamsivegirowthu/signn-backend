import express from 'express';
import QRCode from 'qrcode';
import { createServer } from 'http';
import { Server as SocketIO } from 'socket.io';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLINIC_FILE   = process.env.CLINIC_DATA_FILE || './data/clinics.json';
const SCHEDULE_FILE = './data/schedule.json';

function loadClinics()   { return JSON.parse(fs.readFileSync(CLINIC_FILE,   'utf8')); }
function saveClinics(d)  { fs.writeFileSync(CLINIC_FILE,   JSON.stringify(d, null, 2)); }
function loadSchedule()  { return JSON.parse(fs.readFileSync(SCHEDULE_FILE, 'utf8')); }
function saveSchedule(d) { fs.writeFileSync(SCHEDULE_FILE, JSON.stringify(d, null, 2)); }
function uid()           { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

function toCron(time, days) {
  const [h, m] = time.split(':').map(Number);
  const MAP = { sun:0, mon:1, tue:2, wed:3, thu:4, fri:5, sat:6 };
  const nums = (days||[]).map(d => MAP[d.toLowerCase()]).filter(n=>n!==undefined).sort().join(',');
  return `${m} ${h} * * ${nums || '1-6'}`;
}

export function createDashboardServer({ scheduler, tracker, clinicData, logger }) {
  const app = express();
  const httpServer = createServer(app);
  const io = new SocketIO(httpServer, { cors: { origin: '*' } });

 app.use(cors({
  origin: "*",
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type"]
}));
  app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "*");
  next();
});
app.use(express.json());

app.use(express.static(path.join(__dirname, '../public')));

  app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

  if (scheduler) scheduler.io = io;
  // 🔥 ADD THIS
if (scheduler && scheduler.wa) {
  scheduler.wa.onReady = () => {
    console.log("WA CONNECTED");
    io.emit('wa_connected');
  };

  scheduler.wa.onDisconnect = () => {
    console.log("WA DISCONNECTED");
    io.emit('wa_disconnected');
  };
}

  // STATUS / QR
  app.get('/api/status', (req, res) => {
    res.json({ connected: scheduler?.wa?.isReady?.() || false, qrAvailable: !!scheduler?.wa?.getQRCode?.(), stats: scheduler?.getStats?.() || {}, uptime: process.uptime() });
  });

  app.get('/api/qr', (req, res) => {
  const qr = scheduler?.wa?.getQRCode?.();

  if (!qr) {
    return res.status(404).json({ error: 'No QR available' });
  }

  res.json({ qr }); // ✅ SIMPLE FIX (NO IMAGE)
});

  // SUMMARY / EMPLOYEES
  // 🔥 ADD THIS BLOCK HERE (IMPORTANT)


// 👇 already unna code (leave it)

  app.get('/api/summary', (req, res) => {
    const data = loadClinics();
    res.json({ summary: tracker.getSummary(data.clinics), date: new Date().toISOString() });
  });

  app.get('/api/employees', (req, res) => {
    const data = loadClinics();
    const records = tracker.getAllRecords().map(r => {
      for (const c of data.clinics) {
        const emp = c.staff.find(e => e.id === r.empId);
        if (emp) return { ...r, role: emp.role, clinicName: c.name, phone: emp.phone };
      }
      return r;
    });
    res.json({ employees: records });
  });

  app.get('/api/activity', (req, res) => {
    res.json({ logs: scheduler?.getActivityLog?.(parseInt(req.query.limit)||50) || [] });
  });

  // CLINICS CRUD
  app.get('/api/clinics', (req, res) => res.json(loadClinics()));

  app.post('/api/clinics', (req, res) => {
    const { name, location, supervisor } = req.body;
    if (!name || !location || !supervisor?.name || !supervisor?.whatsapp)
      return res.status(400).json({ error: 'name, location, supervisor.name, supervisor.whatsapp required' });
    const data = loadClinics();
    const ph = supervisor.whatsapp.replace(/\D/g,'');
    const clinic = { id: 'clinic-'+uid(), name: name.trim(), location: location.trim(), supervisor: { name: supervisor.name.trim(), phone: ph, whatsapp: ph }, staff: [] };
    data.clinics.push(clinic);
    saveClinics(data);
    clinicData.clinics = data.clinics;
    tracker.initializeClinics(data.clinics);
    io.emit('clinics_updated');
    logger.info('Clinic added: ' + clinic.name);
    res.json({ success: true, clinic });
  });

  app.put('/api/clinics/:id', (req, res) => {
    const data = loadClinics();
    const c = data.clinics.find(x => x.id === req.params.id);
    if (!c) return res.status(404).json({ error: 'Clinic not found' });
    const { name, location, supervisor } = req.body;
    if (name) c.name = name.trim();
    if (location) c.location = location.trim();
    if (supervisor?.name) c.supervisor.name = supervisor.name.trim();
    if (supervisor?.whatsapp) { const p = supervisor.whatsapp.replace(/\D/g,''); c.supervisor.phone = p; c.supervisor.whatsapp = p; }
    saveClinics(data);
    clinicData.clinics = data.clinics;
    io.emit('clinics_updated');
    res.json({ success: true, clinic: c });
  });

  app.delete('/api/clinics/:id', (req, res) => {
    const data = loadClinics();
    const before = data.clinics.length;
    data.clinics = data.clinics.filter(c => c.id !== req.params.id);
    if (data.clinics.length === before) return res.status(404).json({ error: 'Clinic not found' });
    saveClinics(data);
    clinicData.clinics = data.clinics;
    io.emit('clinics_updated');
    res.json({ success: true });
  });

  // STAFF CRUD
  app.get('/api/clinics/:id/staff', (req, res) => {
    const data = loadClinics();
    const c = data.clinics.find(x => x.id === req.params.id);
    if (!c) return res.status(404).json({ error: 'Clinic not found' });
    res.json({ staff: c.staff });
  });

  app.post('/api/clinics/:id/staff', (req, res) => {
    const { name, role, whatsapp } = req.body;
    if (!name || !whatsapp) return res.status(400).json({ error: 'name and whatsapp required' });
    const data = loadClinics();
    const c = data.clinics.find(x => x.id === req.params.id);
    if (!c) return res.status(404).json({ error: 'Clinic not found' });
    const ph = whatsapp.replace(/\D/g,'');
    const emp = { id: 'emp-'+uid(), name: name.trim(), role: (role||'Staff').trim(), phone: ph, whatsapp: ph };
    c.staff.push(emp);
    saveClinics(data);
    clinicData.clinics = data.clinics;
    tracker.initializeEmployee(emp.id, emp.name, c.id);
    io.emit('clinics_updated');
    logger.info('Staff added: ' + emp.name + ' → ' + c.name);
    res.json({ success: true, employee: emp });
  });

  app.put('/api/clinics/:clinicId/staff/:empId', (req, res) => {
    const data = loadClinics();
    const c = data.clinics.find(x => x.id === req.params.clinicId);
    if (!c) return res.status(404).json({ error: 'Clinic not found' });
    const emp = c.staff.find(e => e.id === req.params.empId);
    if (!emp) return res.status(404).json({ error: 'Employee not found' });
    const { name, role, whatsapp } = req.body;
    if (name) emp.name = name.trim();
    if (role) emp.role = role.trim();
    if (whatsapp) { const p = whatsapp.replace(/\D/g,''); emp.phone = p; emp.whatsapp = p; }
    saveClinics(data);
    clinicData.clinics = data.clinics;
    io.emit('clinics_updated');
    res.json({ success: true, employee: emp });
  });

  app.delete('/api/clinics/:clinicId/staff/:empId', (req, res) => {
    const data = loadClinics();
    const c = data.clinics.find(x => x.id === req.params.clinicId);
    if (!c) return res.status(404).json({ error: 'Clinic not found' });
    const before = c.staff.length;
    c.staff = c.staff.filter(e => e.id !== req.params.empId);
    if (c.staff.length === before) return res.status(404).json({ error: 'Employee not found' });
    saveClinics(data);
    clinicData.clinics = data.clinics;
    io.emit('clinics_updated');
    res.json({ success: true });
  });

  // SCHEDULE CRUD
  app.get('/api/schedule', (req, res) => res.json(loadSchedule()));

  app.post('/api/schedule', (req, res) => {
    const { label, description, type, time, days, enabled, emoji } = req.body;
    if (!label || !time || !type) return res.status(400).json({ error: 'label, time, type required' });
    const sched = loadSchedule();
    const reminder = { id:'reminder-'+uid(), label: label.trim(), description:(description||'').trim(), type: type.trim(), cron: toCron(time, days), time, days: days||['mon','tue','wed','thu','fri','sat'], enabled: enabled!==false, emoji: emoji||'🔔' };
    sched.reminders.push(reminder);
    saveSchedule(sched);
    scheduler?.rescheduleJobs?.(sched.reminders);
    io.emit('schedule_updated', sched);
    res.json({ success: true, reminder });
  });

  app.put('/api/schedule/:id', (req, res) => {
    const sched = loadSchedule();
    const r = sched.reminders.find(x => x.id === req.params.id);
    if (!r) return res.status(404).json({ error: 'Reminder not found' });
    const { label, description, type, time, days, enabled, emoji } = req.body;
    if (label) r.label = label.trim();
    if (description !== undefined) r.description = description.trim();
    if (type) r.type = type.trim();
    if (emoji) r.emoji = emoji;
    if (enabled !== undefined) r.enabled = !!enabled;
    if (time || days) { r.time = time||r.time; r.days = days||r.days; r.cron = toCron(r.time, r.days); }
    saveSchedule(sched);
    scheduler?.rescheduleJobs?.(sched.reminders);
    io.emit('schedule_updated', sched);
    res.json({ success: true, reminder: r });
  });

  app.delete('/api/schedule/:id', (req, res) => {
    const sched = loadSchedule();
    const before = sched.reminders.length;
    sched.reminders = sched.reminders.filter(r => r.id !== req.params.id);
    if (sched.reminders.length === before) return res.status(404).json({ error: 'Reminder not found' });
    saveSchedule(sched);
    scheduler?.rescheduleJobs?.(sched.reminders);
    io.emit('schedule_updated', sched);
    res.json({ success: true });
  });

  // MANUAL TRIGGERS
  app.post('/api/trigger/morning',    async (req, res) => { try { res.json({ success:true, result: await scheduler.sendMorningReminders() }); }    catch(e){ res.status(500).json({success:false,error:e.message}); }});
  app.post('/api/trigger/followup',   async (req, res) => { try { res.json({ success:true, result: await scheduler.sendFollowupReminders() }); }   catch(e){ res.status(500).json({success:false,error:e.message}); }});
  app.post('/api/trigger/supervisor', async (req, res) => { try { res.json({ success:true, result: await scheduler.sendSupervisorAlerts() }); }    catch(e){ res.status(500).json({success:false,error:e.message}); }});

  app.post('/api/scan/:empId', (req, res) => {
    const ok = tracker.markScanned(req.params.empId);
    if (ok) { io.emit('scan_update', {empId:req.params.empId}); scheduler?.emitDashboardUpdate?.(); res.json({success:true}); }
    else res.status(404).json({success:false});
  });

  app.post('/api/reset', (req, res) => {
    const data = loadClinics();
    tracker.resetForToday();
    tracker.initializeClinics(data.clinics);
    io.emit('reset');
    res.json({success:true});
  });

  // SOCKET
  io.on('connection', socket => {
    const data = loadClinics();
    socket.emit('summary_update', { summary: tracker.getSummary(data.clinics), stats: scheduler?.getStats?.() || {} });
    socket.emit('activity', scheduler?.getActivityLog?.(20) || []);
    socket.emit('schedule_updated', loadSchedule());
    socket.emit('clinics_data', data);
  });

app.post('/api/send-message', async (req, res) => {
  try {
    const { number, message } = req.body;

    if (!number || !message) {
      return res.status(400).json({ success: false });
    }

    await scheduler.wa.sendMessage(number, message);

    // ✅ SAFE READ
    let logs = [];

    try {
      if (fs.existsSync('./message-logs.json')) {
        const data = fs.readFileSync('./message-logs.json', 'utf-8');
        logs = data ? JSON.parse(data) : [];
      }
    } catch (e) {
      console.error("Log read error:", e);
      logs = [];
    }

    // ✅ SAVE SUCCESS LOG
    logs.unshift({
      phone: number,
      message: message,
      status: 'sent',
      time: new Date().toISOString()
    });

    fs.writeFileSync('./message-logs.json', JSON.stringify(logs, null, 2));

    res.json({ success: true });

  } catch (err) {
    console.error(err);

    // ❗ SAVE FAILED LOG
    let logs = [];

    try {
      if (fs.existsSync('./message-logs.json')) {
        const data = fs.readFileSync('./message-logs.json', 'utf-8');
        logs = data ? JSON.parse(data) : [];
      }
    } catch {}

    logs.unshift({
      phone: req.body.number,
      message: req.body.message,
      status: 'failed',
      time: new Date().toISOString()
    });

    fs.writeFileSync('./message-logs.json', JSON.stringify(logs, null, 2));

    res.status(500).json({ success: false });
  }
});

  return { httpServer, io, app };
}
