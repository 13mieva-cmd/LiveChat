export type WorkingHours = { enabled: boolean; days: number[]; start: string; end: string };
export const defaultWorkingHours: WorkingHours = { enabled: true, days: [0, 1, 2, 3, 4, 5, 6], start: '08:00', end: '24:00' };
const timePattern = /^(?:[01][0-9]|2[0-3]):[0-5][0-9]$|^24:00$/;
export function minutes(value: string): number { const [hours, mins] = value.split(':').map(Number); return hours * 60 + mins; }
export function validTimezone(value: string): boolean { try { new Intl.DateTimeFormat('en-US', { timeZone: value }); return true; } catch { return false; } }
export function parseWorkingHours(value: unknown): WorkingHours | null {
  const raw = value as Partial<WorkingHours> | null;
  if (!raw || typeof raw !== 'object' || typeof raw.enabled !== 'boolean' || !Array.isArray(raw.days) || typeof raw.start !== 'string' || typeof raw.end !== 'string') return null;
  const days = [...new Set(raw.days)].filter(day => Number.isInteger(day) && day >= 0 && day <= 6);
  if (!days.length || !timePattern.test(raw.start) || raw.start === '24:00' || !timePattern.test(raw.end) || minutes(raw.start) >= minutes(raw.end)) return null;
  return { enabled: raw.enabled, days, start: raw.start, end: raw.end };
}
export function getAvailability(value: unknown, timezone: string, message: string, now = new Date()): { open: boolean; message: string } {
  const hours = parseWorkingHours(value);
  if (!hours || !hours.enabled || !validTimezone(timezone)) return { open: true, message: '' };
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const part = (type: string) => parts.find(item => item.type === type)?.value ?? '';
  const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(part('weekday'));
  const current = Number(part('hour')) * 60 + Number(part('minute'));
  if (day < 0 || Number.isNaN(current)) return { open: true, message: '' };
  const open = hours.days.includes(day) && current >= minutes(hours.start) && current < minutes(hours.end);
  return { open, message: open ? '' : message };
}
