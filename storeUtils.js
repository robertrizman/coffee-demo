// storeUtils.js — helpers for store open/close logic

function parseTimeToMins(timeStr) {
  if (!timeStr) return NaN;
  // Normalise dots to colons e.g. "4.25" → "4:25"
  const normalised = timeStr.replace('.', ':');
  const parts = normalised.split(':').map(Number);
  if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) return NaN;
  return parts[0] * 60 + parts[1];
}

export function isCurrentlyInBreak(breaks = []) {
  const now = new Date();
  const current = now.getHours() * 60 + now.getMinutes();

  return breaks.filter(b => b.active).some(b => {
    const start = parseTimeToMins(b.start_time);
    const end = parseTimeToMins(b.end_time);
    if (isNaN(start) || isNaN(end)) return false;
    return current >= start && current < end;
  });
}

export function getCurrentBreak(breaks = []) {
  const now = new Date();
  const current = now.getHours() * 60 + now.getMinutes();

  return breaks.filter(b => b.active).find(b => {
    const start = parseTimeToMins(b.start_time);
    const end = parseTimeToMins(b.end_time);
    if (isNaN(start) || isNaN(end)) return false;
    return current >= start && current < end;
  }) || null;
}

export function formatTime(time) {
  if (!time) return '';
  const normalised = String(time).replace('.', ':');
  const parts = normalised.split(':').map(Number);
  if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) return time;
  const h = parts[0];
  const m = parts[1];
  const period = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return `${hour}:${m.toString().padStart(2, '0')} ${period}`;
}
