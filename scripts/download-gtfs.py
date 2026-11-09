#!/usr/bin/env python3
"""Download and extract the SEQ GTFS archive with bounded resource usage."""

import shutil
import stat
import sys
import urllib.request
import zipfile
from pathlib import Path
from urllib.parse import urlparse

URL = "https://gtfsrt.api.translink.com.au/GTFS/SEQ_GTFS.zip"
MAX_DOWNLOAD = 512 * 1024 * 1024
MAX_EXTRACTED = 2 * 1024 * 1024 * 1024
MAX_FILE = 1024 * 1024 * 1024
MAX_FILES = 100
CHUNK = 1024 * 1024


class HttpsRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if urlparse(newurl).scheme != "https":
            raise ValueError("Refusing non-HTTPS redirect")
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def download(url, output, limit=MAX_DOWNLOAD):
    opener = urllib.request.build_opener(HttpsRedirect())
    with opener.open(url, timeout=60) as response, open(output, "wb") as target:
        count = 0
        while True:
            data = response.read(min(CHUNK, limit - count + 1))
            if not data:
                break
            count += len(data)
            if count > limit:
                raise ValueError("GTFS download exceeds size limit")
            target.write(data)


def extract(archive, destination, total_limit=MAX_EXTRACTED, file_limit=MAX_FILE):
    destination = Path(destination)
    with zipfile.ZipFile(archive) as source:
        entries = source.infolist()
        if len(entries) > MAX_FILES:
            raise ValueError("GTFS archive has too many entries")
        names = set()
        total = 0
        for entry in entries:
            name = entry.filename
            # GTFS is a flat archive; reject directories, traversal, and links.
            if (not name or '/' in name or '\\' in name or name in ('.', '..')
                    or entry.is_dir() or stat.S_ISLNK(entry.external_attr >> 16)
                    or name in names or entry.flag_bits & 1):
                raise ValueError("GTFS archive contains an unsafe entry")
            names.add(name)
            total += entry.file_size
            if entry.file_size > file_limit or total > total_limit:
                raise ValueError("GTFS archive exceeds extracted size limit")
        destination.mkdir(parents=True, exist_ok=False)
        for entry in entries:
            with source.open(entry) as src, (destination / entry.filename).open('xb') as dst:
                shutil.copyfileobj(src, dst, CHUNK)


def main():
    try:
        download(URL, 'seq_gtfs.zip')
        extract('seq_gtfs.zip', 'seq_gtfs')
    except (OSError, ValueError, zipfile.BadZipFile) as exc:
        print(f"::error::GTFS download or extraction failed: {type(exc).__name__}", file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
