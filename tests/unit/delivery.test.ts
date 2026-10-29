import { describe, expect, it } from 'vitest';
import { addressArea, addressMentions, normalizeAddress } from '../../src/lib/delivery';

describe('address contradiction detection', () => {
  it.each(['غزة', 'غَزَّة', 'غــزة', 'قطاع غزة', 'Gaza', 'GAZA City', 'خان يونس', 'رفح', 'جباليا', 'دير البلح', 'بيت حانون'])('blocks a Gaza indicator: %s', (value) => {
    expect(addressArea(`${value}، شارع السوق`)).toBe('gaza');
  });
  it.each(['القدس', 'Jerusalem', 'بيت حنينا', 'شعفاط', 'سلوان'])('requires Jerusalem classification: %s', (value) => {
    expect(addressArea(`${value}، شارع السوق`)).toBe('jerusalem');
  });
  it('normalizes Arabic text and punctuation without changing city identity', () => {
    expect(normalizeAddress('  رَامُ اللَّه، ')).toBe('رام الله');
    expect(addressMentions('شارع فلسطين، نابلس، بناية ٣', 'نابلس')).toBe(true);
    expect(addressMentions('بيت جالا', 'جال')).toBe(false);
    expect(addressArea('رام الله شارع الاختبار')).toBeNull();
  });
});
