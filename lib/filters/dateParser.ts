/**
 * Parse relative date expressions like "last Monday", "this week", etc.
 * Returns start and end dates for the period
 */

export interface ParsedDateRange {
  startDate: Date;
  endDate: Date;
}

/**
 * Parse a relative date expression
 * Supports:
 * - "today", "yesterday"
 * - "this week", "last week", "next week"
 * - "this month", "last month", "next month"
 * - "this year", "last year", "next year"
 * - "last Monday", "last Tuesday", etc. (day of week)
 * - "last N days", "next N days"
 */
export function parseRelativeDate(expression: string, referenceDate: Date = new Date()): ParsedDateRange {
  const normalized = expression.trim().toLowerCase();
  const today = new Date(referenceDate);
  today.setHours(0, 0, 0, 0);

  // Today
  if (normalized === 'today') {
    const end = new Date(today);
    end.setHours(23, 59, 59, 999);
    return { startDate: today, endDate: end };
  }

  // Yesterday
  if (normalized === 'yesterday') {
    const start = new Date(today);
    start.setDate(start.getDate() - 1);
    const end = new Date(start);
    end.setHours(23, 59, 59, 999);
    return { startDate: start, endDate: end };
  }

  // This week (Monday to Sunday)
  if (normalized === 'this week') {
    const dayOfWeek = today.getDay();
    const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // Monday is day 1
    const start = new Date(today);
    start.setDate(today.getDate() + diff);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return { startDate: start, endDate: end };
  }

  // Last week
  if (normalized === 'last week') {
    const dayOfWeek = today.getDay();
    const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const end = new Date(today);
    end.setDate(today.getDate() + diff - 1);
    end.setHours(23, 59, 59, 999);
    const start = new Date(end);
    start.setDate(end.getDate() - 6);
    start.setHours(0, 0, 0, 0);
    return { startDate: start, endDate: end };
  }

  // Next week
  if (normalized === 'next week') {
    const dayOfWeek = today.getDay();
    const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const start = new Date(today);
    start.setDate(today.getDate() + diff + 7);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return { startDate: start, endDate: end };
  }

  // Last [Day of Week] (e.g., "last Monday")
  const lastDayMatch = normalized.match(/^last (monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/);
  if (lastDayMatch) {
    const dayName = lastDayMatch[1];
    const targetDay = getDayOfWeekNumber(dayName);
    const currentDay = today.getDay();
    
    let daysToSubtract = (currentDay - targetDay + 7) % 7;
    if (daysToSubtract === 0) {
      daysToSubtract = 7; // If today is the target day, go back a week
    }
    
    const start = new Date(today);
    start.setDate(today.getDate() - daysToSubtract);
    const end = new Date(start);
    end.setHours(23, 59, 59, 999);
    return { startDate: start, endDate: end };
  }

  // This month
  if (normalized === 'this month') {
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    end.setHours(23, 59, 59, 999);
    return { startDate: start, endDate: end };
  }

  // Last month
  if (normalized === 'last month') {
    const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const end = new Date(today.getFullYear(), today.getMonth(), 0);
    end.setHours(23, 59, 59, 999);
    return { startDate: start, endDate: end };
  }

  // Next month
  if (normalized === 'next month') {
    const start = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    const end = new Date(today.getFullYear(), today.getMonth() + 2, 0);
    end.setHours(23, 59, 59, 999);
    return { startDate: start, endDate: end };
  }

  // This year
  if (normalized === 'this year') {
    const start = new Date(today.getFullYear(), 0, 1);
    const end = new Date(today.getFullYear(), 11, 31);
    end.setHours(23, 59, 59, 999);
    return { startDate: start, endDate: end };
  }

  // Last year
  if (normalized === 'last year') {
    const start = new Date(today.getFullYear() - 1, 0, 1);
    const end = new Date(today.getFullYear() - 1, 11, 31);
    end.setHours(23, 59, 59, 999);
    return { startDate: start, endDate: end };
  }

  // Next year
  if (normalized === 'next year') {
    const start = new Date(today.getFullYear() + 1, 0, 1);
    const end = new Date(today.getFullYear() + 1, 11, 31);
    end.setHours(23, 59, 59, 999);
    return { startDate: start, endDate: end };
  }

  // Last N days
  const lastDaysMatch = normalized.match(/^last (\d+) days?$/);
  if (lastDaysMatch) {
    const days = parseInt(lastDaysMatch[1], 10);
    const end = new Date(today);
    end.setHours(23, 59, 59, 999);
    const start = new Date(today);
    start.setDate(today.getDate() - days + 1);
    start.setHours(0, 0, 0, 0);
    return { startDate: start, endDate: end };
  }

  // Next N days
  const nextDaysMatch = normalized.match(/^next (\d+) days?$/);
  if (nextDaysMatch) {
    const days = parseInt(nextDaysMatch[1], 10);
    const start = new Date(today);
    start.setHours(0, 0, 0, 0);
    const end = new Date(today);
    end.setDate(today.getDate() + days - 1);
    end.setHours(23, 59, 59, 999);
    return { startDate: start, endDate: end };
  }

  // Default: try to parse as ISO date
  try {
    const date = new Date(expression);
    if (!isNaN(date.getTime())) {
      const start = new Date(date);
      start.setHours(0, 0, 0, 0);
      const end = new Date(date);
      end.setHours(23, 59, 59, 999);
      return { startDate: start, endDate: end };
    }
  } catch (e) {
    // Fall through to error
  }

  throw new Error(`Unable to parse relative date: "${expression}"`);
}

/**
 * Get day of week number (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
 */
function getDayOfWeekNumber(dayName: string): number {
  const days: Record<string, number> = {
    'sunday': 0,
    'monday': 1,
    'tuesday': 2,
    'wednesday': 3,
    'thursday': 4,
    'friday': 5,
    'saturday': 6,
  };
  return days[dayName.toLowerCase()] ?? 1; // Default to Monday
}

/**
 * Parse a date string (ISO format or relative expression)
 */
export function parseDate(dateString: string, referenceDate?: Date): Date {
  // Try relative date first
  try {
    const range = parseRelativeDate(dateString, referenceDate);
    return range.startDate; // Return start date for single date
  } catch (e) {
    // Not a relative date, try ISO format
    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
      throw new Error(`Invalid date format: "${dateString}"`);
    }
    return date;
  }
}

