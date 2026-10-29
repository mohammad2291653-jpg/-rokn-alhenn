import { cp, mkdir, readdir, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
const dist=process.env.NEXT_DIST_DIR || '.next';
const standalone=resolve(dist,'standalone');
// Next's tracing may copy development .env files: never ship build-time credentials.
for(const file of await readdir(standalone)) if(file==='.env'||file.startsWith('.env.')) await rm(join(standalone,file),{force:true});
await mkdir(join(standalone,'public'),{recursive:true});
await mkdir(resolve('public'),{recursive:true});
await cp(resolve('public'),join(standalone,'public'),{recursive:true,filter:(source)=>!source.includes('/uploads/')&&!source.endsWith('/uploads')});
await mkdir(join(standalone,dist),{recursive:true});
await cp(resolve(dist,'static'),join(standalone,dist,'static'),{recursive:true});
console.log('Standalone prepared with static assets; .env and local uploaded media excluded.');
