import { db } from '@/lib/db';
export const dynamic='force-dynamic';
export async function GET(request:Request){
  try {
    const row=await db.siteSetting.findUnique({where:{key:'store'}});
    const value=row?.value;
    if(value&&typeof value==='object'&&!Array.isArray(value)&&typeof value.logoUrl==='string'&&value.logoUrl){
      // Standalone servers can see an internal bind host behind Render's proxy.
      const site=new URL(process.env.NEXT_PUBLIC_SITE_URL || request.url);
      const url=new URL(value.logoUrl,site);
      if(url.protocol==='https:'||(url.protocol==='http:'&&url.origin===site.origin))return Response.redirect(url,307);
    }
  }catch { /* No fabricated replacement icon if the original is unavailable. */ }
  return new Response(null,{status:204});
}
