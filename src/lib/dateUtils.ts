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
