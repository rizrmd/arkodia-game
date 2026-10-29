"""Extract original metadata unchanged and record every source hash; no original files are modified."""
import json,hashlib,pathlib,xml.etree.ElementTree as ET,subprocess,gzip
root=pathlib.Path(__file__).resolve().parents[4]/'arkadia'
public=root/'public'
read=lambda p:json.loads(p.read_text())
prefab=read(root/'src/stronghold/prefabs/stronghold.json')
chars=read(public/'assets/characters/manifest.json')['characters']
manifest=read(public/'assets/choose-hero/manifest.json')
paths=set()
for name in manifest['frames']:paths.add('/assets/choose-hero/@1x/'+name+'.png')
for a in manifest['art'].values():paths.add('/assets/choose-hero/'+a['file'])
for hero in ['rift-runner','ember-warden']:paths.add('/assets/characters/'+chars[hero]['image'])
for n in ['bg-desktop.webp','bg-mobile.webp','logo@1x.png','bar-track@1x.png','bar-fill@1x.png']:paths.add('/typography/v2/loading/'+n)
paths.add('/typography/v2/hero/logo@1x.png')
fonts=[]
for name in ['cinzel-semibold','garamond-medium','garamond-bold']:
 p=public/f'typography/v2/fonts/{name}.fnt';f=ET.parse(p).getroot();info=f.find('info');common=f.find('common');dist=f.find('distanceField')
 data=dict(fontFamily=info.attrib['face'],fontSize=int(info.attrib['size']),lineHeight=int(common.attrib['lineHeight']),baseLineOffset=int(common.attrib['lineHeight'])-int(common.attrib['base']),pages=[dict(id=0,file=name+'.png')],chars={},distanceField=dict(type=dist.attrib['fieldType'],range=float(dist.attrib['distanceRange'])))
 for c in f.findall('chars/char'):
  a=c.attrib;letter=chr(int(a['id']));data['chars'][letter]=dict(id=int(a['id']),letter=letter,page=int(a['page']),x=int(a['x']),y=int(a['y']),width=int(a['width']),height=int(a['height']),xOffset=int(a['xoffset']),yOffset=int(a['yoffset']),xAdvance=int(a['xadvance']),kerning={})
 for k in f.findall('kernings/kerning'):
  a=k.attrib;data['chars'][chr(int(a['second']))]['kerning'][chr(int(a['first']))]=int(a['amount'])
 image=f'/typography/v2/fonts/{name}.png';paths.add(image);fonts.append(dict(data=data,image=image))
# Exact environmentSprites + starterEnclosure formula, original source provenance below.
props=[];origin=prefab['court']['origin'];size=prefab['court']['size']
for p in prefab['props']:
 if p.get('layout')=='legacy' or p['id'] in ['bastion','wall-broken','rampart-ne','rampart-se']:continue
 u,v=p['u'],p['v'];i=p['id'];file=('/modular-stronghold/' if p.get('assetSet')=='v1' else '/modular-stronghold/v2/')+i+'.png'
 props.append(dict(p,id=i,file=file,x=origin['x']+(u-v)*64,y=origin['y']+(u+v)*32,foot=p.get('foot',.97),vertical=p.get('vertical',1),shear=p.get('shear',0),depth=p.get('depth',origin['y']+(u+v)*32),layer='ground' if i in ['snowdrift-edge','weeds-edge','paving-worn'] else 'world'))
import math
contacts={'straight-ne-a':(416,48,207,350,86),'straight-ne-b':(384,45,210,349,90),'straight-se-a':(416,46,88,350,210),'straight-se-b':(384,43,91,345,213)}
for front in [False,True]:
 for axis in ['ne','se']:
  length=size*64-(120 if front else 0);count=math.ceil(length/240);span=length/count
  for i in range(count):
   distance=(i+.5)*span;sign=1 if axis=='se' else -1;x=origin['x']+sign*(size*64-distance if front else distance);y=origin['y']+(size*32+distance*(453/840) if front else distance*.5)
   direction=('se' if axis=='ne' else 'ne') if front else axis;name='straight-'+direction+('-b' if i%3==1 else '-a');width,ax,ay,bx,by=contacts[name];scale=span/(bx-ax);vertical=.75;slope=(-1 if direction=='ne' else 1)*(453/840 if front else .5);shear=slope-vertical*(by-ay)/(bx-ax);offset=((ax+bx)/2-width/2)*scale
   props.append(dict(id='rampart-'+direction,file='/buildings/starter-boundary/'+name+'.png',x=x-offset,y=y-shear*offset,width=width*scale,foot=(ay+by)/2/256,vertical=vertical,shear=shear,depth=y,layer='world'))
for p in props:paths.add(p['file'])
for p in ['/buildings/starting-campfire/campfire-v1.png','/buildings/starter-boundary/gate-closed.png','/buildings/starter-boundary/gate-sheet.png','/modular-stronghold/v2/snow-soft-texture.png','/modular-stronghold/v2/paving-warm-texture.png']:paths.add(p)
packed=json.loads(gzip.decompress((public/'vfx/skills.bin').read_bytes()))
fx={p:v for p,v in packed['effects'].items() if p.startswith('effects/ui/')}
fxmanifest=dict(packed['manifest']);fxmanifest['effects']=[e for e in fxmanifest['effects'] if e['path'] in fx]
for a in fxmanifest['assets']:
 if a['type']=='texture':paths.add('/vfx/'+a['path'])
paths.add('/realistic-torch/frame-3.webp')
for n in ['thumbstick-cap','thumbstick-ring']:paths.add('/typography/v2/hud/@1x/'+n+'.png')
paths={p:hashlib.sha256((public/p.lstrip('/')).read_bytes()).hexdigest() for p in sorted(paths)}
sourcePaths=['src/stronghold/prefabs/stronghold.json','src/stronghold/terrain.ts','src/stronghold/starter-enclosure.ts','src/stronghold/starting-campfire.ts','src/stronghold/hero.ts','src/stronghold/controls.ts','src/stronghold/world-view.ts','public/coop/nav.json','public/assets/characters/manifest.json','public/assets/choose-hero/manifest.json','public/vfx/skills.bin','src/world/maps/arkodia-01.json','public/buildings/starter-boundary/gate-sheet.json']
result=dict(sourceCommit=subprocess.check_output(['git','-C',str(root),'rev-parse','HEAD'],text=True).strip(),sources={p:hashlib.sha256((root/p).read_bytes()).hexdigest() for p in sourcePaths},paths=paths,prefab=prefab,characters={h:chars[h] for h in ['rift-runner','ember-warden']},ui={'/vfx/skills.json':dict(manifest=fxmanifest,effects=fx),'/world/map.json':read(root/'src/world/maps/arkodia-01.json'),'/buildings/starter-boundary/gate-sheet.json':read(public/'buildings/starter-boundary/gate-sheet.json'),'/assets/choose-hero/manifest.json':manifest,'/assets/choose-hero/labels.en.json':read(public/'assets/choose-hero/labels.en.json')},fonts=fonts,props=props,nav=read(public/'coop/nav.json'))
out=pathlib.Path(__file__).resolve().parents[3]/'docs/runtime/stronghold/source.json';out.write_text(json.dumps(result,separators=(',',':')));print(f'{len(paths)} original assets; metadata {out.stat().st_size} bytes')
