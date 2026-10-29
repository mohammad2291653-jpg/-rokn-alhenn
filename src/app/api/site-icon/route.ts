import { db } from '@/lib/db';
export const dynamic='force-dynamic';
export async function GET(request:Request){
  try {
    const row=await db.siteSetting.findUnique({where:{key:'store'}});
    const value=row?.value;
    if(value&&typeof value==='object'&&!Array.isArray(value)&&typeof value.logoUrl==='string'&&value.logoUrl){
      const url=new URL(value.logoUrl,request.url);
      if(url.protocol==='https:'||url.origin===new URL(request.url).origin)return Response.redirect(url,307);
    }
  }catch { /* No fabricated replacement icon if the original is unavailable. */ }
  return new Response(null,{status:204});
}
