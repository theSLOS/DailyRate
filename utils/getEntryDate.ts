/**
 * Client-side mirror of the DB's `get_entry_date` SQL function — the single
 * source of truth for "what day is it for this user," used to gate the
 * posting/editing entry window (4pm open, noon-next-day close, 12pm-4pm dead
 * zone). Must stay in sync with `get_entry_date` if the window ever changes.
 */

/** Returns the local_date the current entry window applies to, or null in the 12pm-4pm dead zone. */
export function getEntryDate(now: Date): string | null {
  const hours = now.getHours();
  const minutes = now.getMinutes();

  if (hours >= 16) {
    return formatAsDateString(now);
  }
  if (hours < 12 || (hours === 12 && minutes === 0)) {
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    return formatAsDateString(yesterday);
  }
  return null;
}

/** Formats a Date as a local_date string (YYYY-MM-DD). */
function formatAsDateString(date: Date): string {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
}
