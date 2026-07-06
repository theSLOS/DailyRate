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

function formatAsDateString(date: Date): string {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
}
