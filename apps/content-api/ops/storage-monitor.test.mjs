import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,symlink,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {storageReport} from './storage-monitor.mjs';
test('reports object bytes without traversing symlinks or deleting published data',async()=>{
 const home=await mkdtemp(path.join(os.tmpdir(),'storage-monitor-'));
 try{
  await mkdir(path.join(home,'data/assets'),{recursive:true});
  await writeFile(path.join(home,'data/assets/object'),Buffer.alloc(10));
  await symlink(home,path.join(home,'data/assets/cycle'));
  const report=await storageReport(home);
  assert.equal(report.assetBytes,10);assert.equal(report.archiveBytes,0);
  assert.equal(report.publishedObjectsDeleted,0);assert.ok(report.filesystem.free>0);
  assert.ok(['ok','warning','stop'].includes(report.filesystem.status));
 }finally{await rm(home,{recursive:true,force:true});}
});
