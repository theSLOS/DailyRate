import { getEntryDate } from '@/utils/getEntryDate';

describe('getEntryDate', () => {
  it('returns today when the entry window is open (4pm–midnight)', () => {
    expect(getEntryDate(new Date(2026, 7, 8, 16, 0))).toBe('2026-08-08');
    expect(getEntryDate(new Date(2026, 7, 8, 23, 59))).toBe('2026-08-08');
  });

  it('returns yesterday when still editable the next morning (midnight–noon inclusive)', () => {
    expect(getEntryDate(new Date(2026, 7, 8, 0, 0))).toBe('2026-08-07');
    expect(getEntryDate(new Date(2026, 7, 8, 11, 59))).toBe('2026-08-07');
    expect(getEntryDate(new Date(2026, 7, 8, 12, 0))).toBe('2026-08-07'); // noon is inclusive
  });

  it('returns null during the dead zone (just after noon to just before 4pm)', () => {
    expect(getEntryDate(new Date(2026, 7, 8, 12, 1))).toBeNull();
    expect(getEntryDate(new Date(2026, 7, 8, 15, 59))).toBeNull();
  });

  it('rolls the "yesterday" case correctly across a month boundary', () => {
    expect(getEntryDate(new Date(2026, 8, 1, 0, 0))).toBe('2026-08-31');
  });
});
