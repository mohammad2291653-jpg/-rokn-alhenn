import type { MetadataRoute } from 'next';
export default function robots():MetadataRoute.Robots {
 const base=(process.env.NEXT_PUBLIC_SITE_URL||'http://localhost:3000').replace(/\/$/,'');
 return {rules: process.env.ALLOW_INDEXING==='true' ? [{userAgent:'*',allow:'/',disallow:['/admin','/api/','/cart','/checkout','/order-status']}] : [{userAgent:'*',disallow:'/'}],sitemap:`${base}/sitemap.xml`};
}
