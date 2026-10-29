import sharp from 'sharp';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const source='brand-assets/originals/Rukn_Al_Henna_Logo_4K.png';
const original=await readFile(source);
const {data,info}=await sharp(original).ensureAlpha().raw().toBuffer({resolveWithObject:true});
// Reconstruct the original flat-ink coverage over its white matte. This is a
// deterministic production cleanup, without tracing, drawing or generated shapes.
const ink=[166,120,152];
const vector=ink.map(c=>255-c);const denominator=vector.reduce((n,c)=>n+c*c,0);
const output=Buffer.alloc(info.width*info.height*4);let maskDifference=0,transparent=0,foreground=0;
for(let i=0;i<data.length;i+=4){
 const r=data[i],g=data[i+1],b=data[i+2];
 const coverage=((255-r)*vector[0]+(255-g)*vector[1]+(255-b)*vector[2])/denominator;
 const isInk=r>g+2&&b>g+2;
 const alpha=isInk&&coverage>=0.015?Math.round(255*Math.max(0,Math.min(1,coverage))):0;
 output[i]=ink[0];output[i+1]=ink[1];output[i+2]=ink[2];output[i+3]=alpha;
 if((alpha>=128)!==(isInk&&coverage>=0.5))maskDifference++;
 if(alpha===0)transparent++;else foreground++;
}
if(maskDifference!==0)throw new Error('Original foreground silhouette changed.');
const image=sharp(output,{raw:{width:info.width,height:info.height,channels:4}});
await image.clone().png({compressionLevel:9}).toFile('public/brand/rokn-alhenna-logo-transparent.png');
await image.clone().resize(1080,1080,{fit:'inside'}).webp({lossless:true}).toFile('public/brand/rokn-alhenna-logo-transparent.webp');
// Proof views composite the transparent ORIGINAL-derived asset; never alter the source.
for(const [name,color] of [['ivory','#FBF8F3'],['pink','#F5E6EA'],['white','#FFFFFF']]){
 await image.clone().resize(800,800).flatten({background:color}).png().toFile(`public/brand/previews/logo-on-${name}.png`);
}
const report={preparedAt:new Date().toISOString(),source,sourceSha256:createHash('sha256').update(original).digest('hex'),method:'White matte removal from original pixels and original flat ink color; no generated contours, no tracing, no lettering changes',width:info.width,height:info.height,inkHex:'#A67898',transparentPixels:transparent,foregroundPixels:foreground,foregroundMaskDifferences:maskDifference,originalUnchanged:true,generatedCandidatesUsed:false,limitations:'Source is raster; no claim of recovered vector detail or genuine additional detail from upscaling.'};
await writeFile('artifacts/transparent-logo-verification.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
