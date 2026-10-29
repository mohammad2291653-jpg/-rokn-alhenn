import type { MetadataRoute } from 'next';
import { db } from '@/lib/db';
export const dynamic='force-dynamic';
export default async function sitemap():Promise<MetadataRoute.Sitemap> {
 if (process.env.RENDER_FREE_PREVIEW==='true') return [];
 const base=(process.env.NEXT_PUBLIC_SITE_URL||'http://localhost:3000').replace(/\/$/,'');
 const [products,articles,settings]=await Promise.all([db.product.findMany({where:{status:'PUBLISHED',nameNeedsConfirmation:false,images:{some:{}}},select:{slug:true,updatedAt:true}}),db.article.findMany({where:{published:true,reviewed:true},select:{slug:true,updatedAt:true}}),db.siteSetting.findMany({where:{key:{in:['returns','terms','privacy']}}})]);
 const approved=settings.filter(s=>s.value&&typeof s.value==='object'&&!Array.isArray(s.value)&&s.value.approved===true).map(s=>`/${s.key}`);
 return [...['','/products','/about','/contact','/faq','/shipping','/blog',...approved].map(path=>({url:`${base}${path}`,changeFrequency:'weekly' as const,priority:path===''?1:0.7})),...products.map(p=>({url:`${base}/products/${p.slug}`,lastModified:p.updatedAt,changeFrequency:'weekly' as const,priority:0.8})),...articles.map(a=>({url:`${base}/blog/${a.slug}`,lastModified:a.updatedAt,changeFrequency:'monthly' as const,priority:0.6}))];
}
