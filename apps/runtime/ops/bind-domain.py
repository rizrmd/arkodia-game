#!/usr/bin/env python3
"""Idempotent runtime-only DNS setup. Never changes apex, editor or Content API records."""
import json, os, urllib.request, urllib.parse, subprocess
host = 'runtime.arkodia.online'
target = 'arkodia-runtime-arkodia.fural.space'
sandbox = 'CSf41a869d5150ba8d8c7cc935'

def cf(path, method='GET', body=None):
    req = urllib.request.Request('https://api.cloudflare.com/client/v4/' + path,
        data=json.dumps(body).encode() if body is not None else None,
        headers={'Authorization': 'Bearer ' + os.environ['CLOUDFLARE_TOKEN'], 'Content-Type': 'application/json'}, method=method)
    with urllib.request.urlopen(req, timeout=30) as response:
        result = json.load(response)
    if not result.get('success'):
        raise RuntimeError('Cloudflare operation failed')
    return result['result']

zones = cf('zones?name=arkodia.online')
if len(zones) != 1:
    raise RuntimeError('Expected one authorized arkodia.online zone')
zone = zones[0]['id']
records = cf(f'zones/{zone}/dns_records?name={host}')
if records:
    if len(records) != 1 or records[0]['type'] != 'CNAME' or records[0]['content'].rstrip('.') != target:
        raise RuntimeError('Existing runtime DNS differs; refusing to replace it')
else:
    cf(f'zones/{zone}/dns_records', 'POST', {'type': 'CNAME', 'name': host, 'content': target, 'proxied': True, 'ttl': 1})
domains = json.loads(subprocess.check_output(['fural-agent', 'organization', 'sandbox-domains', 'list', '--custom-sandbox', sandbox]))
if not any(d['hostname'] == host for d in domains):
    subprocess.run(['fural-agent', 'organization', 'sandbox-domains', 'add', '--hostname', host, '--port', '3000', '--custom-sandbox', sandbox], check=True, stdout=subprocess.DEVNULL)
print(json.dumps({'hostname': host, 'target': target, 'sandbox': sandbox, 'note': 'Configured; verify HTTPS independently before claiming live.'}))
