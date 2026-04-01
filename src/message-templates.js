import dayjs from 'dayjs';

const templates = {
  morningReminder(staffName, clinicName) {
    const date = dayjs().format('DD MMM YYYY');
    const day = dayjs().format('dddd');
    return `🌅 *Good Morning, ${staffName}!*

📋 *Signn Readiness Scan Reminder*
━━━━━━━━━━━━━━━━━━━━
📅 ${day}, ${date}
🏥 ${clinicName}

Please complete your *Signn Readiness Scan* before starting your shift today.

✅ *Steps to Complete:*
1. Open the Signn app
2. Tap "Readiness Scan"
3. Complete the daily check-in
4. Submit your scan ✔️

⏰ Deadline: Please complete within *1 hour*

_This is an automated reminder from the Clinic Management System._`;
  },

  followupReminder(staffName, clinicName) {
    const time = dayjs().format('hh:mm A');
    return `⚠️ *Reminder: Scan Pending – ${staffName}*

Your *Signn Readiness Scan* has not been recorded yet.

🏥 ${clinicName}
🕐 Current Time: ${time}

Please complete your scan *immediately* to avoid being flagged as non-compliant.

📱 Open Signn app → Readiness Scan → Submit

_If you have already scanned, please ignore this message._`;
  },

  supervisorAlert(supervisorName, clinicName, pendingStaff) {
    const time = dayjs().format('hh:mm A');
    const date = dayjs().format('DD MMM YYYY');

    const staffList = pendingStaff
      .map((emp, i) => `  ${i + 1}. ${emp.name} _(${emp.role})_`)
      .join('\n');

    const total = pendingStaff.length;

    return `🚨 *SUPERVISOR ALERT – Scan Non-Compliance*
━━━━━━━━━━━━━━━━━━━━
👤 Dear ${supervisorName},
🏥 ${clinicName}
📅 ${date} | 🕙 ${time}

The following *${total} staff member${total > 1 ? 's have' : ' has'} NOT completed* the Signn Readiness Scan after 2 hours:

${staffList}

*Action Required:*
Please follow up with the above staff members immediately to ensure compliance.

📊 _Automated by Signn Clinic Reminder System_`;
  },

  supervisorDailySummary(supervisorName, clinicName, scanned, total, pendingStaff) {
    const date = dayjs().format('DD MMM YYYY');
    const compliance = total > 0 ? Math.round((scanned / total) * 100) : 0;
    const emoji = compliance === 100 ? '✅' : compliance >= 75 ? '🟡' : '🔴';

    const pending = pendingStaff.length > 0
      ? `\n*Pending Staff:*\n${pendingStaff.map((e, i) => `  ${i + 1}. ${e.name}`).join('\n')}`
      : '';

    return `📊 *Daily Scan Summary – ${date}*
🏥 ${clinicName}
👤 ${supervisorName}
━━━━━━━━━━━━━━━━━━━━
${emoji} *Compliance: ${compliance}%*

✅ Scanned: ${scanned}/${total}
❌ Pending: ${total - scanned}/${total}
${pending}

_End of Day Report – Signn Reminder System_`;
  },

  connectionTest(name) {
    return `✅ *Signn Reminder System*\nHello ${name}! This is a test message confirming your number is registered.\n\n_You will receive Signn scan reminders on this number._`;
  }
};

export default templates;
