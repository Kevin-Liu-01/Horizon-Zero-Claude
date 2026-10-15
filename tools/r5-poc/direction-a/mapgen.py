# Concept map for Direction A (Orchil). Writes an SVG; not the shipped heightfield.
import numpy as np, math, json, os
HERE = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.join(HERE, '../../../docs/media/r5-direction-a')
W = 960.0; HALF = W/2
A, B, AX = 455.0, 330.0, math.radians(45)    # island ellipse: major axis NE-SW
CAL = np.array([40.0, 60.0])                 # caldera centre (E, N)
rng = np.random.default_rng(7)
# smooth periodic coastline noise by bearing
K = 9; ph = rng.uniform(0, 2*math.pi, K); amp = [0, 0, 18, 14, 10, 8, 6, 5, 4]
def coast_noise(t): return sum(amp[k]*math.sin(k*t+ph[k]) for k in range(2, K))
def island_r(t):   # t = math angle (rad, 0=east, ccw)
    u = t - AX
    r = A*B/math.sqrt((B*math.cos(u))**2 + (A*math.sin(u))**2)
    return r + coast_noise(t)
def bearing(e, n): return (math.degrees(math.atan2(e, n)) + 360) % 360
def inside(e, n):
    t = math.atan2(n, e); return math.hypot(e, n) < island_r(t)
def height(e, n):
    t = math.atan2(n, e); d = math.hypot(e, n); R = island_r(t)
    if d >= R: return -1.0
    shore = min(1.0, (R - d)/60.0)                       # beach ramp
    dc = math.hypot(e-CAL[0], n-CAL[1])
    cone = 285*max(0, 1 - dc/430)**1.5                    # main edifice
    rim = 40*math.exp(-((dc-120)/28)**2)                  # caldera rim
    floor = -55*max(0, 1 - dc/105)**0.6                  # caldera floor
    rust = 90*math.exp(-(((e-265)**2 + (n+95)**2)/(2*45**2)))   # Rust Cone
    h = cone + rim + floor + rust
    b = bearing(e - CAL[0], n - CAL[1])
    # Drowned Flank: collapse amphitheatre on the WNW side
    if 258 <= b <= 342 and dc > 180:
        w = max(0.0, min(1.0, (dc - 195)/25))           # steep amphitheatre wall at dc 195-220
        edge = min(1.0, min(abs(b-258), abs(342-b))/12)  # soften the sector edges
        h = h*(1 - 0.85*w*edge) + 12*w*edge
    # Pans: flatten to ~2 m in the SW
    sw = math.exp(-(((e+290)**2 + (n+265)**2)/(2*95**2)))
    h = h*(1-0.92*sw) + 2*sw
    # barrancos in the Cloudline: radial valleys at bearings 15, 40, 65
    for bb in (15, 40, 65):
        db = abs(((b - bb + 180) % 360) - 180)
        if dc > 140: h -= 28*math.exp(-(db/4.5)**2)*min(1, (dc-140)/60)
    return max(0.5, h*shore)
# grid
N = 121; xs = np.linspace(-HALF, HALF, N); ys = np.linspace(-HALF, HALF, N)
H = np.array([[height(x, y) for x in xs] for y in ys])
def sx(e): return (e + HALF)            # svg x
def sy(n): return (HALF - n)            # svg y (north up)
# marching squares
def contours(level):
    segs = []
    for j in range(N-1):
        for i in range(N-1):
            v = [H[j,i], H[j,i+1], H[j+1,i+1], H[j+1,i]]
            p = [(xs[i],ys[j]), (xs[i+1],ys[j]), (xs[i+1],ys[j+1]), (xs[i],ys[j+1])]
            pts = []
            for a in range(4):
                b2 = (a+1) % 4
                if (v[a] < level) != (v[b2] < level):
                    f = (level - v[a])/(v[b2]-v[a])
                    pts.append((p[a][0]+f*(p[b2][0]-p[a][0]), p[a][1]+f*(p[b2][1]-p[a][1])))
            if len(pts) == 2: segs.append(pts)
            elif len(pts) == 4: segs += [pts[:2], pts[2:]]
    return segs
coast = []
for k in range(361):
    t = math.radians(k); r = island_r(t); coast.append((r*math.cos(t), r*math.sin(t)))
coast_d = "M" + " L".join(f"{sx(e):.1f},{sy(n):.1f}" for e, n in coast) + " Z"
# biome sectors (bearing from caldera centre), clipped to island
BIOMES = [("Cloudline", 345, 100, "#3E5B3A"), ("Malpaís", 100, 165, "#8E3B23"),
          ("Crescent Holds", 165, 205, "#5a4a3a"), ("The Pans", 205, 258, "#B9C3C9"),
          ("Drowned Flank", 258, 345, "#3A3A3F")]
def sector_path(b0, b1):
    if b1 < b0: b1 += 360
    pts = [(CAL[0], CAL[1])]
    for b in np.linspace(b0, b1, 40):
        br = math.radians(b); pts.append((CAL[0]+900*math.sin(br), CAL[1]+900*math.cos(br)))
    return "M" + " L".join(f"{sx(e):.1f},{sy(n):.1f}" for e, n in pts) + " Z"
SITES = json.load(open(os.path.join(HERE, 'sites.json')))
out = []
out.append(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="-40 -40 1040 1110" font-family="Helvetica, Arial, sans-serif">')
out.append('<rect x="-40" y="-40" width="1040" height="1110" fill="#1F4E66"/>')
out.append('<defs><clipPath id="isl"><path d="%s"/></clipPath></defs>' % coast_d)
out.append(f'<path d="{coast_d}" fill="#2a2a2e" stroke="#EDEAE2" stroke-width="2.5"/>')
out.append('<g clip-path="url(#isl)" opacity="0.55">')
for name, b0, b1, col in BIOMES: out.append(f'<path d="{sector_path(b0,b1)}" fill="{col}"/>')
out.append(f'<circle cx="{sx(CAL[0])}" cy="{sy(CAL[1])}" r="150" fill="#6b6255"/>')
out.append('</g>')
out.append('<g fill="none" stroke="#EDEAE2" stroke-opacity="0.45" stroke-width="0.8">')
for lvl in range(30, 260, 30):
    d = "".join(f"M{sx(a[0]):.1f},{sy(a[1]):.1f}L{sx(b[0]):.1f},{sy(b[1]):.1f}" for a, b in contours(lvl))
    out.append(f'<path d="{d}" stroke-width="{1.4 if lvl % 90 == 0 else 0.7}"/>')
out.append('</g>')
# Screed Scar
sc = SITES["scar"]
out.append(f'<line x1="{sx(sc[0][0])}" y1="{sy(sc[0][1])}" x2="{sx(sc[1][0])}" y2="{sy(sc[1][1])}" stroke="#E6DCC8" stroke-width="7" stroke-opacity="0.8"/>')
# first-hour path
p = SITES["path"]
out.append('<path d="M' + " L".join(f"{sx(e)},{sy(n)}" for e, n in p) + '" fill="none" stroke="#DA7756" stroke-width="3" stroke-dasharray="9 6"/>')
# trig triangles
T = SITES["trig"]
for a, b in SITES["sight"]:
    out.append(f'<line x1="{sx(T[a][1])}" y1="{sy(T[a][2])}" x2="{sx(T[b][1])}" y2="{sy(T[b][2])}" stroke="#DA7756" stroke-opacity="0.35" stroke-width="1"/>')
for key, (lab, e, n) in T.items():
    out.append(f'<path d="M{sx(e)},{sy(n)-9} L{sx(e)+8},{sy(n)+6} L{sx(e)-8},{sy(n)+6} Z" fill="#DA7756" stroke="#1C1B1E"/>')
    out.append(f'<text x="{sx(e)+10}" y="{sy(n)+4}" font-size="12" fill="#DA7756" font-weight="700">{key}</text>')
for lab, e, n, kind in SITES["sites"]:
    col = {"town": "#EDEAE2", "landmark": "#A9C4B0", "site": "#C98B4E", "boss": "#ff9a76"}[kind]
    r = 9 if kind == "town" else 6
    shape = (f'<rect x="{sx(e)-r}" y="{sy(n)-r}" width="{2*r}" height="{2*r}" fill="{col}" stroke="#1C1B1E" stroke-width="1.5"/>' if kind == "town"
             else f'<circle cx="{sx(e)}" cy="{sy(n)}" r="{r}" fill="{col}" stroke="#1C1B1E" stroke-width="1.5"/>')
    out.append(shape)
    out.append(f'<text x="{sx(e)+r+4}" y="{sy(n)+4}" font-size="{14 if kind=="town" else 12}" fill="{col}" font-weight="{700 if kind=="town" else 400}" stroke="#1C1B1E" stroke-width="3" paint-order="stroke">{lab}</text>')
for name, (e, n) in SITES["biome_labels"].items():
    out.append(f'<text x="{sx(e)}" y="{sy(n)}" font-size="20" fill="#EDEAE2" fill-opacity="0.9" text-anchor="middle" letter-spacing="3" stroke="#1C1B1E" stroke-width="4" paint-order="stroke">{name.upper()}</text>')
# compass + scale + legend
out.append('<g transform="translate(920,40)"><path d="M0,-28 L8,0 L0,-6 L-8,0 Z" fill="#EDEAE2"/><text y="-34" font-size="14" fill="#EDEAE2" text-anchor="middle">N</text></g>')
out.append(f'<g transform="translate(20,1000)"><rect width="200" height="6" fill="#EDEAE2"/><rect width="100" height="6" fill="#A3213A"/><text y="24" font-size="12" fill="#EDEAE2">0          100        200 m</text></g>')
out.append('<g transform="translate(300,985)" font-size="12" fill="#EDEAE2">'
           '<rect x="0" y="-9" width="12" height="12" fill="#EDEAE2"/><text x="18" y="1">settlement</text>'
           '<circle cx="128" cy="-3" r="6" fill="#A9C4B0"/><text x="140" y="1">landmark</text>'
           '<circle cx="232" cy="-3" r="6" fill="#C98B4E"/><text x="244" y="1">site</text>'
           '<path d="M318,-12 L326,3 L310,3 Z" fill="#DA7756"/><text x="332" y="1">trig pillar</text>'
           '<line x1="420" y1="-3" x2="460" y2="-3" stroke="#DA7756" stroke-width="3" stroke-dasharray="9 6"/><text x="466" y="1">first hour</text>'
           '<line x1="550" y1="-3" x2="590" y2="-3" stroke="#E6DCC8" stroke-width="6"/><text x="596" y="1">Screed Scar</text>'
           '</g>')
out.append('<text x="20" y="1050" font-size="12" fill="#EDEAE2" fill-opacity="0.7">ORCHIL — Direction A concept map. 960 m world, contours every 30 m (bold every 90 m). Concept only, not the shipped heightfield. NE trade winds: windward = Cloudline.</text>')
out.append('</svg>')
svg = "\n".join(out)
open(os.path.join(OUT, 'map.svg'), 'w').write(svg)
# report site checks
bad = [s[0] for s in SITES["sites"] if not inside(s[1], s[2])] + [k for k, v in T.items() if not inside(v[1], v[2])]
print("svg bytes", len(svg), "outside island:", bad)
print("peak", round(H.max(), 1), "land cells", int((H > 0).sum()), "land area m2 ~", int((H > 0).sum()*(W/(N-1))**2))
for lab, e, n, kind in SITES["sites"]:
    print(f"{lab:28s} ({e:5.0f},{n:5.0f}) h={height(e,n):6.1f} m  bearing-from-caldera={bearing(e-CAL[0], n-CAL[1]):5.1f}")
for k, (lab, e, n) in T.items(): print(f"{k} {lab:24s} ({e},{n}) h={height(e,n):.0f}")
