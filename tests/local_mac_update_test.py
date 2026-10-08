import hashlib
from pathlib import Path
import stat
import subprocess
import sys
import tempfile
import unittest
import zipfile

SCRIPT = Path(__file__).resolve().parents[1] / 'scripts/local-mac-update.py'

class LocalMacUpdate(unittest.TestCase):
    def test_exact_entries_and_rejected_tampering(self):
        with tempfile.TemporaryDirectory() as root:
            root = Path(root)
            old, new, output, restored = [root / name for name in ('old.zip', 'new.zip', 'delta', 'restored.zip')]
            original = bytes(range(256)) * 8192
            changed = original[:900000] + b'new application content' + original[900000:]
            for file, data in [(old, original), (new, changed)]:
                with zipfile.ZipFile(file, 'w') as archive:
                    archive.writestr('HAICoMo.app/Contents/app.asar', data)
                    archive.writestr('HAICoMo.app/Contents/unchanged', b'same')
                    link = zipfile.ZipInfo('HAICoMo.app/Contents/link')
                    link.create_system = 3
                    link.external_attr = (stat.S_IFLNK | 0o777) << 16
                    link.extra = b'\xfe\xca\x02\x00AB'
                    archive.writestr(link, b'app.asar')
                    archive.writestr('__MACOSX/HAICoMo.app/Contents/._app.asar', b'old metadata' if file == old else b'new metadata')
            expected = hashlib.sha256(new.read_bytes()).hexdigest()
            common = ['--baseline', str(old), '--expected', expected]
            def run(*args):
                return subprocess.run([sys.executable, str(SCRIPT), *args, *common], capture_output=True, text=True)
            self.assertEqual(run('create', '--candidate', str(new), '--output', str(output)).returncode, 0)
            # A locally archived baseline can have different ZIP compression
            # while supplying the same exact entry bytes for reconstruction.
            alternate = root / 'alternate.zip'
            with zipfile.ZipFile(old) as source, zipfile.ZipFile(alternate, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
                for item in source.infolist():
                    archive.writestr(item.filename, source.read(item))
            alternate.replace(old)
            self.assertEqual(run('apply', '--input', str(output), '--output', str(restored)).returncode, 0)
            with zipfile.ZipFile(new) as accepted, zipfile.ZipFile(restored) as actual:
                self.assertEqual(accepted.namelist(), actual.namelist())
                for name in accepted.namelist():
                    self.assertEqual(accepted.read(name), actual.read(name))
                    for attribute in ['external_attr', 'internal_attr', 'create_system', 'extra', 'comment', 'date_time']:
                        self.assertEqual(getattr(accepted.getinfo(name), attribute), getattr(actual.getinfo(name), attribute))
            payload = next(output.glob('*.bin'))
            payload.write_bytes(b'corrupted')
            self.assertNotEqual(run('apply', '--input', str(output), '--output', str(root/'bad.zip')).returncode, 0)
            old.write_bytes(b'wrong baseline')
            self.assertNotEqual(run('apply', '--input', str(output), '--output', str(root/'wrong.zip')).returncode, 0)
            self.assertNotEqual(run('create', '--candidate', str(old), '--output', str(root/'wrong-delta')).returncode, 0)

if __name__ == '__main__':
    unittest.main()
