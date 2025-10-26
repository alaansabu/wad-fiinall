const Meeting = require('../models/meetings');
const User = require('../models/users');
const { sendMail } = require('../utils/mailer');

function toDateTime(meeting) {
  try {
    const d = new Date(meeting.scheduledDate);
    const [hh = '00', mm = '00'] = String(meeting.scheduledTime || '').split(':');
    const iso = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}T${hh.padStart(2,'0')}:${mm.padStart(2,'0')}:00`;
    const dt = new Date(iso);
    return isNaN(dt.getTime()) ? null : dt;
  } catch { return null; }
}

async function scanAndNotify() {
  const now = new Date();
  const in24h = new Date(Date.now() + 24 * 60 * 60 * 1000);
  // We cannot rely solely on scheduledDate because it stores midnight. Fetch a broader window.
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const meetings = await Meeting.find({
    status: 'accepted',
    reminder5SentAt: null,
    scheduledDate: { $gte: yesterday, $lte: in24h }
  }).lean();

  if (!meetings.length) return;

  for (const m of meetings) {
    const when = toDateTime(m);
    if (!when) {
      console.log(`[Reminder] Skipping meeting ${m._id} because scheduled datetime could not be parsed. Raw date=${m.scheduledDate}, time=${m.scheduledTime}`);
      continue;
    }
    const diff = when.getTime() - Date.now();
    // Send when the meeting is within 5 minutes from now but still in the future
    if (diff > 0 && diff <= 5 * 60 * 1000) {
      try {
        // Load users to get emails
        const [requester, owner] = await Promise.all([
          User.findById(m.requester).select('name email').lean(),
          User.findById(m.postOwner).select('name email').lean()
        ]);

        const friendlyTime = when.toLocaleString();
        const subject = 'Meeting Reminder (starts in ~5 minutes)';
        const text = `This is a reminder that your meeting is scheduled at ${friendlyTime}.`;

        const recipients = [requester?.email, owner?.email].filter(Boolean);
        if (recipients.length) {
          await sendMail({ to: recipients.join(','), subject, text });
          console.log(`[Reminder] Sent 5-min email for meeting ${m._id} to ${recipients.join(', ')} at ${new Date().toISOString()}`);
        } else {
          console.log(`[Reminder] Skipped meeting ${m._id} - no recipient emails found.`);
        }

        await Meeting.updateOne({ _id: m._id }, { $set: { reminder5SentAt: new Date() } });
      } catch (e) {
        // Log but do not throw to keep the scheduler running
        console.error('Meeting reminder email failed:', e?.message || e);
      }
    } else if (diff <= 0) {
      // Meeting already started or in the past
      continue;
    } else {
      // Not yet within 5 min window
      continue;
    }
  }
}

function initMeetingReminder() {
  // Run every 60s
  setInterval(() => {
    scanAndNotify().catch(err => console.error('Reminder scan failed:', err?.message || err));
  }, 60 * 1000);

  // Also run once on startup (after slight delay)
  setTimeout(() => scanAndNotify().catch(() => {}), 5000);
}

module.exports = { initMeetingReminder, scanAndNotify };
