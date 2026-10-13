// Writes reminders/friday-HHMM.ics: a weekly Friday event with an alert, one file per hour 07:00–22:00.
// iPhone Safari opens these in Calendar ("Add All"), so the reminder works even when the app is closed.
//
//   node scripts/gen-reminders.mjs [appUrl]
//
// appUrl is linked from the event; the deploy workflow passes the real GitHub Pages address.
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const DEFAULT_URL = 'https://sharonnjd.github.io/Money_Tracking/';
const appUrl = process.argv[2] || process.env.APP_URL || DEFAULT_URL;
const outDir = fileURLToPath(new URL('../reminders/', import.meta.url));

// First occurrence: a fixed past Friday keeps the output stable between runs.
const FIRST_FRIDAY = '20260102';
const HOURS = Array.from({ length: 16 }, (_, i) => i + 7);

// RFC 5545: escape text values and fold lines at 75 octets.
const escapeText = (s) => s.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
function fold(line) {
  const bytes = Buffer.from(line, 'utf8');
  if (bytes.length <= 75) return line;
  const parts = [];
  let current = '';
  for (const ch of line) {
    const limit = parts.length ? 74 : 75; // continuation lines start with a space
    if (Buffer.byteLength(current + ch, 'utf8') > limit) {
      parts.push(current);
      current = '';
    }
    current += ch;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

function calendar(hour) {
  const hh = String(hour).padStart(2, '0');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Money Tracker//Friday Reminder//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:money-tracker-friday-${hh}00@money-tracker.app`,
    'DTSTAMP:20260101T000000Z',
    // Floating local time: fires at this hour wherever the phone is.
    `DTSTART:${FIRST_FRIDAY}T${hh}0000`,
    'DURATION:PT10M',
    'RRULE:FREQ=WEEKLY;BYDAY=FR',
    `SUMMARY:${escapeText('💰 Log this week’s spending')}`,
    `DESCRIPTION:${escapeText(`Open Money Tracker and fill in what you spent this week.\n${appUrl}`)}`,
    `URL:${appUrl}`,
    'TRANSP:TRANSPARENT',
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapeText('Log this week’s spending in Money Tracker')}`,
    'TRIGGER:PT0M',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return `${lines.map(fold).join('\r\n')}\r\n`;
}

mkdirSync(outDir, { recursive: true });
for (const hour of HOURS) {
  const name = `friday-${String(hour).padStart(2, '0')}00.ics`;
  writeFileSync(`${outDir}${name}`, calendar(hour));
}
console.log(`Wrote ${HOURS.length} reminder files to reminders/ linking to ${appUrl}`);
