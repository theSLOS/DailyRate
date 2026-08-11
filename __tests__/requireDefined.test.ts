import { requireDefined } from '@/utils/requireDefined';

describe('requireDefined', () => {
  it('returns the value unchanged when defined', () => {
    expect(requireDefined('post-1', 'missing')).toBe('post-1');
    expect(requireDefined(42, 'missing')).toBe(42);
  });

  it('passes through defined-but-falsy values without throwing', () => {
    expect(requireDefined(0, 'missing')).toBe(0);
    expect(requireDefined('', 'missing')).toBe('');
    expect(requireDefined(false, 'missing')).toBe(false);
  });

  it('throws the given message when the value is null', () => {
    expect(() => requireDefined(null, 'User ID is required')).toThrow('User ID is required');
  });

  it('throws the given message when the value is undefined', () => {
    expect(() => requireDefined(undefined, 'User ID is required')).toThrow('User ID is required');
  });
});
