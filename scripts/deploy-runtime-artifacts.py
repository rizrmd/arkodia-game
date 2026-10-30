#!/usr/bin/env python3
"""Deploy static artifacts using supported Fural bootstrap/exec and checksummed HTTP transfer.
Avoids the routed large-directory transfer which failed with EOF for this 27 MB app.
No host injection, Docker, private REST endpoint, or long-lived member server is used.
"""
import hashlib,http.server,json,pathlib,secrets,shlex,subprocess,threading,time,urllib.parse
ROOT=pathlib.Path(__file__).resolve().parents[1]
SANDBOX_NAME='arkodia-runtime'
PUBLIC_HOSTNAME='runtime.arkodia.online'
PROJECT='PJ8758f22f61165f3d3215e454'
def cli(*args,timeout=120):
 p=subprocess.run(['fural-agent',*args],capture_output=True,text=True,timeout=timeout)
 if p.returncode:raise RuntimeError(p.stderr or p.stdout)
 return json.loads(p.stdout)
# Publish a tiny supervised server, then transfer content to an immutable release.
bootstrap=ROOT/'.deploy-runtime-bootstrap';bootstrap.mkdir(exist_ok=True)
(bootstrap/'server.mjs').write_text((ROOT/'apps/runtime/ops/server.mjs').read_text())
result=cli('sandboxes','serve','--name',SANDBOX_NAME,'--slug',SANDBOX_NAME,'--project',PROJECT,'--dir',str(bootstrap),'--cmd','cd "$HOME"; exec node server.mjs','--port','3000',timeout=150)
print(json.dumps({'bootstrap':result}),flush=True)
sandbox=next(s for s in cli('sandboxes','list') if s['name']==SANDBOX_NAME)
sid=sandbox['id']
public_domains=cli('organization','sandbox-domains','list','--custom-sandbox',sid)
public_domain=next((d for d in public_domains if d['hostname']==PUBLIC_HOSTNAME),None)
if public_domain is None:
 cli('organization','sandbox-domains','add','--hostname',PUBLIC_HOSTNAME,'--port','3000','--custom-sandbox',sid)
elif not public_domain.get('enabled') or public_domain.get('target_port')!=3000:
 cli('organization','sandbox-domains','update',public_domain['id'],'--enabled','true','--port','3000')
who=cli('whoami');domains=cli('organization','sandbox-domains','list','--user',who['user_id'])
transfer_name='arkodia-runtime-transfer-'+who['user_id'].lower()+'-arkodia.fural.space'
transfer=next((d for d in domains if d['hostname']==transfer_name),None)
if transfer is None:transfer=cli('organization','sandbox-domains','add','--hostname',transfer_name,'--port','3192','--user',who['user_id'])
else:cli('organization','sandbox-domains','update',transfer['id'],'--enabled','true','--port','3192')
stage=ROOT/'.deploy-runtime';route=secrets.token_urlsafe(24)
for required in ['dist/index.html']:
 if not (stage/required).is_file():raise RuntimeError('Missing deployment artifact: '+required)
class Handler(http.server.SimpleHTTPRequestHandler):
 def __init__(self,*a,**kw):super().__init__(*a,directory=str(stage),**kw)
 def do_GET(self):
  if not self.path.startswith('/'+route+'/'):self.send_error(404);return
  self.path=self.path[len(route)+1:];super().do_GET()
 def log_message(self,*a):pass
server=http.server.ThreadingHTTPServer(('0.0.0.0',3192),Handler)
threading.Thread(target=server.serve_forever,daemon=True).start()
sha=json.loads((stage/'dist/build.json').read_text())['commit'];release='releases/'+sha
script='set -eu\nmkdir -p '+shlex.quote(release)+'/dist\n'
for path in sorted((stage/'dist').rglob('*')):
 if not path.is_file():continue
 relative=path.relative_to(stage).as_posix();dest=release+'/'+relative
 url=f'https://{transfer_name}/{route}/'+urllib.parse.quote(relative)
 script+='mkdir -p '+shlex.quote(str(pathlib.PurePosixPath(dest).parent))+'\n'
 digest=hashlib.sha256(path.read_bytes()).hexdigest()
 existing=relative
 # Reuse only content verified against this release's checksum. This also
 # resumes an interrupted install without retransferring unchanged artwork.
 script+='if printf "%s  %s\\n" '+digest+' '+shlex.quote(dest)+' | sha256sum -c - >/dev/null 2>&1; then :; elif printf "%s  %s\\n" '+digest+' '+shlex.quote(existing)+' | sha256sum -c - >/dev/null 2>&1; then cp '+shlex.quote(existing)+' '+shlex.quote(dest)+'; else\n'
 script+='curl -fsS --retry 5 --retry-all-errors --retry-delay 1 --connect-timeout 10 --max-time 45 '+shlex.quote(url)+' -o '+shlex.quote(dest)+'\nfi\n'
 script+='printf "%s  %s\\n" '+digest+' '+shlex.quote(dest)+' | sha256sum -c -\n'
script+='test -s '+shlex.quote(release+'/dist/index.html')+'\n'
script+='if [ -d dist ] && [ ! -L dist ]; then mv dist dist.incomplete-'+sha+'; fi\n'
script+='ln -sfn '+shlex.quote(release+'/dist')+' dist.next\nmv -Tf dist.next dist\n'
try:
 probe=subprocess.run(['curl','-fsS','--retry','3','--max-time','20',f'https://{transfer_name}/{route}/dist/build.json'],capture_output=True,text=True)
 if probe.returncode:raise RuntimeError('Transfer route unavailable: '+probe.stderr)
 run=cli('sandboxes','exec',sid,'--name','runtime-install','--cmd',script)
 deadline=time.monotonic()+180
 while time.monotonic()<deadline:
  job=next((p for p in cli('sandboxes','ps',sid) if p['name']=='runtime-install'),None)
  if job and job.get('pid')==run.get('pid') and not job.get('running'):
   log=cli('sandboxes','logs',sid,'--name','runtime-install','--lines','6');print(json.dumps(log),flush=True)
   if job.get('exit_code')!=0:raise RuntimeError('Checksummed runtime install failed')
   break
  time.sleep(2)
 else:raise RuntimeError('Runtime transfer timed out; inspect runtime-install logs')
finally:
 server.shutdown()
 cli('organization','sandbox-domains','update',transfer['id'],'--enabled','false')
url='https://'+PUBLIC_HOSTNAME
# Verify from the public route, not merely the member or custom sandbox process.
p=subprocess.run(['curl','-fsS','--retry','5','--retry-all-errors',url+'/build.json'],capture_output=True,text=True,timeout=60)
if p.returncode:raise RuntimeError(p.stderr)
observed=json.loads(p.stdout)
if observed.get('commit')!=sha:raise RuntimeError('Public build commit does not match release')
print(json.dumps({'url':url,'sandbox_id':sid,'commit':sha,'public_build':observed,'status':'deployed'}),flush=True)
