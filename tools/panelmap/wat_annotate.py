"""Readable view of an -O0 WAT function range: maps every execute_calculator_code(code, f64* out, i32* out, ...) call of the function
to the memory address its result goes to, then prints the control flow of a line range with loads/stores labelled by the
variable stored there, the calculator strings executed and the key events sent (MSFS_EventsEnum.h).
Usage: python wat_annotate.py <file.wat> <wasm file> <MSFS_EventsEnum.h> <func first line> <func last line> <from> <to>
"""
import re
import sys

wat, wasm, header = sys.argv[1], sys.argv[2], sys.argv[3]
f0, f1, a, b = (int(x) for x in sys.argv[4:8])
lines = open(wat, encoding='utf-8', errors='replace').read().split('\n')

# strings of the data section, by address
blob = open(wasm, 'rb').read()
sys.argv = ['x', wasm, '.', '3']
strings = {}
import subprocess
out = subprocess.run([sys.executable, __file__.replace('wat_annotate.py', 'wasm_strings.py'), wasm, '.', '3'], capture_output=True, text=True).stdout
for l in out.splitlines():
    p = l.strip().split(None, 1)
    if len(p) == 2:
        strings[int(p[0])] = p[1]
events = {}
for line in open(header, encoding='utf-8', errors='replace'):
    m = re.match(r'#define\s+(KEY_\w+)\s+\(KEY_ID_MIN\s*\+\s*(\d+)\)', line)
    if m:
        events.setdefault(0x10000 + int(m.group(2)), m.group(1))

# pass 1: memory address -> variable, over the whole function
mem = {}
loc = {}
gets = []
for l in lines[f0 - 1:f1]:
    s = l.strip()
    m = re.match(r'i32\.const (\d+)$', s)
    if m:
        last_const = int(m.group(1)); continue
    m = re.match(r'local\.set (\d+)$', s)
    if m and 'last_const' in dir():
        loc[int(m.group(1))] = last_const
    m = re.match(r'local\.get (\d+)$', s)
    if m:
        gets.append(loc.get(int(m.group(1))))
        gets = gets[-4:]
    if s == 'call $execute_calculator_code' and len(gets) == 4:
        code, fout, iout, _ = gets
        if code in strings and re.match(r'^\((A|L|E):', strings[code]):
            if fout:
                mem[fout] = ('f64', strings[code])
            if iout:
                mem[iout] = ('i32', strings[code])
    if not s.startswith('local.'):
        last_const = None if not s.startswith('i32.const') else last_const

# pass 2: print the range
depth = 0
recent = []
for i in range(a, b + 1):
    s = lines[i - 1].strip()
    if s.startswith(('local.set', 'local.get', 'local.tee', 'drop')) or not s:
        continue
    m = re.match(r'i32\.const (\d+)$', s)
    if m:
        v = int(m.group(1))
        recent.append(v)
        if v in strings:
            print(f'{i:7d} {"  " * depth}str "{strings[v]}"')
        continue
    if s.startswith(('end', 'else')):
        depth = max(0, depth - 1)
    note = ''
    m = re.search(r'\.(load|store)\w* offset=(\d+)', s)
    if m and int(m.group(2)) in mem:
        note = f'   <- {mem[int(m.group(2))][1]}'
    if s == 'call $trigger_key_event_EX1':
        ev = next((events[v] for v in reversed(recent[-6:]) if v in events), '?')
        note = f'   KEY {ev}'
    print(f'{i:7d} {"  " * depth}{s}{note}')
    if s.startswith(('block', 'loop', 'if', 'else')):
        depth += 1
    if not s.startswith('i32.const'):
        recent = recent[-6:]
