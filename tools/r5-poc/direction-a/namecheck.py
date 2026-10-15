#!/usr/bin/env python3
"""Direction A name lint: every proposed CALIMA name vs the Horizon lexicon.
Flags exact matches, substrings (both >= 5 chars) and edit distance <= 1. Run: python3 namecheck.py"""
import os, re
HERE = os.path.dirname(os.path.abspath(__file__))
lex = set()
for line in open(os.path.join(HERE, 'horizon-lexicon.txt')):
    line = line.strip()
    if not line or line.startswith('#'): continue
    lex.add(line.lower())
    for p in re.split(r"[ /()\-]+", line):
        if len(p) >= 4: lex.add(p.lower())
proposed = """Calima Orchil Brea Reckoner Datum Instrument Instruments Alidade Benchmark Fundamental Saltrow Ninewalls Mistfold Fogcatchers Levelers Pan Houses Crescent Holds Cloudline Malpais Caldera Glass Organ Shelf Sounding Ring Screed Scar Fog Harp Kiln Yards Pinned Cliff Calibration Yard Trig Pillar Field Book
Peg Plumb Tiller Gauge Sickle Spindle Gyre Sonde Screed Kiln Dredge Transit
Sabina Recurve Sighting Lance Obsidian Counterweight Gaff Rake Bronze Windwall Scute Mirror Brine Cinder Dust Pot Net Sinker Wire Salt Picon Lapilli Orchil Cochineal Glaze Celadon Oxblood Verdigris
Raker Matron Porter Boilers Rust Cone Shepherd Cane Epoch Jameo Hornito Leap Reed Barbed Gourd Resin Puff Tiller-Follower Highline Dripline Shepherd's Felt Lattice Quilt Lamellar Datum Plate Raker's Guild Brine-Cured Calima Veil Pit Wraps Sounding Ring Mistfold Caulker Lantern-Keeper Pit Farmer Follower Picker Tube Smith Netter Vaulter Elder Zealot""".split()
def lev(a, b):
    m, n = len(a), len(b); d = list(range(n + 1))
    for i in range(1, m + 1):
        p = d[:]; d[0] = i
        for j in range(1, n + 1):
            d[j] = min(p[j] + 1, d[j - 1] + 1, p[j - 1] + (a[i - 1] != b[j - 1]))
    return d[n]
hits = set()
for w in proposed:
    lw = w.lower()
    for h in lex:
        if lw == h: hits.add((w, h, 'EXACT'))
        elif len(lw) >= 5 and len(h) >= 5 and (lw in h or h in lw): hits.add((w, h, 'substring'))
        elif len(lw) >= 5 and len(h) >= 5 and lev(lw, h) <= 1: hits.add((w, h, 'edit<=1'))
print('lexicon', len(lex), 'proposed', len(proposed), 'hits', len(hits))
for h in sorted(hits): print(*h)
