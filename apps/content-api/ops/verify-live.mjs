// Run inside the dedicated sandbox. Never prints its editor token.
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const home=process.env.HOME;
const {CONTENT_API_TOKEN:token}=JSON.parse(readFileSync(`${home}/private/content.env.json`,'utf8'));
const origin=process.env.VERIFY_ORIGIN || 'https://content.arkodia.online';
const sha=b=>createHash('sha256').update(b).digest('hex');
async function req(method,path,body,auth,status=200){
 const headers={};if(auth)headers.Authorization=`Bearer ${token}`;
 if(body && !Buffer.isBuffer(body)){body=JSON.stringify(body);headers['Content-Type']='application/json'}
 const r=await fetch(origin+path,{method,headers,body,signal:AbortSignal.timeout(20000)});const b=Buffer.from(await r.arrayBuffer());
 if(r.status!==status)throw new Error(`${method} ${path}: HTTP ${r.status}, expected ${status}: ${b.toString()}`);
 return {body:b,json:()=>JSON.parse(b.toString()),headers:r.headers};
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
