#!/usr/bin/env python3
"""Arkodia asset storage v1. Python standard library only; no credentials in locks."""
import argparse
import contextlib
import fnmatch
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
import urllib.parse

MIB = 1024 * 1024
BINARY = {'.png', '.jpg', '.jpeg', '.webp', '.gif', '.ico', '.avif', '.glb', '.bin',
          '.zip', '.gz', '.tgz', '.webm', '.mp4', '.mov', '.mp3', '.wav', '.ogg',
          '.woff', '.woff2', '.ttf', '.otf', '.pdf', '.psd', '.blend', '.hip', '.hiplc', '.hipnc', '.exr'}
GENERATED = {'node_modules', 'dist', '.publish', '.deploy', '__pycache__', '.asset-cache', '.sprite-work'}
HASH = re.compile(r'^[a-f0-9]{64}$')
LFS = re.compile(rb'version https://git-lfs.github.com/spec/v1\noid sha256:([a-f0-9]{64})\nsize ([0-9]+)\n?')

class AssetError(Exception):
    pass

def git(root, *args):
    return subprocess.check_output(['git', '-C', str(root), *args])

def safe_path(root, relative):
    p = PurePosixPath(relative)
    if not relative or p.is_absolute() or '..' in p.parts or '\\' in relative or any(x in p.parts for x in ['.git']):
        raise AssetError('Unsafe asset path: ' + relative)
    dest = root.joinpath(*p.parts)
    if not dest.resolve().is_relative_to(root.resolve()):
        raise AssetError('Asset path escapes root: ' + relative)
    return dest

def digest(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for block in iter(lambda: f.read(MIB), b''):
            h.update(block)
    return h.hexdigest()

def verified(path, entry):
    return path.is_file() and not path.is_symlink() and path.stat().st_size == entry['size'] and digest(path) == entry['sha256']

def atomic_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, name = tempfile.mkstemp(dir=path.parent, prefix='.json-')
    try:
        with os.fdopen(fd, 'w') as f:
            json.dump(value, f, indent=2, sort_keys=True)
            f.write('\n')
            f.flush()
            os.fsync(f.fileno())
        os.replace(name, path)
    finally:
        Path(name).unlink(missing_ok=True)

def copy_verified(stream, dest, entry):
    dest.parent.mkdir(parents=True, exist_ok=True)
    fd, name = tempfile.mkstemp(dir=dest.parent, prefix='.asset-')
    try:
        h = hashlib.sha256()
        size = 0
        with os.fdopen(fd, 'wb') as f:
            while True:
                block = stream.read(min(MIB, entry['size'] - size + 1))
                if not block:
                    break
                size += len(block)
                if size > entry['size']:
                    raise AssetError('Asset exceeds declared size')
                h.update(block)
                f.write(block)
            f.flush()
            os.fsync(f.fileno())
        if size != entry['size'] or h.hexdigest() != entry['sha256']:
            raise AssetError('Asset size/checksum mismatch: ' + entry['path'])
        os.replace(name, dest)
    finally:
        Path(name).unlink(missing_ok=True)

def entries(root, ref='HEAD'):
    out = []
    for item in git(root, 'ls-tree', '-rzl', ref).split(b'\0'):
        if not item:
            continue
        meta, name = item.split(b'\t', 1)
        mode, kind, oid, size = meta.split()
        if kind == b'blob':
            out.append({'path': name.decode(), 'oid': oid.decode(), 'size': int(size), 'mode': mode.decode()})
    return out

class Blobs:
    def __init__(self, root):
        self.proc = subprocess.Popen(['git', '-C', str(root), 'cat-file', '--batch'], stdin=subprocess.PIPE, stdout=subprocess.PIPE)
    def __enter__(self):
        return self
    def read(self, oid):
        self.proc.stdin.write((oid + '\n').encode())
        self.proc.stdin.flush()
        header = self.proc.stdout.readline().split()
        if len(header) != 3 or header[1] != b'blob':
            raise AssetError('Missing Git blob ' + oid)
        size = int(header[2])
        data = self.proc.stdout.read(size)
        if len(data) != size or self.proc.stdout.read(1) != b'\n':
            raise AssetError('Truncated Git object')
        return data
    def __exit__(self, *args):
        self.proc.stdin.close()
        self.proc.stdout.close()
        self.proc.wait()

def binary(path, data):
    if Path(path).suffix.lower() in BINARY:
        return True
    try:
        data[:8192].decode('utf-8')
        return b'\0' in data[:8192]
    except UnicodeDecodeError:
        return True

def origin_ok(origin):
    p = urllib.parse.urlsplit(origin)
    if p.scheme != 'https' or not p.netloc or p.username or p.password or p.query or p.fragment or p.path not in ('', '/'):
        raise AssetError('Content origin must be an HTTPS origin without credentials or path')
    return origin.rstrip('/')

def save_lock(path, lock):
    lock = dict(lock)
    rows = lock.pop('assets')
    shards = []
    for i in range(0, len(rows), 500):
        relative = 'asset-lock/part-' + str(i // 500).zfill(3) + '.json'
        dest = safe_path(path.parent, relative)
        atomic_json(dest, {'assets': rows[i:i+500]})
        shards.append({'path': relative, 'sha256': digest(dest)})
    lock['shards'] = shards
    atomic_json(path, lock)


def load_lock(path):
    lock = json.loads(path.read_text())
    if 'shards' in lock:
        lock['assets'] = []
        for shard in lock.pop('shards'):
            dest = safe_path(path.parent, shard['path'])
            if not HASH.fullmatch(shard['sha256']) or digest(dest) != shard['sha256']:
                raise AssetError('Manifest shard checksum mismatch')
            lock['assets'].extend(json.loads(dest.read_text())['assets'])
    if lock.get('schemaVersion') != 1 or not isinstance(lock.get('assets'), list):
        raise AssetError('Unsupported asset lock')
    seen = set()
    for e in lock['assets']:
        safe_path(Path('/tmp/asset-validation'), e['path'])
        if e['path'] in seen or not HASH.fullmatch(e['sha256']) or type(e['size']) is not int or e['size'] <= 0:
            raise AssetError('Invalid/duplicate asset entry')
        seen.add(e['path'])
        s = e['source']
        if s['type'] == 'content':
            origin_ok(s['origin'])
            if not re.fullmatch(r'[A-Za-z0-9_-]{1,100}', s['releaseId']):
                raise AssetError('Invalid release ID')
        elif s['type'] != 'archive':
            raise AssetError('Unknown asset source')
    return lock

def selected(lock, patterns):
    chosen = [e for e in lock['assets'] if not patterns or any(fnmatch.fnmatchcase(e['path'], p) for p in patterns)]
    if patterns and not chosen:
        raise AssetError('No matching assets')
    return chosen

def capacity(path):
    while not path.exists():
        path = path.parent
    v = shutil.disk_usage(path)
    used = v.used / v.total
    return {'total': v.total, 'used': v.used, 'free': v.free, 'percent': round(100 * used, 2),
            'status': 'stop' if used >= .8 else 'warning' if used >= .7 else 'ok'}

def import_guard(path, size):
    c = capacity(path)
    if c['status'] == 'stop' or c['free'] < size * 2 + 64 * MIB:
        raise AssetError('Storage import stopped: disk >=80% or insufficient staging reserve')

def push_archive(args):
    """Capture tracked binaries without touching the index or working source."""
    root, archive = args.root, args.archive
    archive.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(archive, 0o700)
    media = None
    existing = {'schemaVersion': 1, 'repository': Path(git(root, 'remote', 'get-url', 'origin').decode().strip()).stem if git(root, 'remote').strip() else root.name, 'sourceCommit': git(root, 'rev-parse', 'HEAD').decode().strip(), 'assets': []}
    with Blobs(root) as blobs:
        for e in entries(root):
            data = blobs.read(e['oid'])
            if not binary(e['path'], data) and not LFS.fullmatch(data):
                continue
            if e['mode'] != '100644' and e['mode'] != '100755':
                raise AssetError('Unsupported asset mode: ' + e['path'])
            ptr = LFS.fullmatch(data)
            if ptr:
                local = safe_path(root, e['path'])
                expected = {'path': e['path'], 'size': int(ptr[2]), 'sha256': ptr[1].decode()}
                if not verified(local, expected):
                    try:
                        if media is None:
                            env = git(root, 'lfs', 'env').decode().splitlines()
                            media = Path(next(line.split('=', 1)[1] for line in env if line.startswith('LocalMediaDir=')))
                        sha = expected['sha256']
                        local = media / sha[:2] / sha[2:4] / sha
                    except subprocess.CalledProcessError:
                        raise AssetError('Hydrate LFS first: git lfs pull --include=' + e['path']) from None
                    if not verified(local, expected):
                        raise AssetError('Missing/corrupt LFS bytes; git lfs pull --include=' + e['path'])
                sha, size = expected['sha256'], expected['size']
            else:
                sha, size = hashlib.sha256(data).hexdigest(), len(data)
            role = 'runtime' if e['path'].startswith(('public/', 'apps/runtime/public/')) and Path(e['path']).suffix.lower() not in {'.zip', '.webm', '.mp4'} else 'evidence' if e['path'].startswith(('docs/', 'artifacts/')) else 'source'
            row = {'path': e['path'], 'sha256': sha, 'size': size, 'role': role, 'source': {'type': 'archive'}}
            dest = archive / 'objects' / sha
            if not verified(dest, row):
                import_guard(archive, size)
                if ptr:
                    with local.open('rb') as src:
                        copy_verified(src, dest, row)
                else:
                    import io
                    copy_verified(io.BytesIO(data), dest, row)
            existing['assets'].append(row)
    save_lock(args.lock, existing)
    save_lock(archive / 'indexes' / (root.name + '-' + existing['sourceCommit']) / 'assets.lock.json', existing)
    return {'assets': len(existing['assets']), 'logicalBytes': sum(e['size'] for e in existing['assets']), 'lock': str(args.lock), 'archive': str(archive), 'sourceFilesRemoved': 0}

# Do not forward tokens to redirects, including cross-origin redirects.
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None

def http(origin, route, method='GET', body=None, token=None):
    headers = {'User-Agent': 'ArkodiaAssetOperator/1.0'}
    if token:
        headers['Authorization'] = 'Bearer ' + token
    if isinstance(body, dict):
        body = json.dumps(body).encode()
        headers['Content-Type'] = 'application/json'
    req = urllib.request.Request(origin_ok(origin) + route, data=body, method=method, headers=headers)
    return urllib.request.build_opener(NoRedirect()).open(req, timeout=60)

def publish(args):
    """Publish runtime assets via the existing author/publisher API, then verify."""
    lock = load_lock(args.lock)
    config = json.loads(args.token_file.read_text())
    origin = origin_ok(args.origin)
    author, publisher = config['CONTENT_API_AUTHOR_TOKEN'], config['CONTENT_API_PUBLISHER_TOKEN']
    rows = selected(lock, args.pattern)
    if any(e['role'] != 'runtime' or e['size'] > 16 * MIB for e in rows):
        raise AssetError('Publish accepts runtime assets <=16 MiB only; select --pattern')
    assets = {}
    for e in rows:
        p = args.archive / 'objects' / e['sha256']
        if not verified(p, e):
            raise AssetError('Restore archive before publishing: ' + e['path'])
        if e['sha256'] not in assets:
            with http(origin, '/v1/assets', 'POST', p.read_bytes(), author) as r:
                a = json.load(r)
            if a['sha256'] != e['sha256'] or a['size'] != e['size']:
                raise AssetError('Upload integrity mismatch')
            assets[e['sha256']] = a
    hashes = sorted(assets)
    group_id = hashlib.sha256(json.dumps(hashes).encode()).hexdigest()[:20]
    selections = []
    for i in range(0, len(hashes), 500):
        ident = 'storage-' + group_id + '-' + str(i // 500)
        doc = {'schemaVersion': 1, 'kind': 'environment', 'name': ident, 'assets': hashes[i:i+500], 'data': {'width': 1, 'height': 1, 'layers': [{'id': 'assets', 'objects': []}]}}
        try:
            with http(origin, '/v1/drafts/' + ident, token=author) as r:
                revision = json.load(r)['revision']
        except urllib.error.HTTPError as e:
            if e.code != 404:
                raise
            revision = 0
        with http(origin, '/v1/drafts/' + ident, 'PUT', {'revision': revision, 'document': doc}, author) as r:
            saved = json.load(r)
        selections.append({'id': ident, 'revision': saved['revision']})
    if not selections:
        raise AssetError('No runtime assets selected')
    with http(origin, '/v1/releases', 'POST', {'channel': args.channel, 'documents': selections}, publisher) as r:
        release = json.load(r)
    for sha, a in assets.items():
        e = next(e for e in rows if e['sha256'] == sha)
        with http(origin, '/v1/releases/' + release['id'] + '/assets/' + sha) as stream:
            with tempfile.TemporaryDirectory() as td:
                copy_verified(stream, Path(td) / sha, e)
    for e in rows:
        e['source'] = {'type': 'content', 'origin': origin, 'releaseId': release['id']}
    save_lock(args.lock, lock)
    return {'releaseId': release['id'], 'verifiedAssets': len(assets), 'channel': args.channel}

@contextlib.contextmanager
def cache_lock(cache):
    import fcntl
    cache.mkdir(parents=True, exist_ok=True)
    with (cache / '.lock').open('a') as f:
        fcntl.flock(f, fcntl.LOCK_EX)
        yield

def cache_prune(cache, limit, pinned, dry):
    files = [p for p in (cache / 'objects').glob('*') if HASH.fullmatch(p.name) and p.is_file() and not p.is_symlink()]
    total = sum(p.stat().st_size for p in files)
    removed = []
    for p in sorted(files, key=lambda p: p.stat().st_mtime):
        if total <= limit:
            break
        if p.name in pinned:
            continue
        total -= p.stat().st_size
        removed.append(p.name)
        if not dry:
            p.unlink()
    return {'removed': removed, 'remainingBytes': total, 'overBudget': total > limit, 'dryRun': dry}

def pull(args):
    lock = load_lock(args.lock)
    rows = selected(lock, args.pattern)
    with cache_lock(args.cache):
        for e in rows:
            dest = safe_path(args.root, e['path'])
            if verified(dest, e):
                continue
            if dest.exists():
                raise AssetError('Refusing to overwrite modified file: ' + e['path'])
            cached = args.cache / 'objects' / e['sha256']
            if not verified(cached, e):
                cached.unlink(missing_ok=True)
                if e['source']['type'] == 'archive':
                    src = args.archive / 'objects' / e['sha256']
                    if not verified(src, e):
                        raise AssetError('Missing/corrupt private archive object; restore archive or configure ARKODIA_ASSET_ARCHIVE: ' + e['path'])
                    with src.open('rb') as stream:
                        copy_verified(stream, cached, e)
                else:
                    s = e['source']
                    try:
                        with http(s['origin'], '/v1/releases/' + s['releaseId'] + '/assets/' + e['sha256']) as stream:
                            copy_verified(stream, cached, e)
                    except (OSError, urllib.error.URLError) as error:
                        raise AssetError('Asset unavailable; retry assets pull after restoring Content API: ' + e['path']) from error
            os.utime(cached, None)
            with cached.open('rb') as stream:
                copy_verified(stream, dest, e)
        pruned = cache_prune(args.cache, args.cache_bytes, set(), False)
    return {'materialized': len(rows), 'cache': pruned}

def verify(args):
    lock = load_lock(args.lock)
    rows = selected(lock, args.pattern)
    failures = []
    for e in rows:
        path = args.archive / 'objects' / e['sha256'] if args.archive_only else safe_path(args.root, e['path'])
        if not verified(path, e):
            failures.append(e['path'])
    if failures:
        raise AssetError('Missing/corrupt assets: ' + ', '.join(failures[:20]))
    return {'verified': len(rows), 'archiveOnly': args.archive_only}

def audit(args):
    tree = entries(args.root)
    totals = {}
    restrictions = []
    counts = {}
    seen = {}
    with Blobs(args.root) as blobs:
        for e in tree:
            totals[e['path'].split('/')[0]] = totals.get(e['path'].split('/')[0], 0) + e['size']
            data = blobs.read(e['oid'])
            ptr = LFS.fullmatch(data)
            if binary(e['path'], data) or e['size'] > MIB or ptr:
                sha = ptr[1].decode() if ptr else hashlib.sha256(data).hexdigest()
                size = int(ptr[2]) if ptr else e['size']
                row = {'path': e['path'], 'sha256': sha, 'size': size, 'gitOid': e['oid'], 'lfs': bool(ptr)}
                restrictions.append(row)
                counts[e['path'].split('/')[0]] = counts.get(e['path'].split('/')[0], 0) + size
                seen.setdefault(sha, {'size': size, 'paths': []})['paths'].append(e['path'])
    value = {'schemaVersion': 1, 'sourceCommit': git(args.root, 'rev-parse', 'HEAD').decode().strip(), 'trackedBytes': sum(totals.values()), 'byDirectory': totals, 'binaryLogicalBytesByDirectory': counts, 'uniqueBinaryBytes': sum(v['size'] for v in seen.values()), 'duplicateBytes': sum(v['size'] * (len(v['paths']) - 1) for v in seen.values()), 'duplicates': [v for v in seen.values() if len(v['paths']) > 1], 'gitObjects': git(args.root, 'count-objects', '-vH').decode(), 'capacity': capacity(args.archive)}
    if args.baseline:
        parts = []
        for i in range(0, len(restrictions), 500):
            relative = '.asset-policy/legacy-' + str(i // 500).zfill(3) + '.json'
            dest = args.root / relative
            atomic_json(dest, restrictions[i:i+500])
            parts.append({'path': relative, 'sha256': digest(dest)})
        atomic_json(args.root / '.asset-policy.json', {'schemaVersion': 1, 'baselineCommit': value['sourceCommit'], 'legacyShards': parts, 'fixtures': []})
    if args.output:
        atomic_json(args.output, value)
    return value

def guard(args):
    # Base policy is immutable for this check: a PR cannot bless its own binaries.
    policy = json.loads(git(args.root, 'show', args.base + ':.asset-policy.json'))
    policy['legacy'] = policy.get('legacy', [])
    for shard in policy.get('legacyShards', []):
        safe_path(args.root, shard['path'])
        raw = git(args.root, 'show', args.base + ':' + shard['path'])
        if hashlib.sha256(raw).hexdigest() != shard['sha256']:
            raise AssetError('Policy shard integrity mismatch')
        policy['legacy'].extend(json.loads(raw))
    present = {e['path'] for e in entries(args.root, args.base)}
    legacy = {(e['path'], e['gitOid']) for e in policy['legacy'] if e['path'] in present}
    fixtures = {(e['path'], e['sha256']) for e in policy.get('fixtures', []) if e['size'] <= 256 * 1024}
    commits = git(args.root, 'rev-list', '--reverse', args.base + '..' + args.head).decode().splitlines()
    failures = []
    with Blobs(args.root) as blobs:
        for commit in commits:
            # Compare merge trees with every parent; first-parent diff alone misses blobs.
            parents = git(args.root, 'show', '-s', '--format=%P', commit).decode().split()
            for parent in parents:
                changes = git(args.root, 'diff-tree', '--no-commit-id', '--no-renames', '-r', '--diff-filter=ACM', '--name-only', '-z', parent, commit).split(b'\0')
                changed = {p.decode() for p in changes if p}
                for e in entries(args.root, commit):
                    if e['path'] not in changed:
                        continue
                    if any(part in GENERATED or part.startswith('dist-') for part in PurePosixPath(e['path']).parts):
                        failures.append(commit[:8] + ': generated directory ' + e['path'])
                        continue
                    data = blobs.read(e['oid'])
                    ptr = LFS.fullmatch(data)
                    if (e['path'], e['oid']) in legacy:
                        continue
                    # Existing binaries may become LFS pointers with identical bytes only.
                    if ptr and e['path'] in present and any(p['path'] == e['path'] and p['sha256'] == ptr[1].decode() and p['size'] == int(ptr[2]) for p in policy['legacy']):
                        continue
                    if binary(e['path'], data) or ptr:
                        if len(data) <= 256 * 1024 and (e['path'], hashlib.sha256(data).hexdigest()) in fixtures:
                            continue
                        failures.append(commit[:8] + ': binary must use asset storage ' + e['path'])
                    elif e['size'] > MIB:
                        failures.append(commit[:8] + ': file exceeds 1 MiB ' + e['path'])
    if failures:
        raise AssetError('\n'.join(sorted(set(failures))))
    return {'checkedCommits': len(commits), 'status': 'pass'}

def directory_bytes(root):
    total = 0
    if root.exists():
        for base, dirs, files in os.walk(root, followlinks=False):
            dirs[:] = [d for d in dirs if not (Path(base) / d).is_symlink()]
            for f in files:
                p = Path(base) / f
                if p.is_file() and not p.is_symlink():
                    total += p.stat().st_size
    return total

def report(args):
    roots = args.repo or [args.root]
    repos = []
    for root in roots:
        repos.append({'repository': root.name, 'commit': git(root, 'rev-parse', 'HEAD').decode().strip(), 'treeBytes': sum(e['size'] for e in entries(root)), 'objects': git(root, 'count-objects', '-vH').decode()})
    report = {'schemaVersion': 1, 'at': int(time.time()), 'repositories': repos, 'capacity': capacity(args.archive), 'archiveBytes': directory_bytes(args.archive), 'cacheBytes': directory_bytes(args.cache), 'backupBytes': directory_bytes(Path.home() / 'backups'), 'stagingBytes': directory_bytes(Path.home() / 'releases/arkodia-layers'), 'publishedObjectsDeleted': 0}
    if args.output:
        previous = json.loads(args.output.read_text()) if args.output.exists() else None
        report['archiveGrowthBytes'] = report['archiveBytes'] - previous['archiveBytes'] if previous else None
        atomic_json(args.output, report)
    return report

def prune(args):
    pinned = set()
    for lock in args.pin_lock:
        pinned.update(e['sha256'] for e in load_lock(lock)['assets'])
    with cache_lock(args.cache):
        result = cache_prune(args.cache, args.cache_bytes, pinned, not args.apply)
    # Delete only tool-owned staging files, never an arbitrary deploy directory.
    staging = getattr(args, 'staging', Path.home() / 'releases/arkodia-layers')
    stale = [p for p in staging.glob('*') if re.fullmatch(r'[A-Za-z0-9_-]+-[a-f0-9]{12}-[0-9]+\.part', p.name) and p.is_file() and not p.is_symlink() and p.stat().st_mtime < time.time() - 7 * 86400]
    result['staleStagingFiles'] = [p.name for p in stale]
    if args.apply:
        for p in stale:
            p.unlink()
    result['publishedObjectsDeleted'] = 0
    result['archiveObjectsDeleted'] = 0
    return result

def parser():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--root', type=Path, default=Path.cwd())
    p.add_argument('--archive', type=Path, default=Path(os.environ.get('ARKODIA_ASSET_ARCHIVE', str(Path.home() / '.local/share/arkodia-assets/archive'))))
    p.add_argument('--cache', type=Path, default=Path(os.environ.get('ARKODIA_ASSET_CACHE', str(Path.home() / '.cache/arkodia-assets'))))
    p.add_argument('--lock', type=Path)
    p.add_argument('--cache-bytes', type=int, default=2 * 1024**3)
    p.add_argument('--staging', type=Path, default=Path.home() / 'releases/arkodia-layers')
    s = p.add_subparsers(dest='command', required=True)
    a = s.add_parser('audit'); a.add_argument('--baseline', action='store_true'); a.add_argument('--output', type=Path)
    s.add_parser('push')
    a = s.add_parser('publish'); a.add_argument('--origin', required=True); a.add_argument('--token-file', type=Path, required=True); a.add_argument('--channel', required=True); a.add_argument('--pattern', action='append', default=[])
    a = s.add_parser('pull'); a.add_argument('--pattern', action='append', default=[])
    a = s.add_parser('verify'); a.add_argument('--pattern', action='append', default=[]); a.add_argument('--archive-only', action='store_true')
    a = s.add_parser('guard'); a.add_argument('--base', required=True); a.add_argument('--head', default='HEAD')
    a = s.add_parser('prune'); g = a.add_mutually_exclusive_group(); g.add_argument('--apply', action='store_true'); g.add_argument('--dry-run', action='store_true'); a.add_argument('--pin-lock', type=Path, action='append', default=[])
    a = s.add_parser('report'); a.add_argument('--repo', type=Path, action='append'); a.add_argument('--output', type=Path)
    return p

def main():
    args = parser().parse_args()
    args.root = args.root.resolve()
    args.archive = args.archive.expanduser().resolve()
    args.cache = args.cache.expanduser().resolve()
    args.lock = (args.lock or args.root / 'assets.lock.json').resolve()
    if args.cache_bytes < 0:
        raise AssetError('Cache budget cannot be negative')
    commands = {'push': push_archive, 'publish': publish, 'pull': pull, 'verify': verify, 'audit': audit, 'guard': guard, 'prune': prune, 'report': report}
    result = commands[args.command](args)
    print(json.dumps(result, indent=2, sort_keys=True))

if __name__ == '__main__':
    try:
        main()
    except (AssetError, OSError, ValueError, KeyError, subprocess.CalledProcessError) as error:
        # HTTP errors include status but never Authorization/request bodies.
        print('assets: ' + str(error), file=sys.stderr)
        sys.exit(1)
