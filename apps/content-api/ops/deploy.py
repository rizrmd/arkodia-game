#!/usr/bin/env python3
"""Deploy only to the existing Content API sandbox. Requires Fural CLI and a member HTTP route."""
import argparse,gzip,hashlib,http.server,json,os,pathlib,secrets,shlex,shutil,subprocess,tempfile,threading,time
SANDBOX='CS4cff70216b6c6d7b499790b5'
REPO=pathlib.Path(__file__).resolve().parents[3]
OPS=pathlib.Path(__file__).resolve().parent

def cli(*args):
 p=subprocess.run(['fural-agent',*args],capture_output=True,text=True,stdin=subprocess.DEVNULL,timeout=30)
 if p.returncode:raise RuntimeError(p.stderr or p.stdout)
 return json.loads(p.stdout)

def wait_job(name,deadline=600):
 end=time.monotonic()+deadline
 while time.monotonic()<end:
  process=next((p for p in cli('sandboxes','ps',SANDBOX) if p['name']==name),None)
  if process and not process.get('running'):
   logs=cli('sandboxes','logs',SANDBOX,'--name',name,'--lines','30').get('log','')
   print(logs,flush=True)
   if process.get('exit_code')!=0:raise RuntimeError('Deployment job failed')
   return
  time.sleep(3)
 raise RuntimeError('Deployment job exceeded 600 seconds; inspect logs before retrying')

parser=argparse.ArgumentParser()
parser.add_argument('--member-origin',required=True,help='HTTPS domain routed to this member sandbox on --port')
parser.add_argument('--port',type=int,default=3000)
args=parser.parse_args()
with tempfile.TemporaryDirectory(prefix='content-deploy-') as tmp:
 stage=pathlib.Path(tmp);binary=stage/'content-api'
 go=shutil.which('go') or str(pathlib.Path.home()/'.local/bin/go')
 subprocess.run([go,'build','-p','2','-trimpath','-o',str(binary),'./apps/content-api'],cwd=REPO,env={**os.environ,'CGO_ENABLED':'0','GOMAXPROCS':'2'},check=True,timeout=180)
 binary_sha=hashlib.sha256(binary.read_bytes()).hexdigest()
 with gzip.open(stage/'content-api.gz','wb') as f:f.write(binary.read_bytes())
 binary.unlink()
 for name in ['boot.sh','supervise.mjs','install-postgres.py','verify-live.mjs']:shutil.copyfile(OPS/name,stage/name)
 route=secrets.token_urlsafe(24)
 class Handler(http.server.SimpleHTTPRequestHandler):
  def __init__(self,*a,**kw):super().__init__(*a,directory=str(stage),**kw)
  def do_GET(self):
   if not self.path.startswith('/'+route+'/'):self.send_error(404);return
   self.path=self.path[len(route)+1:];super().do_GET()
  def log_message(self,*a):pass
 server=http.server.ThreadingHTTPServer(('0.0.0.0',args.port),Handler)
 threading.Thread(target=server.serve_forever,daemon=True).start()
 try:
  script='set -eu\nmkdir -p "$HOME/app"\n'
  for path in stage.iterdir():
   url=args.member_origin.rstrip('/')+'/'+route+'/'+path.name
   script+=f'curl -4 --retry 4 --retry-all-errors --connect-timeout 10 --max-time 120 -fsS {shlex.quote(url)} -o "$HOME/app/{path.name}.new"\n'
   script+=f'printf "%s  %s\\n" {hashlib.sha256(path.read_bytes()).hexdigest()} "$HOME/app/{path.name}.new" | sha256sum -c -\n'
   script+=f'mv "$HOME/app/{path.name}.new" "$HOME/app/{path.name}"\n'
  script+='gunzip -f "$HOME/app/content-api.gz"\nchmod 755 "$HOME/app/content-api"\npython3 "$HOME/app/install-postgres.py"\n'
  cli('sandboxes','exec',SANDBOX,'--name','deploy-content-api','--cmd',script)
  wait_job('deploy-content-api')
 finally:server.shutdown()
 cli('sandboxes','update',SANDBOX,'--boot-script','exec sh "$HOME/app/boot.sh"')
 cli('sandboxes','boot',SANDBOX)
 print(json.dumps({'status':'boot_started','binarySha256':binary_sha,'url':'https://content.arkodia.online','note':'Verify HTTPS readiness and live lifecycle before claiming success.'}))
