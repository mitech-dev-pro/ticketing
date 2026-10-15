import { describe, expect, it } from 'vitest';
import { formatAssetId, formatTicketId, parseAssetId, parseTicketId } from '@/lib/ids';

describe('ticket ids', () => {
  it('formats a ticket number', () => {
    expect(formatTicketId(24827)).toBe('MLT-24827');
  });

  it('parses a bare number', () => {
    expect(parseTicketId('24827')).toBe(24827);
  });

  it('parses a formatted id, case-insensitively', () => {
    expect(parseTicketId('MLT-24827')).toBe(24827);
    expect(parseTicketId('mlt-24827')).toBe(24827);
  });

  it('rejects garbage', () => {
    expect(parseTicketId('not-a-ticket')).toBeNull();
    expect(parseTicketId('MLT-')).toBeNull();
    expect(parseTicketId('-5')).toBeNull();
  });
});

describe('asset ids', () => {
  it('formats and parses round-trip', () => {
    const id = formatAssetId('lt', 142);
    expect(id).toBe('MLA-LT-0142');
    expect(parseAssetId(id)).toEqual({ type: 'LT', number: 142 });
  });

  it('rejects garbage', () => {
    expect(parseAssetId('MLA-0142')).toBeNull();
    expect(parseAssetId('MLT-24827')).toBeNull();
  });
});
