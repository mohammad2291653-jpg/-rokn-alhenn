import type { NextConfig } from 'next';
const isProd = process.env.NODE_ENV === 'production';
const config: NextConfig = {
  allowedDevOrigins:['127.0.0.1','localhost'],
  output: 'standalone', distDir:process.env.NEXT_DIST_DIR || '.next', poweredByHeader: false,
  images: { unoptimized: process.env.RENDER_FREE_PREVIEW === 'true', remotePatterns: process.env.S3_PUBLIC_URL ? [new URL(process.env.S3_PUBLIC_URL.replace(/\/$/,'') + '/products/**')] : [] },
  experimental: { serverActions: { bodySizeLimit: '6mb' } },
  async rewrites() { return [{source:'/favicon.ico',destination:'/api/site-icon'}]; },
  async headers() {
    const csp = ["default-src 'self'", "script-src 'self' 'unsafe-inline'" + (isProd ? '' : " 'unsafe-eval'"), "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob: https:", "font-src 'self'", "connect-src 'self'" + (isProd ? '' : ' ws: wss:'), "object-src 'none'", "base-uri 'self'", "frame-ancestors 'none'", "form-action 'self'"].join('; ');
    return [{source:'/:path*',headers:[{key:'Content-Security-Policy',value:csp},{key:'X-Content-Type-Options',value:'nosniff'},{key:'Referrer-Policy',value:process.env.RENDER_FREE_PREVIEW === 'true' ? 'no-referrer' : 'strict-origin-when-cross-origin'},{key:'X-Frame-Options',value:'DENY'},{key:'Permissions-Policy',value:'camera=(), microphone=(), geolocation=()'},...(process.env.RENDER_FREE_PREVIEW === 'true' ? [{key:'Cache-Control',value:'private, no-store'},{key:'X-Robots-Tag',value:'noindex, nofollow'}] : []),...(isProd ? [{key:'Strict-Transport-Security',value:'max-age=31536000; includeSubDomains'}]:[])]},{source:'/admin/:path*',headers:[{key:'Cache-Control',value:'private, no-store'},{key:'X-Robots-Tag',value:'noindex, nofollow'}]},{source:'/api/:path*',headers:[{key:'Cache-Control',value:'no-store'}]},{source:'/order-status',headers:[{key:'Referrer-Policy',value:'no-referrer'},{key:'X-Robots-Tag',value:'noindex, nofollow'}]}];
  }
};
export default config;
