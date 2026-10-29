import sharp from 'sharp';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const manifest=JSON.parse(await readFile('config/catalog-media-review-2026-10-29.json','utf8'));
for(const image of manifest.images){
 if(!/^product-assets\/originals\/2026-10-29\/page-\d{2}\.jpeg$/.test(image.originalKey)||!/^\/catalog-media\/2026-10-29\/page-\d{2}\.webp$/.test(image.url))throw new Error('Unexpected media path.');
 const bytes=await readFile(image.originalKey);
 if(createHash('sha256').update(bytes).digest('hex')!==image.sha256)throw new Error('Original media checksum mismatch.');
 await sharp(bytes).rotate().resize(1600,2400,{fit:'inside',withoutEnlargement:true}).webp({quality:92}).toFile(`public${image.url}`);
}
console.log('Prepared26 original-photo derivatives without crop, recoloring or rewritten labels.');
