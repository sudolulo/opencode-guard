# Artificial routing-reader fixture: parsed only, never executed or given real data.
import collections
import datetime
import json
import math
import os
import stat
import sys

CODES = frozenset(('fallback', 'selected', 'refused'))
UTC = datetime.timezone.utc
PATH = '/artificial/never-read-routing-trace.jsonl'

def iso_ms(value):
    try:
        return datetime.datetime.fromtimestamp(value / 1000, UTC).isoformat()
    except (ValueError, OverflowError, RuntimeError):
        return None

counts = collections.Counter()
models = {}
report = {'errors': [], 'first': None, 'last': None}
try:
    before = os.lstat(PATH)
    if not stat.S_ISREG(before.st_mode):
        raise RuntimeError('not a regular file')
    with open(PATH, 'rb') as stream:
        opened = os.fstat(stream.fileno())
        if (before.st_dev, before.st_ino) != (opened.st_dev, opened.st_ino):
            raise RuntimeError('file identity changed')
        while True:
            line = stream.readline(65536)
            if not line:
                break
            try:
                item = json.loads(line)
            except (UnicodeDecodeError, json.JSONDecodeError) as exc:
                report['errors'].append(type(exc).__name__)
                continue
            if not isinstance(item, dict):
                continue
            code = item.get('code')
            if code not in CODES:
                continue
            at = item.get('at')
            if not isinstance(at, (int, float)) or isinstance(at, bool) or not math.isfinite(at):
                continue
            stamp = iso_ms(at)
            if stamp is None:
                continue
            counts[code] += 1
            model = item.get('model', 'unknown')
            entry = models.setdefault(model, {'count': 0, 'first': at, 'last': at})
            entry['count'] += 1
            entry.update({'first': min(entry['first'], at), 'last': max(entry['last'], at)})
    report.update({'counts': dict(counts), 'models': models})
    report['generated'] = datetime.datetime.now(UTC).timestamp()
    report['codes'] = sorted(CODES)
    print(json.dumps(report, sort_keys=True))
except (OSError, RuntimeError) as exc:
    print(json.dumps({'error': type(exc).__name__}, sort_keys=True))
    sys.exit(1)
