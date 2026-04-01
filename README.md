# 📋 Signn Readiness Scan – Morning Reminder System

Automated WhatsApp reminder system for daily Signn Readiness Scans across clinic staff, built with [Baileys](https://github.com/WhiskeySockets/Baileys) (unofficial WhatsApp Web API).

---

## 🚀 Features

- **Morning Blast (8:00 AM)** – Sends personalized WhatsApp reminder to every staff member in every clinic
- **1-Hour Follow-up (9:00 AM)** – Sends a second reminder only to staff who haven't scanned yet
- **Supervisor Alert (10:00 AM)** – Sends supervisor a list of non-compliant staff at their clinic
- **Real-Time Dashboard** – Web UI showing compliance status per clinic with live updates
- **Manual Triggers** – Fire any step manually from the dashboard
- **Daily Log** – Scan records saved per day for auditing
- **Multi-Clinic Support** – Configure as many clinics as needed

---

## 📁 Project Structure

```
signn-reminder/
├── src/
│   ├── index.js              # Main entry point
│   ├── whatsapp-client.js    # Baileys WA client wrapper
│   ├── scan-tracker.js       # Daily scan state tracker
│   ├── scheduler.js          # Cron-based reminder scheduler
│   ├── message-templates.js  # WhatsApp message templates
│   └── dashboard-server.js   # Express + Socket.IO API
├── public/
│   └── index.html            # Dashboard UI
├── data/
│   ├── clinics.json          # Clinic & staff configuration
│   └── scan-log.json         # Daily scan records (auto-generated)
├── wa-session/               # WhatsApp session files (auto-generated)
├── .env                      # Configuration
└── package.json
```

---

## ⚙️ Setup & Installation

### Prerequisites
- Node.js v18+
- npm v8+
- A WhatsApp account to link as the sender

### 1. Install dependencies
```bash
cd signn-reminder
npm install
```

### 2. Configure clinics
Edit `data/clinics.json` to add your clinics, staff, and supervisor WhatsApp numbers:

```json
{
  "clinics": [
    {
      "id": "clinic-001",
      "name": "Your Clinic Name",
      "location": "City Area",
      "supervisor": {
        "name": "Dr. Supervisor Name",
        "phone": "919876543210",
        "whatsapp": "919876543210"
      },
      "staff": [
        {
          "id": "emp-001",
          "name": "Employee Name",
          "role": "Nurse",
          "phone": "919876543211",
          "whatsapp": "919876543211"
        }
      ]
    }
  ]
}
```

> **Phone format:** Country code + number, no `+` or spaces. For India: `91XXXXXXXXXX`

### 3. Configure schedule (optional)
Edit `.env` to change reminder times:
```
MORNING_REMINDER_CRON="0 8 * * 1-6"   # 8:00 AM Mon-Sat
FOLLOWUP_1H_CRON="0 9 * * 1-6"         # 9:00 AM
SUPERVISOR_ALERT_CRON="0 10 * * 1-6"   # 10:00 AM
```
Cron format: `minute hour day month weekday`

---

## ▶️ Running the System

```bash
npm start
```

On **first run**:
1. A **QR code** will appear in the terminal
2. Open WhatsApp on your phone
3. Go to **Settings → Linked Devices → Link a Device**
4. Scan the QR code
5. The system connects and saves the session

Once connected, open the dashboard at: **http://localhost:3000**

---

## 📊 Dashboard

The real-time dashboard shows:
- Overall compliance rate and counts
- Per-clinic scan status with staff names
- Activity log with all message events
- Manual trigger buttons for each step
- WhatsApp connection status

---

## 🔗 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/status` | System & WA connection status |
| GET | `/api/summary` | Per-clinic scan summary |
| GET | `/api/employees` | All employee scan records |
| GET | `/api/clinics` | Clinic list |
| GET | `/api/activity` | Activity log |
| POST | `/api/trigger/morning` | Manually send morning reminders |
| POST | `/api/trigger/followup` | Manually send follow-ups |
| POST | `/api/trigger/supervisor` | Manually send supervisor alerts |
| POST | `/api/scan/:empId` | Mark employee as scanned |
| POST | `/api/reset` | Reset today's data |

---

## 🔧 Integrating Scan Data

To mark an employee as scanned when they complete the Signn scan, call:
```
POST /api/scan/{empId}
```

Or from your Signn backend, send a webhook to this endpoint whenever a scan is recorded.

---

## ⚠️ Important Notes

1. **WhatsApp ToS** – This uses the unofficial WhatsApp Web API. Use a dedicated number, not a personal number, to reduce ban risk.
2. **Rate Limiting** – The system adds 1.5s delay between messages to avoid being flagged.
3. **Session Persistence** – Session saved in `wa-session/`. Don't delete this folder or you'll need to re-scan the QR.
4. **Timezone** – Default is `Asia/Kolkata` (IST). Change in `scheduler.js` if needed.

---

## 📱 Sample Messages

### Morning Reminder
> 🌅 *Good Morning, Rahul Sharma!*
> 📋 *Signn Readiness Scan Reminder*
> 📅 Monday, 16 Mar 2026 | 🏥 Downtown Medical Center
> Please complete your Signn Readiness Scan before starting your shift...

### Supervisor Alert
> 🚨 *SUPERVISOR ALERT – Scan Non-Compliance*
> The following 3 staff members have NOT completed the scan after 2 hours:
> 1. Rahul Sharma (Nurse)
> 2. Priya Patel (Receptionist)
> 3. Arun Kumar (Lab Technician)
