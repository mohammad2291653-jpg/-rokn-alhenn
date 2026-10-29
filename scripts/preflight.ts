import 'dotenv/config';
import { assessPreflight, parsePreflightArgs, type PreflightDatabaseSnapshot } from './preflight-checks';

async function databaseSnapshot(): Promise<PreflightDatabaseSnapshot | null> {
  // Guard the import too: driver errors must not expose connection strings.
  let db: (typeof import('../src/lib/db'))['db'] | undefined;
  try {
    db = (await import('../src/lib/db')).db;
    return await db.$transaction(async tx => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      const [administratorCount, settings, productRows, zones] = await Promise.all([
        tx.user.count({ where: { role: 'ADMIN', accounts: { some: { providerId: 'credential', password: { not: null } } } } }),
        // Project required booleans only; never read policy bodies or PII.
        tx.$queryRaw<Array<{ key: string; enabled: boolean | null; approved: boolean | null; logoUrl: string | null }>>`
          SELECT "key", ("value" = 'true'::jsonb) AS "enabled",
            ("value"->'approved' = 'true'::jsonb) AS "approved",
            CASE WHEN jsonb_typeof("value"->'logoUrl') = 'string' THEN "value"->>'logoUrl' ELSE NULL END AS "logoUrl"
          FROM "SiteSetting" WHERE "key" IN ('checkoutEnabled', 'returns', 'privacy', 'terms', 'store')`,
        tx.$queryRaw<Array<PreflightDatabaseSnapshot['products']>>`
          SELECT COUNT(*)::int AS "total",
            (COUNT(*) FILTER (WHERE p."status" = 'DRAFT'))::int AS "draft",
            (COUNT(*) FILTER (WHERE p."status" = 'PUBLISHED'))::int AS "published",
            (COUNT(*) FILTER (WHERE p."status" = 'PUBLISHED' AND (p."nameNeedsConfirmation" OR p."priceAgorot" <= 0 OR p."weightGrams" <= 0 OR NOT EXISTS (SELECT 1 FROM "ProductImage" i WHERE i."productId" = p."id"))))::int AS "incompletePublished",
            (COUNT(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM "ProductImage" i WHERE i."productId" = p."id")))::int AS "missingImages",
            (COUNT(*) FILTER (WHERE p."nameNeedsConfirmation"))::int AS "pendingNames",
            (COUNT(*) FILTER (WHERE p."usage" IS NULL OR btrim(p."usage") = ''))::int AS "missingUsage",
            (COUNT(*) FILTER (WHERE p."ingredients" IS NULL OR btrim(p."ingredients") = ''))::int AS "missingIngredients"
          FROM "Product" p`,
        tx.deliveryZone.findMany({ select: { code: true, enabled: true, approved: true, feeAgorot: true } }),
      ]);
      return {
        administratorCount,
        checkoutEnabled: settings.find(setting => setting.key === 'checkoutEnabled')?.enabled === true,
        logoUrl: settings.find(setting => setting.key === 'store')?.logoUrl ?? null,
        policiesApproved: {
          returns: settings.find(setting => setting.key === 'returns')?.approved === true,
          privacy: settings.find(setting => setting.key === 'privacy')?.approved === true,
          terms: settings.find(setting => setting.key === 'terms')?.approved === true,
        },
        products: productRows[0],
        zones,
      };
    }, { isolationLevel: 'RepeatableRead', timeout: 15_000, maxWait: 5_000 });
  } catch { return null; }
  finally { await db?.$disconnect().catch(() => {}); }
}

try {
  const options = parsePreflightArgs(process.argv.slice(2));
  if (options.help) {
    console.log('Usage: npm run preflight -- [--preview] [--json]\nDefault: commercial launch checks. --preview: hosted review with sales and indexing disabled.\nThis command only reads configuration/database state and never approves or publishes content.');
  } else {
    const report = assessPreflight(process.env, await databaseSnapshot(), options.mode);
    if (options.json) console.log(JSON.stringify(report, null, 2));
    else {
      console.log(`${report.mode === 'preview' ? 'Hosted preview' : 'Commercial launch'} configuration ${report.ready ? 'checks pass' : 'is blocked'}.`);
      for (const check of report.checks.filter(check => !check.passed)) console.log(`• ${check.message}`);
      if (report.content.notices.length) {
        console.log('Content awaiting review (reported separately):');
        for (const notice of report.content.notices) console.log(`• ${notice.message} (${notice.count})`);
      }
      for (const limitation of report.limitations) console.log(limitation);
    }
    if (!report.ready) process.exitCode = 1;
  }
} catch {
  const error = { error: 'INVALID_PREFLIGHT_ARGUMENTS', message: 'Use preflight [--preview] [--json] or --help.' };
  console.error(process.argv.includes('--json') ? JSON.stringify(error) : error.message);
  process.exitCode = 2;
}
