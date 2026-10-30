// No object deletion: every published release remains immutable and available.
import {readdir, stat, statfs, mkdir, writeFile, rename} from 'node:fs/promises';
import path from 'node:path';
export async function directoryBytes(root){
 let total=0;
 for(const e of await readdir(root,{withFileTypes:true}).catch(e=>{if(e.code==='ENOENT')return [];throw e;})){
  const p=path.join(root,e.name);
  if(e.isDirectory())total+=await directoryBytes(p);
  else if(e.isFile())total+=(await stat(p)).size;
 }
 return total;
}
async function fileBytes(p){
 const s=await stat(p).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
 return s&&s.isFile()?s.size:0;
}
export async function storageReport(home){
 const fs=await statfs(home),total=fs.blocks*fs.bsize,free=fs.bavail*fs.bsize,used=total-free,percent=total?used/total*100:100;
 const assets=await directoryBytes(path.join(home,'data/assets'));
 const archive=await directoryBytes(path.join(home,'data/archive'));
 let sqliteBytes=0;
 for(const suffix of ['','-'+'wal','-'+'shm']) sqliteBytes+=await fileBytes(path.join(home,'data/content.db'+suffix));
 return {schemaVersion:1,at:new Date().toISOString(),storage:'sqlite',sqliteBytes,filesystem:{total,free,used,percent,status:percent>=80?'stop':percent>=70?'warning':'ok'},assetBytes:assets,archiveBytes:archive,publishedObjectsDeleted:0};
}
export function startStorageMonitor(home,log=console.log){
 let running=false;
 const run=async()=>{
  if(running)return;running=true;
  try{
   const report=await storageReport(home),dir=path.join(home,'data'),dest=path.join(dir,'storage-report.json');
   await mkdir(dir,{recursive:true,mode:0o700});await writeFile(dest+'.new',JSON.stringify(report,null,2),{mode:0o600});await rename(dest+'.new',dest);
   log('Storage capacity: '+JSON.stringify(report));
  }catch(e){log('Storage monitor failed: '+e.message);}finally{running=false;}
 };
 void run();const timer=setInterval(run,24*60*60*1000);timer.unref();return ()=>clearInterval(timer);
}
