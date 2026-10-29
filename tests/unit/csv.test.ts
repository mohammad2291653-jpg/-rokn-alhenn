import { describe, expect, it } from 'vitest';
import { escapeCsvCell } from '../../src/lib/csv';
describe('CSV export spreadsheet safety', () => {
  it.each(['=1+1', '+970599373380', '-1+1', '@SUM(A1)', '\t=WEBSERVICE("https://example.invalid")', '\u200f=1+1', '\u0000=1+1'])('neutralizes formula prefix in %s', input => {
    expect(escapeCsvCell(input).startsWith('"\'')).toBe(true);
  });
  it('escapes quotes, commas and multiline content without creating extra rows', () => {
    expect(escapeCsvCell('زبونة "اختبار",\nرام الله')).toBe('"زبونة ""اختبار"", رام الله"');
  });
  it('retains plain Arabic and decimal currency values', () => {
    expect(escapeCsvCell('ركن الحناء')).toBe('"ركن الحناء"');
    expect(escapeCsvCell('95.00')).toBe('"95.00"');
  });
});
