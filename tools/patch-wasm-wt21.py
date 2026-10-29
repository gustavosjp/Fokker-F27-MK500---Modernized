"""Writes the WT21 variation's copy of the author's systems WASM with the old TAPIR autopilot's MODE handling switched off.

Why (test 10, decoded from the WASM's own strings, names and key events; see README "v9.3"): SystemsBgt_gauge_callback emulates the
F27's TAPIR autopilot through the sim's standard autopilot. While the AP is engaged in flight it pulses AP_PANEL_ALTITUDE_ON, then
AP_PANEL_ALTITUDE_OFF five frames later, and starts over every ~2 s; and it turns heading / wing leveler / NAV / LOC / APR / BC holds
on and off from the old TAPIR buttons and knob (gone in the WT21 variation). That fought the WT21 autopilot: altitude never held.

v9.4 (test 11): while engaged the TAPIR also flies its own pitch and roll servos through the trims every frame (ELEVATOR_TRIM_SET,
AILERON_TRIM_SET_EX1), which overwrote the trim the sim autopilot flies WT21's pitch with: those two calls are switched off as well.

The patch replaces the event id of every such trigger_key_event_EX1 call with KEY_NULL (a no-op). Each `i32.const <id>` is 4 bytes
(0x41 + 3-byte LEB128) and KEY_NULL (0x10000) encodes in 3 bytes too, so nothing moves. Kept: AUTOPILOT_OFF + CENTER_AILER_RUDDER
(the AP disengages unless the four servo switches DIR / ROULIS / PROF / TRIM are on, as in the aircraft), heading gyro, props, etc.

v10.4 (user: wheel chocks, "assim as escadas sairiam ao remover os calços"): every frame the same function puts both stairs away
(0 (>L:StairFwd_isVisible, Bool) / 0 (>L:StairAft_isVisible, Bool)) while his GPU is not shown (L:GPU_isVisible = 0), so the stairs
only stayed with ground power on, which looked like stairs missing from some liveries. In this copy those two calculator strings become
"0" padded with spaces (same length, a no-op); the stairs then follow the wheel chocks, which the tablet works. The other copy of the
forward-stairs string (opening the cargo door puts the forward stairs away) is kept.

v10.8 (user: a Classic variation, "o AP original controla o avião", "a única coisa nossa que entra é o Tablet"): --stairs-only writes
the Classic's copy, with only the stairs rule blanked (the stairs follow the tablet's chocks there too) and the TAPIR autopilot intact.

Usage: python patch-wasm-wt21.py <author wasm> <out wasm> [--stairs-only] [--check]
  --check: only verify that <out> is exactly the patch of <author>
"""
import hashlib
import sys

FUNC = 'SystemsBgt_gauge_callback'
KEY_NULL = 0x10000
# event id -> (name, call sites expected in FUNC[, which of them to patch, in code order; default all]); ids from MSFS_EventsEnum.h
EVENTS = {
    66103: ('AP_PANEL_ALTITUDE_ON', 1), 66104: ('AP_PANEL_ALTITUDE_OFF', 3), 66042: ('HEADING_BUG_SET', 3),
    65807: ('AP_HDG_HOLD_ON', 4), 65815: ('AP_HDG_HOLD_OFF', 2), 65809: ('AP_WING_LEVELER_ON', 2), 65817: ('AP_WING_LEVELER_OFF', 1),
    65811: ('AP_NAV1_HOLD_ON', 2), 65819: ('AP_NAV1_HOLD_OFF', 3), 65805: ('AP_LOC_HOLD_ON', 1), 65813: ('AP_LOC_HOLD_OFF', 3),
    65814: ('AP_APR_HOLD_OFF', 3), 65810: ('AP_BC_HOLD_ON', 1), 65818: ('AP_BC_HOLD_OFF', 2),
    # v9.4 (test 11: "o AP não está controlando a subida ou descida, apenas a direção"): while the AP is engaged the TAPIR flies its own
    # pitch and roll servos through the trims, every frame: ELEVATOR_TRIM_SET (it overwrote the trim the sim autopilot flies pitch with,
    # pitch_use_trim = 1) and the 2nd AILERON_TRIM_SET_EX1 (rate-limited roll servo). The 1st AILERON_TRIM_SET_EX1 belongs to the
    # (hidden) VIRAGE knob and only rewrites the current trim: kept.
    65706: ('ELEVATOR_TRIM_SET', 1),
    67236: ('AILERON_TRIM_SET_EX1', 2, [1]),
}
# calculator string -> (copies expected in the data section, which of them to blank, in address order)
STRINGS = {
    b'0 (>L:StairFwd_isVisible, Bool)': (2, [1]),   # [0] = the cargo-door rule (kept), [1] = the GPU rule
    b'0 (>L:StairAft_isVisible, Bool)': (1, [0]),
}


def uleb(b, i):
    r = s = 0
    while True:
        x = b[i]; i += 1
        r |= (x & 0x7f) << s; s += 7
        if not x & 0x80:
            return r, i


def sleb3(v):
    out = bytearray()
    while True:
        byte = v & 0x7f; v >>= 7
        if (v == 0 and not byte & 0x40) or (v == -1 and byte & 0x40):
            out.append(byte); break
        out.append(byte | 0x80)
    return bytes(out)


def sections(b):
    i, out = 8, []
    while i < len(b):
        sid = b[i]; size, j = uleb(b, i + 1)
        out.append((sid, j, j + size)); i = j + size
    return out


def name_str(b, i):
    n, i = uleb(b, i)
    return b[i:i + n].decode('utf-8', 'replace'), i + n


def find_function_body(b):
    secs = sections(b)
    imported = 0
    for sid, s, e in secs:
        if sid == 2:   # imports: count function imports
            n, i = uleb(b, s)
            for _ in range(n):
                _, i = name_str(b, i); _, i = name_str(b, i)
                kind = b[i]; i += 1
                if kind == 0:
                    _, i = uleb(b, i); imported += 1
                elif kind == 1:
                    i += 1; flags, i = uleb(b, i); _, i = uleb(b, i)
                    if flags & 1: _, i = uleb(b, i)
                elif kind == 2:
                    flags, i = uleb(b, i); _, i = uleb(b, i)
                    if flags & 1: _, i = uleb(b, i)
                elif kind == 3:
                    i += 2
    index = None
    for sid, s, e in secs:
        if sid == 7:   # exports
            n, i = uleb(b, s)
            for _ in range(n):
                nm, i = name_str(b, i); kind = b[i]; i += 1; idx, i = uleb(b, i)
                if nm == FUNC and kind == 0:
                    index = idx
    if index is None:
        raise SystemExit(f'{FUNC} not exported')
    for sid, s, e in secs:
        if sid == 10:   # code
            n, i = uleb(b, s)
            for k in range(n):
                size, j = uleb(b, i)
                if k == index - imported:
                    return j, j + size
                i = j + size
    raise SystemExit('function body not found')


def patch(src, events=True):
    b = bytearray(src)
    s, e = find_function_body(b)
    hits = {}
    for ev in (EVENTS if events else {}):
        pat = b'\x41' + sleb3(ev)
        i = s
        while True:
            i = b.find(pat, i, e)
            if i < 0:
                break
            # -O0 code stores the constant in a local right away: `i32.const id; local.set n` (0x21)
            if b[i + 4] == 0x21:
                hits.setdefault(ev, []).append(i)
            i += 1
    for ev, spec in (EVENTS.items() if events else []):
        name, want = spec[0], spec[1]
        got = len(hits.get(ev, []))
        if got != want:
            raise SystemExit(f'{name}: expected {want} call sites in {FUNC}, found {got}; not patching')
    new = sleb3(KEY_NULL)
    n = 0
    for ev, offs in hits.items():
        which = EVENTS[ev][2] if len(EVENTS[ev]) > 2 else range(len(offs))   # occurrences in code order (= WAT order)
        for k in which:
            b[offs[k] + 1:offs[k] + 4] = new
            n += 1
    ds, de = next((s, e) for sid, s, e in sections(b) if sid == 11)   # data section
    for text, (want, which) in STRINGS.items():
        z = text + b'\x00'
        offs, i = [], ds
        while (i := b.find(z, i, de)) >= 0:
            offs.append(i)
            i += 1
        if len(offs) != want:
            raise SystemExit(f'{text.decode()}: expected {want} copies in the data section, found {len(offs)}; not patching')
        for k in which:
            b[offs[k]:offs[k] + len(text)] = b'0' + b' ' * (len(text) - 1)
            n += 1
    return bytes(b), n


src = open(sys.argv[1], 'rb').read()
stairs_only = '--stairs-only' in sys.argv
out, n = patch(src, events=not stairs_only)
if '--check' in sys.argv:
    ok = open(sys.argv[2], 'rb').read() == out
    print(f'{"ok" if ok else "MISMATCH"}: {sys.argv[2]} is {"" if ok else "NOT "}the patch of the author WASM ({n} sites)')
    sys.exit(0 if ok else 1)
open(sys.argv[2], 'wb').write(out)
what = 'the stairs-with-GPU rule blanked, the TAPIR autopilot kept' if stairs_only else 'TAPIR autopilot mode events to KEY_NULL, the stairs-with-GPU rule blanked'
print(f'patched {n} sites ({what}) -> {sys.argv[2]} (sha256 {hashlib.sha256(out).hexdigest()[:16]})')
