import type { MetadataRoute } from 'next';
export default function robots():MetadataRoute.Robots {
 const base=(process.env.NEXT_PUBLIC_SITE_URL||'http://localhost:3000').replace(/\/$/,'');
 return {rules: process.env.RENDER_FREE_PREVIEW!=='true' && process.env.ALLOW_INDEXING==='true' ? [{userAgent:'*',allow:'/',disallow:['/admin','/api/','/cart','/checkout','/order-status']}] : [{userAgent:'*',disallow:'/'}],sitemap:process.env.RENDER_FREE_PREVIEW==='true' ? undefined : `${base}/sitemap.xml`};
}
