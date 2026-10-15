import base64, math, os
HERE = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.join(HERE, '../../../docs/media/r5-direction-a')
FONT = base64.b64encode(open(os.path.join(HERE, '../../../public/fonts/JuliusSansOne-Regular.ttf'),'rb').read()).decode()
# --- spark (same 10 rays as public/favicon.svg) ---
RAYS = [(0,42),(38,30),(72,44),(109,29),(144,40),(180,28),(217,43),(252,27),(288,41),(323,30)]
def spark(cx, cy, s, col="#DA7756", w=8.5):
    g = [f'<g stroke="{col}" stroke-width="{w*s:.2f}" stroke-linecap="round">']
    for ang, L in RAYS:
        a = math.radians(ang)
        x1, y1 = cx + 14*s*math.sin(a), cy - 14*s*math.cos(a)
        x2, y2 = cx + L*s*math.sin(a), cy - L*s*math.cos(a)
        g.append(f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}"/>')
    g.append('</g>'); return "".join(g)
def logo(bg, fg, sub, fname):
    W, H = 1200, 520
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}">',
         f'<defs><style>@font-face{{font-family:"JSO";src:url(data:font/ttf;base64,{FONT}) format("truetype");}}</style></defs>',
         f'<rect width="{W}" height="{H}" fill="{bg}"/>']
    # wordmark: C A L [I] M A with tracking; the I is drawn as a plumb line under the spark
    letters = ["C", "A", "L", None, "M", "A"]
    x0, base, size, step = 170, 330, 150, 160
    xs = []
    for i, ch in enumerate(letters):
        x = x0 + i*step; xs.append(x)
        if ch: o.append(f'<text x="{x}" y="{base}" font-family="JSO, Julius Sans One, Helvetica" font-size="{size}" fill="{fg}" text-anchor="middle">{ch}</text>')
    ix = xs[3]
    # plumb line (the I) from the spark down through the cap height to the datum rule
    o.append(f'<line x1="{ix}" y1="168" x2="{ix}" y2="{base}" stroke="{fg}" stroke-width="7"/>')
    o.append(f'<path d="M{ix-11},{base-36} L{ix+11},{base-36} L{ix},{base-6} Z" fill="{fg}"/>')   # the bob
    o.append(spark(ix, 100, 1.3))
    # datum rule + benchmark crow's-foot under the I
    o.append(f'<line x1="{x0-70}" y1="{base+28}" x2="{xs[-1]+70}" y2="{base+28}" stroke="{fg}" stroke-width="2"/>')
    o.append(f'<g stroke="#DA7756" stroke-width="5" stroke-linecap="round"><line x1="{ix}" y1="{base+40}" x2="{ix}" y2="{base+78}"/>'
             f'<line x1="{ix}" y1="{base+40}" x2="{ix-20}" y2="{base+74}"/><line x1="{ix}" y1="{base+40}" x2="{ix+20}" y2="{base+74}"/></g>')
    o.append(f'<text x="{W/2}" y="{base+128}" font-family="JSO, Julius Sans One, Helvetica" font-size="26" letter-spacing="14" fill="{sub}" text-anchor="middle">READ THE LAND · REDRAW THE DATUM</text>')
    o.append('</svg>')
    open(os.path.join(OUT, fname), 'w').write("\n".join(o))
logo("#1C1B1E", "#EDEAE2", "#C98B4E", "logo-dark.svg")
logo("#EDEAE2", "#1C1B1E", "#8E3B23", "logo-light.svg")
# --- palette sheet ---
GROUPS = [
 ("LAND", [("Lapilli Black","#1C1B1E"),("Basalt","#3A3A3F"),("Wet Sand","#2A2826"),("Salt White","#EDEAE2"),("Salt Shadow","#B9C3C9"),("Cinder Rust","#8E3B23"),("Calima Ochre","#C98B4E"),("Pumice","#CFC6B4")]),
 ("LIFE + WATER", [("Laurel","#3E5B3A"),("Lichen Sage","#9AA67E"),("Pine Needle","#4C5A2E"),("Tajinaste Red","#B5313A"),("Lagoon Emerald","#2F8F6F"),("Atlantic Deep","#1F4E66"),("Surf Foam","#F2F4F0"),("Fog Grey","#AEB4B1")]),
 ("PEOPLE (dyes + fibres)", [("Orchil Violet","#6B3F73"),("Cochineal","#A3213A"),("Linen","#E4DDCC"),("Undyed Wool","#BBAE94"),("Felt Moss","#56603F"),("Tar (brea)","#22201E"),("Brass","#B08A45"),("Skin ref (Brea)","#8A5A3C")]),
 ("INSTRUMENTS", [("Bone Glaze","#E6DCC8"),("Celadon","#A9C4B0"),("Oxblood","#6E2421"),("Bronze","#A07A3F"),("Verdigris","#4F8F7E"),("Graphite","#2B2C30"),("Survey Vermilion","#D2452E"),("Staff White","#F1EEE6")]),
 ("SENSOR STATES + UI", [("Calm","#6FE3B4"),("Wary","#B07CFF"),("Hostile (strobe)","#F4F1EA"),("Dead","#050505"),("Spark Coral","#DA7756"),("UI Paper","#EDEAE2"),("UI Smoke","#1C1B1E"),("UI Ink Red","#A3213A")]),
]
W = 1200; rowh = 150
o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {len(GROUPS)*rowh+40}" font-family="Helvetica, Arial, sans-serif">',
     f'<rect width="{W}" height="{len(GROUPS)*rowh+40}" fill="#141416"/>']
for gi, (gname, sw) in enumerate(GROUPS):
    y = 20 + gi*rowh
    o.append(f'<text x="20" y="{y+16}" font-size="14" letter-spacing="3" fill="#EDEAE2">{gname}</text>')
    for k, (nm, hx) in enumerate(sw):
        x = 20 + k*145
        o.append(f'<rect x="{x}" y="{y+26}" width="135" height="70" rx="4" fill="{hx}" stroke="#55555a"/>')
        o.append(f'<text x="{x}" y="{y+114}" font-size="13" fill="#EDEAE2">{nm}</text>')
        o.append(f'<text x="{x}" y="{y+131}" font-size="12" fill="#9a9a9f" font-family="Menlo, monospace">{hx}</text>')
o.append('</svg>')
open(os.path.join(OUT, 'palette.svg'),'w').write("\n".join(o))
