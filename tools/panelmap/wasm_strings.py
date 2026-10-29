"""Printable strings of a WASM data section with their memory addresses (active segments, i32.const offsets), filtered by a regex.
Usage: python wasm_strings.py <file.wasm> <regex> [min length]
"""
import re
import sys

path, pattern = sys.argv[1], re.compile(sys.argv[2])
min_len = int(sys.argv[3]) if len(sys.argv) > 3 else 4
b = open(path, 'rb').read()


def uleb(buf, i):
    r = s = 0
    while True:
        x = buf[i]; i += 1
        r |= (x & 0x7f) << s; s += 7
        if not x & 0x80:
            return r, i


def sleb(buf, i):
    r = s = 0
    while True:
        x = buf[i]; i += 1
        r |= (x & 0x7f) << s; s += 7
        if not x & 0x80:
            if x & 0x40:
                r -= 1 << s
            return r, i


i = 8
segments = []
while i < len(b):
    sid = b[i]; i += 1
    size, i = uleb(b, i)
    end = i + size
    if sid == 11:   # data section
        n, j = uleb(b, i)
        for _ in range(n):
            flag, j = uleb(b, j)
            off = 0
            if flag in (0, 2):
                if flag == 2:
                    _, j = uleb(b, j)
                op = b[j]; j += 1
                if op == 0x41:
                    off, j = sleb(b, j)
                while b[j] != 0x0b:
                    j += 1
                j += 1
            ln, j = uleb(b, j)
            segments.append((off, b[j:j + ln]))
            j += ln
    i = end

for off, data in segments:
    for m in re.finditer(rb'[\x20-\x7e]{%d,}' % min_len, data):
        s = m.group().decode('ascii')
        if pattern.search(s):
            print(f'{off + m.start():8d}  {s}')
