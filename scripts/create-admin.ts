import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { hashPassword } from 'better-auth/crypto';
import { db } from '../src/lib/db';
import { z } from 'zod';
const input=z.object({email:z.email(),password:z.string().min(14).max(128)}).parse({email:process.env.ADMIN_EMAIL,password:process.env.ADMIN_PASSWORD});

try {
  const hashed=await hashPassword(input.password);
  await db.$transaction(async tx=>{
    const existing=await tx.user.findUnique({where:{email:input.email.toLowerCase()}});
    if(existing) throw new Error('Administrator already exists. Use a controlled password reset procedure; this command never overwrites accounts.');
    const id=randomUUID();
    await tx.user.create({data:{id,name:'إدارة ركن الحناء',email:input.email.toLowerCase(),emailVerified:true,role:'ADMIN'}});
    await tx.account.create({data:{id:randomUUID(),accountId:id,providerId:'credential',userId:id,password:hashed}});
    await tx.auditLog.create({data:{actorId:id,action:'ADMIN_BOOTSTRAPPED',entityType:'User',entityId:id}});
  });
  console.log('Administrator created. Remove ADMIN_PASSWORD from the runtime after bootstrapping.');
} finally { await db.$disconnect(); }
