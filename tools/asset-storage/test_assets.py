import argparse
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('assets', Path(__file__).with_name('assets.py'))
a = importlib.util.module_from_spec(spec)
spec.loader.exec_module(a)

class StorageTests(unittest.TestCase):
    def setUp(self):
        # Hosted runners may exceed the production 80% threshold. Exercise real
        # file I/O against a deterministic capacity probe; the threshold test
        # overrides this probe independently.
        capacity_probe = patch.object(a.shutil, 'disk_usage', return_value=shutil_usage(1024**4, 1024**3, 1024**4 - 1024**3))
        capacity_probe.start()
        self.addCleanup(capacity_probe.stop)
        self.tmp = tempfile.TemporaryDirectory()
        self.home = Path(self.tmp.name)
        self.root = self.home / 'repo'
        self.root.mkdir()
        self.git('init', '-q')
        self.git('config', 'user.name', 'Test')
        self.git('config', 'user.email', 'test@example.invalid')
        self.args = argparse.Namespace(root=self.root, archive=self.home / 'archive', cache=self.home / 'cache', lock=self.root / 'assets.lock.json', pattern=[], cache_bytes=2**31, baseline=True, output=None)
    def tearDown(self):
        self.tmp.cleanup()
    def git(self, *args):
        return subprocess.check_output(['git', '-C', str(self.root), *args], stderr=subprocess.DEVNULL).decode().strip()
    def commit(self, name='change'):
        self.git('add', '.')
        self.git('commit', '-qm', name)
        return self.git('rev-parse', 'HEAD')
    def seed(self):
        (self.root / 'public').mkdir()
        for n in ['one.png', 'two.png']:
            (self.root / 'public' / n).write_bytes(b'\x89PNG\r\n\x1a\n' + bytes(range(256)) * 10)
        self.commit()
        a.audit(self.args)
        self.base = self.commit('baseline')
    def test_shared_archive_and_cache_roundtrip(self):
        self.seed()
        a.push_archive(self.args)
        lock = a.load_lock(self.args.lock)
        self.assertEqual(len(list((self.args.archive / 'objects').iterdir())), 1)
        self.assertEqual(lock['assets'][0]['sha256'], lock['assets'][1]['sha256'])
        for e in lock['assets']:
            (self.root / e['path']).unlink()
        a.pull(self.args)
        self.assertEqual(len(list((self.args.cache / 'objects').iterdir())), 1)
        self.assertTrue(all(a.verified(self.root / e['path'], e) for e in lock['assets']))
        # A second repository uses the exact same archive/cache without duplicate bytes.
        other = self.home / 'second'; other.mkdir()
        a.save_lock(other / 'assets.lock.json', lock)
        self.args.root, self.args.lock = other, other / 'assets.lock.json'
        a.pull(self.args)
        self.assertEqual(len(list((self.args.cache / 'objects').iterdir())), 1)
        self.assertTrue((other / 'public/one.png').exists())
    def test_missing_corrupt_archive_and_modified_destination(self):
        self.seed(); a.push_archive(self.args)
        e = a.load_lock(self.args.lock)['assets'][0]
        dest = self.root / e['path']; dest.write_bytes(b'my edits')
        with self.assertRaisesRegex(a.AssetError, 'modified'):
            a.pull(self.args)
        dest.unlink()
        obj = self.args.archive / 'objects' / e['sha256']; obj.write_bytes(b'corrupt')
        with self.assertRaisesRegex(a.AssetError, 'Missing/corrupt'):
            a.pull(self.args)
        self.assertFalse(dest.exists())
        self.assertEqual(list(dest.parent.glob('.asset-*')), [])
    def test_atomic_failure_and_size_limit(self):
        dest = self.home / 'out'
        e = {'path': 'out', 'size': 3, 'sha256': hashlib.sha256(b'abc').hexdigest()}
        for data in [b'ab', b'abd', b'abcd']:
            with self.assertRaises(a.AssetError):
                a.copy_verified(io.BytesIO(data), dest, e)
            self.assertFalse(dest.exists())
            self.assertEqual(list(self.home.glob('.asset-*')), [])
        class Interrupted:
            def read(self, n):
                raise OSError('connection lost')
        with self.assertRaises(OSError):
            a.copy_verified(Interrupted(), dest, e)
        self.assertFalse(dest.exists())
    def test_paths_and_shards_reject_tampering(self):
        for path in ['../out', '/tmp/out', '.git/config', 'x\\..\\out']:
            with self.assertRaises(a.AssetError):
                a.safe_path(self.root, path)
        (self.root / 'link').symlink_to(self.home, target_is_directory=True)
        with self.assertRaises(a.AssetError):
            a.safe_path(self.root, 'link/out')
        self.seed(); a.push_archive(self.args)
        (self.root / 'asset-lock/part-000.json').write_text('{}')
        with self.assertRaisesRegex(a.AssetError, 'checksum'):
            a.load_lock(self.args.lock)
    def test_guard_intermediate_binary_even_if_deleted(self):
        self.seed()
        (self.root / 'extra.png').write_bytes(b'new')
        self.commit()
        (self.root / 'extra.png').unlink(); self.commit()
        self.args.base, self.args.head = self.base, 'HEAD'
        with self.assertRaisesRegex(a.AssetError, 'extra.png'):
            a.guard(self.args)
    def test_guard_cannot_self_allowlist(self):
        self.seed()
        (self.root / 'extra.png').write_bytes(b'new')
        a.audit(self.args)  # current tree only; stage new asset then regenerate malicious policy
        self.commit()
        a.audit(self.args); self.commit()
        self.args.base, self.args.head = self.base, 'HEAD'
        with self.assertRaisesRegex(a.AssetError, 'extra.png'):
            a.guard(self.args)
    def test_guard_rejects_reintroducing_retired_binary(self):
        self.seed()
        data = (self.root / 'public/one.png').read_bytes()
        (self.root / 'public/one.png').unlink()
        retired = self.commit('migrate binary out of Git')
        (self.root / 'public/one.png').write_bytes(data)
        self.commit('accidental reintroduction')
        self.args.base, self.args.head = retired, 'HEAD'
        with self.assertRaisesRegex(a.AssetError, 'one.png'):
            a.guard(self.args)
    def test_guard_unchanged_lfs_conversion_only(self):
        self.seed()
        b = (self.root / 'public/one.png').read_bytes()
        sha = hashlib.sha256(b).hexdigest()
        (self.root / 'public/one.png').write_text(f'version https://git-lfs.github.com/spec/v1\noid sha256:{sha}\nsize {len(b)}\n')
        self.commit()
        self.args.base, self.args.head = self.base, 'HEAD'
        self.assertEqual(a.guard(self.args)['status'], 'pass')
        (self.root / 'public/one.png').write_text(f'version https://git-lfs.github.com/spec/v1\noid sha256:{"0" * 64}\nsize {len(b)}\n')
        self.commit()
        with self.assertRaises(a.AssetError):
            a.guard(self.args)
    def test_prune_lru_pins_dryrun_archive_untouched(self):
        self.seed(); a.push_archive(self.args)
        with a.cache_lock(self.args.cache):
            pass
        d = self.args.cache / 'objects'; d.mkdir()
        old, new = d / ('a' * 64), d / ('b' * 64)
        old.write_bytes(b'abc'); new.write_bytes(b'def')
        os.utime(old, (1, 1)); os.utime(new, (2, 2))
        v = a.cache_prune(self.args.cache, 3, set(), True)
        self.assertEqual(v['removed'], [old.name]); self.assertTrue(old.exists())
        v = a.cache_prune(self.args.cache, 0, {new.name}, False)
        self.assertFalse(old.exists()); self.assertTrue(new.exists()); self.assertTrue(v['overBudget'])
        self.assertEqual(len(list((self.args.archive / 'objects').iterdir())), 1)
    def test_capacity_thresholds(self):
        with patch.object(a.shutil, 'disk_usage', return_value=shutil_usage(1000, 800, 200)):
            with self.assertRaisesRegex(a.AssetError, 'Storage import stopped'):
                a.import_guard(self.home, 1)
    def test_https_origin_and_redirect_policy(self):
        for origin in ['http://example.com', 'https://user:secret@example.com', 'https://example.com/path', 'https://example.com?q=1']:
            with self.assertRaises(a.AssetError):
                a.origin_ok(origin)
        self.assertIsNone(a.NoRedirect().redirect_request(None, None, None, None, None, None))

def shutil_usage(total, used, free):
    import collections
    return collections.namedtuple('Usage', 'total used free')(total, used, free)

if __name__ == '__main__':
    unittest.main()
