/**
 * CC0 authored building prefabs, original Quaternius Downtown City MegaKit.
 * Web-optimized GLBs by anshaneja5/skyline-run, pinned and SHA256 verified.
 * No runtime dependency on GitHub: these get baked into the production release.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';

const repo='anshaneja5/skyline-run';
const revision='0c41526d8d4130c37c15e219c2c3737fa8cb4ad8';
const assets:Record<string,string>={
  b_small:'3e8e432d69253d4f459094850508ef55379b188f43a6884c92774aac0d5d97b4',
  b_medium:'5a3133c67f2f2ade760156b27f882d43b18dadd97703ade11b350b9cb163a41d',
  b_large:'7cc886d3a817f1538a96139b2642d2923925a340e7249f588be1dd8229e1e780'
};
const dir=resolve('client/public/assets/cc0');
await mkdir(dir,{recursive:true});
for(const [name,sha] of Object.entries(assets)){
  const path=join(dir,name+'.glb');
  try {
    const contents=await readFile(path);
    if(createHash('sha256').update(contents).digest('hex')===sha){
      console.log(name+': cached and verified'); continue;
    }
  } catch { /* Download missing file. */ }
  const urls=[
    `https://raw.githubusercontent.com/${repo}/${revision}/public/assets/models/${name}.glb`,
    `https://cdn.jsdelivr.net/gh/${repo}@${revision}/public/assets/models/${name}.glb`
  ];
  let downloaded=false;
  for(const url of urls){
    try{
      const response=await fetch(url,{signal:AbortSignal.timeout(60000)});
      if(!response.ok)throw new Error('HTTP '+response.status);
      const content=Buffer.from(await response.arrayBuffer());
      const digest=createHash('sha256').update(content).digest('hex');
      if(digest!==sha)throw new Error('SHA256 mismatch for '+name);
      const tmp=path+'.tmp';
      await writeFile(tmp,content);
      await rename(tmp,path);
      downloaded=true;
      console.log(name+': '+content.length+' bytes, SHA256 verified');
      break;
    } catch(error) {console.warn(name+': mirror failed: '+String(error));}
  }
  if(!downloaded)throw new Error('Could not obtain verified CC0 asset '+name);
}
