import { formatCoarseAge } from '@/utils/formatCoarseAge';

const NOW = new Date('2026-08-08T12:00:00Z');

function secondsAgo(seconds: number): string {
  return new Date(NOW.getTime() - seconds * 1000).toISOString();
}

describe('formatCoarseAge', () => {
  it('returns "just now" for anything under a minute', () => {
    expect(formatCoarseAge(secondsAgo(0), NOW)).toBe('just now');
    expect(formatCoarseAge(secondsAgo(59), NOW)).toBe('just now');
  });

  it('returns whole minutes under an hour', () => {
    expect(formatCoarseAge(secondsAgo(60), NOW)).toBe('1m ago');
    expect(formatCoarseAge(secondsAgo(60 * 45), NOW)).toBe('45m ago');
    expect(formatCoarseAge(secondsAgo(60 * 59), NOW)).toBe('59m ago');
  });

  it('rolls over to hours at the 60-minute boundary', () => {
    expect(formatCoarseAge(secondsAgo(60 * 60), NOW)).toBe('1h ago');
    expect(formatCoarseAge(secondsAgo(60 * 60 * 5), NOW)).toBe('5h ago');
  });
});
