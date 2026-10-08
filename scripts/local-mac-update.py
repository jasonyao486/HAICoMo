"""Transfer an accepted Mac bundle using a verified older release as a base.

Only the ZIP transport wrapper changes. Every entry's bytes and attributes come
from the accepted candidate; no application build or signing happens here.
"""
import argparse
import base64
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import subprocess
import tempfile
import zipfile


def digest(data):
    return hashlib.sha256(data).hexdigest()


def file_digest(file):
    with open(file, 'rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def safe_name(name):
    path = PurePosixPath(name)
    if path.is_absolute() or '..' in path.parts or not path.parts or path.parts[0] not in ('HAICoMo.app', '__MACOSX'):
        raise ValueError('Unexpected bundle entry')


def create(args):
    if file_digest(args.candidate) != args.expected:
        raise ValueError('Accepted candidate ZIP checksum mismatch')
    output = Path(args.output)
    output.mkdir(parents=True, exist_ok=False)
    manifest = {'schema': 1, 'candidateZipSha256': args.expected,
                'baselineZipSha256': file_digest(args.baseline), 'entries': []}
    with zipfile.ZipFile(args.baseline) as old, zipfile.ZipFile(args.candidate) as new, tempfile.TemporaryDirectory() as temp:
        if len(new.namelist()) != len(set(new.namelist())):
            raise ValueError('Duplicate candidate ZIP entry')
        old_names = set(old.namelist())
        for index, info in enumerate(new.infolist()):
            safe_name(info.filename)
            data = new.read(info)
            previous = old.read(info.filename) if info.filename in old_names else None
            entry = {'name': info.filename, 'sha256': digest(data), 'size': len(data),
                     'dateTime': list(info.date_time), 'externalAttr': info.external_attr,
                     'internalAttr': info.internal_attr, 'createSystem': info.create_system,
                     'extra': base64.b64encode(info.extra).decode(),
                     'comment': base64.b64encode(info.comment).decode()}
            if previous == data:
                entry['action'] = 'copy'
            else:
                payload = output / f'{index}.bin'
                payload.write_bytes(data)
                entry.update(action='replace', payload=payload.name)
                if previous is not None and len(data) >= 1024 * 1024:
                    base = Path(temp) / 'base'
                    target = Path(temp) / 'target'
                    patch = Path(temp) / 'patch'
                    base.write_bytes(previous)
                    target.write_bytes(data)
                    subprocess.run(['zstd', '-q', '-f', '-3', '--long=29', f'--patch-from={base}', str(target), '-o', str(patch)], check=True)
                    if patch.stat().st_size < len(data):
                        payload.write_bytes(patch.read_bytes())
                        entry['action'] = 'patch'
                entry['payloadSha256'] = file_digest(payload)
            manifest['entries'].append(entry)
    (output / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    print(f'Prepared {len(manifest["entries"])} exact bundle entries; payload bytes: {sum(f.stat().st_size for f in output.iterdir())}')


def apply(args):
    source = Path(args.input)
    manifest = json.loads((source / 'manifest.json').read_text())
    if manifest['schema'] != 1 or manifest['candidateZipSha256'] != args.expected:
        raise ValueError('Wrong accepted candidate provenance')
    if file_digest(args.baseline) != manifest['baselineZipSha256']:
        # Local ZIP timestamps/compression may differ. Never trust that base:
        # each restored entry must still match the accepted candidate SHA-256.
        print('Baseline ZIP wrapper differs; checking every restored entry against the accepted candidate.')
    output = Path(args.output)
    if output.exists():
        raise ValueError('Output already exists')
    partial = output.with_suffix(output.suffix + '.partial')
    seen = set()
    with zipfile.ZipFile(args.baseline) as old, zipfile.ZipFile(partial, 'w', compression=zipfile.ZIP_STORED, allowZip64=True) as new, tempfile.TemporaryDirectory() as temp:
        for entry in manifest['entries']:
            name = entry['name']
            safe_name(name)
            if name in seen:
                raise ValueError('Duplicate bundle entry')
            seen.add(name)
            if entry['action'] == 'copy':
                data = old.read(name)
            else:
                payload_name = entry['payload']
                if Path(payload_name).name != payload_name:
                    raise ValueError('Unsafe payload name')
                payload = source / payload_name
                if file_digest(payload) != entry['payloadSha256']:
                    raise ValueError('Payload checksum mismatch')
                if entry['action'] == 'replace':
                    data = payload.read_bytes()
                elif entry['action'] == 'patch':
                    base, target = Path(temp) / 'base', Path(temp) / 'target'
                    base.write_bytes(old.read(name))
                    subprocess.run(['zstd', '-q', '-f', '-d', '--long=29', f'--patch-from={base}', str(payload), '-o', str(target)], check=True)
                    data = target.read_bytes()
                else:
                    raise ValueError('Unknown payload action')
            if len(data) != entry['size'] or digest(data) != entry['sha256']:
                raise ValueError('Restored bundle entry checksum mismatch')
            info = zipfile.ZipInfo(name, tuple(entry['dateTime']))
            info.external_attr, info.internal_attr = entry['externalAttr'], entry['internalAttr']
            info.create_system = entry['createSystem']
            # ZIP64 sizes are regenerated for the transport wrapper; preserve
            # all other original metadata, including AppleDouble payload files.
            extra = base64.b64decode(entry['extra'])
            info.extra = b''
            while extra:
                tag, size = int.from_bytes(extra[:2], 'little'), int.from_bytes(extra[2:4], 'little')
                if len(extra) < size + 4:
                    raise ValueError('Malformed ZIP metadata')
                if tag != 1:
                    info.extra += extra[:size+4]
                extra = extra[size+4:]
            info.comment = base64.b64decode(entry['comment'])
            new.writestr(info, data)
    os.replace(partial, output)
    print(f'Restored and verified {len(seen)} original bundle entries. ZIP transport hash differs by design.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('operation', choices=('create', 'apply'))
    parser.add_argument('--baseline', required=True)
    parser.add_argument('--candidate')
    parser.add_argument('--input')
    parser.add_argument('--output', required=True)
    parser.add_argument('--expected', required=True)
    arguments = parser.parse_args()
    (create if arguments.operation == 'create' else apply)(arguments)
