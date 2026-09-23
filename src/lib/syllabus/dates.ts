// Finding dates in syllabus text. Everything here is a best guess that the user
// reviews before anything is saved, so the rules favour "no date" over a wrong one.

export interface DateContext {
  /** Start of the semester (YYYY-MM-DD) from the profile, used to pick the year for dates that have none. */
  semesterStart: string | null;
  /** Today (YYYY-MM-DD) in the user's timezone: the fallback anchor when there's no semester start. */
  today: string;
}

export interface DateMatch {
  index: number;
  end: number;
  month: number;
  day: number;
  /** The year as written (four digits), if it was written. */
  year: number | null;
  /** Both numbers could be a month (03/04): read as month/day, but worth a second look. */
  ambiguous: boolean;
  /** For "Oct 16–20" / "10/16 – 10/20": the last day of the range. */
  rangeEnd: { month: number; day: number } | null;
}

const DAY_MS = 86_400_000;

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6,
  jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11,
  dec: 12, december: 12,
};

const MONTH_NAME = "(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)";
const DASH = "[-–—]";
const ORDINAL = "(?:st|nd|rd|th)?";

const monthNumber = (name: string) => MONTHS[name.toLowerCase()];

/** True if month/day is a real calendar day in some year (Feb 29 counts). */
export function isRealDay(month: number, day: number, year = 2024): boolean {
  if (!Number.isInteger(month) || !Number.isInteger(day) || month < 1 || month > 12 || day < 1) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function toIso(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/**
 * The year for a date written without one. Semester-based when the profile has a
 * start: the first year in which the date falls no earlier than 45 days before it.
 * Otherwise anchored on today: nothing earlier than about six months ago.
 */
export function inferYear(month: number, day: number, context: DateContext): number {
  const [ay, am, ad] = (context.semesterStart ?? context.today).split("-").map(Number);
  const earliest = Date.UTC(ay, am - 1, ad) - (context.semesterStart ? 45 : 180) * DAY_MS;
  for (const year of [ay - 1, ay, ay + 1, ay + 2]) {
    if (isRealDay(month, day, year) && Date.UTC(year, month - 1, day) >= earliest) return year;
  }
  return ay;
}

const twoOrFourDigitYear = (text: string) => (text.length === 2 ? 2000 + Number(text) : Number(text));

function overlaps(spans: { index: number; end: number }[], index: number, end: number) {
  return spans.some((span) => index < span.end && end > span.index);
}

/** Every date in a line, in order. */
export function findDates(line: string): DateMatch[] {
  const found: DateMatch[] = [];

  // 1. "Oct 18", "October 18th, 2026", "Oct 16–20", "Oct 30 – Nov 3"
  const monthFirst = new RegExp(
    `\\b${MONTH_NAME}\\.?\\s+(\\d{1,2})${ORDINAL}\\b(?:,?\\s+(\\d{4})\\b)?(?:\\s*${DASH}\\s*(?:${MONTH_NAME}\\.?\\s+)?(\\d{1,2})${ORDINAL}\\b)?`,
    "gi"
  );
  for (const match of line.matchAll(monthFirst)) {
    const [text, monthText, dayText, yearText, endMonthText, endDayText] = match;
    // "may"/"mar" are ordinary words: only accept them capitalised.
    if (/^(may|mar)$/i.test(monthText) && monthText[0] !== monthText[0].toUpperCase()) continue;
    const month = monthNumber(monthText);
    const day = Number(dayText);
    if (!isRealDay(month, day)) continue;
    let rangeEnd: DateMatch["rangeEnd"] = null;
    if (endDayText) {
      const endMonth = endMonthText ? monthNumber(endMonthText) : month;
      const endDay = Number(endDayText);
      if (isRealDay(endMonth, endDay) && (endMonth > month || (endMonth === month && endDay > day))) rangeEnd = { month: endMonth, day: endDay };
    }
    found.push({
      index: match.index!,
      end: match.index! + text.length,
      month,
      day,
      year: yearText ? Number(yearText) : null,
      ambiguous: false,
      rangeEnd,
    });
  }

  // 2. "18 October", "18th of Oct 2026" (skipping anything already read as month-first)
  const dayFirst = new RegExp(`\\b(\\d{1,2})${ORDINAL}\\s+(?:of\\s+)?${MONTH_NAME}\\b\\.?(?:,?\\s+(\\d{4})\\b)?`, "gi");
  for (const match of line.matchAll(dayFirst)) {
    const [text, dayText, monthText, yearText] = match;
    if (/^(may|mar)$/i.test(monthText) && monthText[0] !== monthText[0].toUpperCase()) continue;
    const index = match.index!;
    if (overlaps(found, index, index + text.length)) continue;
    const month = monthNumber(monthText);
    const day = Number(dayText);
    if (!isRealDay(month, day)) continue;
    found.push({ index, end: index + text.length, month, day, year: yearText ? Number(yearText) : null, ambiguous: false, rangeEnd: null });
  }

  // 3. 10/18, 10/18/26, 10/18/2026 (and 10-18-2026 / 10.18.2026, which need the year to not be mistaken for page ranges)
  const numeric = /(?<![\d/.-])(\d{1,2})(?:(\/)(\d{1,2})(?:\/(\d{2}|\d{4}))?|([-.])(\d{1,2})\5(\d{2}|\d{4}))(?![\dA-Za-z/])/g;
  for (const match of line.matchAll(numeric)) {
    const [text, first, slash, secondSlash, yearSlash, , secondOther, yearOther] = match;
    const second = slash ? secondSlash : secondOther;
    const yearText = slash ? yearSlash : yearOther;
    const index = match.index!;
    if (overlaps(found, index, index + text.length)) continue;
    let month = Number(first);
    let day = Number(second);
    let ambiguous = month <= 12 && day <= 12 && month !== day;
    if (month > 12 && day <= 12) {
      [month, day] = [day, month]; // 18/10: only day/month makes sense
      ambiguous = false;
    }
    if (!isRealDay(month, day)) continue;

    // 10/16 - 10/20
    let rangeEnd: DateMatch["rangeEnd"] = null;
    let end = index + text.length;
    const tail = line.slice(end).match(new RegExp(`^\\s*${DASH}\\s*(\\d{1,2})/(\\d{1,2})(?:/(?:\\d{2}|\\d{4}))?(?![\\d/])`));
    if (tail) {
      const endMonth = Number(tail[1]);
      const endDay = Number(tail[2]);
      if (isRealDay(endMonth, endDay) && (endMonth > month || (endMonth === month && endDay > day))) {
        rangeEnd = { month: endMonth, day: endDay };
        end += tail[0].length;
      }
    }
    found.push({ index, end, month, day, year: yearText ? twoOrFourDigitYear(yearText) : null, ambiguous, rangeEnd });
  }

  return found.sort((a, b) => a.index - b.index);
}

/** A found date as YYYY-MM-DD, choosing the year if it wasn't written. */
export function dateToIso(match: DateMatch, context: DateContext): string {
  return toIso(match.year ?? inferYear(match.month, match.day, context), match.month, match.day);
}

/** "Week 5" in a line, if there is one. */
export function findWeekNumber(line: string): number | null {
  const match = line.match(/\bweek\s*#?\s*(\d{1,2})\b/i);
  const week = match ? Number(match[1]) : null;
  return week !== null && week >= 1 && week <= 40 ? week : null;
}

/** The first day of week N, counting the semester's first day as the start of week 1. */
export function weekStart(week: number, semesterStart: string): string {
  return addDays(semesterStart, (week - 1) * 7);
}
