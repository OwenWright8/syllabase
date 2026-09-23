import { format as dateFnsFormat, parseISO } from 'date-fns';
import { toZonedTime, fromZonedTime } from 'date-fns-tz';

/**
 * Format a date string or Date object in the user's timezone
 */
export function formatInTimezone(
  date: string | Date,
  formatStr: string,
  timezone: string
): string {
  const dateObj = typeof date === 'string' ? parseISO(date) : date;
  const zonedDate = toZonedTime(dateObj, timezone);
  return dateFnsFormat(zonedDate, formatStr);
}

/**
 * Convert a date from the user's timezone to UTC for storage
 */
export function dateToUTC(date: Date, timezone: string): Date {
  return fromZonedTime(date, timezone);
}

/**
 * Get current date/time in user's timezone
 */
export function nowInTimezone(timezone: string): Date {
  return toZonedTime(new Date(), timezone);
}

/**
 * Parse a date string in the user's timezone and convert to UTC ISO string for storage
 */
export function parseInTimezone(dateStr: string, timeStr: string, timezone: string): string {
  // Create a date string in the user's timezone
  const localDateTimeStr = `${dateStr}T${timeStr}`;
  const localDate = new Date(localDateTimeStr);
  
  // Convert to UTC
  const utcDate = fromZonedTime(localDate, timezone);
  return utcDate.toISOString();
}

/**
 * Get today's date string (YYYY-MM-DD) in user's timezone
 */
export function getTodayInTimezone(timezone: string): string {
  const now = nowInTimezone(timezone);
  return dateFnsFormat(now, 'yyyy-MM-dd');
}

/**
 * Normalise a Postgres `time` ("10:30:00") or an <input type="time"> value
 * ("10:30") to "HH:MM"; empty/absent gives "".
 */
export function toTimeInputValue(time: string | null | undefined): string {
  return time ? time.slice(0, 5) : '';
}

/** "10:30" / "10:30:00" -> "10:30 AM" (a time of day, so no timezone conversion applies). */
export function formatTimeOfDay(time: string): string {
  const [hours, minutes] = time.split(':').map(Number);
  return dateFnsFormat(new Date(2000, 0, 1, hours, minutes), 'h:mm a');
}
