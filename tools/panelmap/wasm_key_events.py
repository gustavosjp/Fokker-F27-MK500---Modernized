"""Key events a WASM gauge sends: every `i32.const <id>` that feeds `call $trigger_key_event_EX1` in a WAT text, decoded with the SDK's
MSFS_EventsEnum.h (KEY_x = KEY_ID_MIN + n). Prints line, event name and the enclosing function.
Usage: python wasm_key_events.py <file.wat> <MSFS_EventsEnum.h> [first line] [last line]
"""
import re
import sys

wat, header = sys.argv[1], sys.argv[2]
lo = int(sys.argv[3]) if len(sys.argv) > 3 else 0
hi = int(sys.argv[4]) if len(sys.argv) > 4 else 10 ** 9
names = {}
base = 0x10000
for line in open(header, encoding='utf-8', errors='replace'):
    m = re.match(r'#define\s+(KEY_\w+)\s+\(KEY_ID_MIN\s*\+\s*(\d+)\)', line)
    if m:
        names.setdefault(base + int(m.group(2)), m.group(1))
lines = open(wat, encoding='utf-8', errors='replace').read().split('\n')
func = ''
recent = []
for i, l in enumerate(lines, 1):
    s = l.strip()
    if s.startswith('(func $'):
        func = s.split()[1][1:]
    if i < lo:
        continue
    if i > hi:
        break
    m = re.match(r'i32\.const (\d+)$', s)
    if m:
        recent.append((i, int(m.group(1))))
        recent = recent[-6:]
    if 'call $trigger_key_event_EX1' in s:
        ids = [(ln, v) for ln, v in recent if v in names]
        if ids:
            ln, v = ids[0]
            print(f'{i:7d}  {names[v]:34s} ({v})  in {func[:40]}')
        else:
            print(f'{i:7d}  (id computed at run time)  in {func[:40]}')
        recent = []
