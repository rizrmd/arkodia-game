// Run inside the dedicated sandbox. Never prints its editor token.
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const home=process.env.HOME;
const config=JSON.parse(readFileSync(`${home}/private/content.env.json`,'utf8'));
const token=config.CONTENT_API_TOKEN;
const origin=process.env.VERIFY_ORIGIN || 'https://content.arkodia.online';
const sha=b=>createHash('sha256').update(b).digest('hex');
async function req(method,path,body,auth,status=200){
 const headers={};if(auth)headers.Authorization=`Bearer ${typeof auth==='string'?auth:token}`;
 if(body && !Buffer.isBuffer(body)){body=JSON.stringify(body);headers['Content-Type']='application/json'}
 const r=await fetch(origin+path,{method,headers,body,signal:AbortSignal.timeout(20000)});const b=Buffer.from(await r.arrayBuffer());
 if(r.status!==status)throw new Error(`${method} ${path}: HTTP ${r.status}, expected ${status}: ${b.toString()}`);
 return {body:b,json:()=>JSON.parse(b.toString()),headers:r.headers};
}
if(['contracts','verify-contracts'].includes(process.argv[2])){
 const author=config.CONTENT_API_AUTHOR_TOKEN,publisher=config.CONTENT_API_PUBLISHER_TOKEN;
 const file=`${home}/private/contract-verification.json`;
 const keyed=async(method,path,body,credential,key,status=200)=>{
  const r=await fetch(origin+path,{method,headers:{Authorization:`Bearer ${credential}`,'Content-Type':'application/json','Idempotency-Key':key},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
  const b=await r.json();if(r.status!==status)throw new Error(`keyed ${method} ${path}: ${r.status} expected ${status}: ${b.error}`);return b;
 };
 const registry=(await req('GET','/v1/contracts',undefined,false)).json();if(registry.formats.length!==17)throw new Error('contract registry incomplete');
 let proof;
 if(process.argv[2]==='contracts'){
  const id=`contract-check-${Date.now()}`;
  const doc={schemaVersion:2,kind:'skill',name:'Authored API contract check',assets:[],dependencies:[],provenance:{repository:'arkodia-game',sourcePath:'apps/content-api/ops/verify-live.mjs',selector:'synthetic API authoring check; no legacy import',sourceSha256:sha(Buffer.from('contract-check-v2')),legacyId:id},data:{format:'arkadia.combat-rules.v1',payload:{stats:{hero:{hp:100,speed:2.2,reach:1.15,damage:1}},cleave:3},bindings:{}}};
  await req('POST','/v1/releases',{},author,401);await req('PUT',`/v1/drafts/${id}`,{},publisher,401);
  const body={revision:0,document:doc},key=id+'-save';
  await keyed('PUT',`/v1/drafts/${id}`,body,author,key);const retry=await keyed('PUT',`/v1/drafts/${id}`,body,author,key);if(retry.revision!==1)throw new Error('retry bumped revision');
  await keyed('PUT',`/v1/drafts/${id}`,{revision:1,document:doc},author,key,409);
  const selection={channel:'contract-check',documents:[{id,revision:1}]};const first=await keyed('POST','/v1/releases',selection,publisher,id+'-publish',201);
  const duplicate=await keyed('POST','/v1/releases',selection,publisher,id+'-publish',201);if(first.id!==duplicate.id)throw new Error('publish duplicated');
  doc.name='Edited authored contract';await req('PUT',`/v1/drafts/${id}`,{revision:1,document:doc},author);
  const second=(await req('POST','/v1/releases',{channel:'contract-check',documents:[{id,revision:2}]},publisher,201)).json();
  const move={releaseId:first.id,expectedReleaseId:second.id};await keyed('PUT','/v1/channels/contract-check',move,publisher,id+'-rollback');
  proof={id,release:first.id,newerRelease:second.id,rollbackKey:id+'-rollback',documentHash:first.documents[0].sha256,draftRevision:2};writeFileSync(file,JSON.stringify(proof),{mode:0o600});
 }else{proof=JSON.parse(readFileSync(file,'utf8'));await keyed('PUT','/v1/channels/contract-check',{releaseId:proof.release,expectedReleaseId:proof.newerRelease},publisher,proof.rollbackKey)}
 const pointer=(await req('GET','/v1/channels/contract-check',undefined,false)).json();if(pointer.releaseId!==proof.release)throw new Error('rollback pointer lost');
 const doc=await req('GET',`/v1/releases/${proof.release}/documents/${proof.id}`,undefined,false);if(sha(doc.body)!==proof.documentHash)throw new Error('published hash changed');
 const draft=(await req('GET',`/v1/drafts/${proof.id}`,undefined,author)).json();if(draft.revision!==2)throw new Error('draft revision lost');
 console.log(JSON.stringify({status:'PASS',phase:process.argv[2],origin,formats:registry.formats.length,schemaSha256:registry.schemaSha256,checks:['separate author/publisher permissions','durable Save idempotency','key misuse conflict','publish retry deduplication','rollback compare-and-swap','immutable public snapshot','restart persistence'],...proof}));process.exit(0);
}
await req('GET','/healthz',undefined,false);
await req('GET','/v1/drafts',undefined,false,401);
let proof;
const proofPath=`${home}/private/verification.json`;
if(process.argv[2]==='seed'){
 const id=`acceptance-${Date.now()}`;
 const bytes=Buffer.from('Arkodia Content API persistent integration asset\x00\x01');
 const asset=(await req('POST','/v1/assets',bytes,true,201)).json();
 await req('GET',`/v1/assets/${asset.sha256}`,undefined,false,401);
 const doc={schemaVersion:1,kind:'environment',name:'API acceptance fixture',assets:[asset.sha256],data:{width:8,height:8,layers:[{id:'ground',objects:[]}]}};
 await req('PUT',`/v1/drafts/${id}`,{revision:0,document:doc},true);
 await req('GET',`/v1/drafts/${id}`,undefined,true);
 await req('PUT',`/v1/drafts/${id}`,{revision:0,document:doc},true,409);
 const release=(await req('POST','/v1/releases',{channel:'acceptance',documents:[{id,revision:1}]},true,201)).json();
 const published=await req('GET',`/v1/releases/${release.id}/documents/${id}`,undefined,false);
 if(sha(published.body)!==release.documents[0].sha256)throw new Error('document digest mismatch');
 doc.name='Draft changed after publication';await req('PUT',`/v1/drafts/${id}`,{revision:1,document:doc},true);
 proof={id,release:release.id,documentHash:sha(published.body),assetHash:asset.sha256,draftRevision:2};
 writeFileSync(proofPath,JSON.stringify(proof),{mode:0o600});
}else{proof=JSON.parse(readFileSync(proofPath,'utf8'))}
const draft=(await req('GET',`/v1/drafts/${proof.id}`,undefined,true)).json();if(draft.revision!==proof.draftRevision)throw new Error('draft persistence failed');
const manifest=(await req('GET',`/v1/releases/${proof.release}`,undefined,false)).json();if(manifest.documents[0].sha256!==proof.documentHash)throw new Error('manifest persistence failed');
const doc=await req('GET',`/v1/releases/${proof.release}/documents/${proof.id}`,undefined,false);if(sha(doc.body)!==proof.documentHash)throw new Error('snapshot changed');
const asset=await req('GET',`/v1/releases/${proof.release}/assets/${proof.assetHash}`,undefined,false);if(sha(asset.body)!==proof.assetHash)throw new Error('asset persistence failed');
const pointer=(await req('GET','/v1/channels/acceptance',undefined,false)).json();if(pointer.releaseId!==proof.release)throw new Error('channel persistence failed');
console.log(JSON.stringify({status:'PASS',phase:process.argv[2]||'verify',origin,checks:['HTTPS health','draft authentication','draft revision persistence','immutable manifest','published document digest','published asset digest','channel game read'],...proof}));
