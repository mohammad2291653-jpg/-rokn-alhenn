import 'dotenv/config';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { db } from '../src/lib/db';
const expected = [
  ['integrated-henna', 'خلطة الحناء المتكاملة', 500, 7500],
  ['sidr-mask', 'ماسك السدر', 200, 11000],
  ['red-mashat-mask', 'ماسك المشاط الأحمر', 500, 11000],
  ['green-mashat-mask', 'ماسك المشاط الأخضر', 500, 13000],
  ['ground-henna', 'الحناء المطحونة', 200, 4000],
  ['sidr-powder', 'بودرة السدر', 100, 5500],
  ['red-mashat-powder', 'بودرة المشاط الأحمر', 200, 5000],
  ['green-mashat-powder', 'بودرة المشاط الأخضر', 200, 6000],
  ['dark-color-powder', 'بودرة اللون الداكن بعد الحناء', 100, 6000],
] as const;
try {
  const records = await db.product.findMany({ where: { slug: { in: expected.map((p) => p[0]) } }, include: { images: true } });
  assert.equal(records.length, 9, 'Exactly nine initial catalog records must exist.');
  const findings = expected.map(([slug, name, weightGrams, priceAgorot]) => {
    const actual = records.find((p) => p.slug === slug);
    assert.ok(actual, slug);
    assert.equal(actual.name, name, `${slug} name`);
    assert.equal(actual.weightGrams, weightGrams, `${slug} weight`);
    assert.equal(actual.priceAgorot, priceAgorot, `${slug} price`);
    assert.equal(actual.status, 'DRAFT', `${slug} must stay a draft without original images`);
    assert.equal(actual.images.length, 0, `${slug} has no supplied original image`);
    return { slug, name, weightGrams, priceAgorot, status: actual.status, originalPhotoProvided: false, result: 'passed' };
  });
  await mkdir('artifacts', { recursive: true });
  await writeFile('artifacts/catalog-audit.json', JSON.stringify({ at: new Date().toISOString(), readOnly: true, actualDatabaseRecords: 9, findings, physicalPackagingComparison: 'not performed: no source assets supplied' }, null, 2));
  console.log('Catalog audit passed: nine DB names, weights and prices match; all remain drafts without supplied photos.');
} finally { await db.$disconnect(); }
