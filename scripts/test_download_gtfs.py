import importlib.util
import io
import os
import stat
import subprocess
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('download_gtfs', Path(__file__).with_name('download-gtfs.py'))
gtfs = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gtfs)


class DownloadGtfsTest(unittest.TestCase):
    def test_workflow_default_branch_guard(self):
        workflow = (Path(__file__).parent.parent / '.github/workflows/gtfs-update.yml').read_text()
        step = workflow.split('- name: Require default branch', 1)[1].split('      - uses:', 1)[0]
        script = step.split('        run: |\n', 1)[1]
        script = '\n'.join(line[10:] for line in script.splitlines())
        for ref, branch, expected in [('refs/heads/main', 'main', 0),
                                      ('refs/heads/feature', 'main', 1),
                                      ('refs/heads/main', '', 1)]:
            env = dict(os.environ, RUN_REF=ref, DEFAULT_BRANCH=branch)
            result = subprocess.run(['bash', '-c', script], env=env, capture_output=True)
            self.assertEqual(result.returncode, expected)

    def test_bounded_download(self):
        class Response(io.BytesIO):
            pass
        class Opener:
            def open(self, *_args, **_kwargs):
                return Response(b'12345')
        with tempfile.TemporaryDirectory() as tmp, patch.object(gtfs.urllib.request, 'build_opener', return_value=Opener()):
            with self.assertRaisesRegex(ValueError, 'size limit'):
                gtfs.download('https://example.org/feed.zip', Path(tmp) / 'feed.zip', limit=4)

    def archive(self, directory, entries):
        path = Path(directory) / 'feed.zip'
        with zipfile.ZipFile(path, 'w') as archive:
            for name, data in entries:
                archive.writestr(name, data)
        return path

    def test_valid_flat_archive(self):
        with tempfile.TemporaryDirectory() as tmp:
            archive = self.archive(tmp, [('routes.txt', 'routes'), ('trips.txt', 'trips')])
            gtfs.extract(archive, Path(tmp) / 'out', total_limit=20, file_limit=10)
            self.assertEqual((Path(tmp) / 'out/routes.txt').read_text(), 'routes')

    def test_rejects_traversal_and_symlink(self):
        link = zipfile.ZipInfo('link')
        link.create_system = 3
        link.external_attr = (stat.S_IFLNK | 0o777) << 16
        for entry in ['../escape', 'nested/file', link]:
            with self.subTest(entry=entry), tempfile.TemporaryDirectory() as tmp:
                archive = self.archive(tmp, [(entry, 'contents')])
                with self.assertRaisesRegex(ValueError, 'unsafe'):
                    gtfs.extract(archive, Path(tmp) / 'out')
                self.assertFalse((Path(tmp) / 'out').exists())

    def test_rejects_oversized_members_and_total_before_extraction(self):
        for limits in [(9, 4), (8, 5)]:
            with self.subTest(limits=limits), tempfile.TemporaryDirectory() as tmp:
                archive = self.archive(tmp, [('a.txt', '12345'), ('b.txt', '67890')])
                with self.assertRaisesRegex(ValueError, 'size limit'):
                    gtfs.extract(archive, Path(tmp) / 'out', total_limit=limits[0], file_limit=limits[1])
                self.assertFalse((Path(tmp) / 'out').exists())


if __name__ == '__main__':
    unittest.main()
