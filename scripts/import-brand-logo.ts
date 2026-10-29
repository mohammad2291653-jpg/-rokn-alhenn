import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { db } from '../src/lib/db';
const assets=[
  {path:'brand-assets/originals/Rukn_Al_Henna_Logo_4K.png',sha256:'1d101d3866bf6fbdacd8d38b385d6b0a0e0093d13c18603bae37c61c5db744fe'},
  {path:'public/brand/rokn-alhenna-logo.webp',sha256:'1603fba33ebb92fbc2b4bdf991e2d5c9be7d79ae9469346aba81c5b0d0a76d15'},
];
try {
  for(const asset of assets){const bytes=await readFile(asset.path);if(createHash('sha256').update(bytes).digest('hex')!==asset.sha256)throw new Error('Original logo integrity check failed.');}
  await db.$transaction(async tx=>{
    const row=await tx.siteSetting.findUniqueOrThrow({where:{key:'store'}});
    if(!row.value||typeof row.value!=='object'||Array.isArray(row.value))throw new Error('Store settings require review.');
    await tx.siteSetting.update({where:{key:'store'},data:{value:{...row.value,logoUrl:'/brand/rokn-alhenna-logo-transparent.webp',logoOriginalKey:assets[0].path}}});
    await tx.auditLog.create({data:{action:'OWNER_LOGO_IMPORTED',entityType:'SiteSetting',entityId:'store',details:{source:'Rukn_Al_Henna_Logo_Codex.zip',assets}}});
  });
  console.log('Original-derived transparent logo selected; original files and all other store settings preserved.');
}finally{await db.$disconnect();}
