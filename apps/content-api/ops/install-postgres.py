import urllib.request,tarfile,io,pathlib,subprocess,os
root=pathlib.Path.home()/'.local/content-postgres';root.mkdir(parents=True,exist_ok=True)
base='https://dl-cdn.alpinelinux.org/alpine/v3.23/main/x86_64/'
def fetch(url):
 return subprocess.check_output(['curl','-4','--fail','--silent','--show-error','--retry','2','--connect-timeout','10','--max-time','45',url])
data=fetch(base+'APKINDEX.tar.gz')
with tarfile.open(fileobj=io.BytesIO(data),mode='r:gz') as t: index=t.extractfile('APKINDEX').read().decode()
pkgs={};providers={}
for block in index.split('\n\n'):
 d=dict(l.split(':',1) for l in block.splitlines() if ':' in l)
 if 'P' in d:
  pkgs[d['P']]=d
  for p in d.get('p','').split():providers[p.split('=')[0]]=d['P']
selected={}
def add(n):
 if n in selected:return
 d=pkgs[n];selected[n]=d
 for dep in d.get('D','').split():
  if dep.startswith(('!','/')):continue
  name=dep.split('=')[0].split('>')[0].split('<')[0]
  candidate=providers.get(name,name)
  if candidate in pkgs and candidate not in ('musl','busybox','alpine-baselayout','alpine-baselayout-data'):add(candidate)
add('postgresql18')
for n,d in selected.items():
 mark=root/(n+'.installed')
 if mark.exists():continue
 print('Installing',n,d['V'],flush=True)
 b=fetch(base+n+'-'+d['V']+'.apk')
 with tarfile.open(fileobj=io.BytesIO(b),mode='r:gz') as t:
  for m in t:
   if m.name.startswith(('usr/','lib/')):
    t.extract(m,root,filter='fully_trusted')
 mark.touch()
print('PostgreSQL runtime installed under HOME; packages:',len(selected))
