import { randomBytes, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import EmbeddedPostgres from "embedded-postgres";
import { verifyPassword } from "better-auth/crypto";

// Standalone test only: no connection to .env's development/production database.
const directory = resolve(".local",`durability-${randomUUID()}`);
const password = randomBytes(24).toString("base64url");
const url = `postgresql://durability:${encodeURIComponent(password)}@127.0.0.1:5434/durability`;
process.env.DATABASE_URL = url;
Object.assign(process.env,{NODE_ENV:"test"});
process.env.ORDER_TOKEN_SECRET = randomBytes(32).toString("base64url");
const postgres = new EmbeddedPostgres({
  databaseDir:directory,user:"durability",password,port:5434,persistent:true,
  authMethod:"scram-sha-256",onLog:()=>{},onError:()=>{},
});
const checks:string[] = [];
const check = (name:string) => {checks.push(name);console.info(`PASS: ${name}`);};
let database:typeof import("../src/lib/db") | undefined;
let started = false;

function command(args:string[], env:NodeJS.ProcessEnv = process.env) {
  const result = spawnSync("npx",args,{cwd:process.cwd(),env,encoding:"utf8",timeout:60_000});
  if (result.status !== 0) throw new Error(`Test subprocess failed: ${args.join(" ")} (exit ${result.status})\n${result.stderr}`);
  return result;
}

try {
  await postgres.initialise();
  await postgres.start();started=true;
  await postgres.createDatabase("durability");
  command(["prisma","migrate","deploy"]);
  command(["tsx","prisma/seed.ts"]);
  database = await import("../src/lib/db");
  const {db} = database;
  assert.equal(await db.product.count(),9);
  check("Both production migrations applied and exact nine-product seed persisted in isolated database");
  const product = await db.product.findUniqueOrThrow({where:{slug:"integrated-henna"}});
  await db.product.update({where:{id:product.id},data:{status:"PUBLISHED",nameNeedsConfirmation:false,images:{create:{url:"https://example.invalid/test-only.webp",originalKey:"test-only",alt:"صورة اختبار لا تُنشر"}}}});
  for (const key of ["returns","privacy","terms"])
    await db.siteSetting.update({where:{key},data:{value:{approved:true,body:"Isolated durability test policy"}}});
  await db.siteSetting.update({where:{key:"checkoutEnabled"},data:{value:true}});
  const zone = await db.deliveryZone.findUniqueOrThrow({where:{code:"west-bank"}});
  const {createOrder,lookupOrder} = await import("../src/lib/order-service");
  const request = {items:[{productId:product.id,quantity:1}],zoneId:zone.id,city:"رام الله",customerName:"اختبار استمرارية معزول",phone:"0599123456",address:"رام الله شارع الاختبار بناية ١",idempotencyKey:randomUUID(),acceptPolicies:true};
  const order = await createOrder(request);
  assert.equal(order.totalAgorot,9500);
  assert.equal(order.paymentStatus,"UNPAID");
  check("Real transactional COD order created at 75 + 20 = 95 ILS as UNPAID");

  const adminEmail = "durability-admin@example.invalid";
  const adminPassword = randomBytes(32).toString("base64url");
  const bootstrapEnv = {...process.env,ADMIN_EMAIL:adminEmail,ADMIN_PASSWORD:adminPassword};
  command(["tsx","scripts/create-admin.ts"],bootstrapEnv);
  const admin = await db.user.findUniqueOrThrow({where:{email:adminEmail},include:{accounts:true}});
  assert.equal(admin.role,"ADMIN");
  const hashed = admin.accounts.find(account=>account.providerId==="credential")?.password;
  assert.ok(hashed);
  assert.notEqual(hashed,adminPassword);
  assert.equal(await verifyPassword({hash:hashed,password:adminPassword}),true);
  assert.equal(await verifyPassword({hash:hashed,password:randomBytes(32).toString("hex")}),false);
  check("Controlled administrator bootstrap stores a password hash; correct password verifies and wrong password fails");
  const duplicate = spawnSync("npx",["tsx","scripts/create-admin.ts"],{env:bootstrapEnv,encoding:"utf8",timeout:60_000});
  assert.notEqual(duplicate.status,0);
  assert.equal(await db.user.count({where:{email:adminEmail}}),1);
  check("Repeated administrator bootstrap rejects overwrite and duplicate account creation");

  await db.product.update({where:{id:product.id},data:{name:"اسم اختبار معدّل",priceAgorot:8000}});
  await db.deliveryZone.update({where:{id:zone.id},data:{feeAgorot:2500}});
  await db.$disconnect();
  await postgres.stop();started=false;
  await postgres.start();started=true;
  const saved = await db.order.findUniqueOrThrow({where:{number:order.number},include:{items:true,history:true}});
  assert.equal(saved.totalAgorot,9500);
  assert.equal(saved.deliveryAgorot,2000);
  assert.equal(saved.items[0]?.unitPriceAgorot,7500);
  assert.equal(saved.items[0]?.productName,"خلطة الحناء المتكاملة");
  assert.equal(saved.history.length,1);
  assert.equal(saved.paymentStatus,"UNPAID");
  check("Database stop/start retains saved order, original name/price/shipping snapshots, payment state and history");
  assert.equal((await lookupOrder(order.trackingToken)).number,order.number);
  assert.equal((await createOrder(request)).number,order.number);
  assert.equal(await db.order.count(),1);
  check("Secure tracking and idempotent replay work after database restart without duplicate order");
  assert.equal(await db.product.count(),9);
  assert.equal((await db.user.findUniqueOrThrow({where:{email:adminEmail}})).id,admin.id);
  assert.equal(await db.productImage.count(),1);
  check("Products, test image metadata and administrator survive database restart");
  command(["prisma","migrate","deploy"]);
  command(["tsx","prisma/seed.ts"]);
  assert.equal(await db.order.count(),1);
  assert.equal((await db.product.findUniqueOrThrow({where:{id:product.id}})).priceAgorot,8000);
  assert.equal((await db.deliveryZone.findUniqueOrThrow({where:{id:zone.id}})).feeAgorot,2500);
  check("Redeploy migrations and seed preserve existing order and administrative price/delivery changes");

  await mkdir(resolve("artifacts"),{recursive:true});
  await writeFile(resolve("artifacts/durability-report.json"),JSON.stringify({
    measuredAt:new Date().toISOString(),database:"PostgreSQL isolated temporary cluster on port 5434",result:"passed",checks,
    limitations:["Local PostgreSQL restart/redeploy drill only; managed production database not provisioned.","pg_dump/pg_restore backup restoration drill was not executed because these binaries are unavailable."],
  },null,2)+"\n");
  console.info(`Durability verification passed: ${checks.length} checks. Report: artifacts/durability-report.json`);
} finally {
  await database?.db.$disconnect();
  if (started) await postgres.stop();
  await rm(directory,{recursive:true,force:true});
}
