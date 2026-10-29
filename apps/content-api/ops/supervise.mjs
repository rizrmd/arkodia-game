import {startStorageMonitor} from './storage-monitor.mjs';
// Foreground boot supervisor: exits if either required child fails; platform supervises boot.
import {spawn} from 'node:child_process';
import {mkdirSync,existsSync,readFileSync,writeFileSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
const home=process.env.HOME;
startStorageMonitor(home);
const root=`${home}/.local/content-postgres`;
const pg=`${root}/usr/libexec/postgresql18`;
const env={...process.env,LD_LIBRARY_PATH:`${root}/usr/lib`};
for(const dir of ['data','data/assets','private','run']) mkdirSync(`${home}/${dir}`,{recursive:true,mode:0o700});
const envPath=`${home}/private/content.env.json`;
if(!existsSync(envPath)) writeFileSync(envPath,JSON.stringify({CONTENT_API_TOKEN:randomBytes(48).toString('hex')}),{mode:0o600,flag:'wx'});
const privateConfig=JSON.parse(readFileSync(envPath,'utf8'));
let changed=false;for(const key of ['CONTENT_API_AUTHOR_TOKEN','CONTENT_API_PUBLISHER_TOKEN'])if(!privateConfig[key]){privateConfig[key]=randomBytes(48).toString('hex');changed=true;}
if(changed)writeFileSync(envPath,JSON.stringify(privateConfig),{mode:0o600});
Object.assign(env,privateConfig);
if(!existsSync(`${home}/data/postgres/PG_VERSION`)) {
 const init=spawn(`${pg}/initdb`,['-D',`${home}/data/postgres`,'--username=content','--auth-local=trust','--auth-host=trust','--no-locale','-E','UTF8'],{env,stdio:'inherit'});
 await new Promise((resolve,reject)=>{init.on('error',reject);init.on('exit',code=>code===0?resolve():reject(new Error(`initdb exited ${code}`)));});
}
const children=[];let stopping=false;
function stop(code=0){if(stopping)return;stopping=true;for(const c of children)c.kill('SIGTERM');const timer=setTimeout(()=>{for(const c of children)c.kill('SIGKILL');process.exit(code)},12000);timer.unref();Promise.all(children.map(c=>c.exitCode!==null?Promise.resolve():new Promise(r=>c.once('exit',r)))).then(()=>process.exit(code));}
function run(cmd,args,extraEnv={}){const c=spawn(cmd,args,{env:{...env,...extraEnv},stdio:'inherit'});children.push(c);c.on('error',()=>stop(1));c.on('exit',(code,signal)=>{if(!stopping){console.error(`Required service exited: ${cmd.split('/').pop()} code=${code} signal=${signal}`);stop(1)}});return c;}
process.on('SIGTERM',()=>stop());process.on('SIGINT',()=>stop());
run(`${pg}/postgres`,['-D',`${home}/data/postgres`,'-h','127.0.0.1','-p','5432','-k',`${home}/run`,'-c','shared_buffers=32MB','-c','max_connections=20','-c','unix_socket_permissions=0700']);
for(let i=0;i<60;i++) {
 const ready=spawn(`${pg}/pg_isready`,['-h','127.0.0.1','-p','5432','-U','content','-d','postgres'],{env,stdio:'ignore'});
 const code=await new Promise((resolve,reject)=>{ready.on('error',reject);ready.on('exit',resolve)});
 if(code===0)break;if(i===59){stop(1);throw new Error('PostgreSQL readiness timeout')};await new Promise(r=>setTimeout(r,500));
}
run(`${home}/app/content-api`,[],{DATABASE_URL:'postgres://content@127.0.0.1:5432/postgres?sslmode=disable',ASSET_DIR:`${home}/data/assets`,PUBLIC_URL:'https://content.arkodia.online',LISTEN_ADDR:':3000',CORS_ORIGINS:'https://arkodia.online,https://editor.arkodia.online'});
