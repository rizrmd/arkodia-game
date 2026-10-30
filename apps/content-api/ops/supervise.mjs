import {startStorageMonitor} from './storage-monitor.mjs';
// Foreground boot supervisor: exits if the Content API process fails; platform supervises boot.
import {spawn} from 'node:child_process';
import {mkdirSync,existsSync,readFileSync,writeFileSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
const home=process.env.HOME;
startStorageMonitor(home);
const env={...process.env};
for(const dir of ['data','data/assets','private','run']) mkdirSync(`${home}/${dir}`,{recursive:true,mode:0o700});
const envPath=`${home}/private/content.env.json`;
if(!existsSync(envPath)) writeFileSync(envPath,JSON.stringify({CONTENT_API_TOKEN:randomBytes(48).toString('hex')}),{mode:0o600,flag:'wx'});
const privateConfig=JSON.parse(readFileSync(envPath,'utf8'));
let changed=false;
for(const key of ['CONTENT_API_AUTHOR_TOKEN','CONTENT_API_PUBLISHER_TOKEN']){
 if(!privateConfig[key]){privateConfig[key]=randomBytes(48).toString('hex');changed=true;}
}
if(changed) writeFileSync(envPath,JSON.stringify(privateConfig),{mode:0o600});
Object.assign(env,privateConfig);
const children=[];let stopping=false;
function stop(code=0){
 if(stopping)return;stopping=true;
 for(const c of children)c.kill('SIGTERM');
 const timer=setTimeout(()=>{for(const c of children)c.kill('SIGKILL');process.exit(code)},12000);
 timer.unref();
 Promise.all(children.map(c=>c.exitCode!==null?Promise.resolve():new Promise(r=>c.once('exit',r)))).then(()=>process.exit(code));
}
function run(cmd,args,extraEnv={}){
 const c=spawn(cmd,args,{env:{...env,...extraEnv},stdio:'inherit'});
 children.push(c);
 c.on('error',()=>stop(1));
 c.on('exit',(code,signal)=>{if(!stopping){console.error(`Required service exited: ${cmd.split('/').pop()} code=${code} signal=${signal}`);stop(1)}});
 return c;
}
process.on('SIGTERM',()=>stop());
process.on('SIGINT',()=>stop());
const sqlitePath=`${home}/data/content.db`;
run(`${home}/app/content-api`,[],{
 SQLITE_PATH:sqlitePath,
 DATABASE_URL:`sqlite://${sqlitePath}`,
 ASSET_DIR:`${home}/data/assets`,
 PUBLIC_URL:'https://content.arkodia.online',
 LISTEN_ADDR:':3000',
 CORS_ORIGINS:'https://arkodia.online,https://editor.arkodia.online'
});
