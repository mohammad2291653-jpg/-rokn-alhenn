import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { headers } from 'next/headers';
import { db } from '@/lib/db';
import { HttpError } from '@/lib/security';

export const auth = betterAuth({
  appName: 'Rokn Alhenna', baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: prismaAdapter(db, {provider:'postgresql'}),
  emailAndPassword: { enabled:true, disableSignUp:true, minPasswordLength:14, maxPasswordLength:128 },
  user: { additionalFields: {role: {type:'string',defaultValue:'ADMIN',input:false}} },
  session: { expiresIn:60*60*8, updateAge:60*30, cookieCache: {enabled:false} },
  advanced: { useSecureCookies:process.env.NODE_ENV==='production' },
  trustedOrigins: process.env.BETTER_AUTH_URL ? [new URL(process.env.BETTER_AUTH_URL).origin] : [],
  rateLimit: {enabled:false} // Durable limits applied at the HTTP boundary.
});
export async function requireAdmin() {
  const session = await auth.api.getSession({headers:await headers()});
  if (!session || session.user.role !== 'ADMIN') throw new HttpError('يلزم تسجيل دخول المدير.',401,'UNAUTHORIZED');
  return session.user;
}
