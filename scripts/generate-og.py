#!/usr/bin/env python3
"""
OG image generator for htxlang.org
Generates 1200x630 PNGs for all key pages.
Style: intercooler-inspired, clean utilitarian, blue accent.
"""

from PIL import Image, ImageDraw, ImageFont
import os

W, H = 1200, 630
OUT = os.path.join(os.path.dirname(__file__), "..", "public", "og")
os.makedirs(OUT, exist_ok=True)

MONO = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"
MONO_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf"
SANS = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
SANS_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"

# Palette — intercooler-inspired
BG = (31, 31, 31)
BG2 = (26, 29, 30)
ACCENT = (91, 150, 213)    # #5b96d5
ACCENT_DIM = (60, 100, 150)
WHITE = (224, 221, 217)
GRAY = (180, 176, 172)
DIM = (120, 120, 120)
BORDER = (65, 70, 75)
CODE_BG = (39, 40, 34)
TEAL = (45, 212, 191)

def new_image():
    img = Image.new("RGB", (W, H), BG)
    draw = ImageDraw.Draw(img)
    # Top accent line
    draw.rectangle([0, 0, W, 4], fill=ACCENT)
    # Bottom subtle bar
    draw.rectangle([0, H-44, W, H], fill=BG2)
    return img, draw

def add_brand(draw, y=50):
    f = ImageFont.truetype(SANS_BOLD, 38)
    draw.text((64, y), "htx", fill=WHITE, font=f)
    tw = draw.textlength("htx", font=f)
    draw.text((64 + tw, y), "lang", fill=ACCENT, font=f)
    return y + 55

def add_footer(draw):
    f = ImageFont.truetype(MONO, 13)
    draw.text((64, H-32), "htxlang.org", fill=ACCENT, font=f)
    draw.text((W-250, H-32), "Specification", fill=DIM, font=f)

def add_badge(draw, x, y, text, color=TEAL):
    f = ImageFont.truetype(MONO, 13)
    tw = draw.textlength(text, font=f)
    draw.rectangle([x, y, x+tw+14, y+24], fill=(30, 32, 36), outline=(50, 54, 60))
    draw.text((x+7, y+4), text, fill=color, font=f)
    return x + tw + 22

def save(img, name):
    path = os.path.join(OUT, f"{name}.png")
    img.save(path, "PNG")
    print(f"  {name}.png")

# ══════════════════════════════════════════════════
# Landing page
# ══════════════════════════════════════════════════
img, draw = new_image()
y = add_brand(draw, 50)
f_title = ImageFont.truetype(SANS_BOLD, 28)
f_sub = ImageFont.truetype(SANS, 18)
f_pitch = ImageFont.truetype(SANS, 15)

draw.text((64, y+10), "A template language and resolution model", fill=GRAY, font=f_sub)
draw.text((64, y+38), "for hypermedia-native web applications", fill=GRAY, font=f_sub)

# Badges
bx = 64
by = y + 80
for badge in ["Bilateral Boundary", "Progressive Layers", "Resolver Model", "7 Engines"]:
    bx = add_badge(draw, bx, by, badge)

# The pitch
draw.text((64, y+130), "HTML in, pure HTML out.", fill=WHITE, font=f_title)
draw.text((64, y+168), "The bilateral boundary.", fill=WHITE, font=f_title)
draw.text((64, y+206), "No client-side framework required.", fill=ACCENT_DIM, font=f_title)

# Code preview
f_code = ImageFont.truetype(MONO, 12)
code_y = y + 270
draw.rectangle([54, code_y, W-54, code_y+100], fill=CODE_BG, outline=(50, 52, 48))
lines = [
    ("<!-- Server territory -->", DIM),
    ('<htx:each from="posts" as="post">', TEAL),
    ('  <h2><htx:v>post.title</htx:v></h2>', GRAY),
    ("</htx:each>", TEAL),
    ("<!-- Client receives: pure HTML -->", DIM),
]
for i, (line, color) in enumerate(lines):
    draw.text((72, code_y + 10 + i*18), line, fill=color, font=f_code)

add_footer(draw)
save(img, "home")

# ══════════════════════════════════════════════════
# Spec page
# ══════════════════════════════════════════════════
img, draw = new_image()
y = add_brand(draw, 50)
draw.text((64, y+15), "THE SPECIFICATION", fill=ACCENT, font=ImageFont.truetype(MONO, 14))
draw.text((64, y+50), "htxlang v0.2 — Working Draft", fill=WHITE, font=ImageFont.truetype(SANS_BOLD, 30))
draw.text((64, y+95), "Eight contracts a conformant engine must satisfy.", fill=GRAY, font=ImageFont.truetype(SANS, 18))
draw.text((64, y+125), "RFC 2119 keywords. Falsifiable. Implementable.", fill=DIM, font=ImageFont.truetype(SANS, 16))

# Contract list
f_item = ImageFont.truetype(MONO, 13)
contracts = ["C1 Document Model", "C2 Resolution", "C3 Expressions", "C4 Inclusions",
             "C5 Mutations", "C6 Data", "C7 Grants", "C8 Security"]
cx, cy = 64, y + 180
for i, c in enumerate(contracts):
    col = 0 if i < 4 else 1
    row = i % 4
    x = 64 + col * 320
    yy = cy + row * 28
    draw.text((x, yy), f"  {c}", fill=TEAL if i < 4 else ACCENT, font=f_item)

add_footer(draw)
save(img, "spec")

# ══════════════════════════════════════════════════
# Composition page
# ══════════════════════════════════════════════════
img, draw = new_image()
y = add_brand(draw, 50)
draw.text((64, y+15), "COMPOSITION", fill=ACCENT, font=ImageFont.truetype(MONO, 14))
draw.text((64, y+50), "How SERVER + PRESTO compose", fill=WHITE, font=ImageFont.truetype(SANS_BOLD, 28))
draw.text((64, y+95), "Two layers. Two bilateral boundaries.", fill=GRAY, font=ImageFont.truetype(SANS, 18))
draw.text((64, y+125), "SERVER bootstraps the graph. PRESTO resolves it.", fill=DIM, font=ImageFont.truetype(SANS, 16))

# Diagram
f_box = ImageFont.truetype(MONO, 14)
# SERVER box
draw.rectangle([80, y+180, 380, y+260], outline=ACCENT, width=2)
draw.text((100, y+190), "SERVER Layer", fill=ACCENT, font=ImageFont.truetype(SANS_BOLD, 16))
draw.text((100, y+215), "srv: namespace", fill=TEAL, font=f_box)
draw.text((100, y+235), "14-stage bootstrap", fill=DIM, font=f_box)

# Arrow
draw.text((410, y+210), "→", fill=GRAY, font=ImageFont.truetype(SANS, 28))

# PRESTO box
draw.rectangle([470, y+180, 770, y+260], outline=TEAL, width=2)
draw.text((490, y+190), "PRESTO Layer", fill=TEAL, font=ImageFont.truetype(SANS_BOLD, 16))
draw.text((490, y+215), "htx: namespace", fill=ACCENT, font=f_box)
draw.text((490, y+235), "22-stage pipeline", fill=DIM, font=f_box)

# Output
draw.text((800, y+210), "→  Pure HTML", fill=WHITE, font=ImageFont.truetype(SANS_BOLD, 16))

add_footer(draw)
save(img, "composition")

# ══════════════════════════════════════════════════
# Seed page
# ══════════════════════════════════════════════════
img, draw = new_image()
y = add_brand(draw, 50)
draw.text((64, y+15), "THE SEED", fill=ACCENT, font=ImageFont.truetype(MONO, 14))
draw.text((64, y+50), "~2,200 words of prose.", fill=WHITE, font=ImageFont.truetype(SANS_BOLD, 30))
draw.text((64, y+95), "Feed it to any frontier model.", fill=GRAY, font=ImageFont.truetype(SANS, 18))
draw.text((64, y+125), "Get a conformant engine.", fill=GRAY, font=ImageFont.truetype(SANS, 18))

draw.text((64, y+175), "Validated across 7 languages:", fill=DIM, font=ImageFont.truetype(SANS, 15))
bx = 64
for lang in ["TypeScript", "Go", "Zig", "Elixir", "Rust", "C", "Python"]:
    bx = add_badge(draw, bx, y+205, lang)

draw.text((64, y+265), "The seed determines the harvest.", fill=WHITE, font=ImageFont.truetype(SANS_BOLD, 22))
draw.text((64, y+300), "The derivation inversion.", fill=ACCENT_DIM, font=ImageFont.truetype(SANS, 18))

add_footer(draw)
save(img, "seed")

# ══════════════════════════════════════════════════
# Engine pages (one per language)
# ══════════════════════════════════════════════════
engine_data = [
    ("ts", "TypeScript", "Reference Engine", "1,555 lines · Bun runtime · Powers jaredfoy.com", ACCENT),
    ("go", "Go", "Go Engine", "2,387 lines · Native HTTP server · Full pipeline", (0, 173, 216)),
    ("zig", "Zig", "Zig Engine", "2,516 lines · Comptime-optimized · HTTP + CLI + tests", (236, 145, 64)),
    ("elixir", "Elixir", "Elixir Engine", "26,764 lines · Phoenix-based · Comprehensive", (75, 0, 130)),
    ("rust", "Rust", "Rust Engine", "54,155 lines · Ownership-driven safety · In progress", (222, 165, 132)),
    ("c", "C", "C Engine", "4,209 lines · Compiles on Raspberry Pi 5 · Zero deps", (85, 85, 85)),
    ("python", "Python", "Python Engine", "1,631 lines · Simplest derivation · Readable reference", (55, 118, 171)),
]

for slug, lang, title, desc, color in engine_data:
    img, draw = new_image()
    y = add_brand(draw, 50)
    draw.text((64, y+15), "ENGINE DERIVATION", fill=ACCENT, font=ImageFont.truetype(MONO, 14))
    draw.text((64, y+50), title, fill=WHITE, font=ImageFont.truetype(SANS_BOLD, 34))
    draw.text((64, y+100), desc, fill=GRAY, font=ImageFont.truetype(SANS, 16))

    # Language badge
    draw.rectangle([64, y+145, 180, y+195], fill=CODE_BG, outline=color, width=2)
    draw.text((80, y+157), lang, fill=color, font=ImageFont.truetype(SANS_BOLD, 22))

    draw.text((200, y+158), "Derived from the PRESTO Seed", fill=DIM, font=ImageFont.truetype(SANS, 15))

    # Code snippet
    f_code = ImageFont.truetype(MONO, 12)
    cy = y + 225
    draw.rectangle([54, cy, W-54, cy+80], fill=CODE_BG, outline=(50, 52, 48))
    draw.text((72, cy+10), f"// The bilateral boundary in {lang}", fill=DIM, font=f_code)
    draw.text((72, cy+30), f"resolve(template, context) -> pure HTML", fill=TEAL, font=f_code)
    draw.text((72, cy+50), f"// htx: directives consumed, HTML emitted", fill=DIM, font=f_code)

    add_footer(draw)
    draw.text((W-250, H-32), f"engines/{slug}", fill=DIM, font=ImageFont.truetype(MONO, 13))
    save(img, f"engine-{slug}")

# ══════════════════════════════════════════════════
# Implementation page
# ══════════════════════════════════════════════════
img, draw = new_image()
y = add_brand(draw, 50)
draw.text((64, y+15), "IMPLEMENTATION GUIDE", fill=ACCENT, font=ImageFont.truetype(MONO, 14))
draw.text((64, y+50), "Build a conformant engine", fill=WHITE, font=ImageFont.truetype(SANS_BOLD, 30))
draw.text((64, y+95), "Algorithms, data structures, exact behaviors.", fill=GRAY, font=ImageFont.truetype(SANS, 18))
draw.text((64, y+125), "Any language. Same constraints. Same properties.", fill=DIM, font=ImageFont.truetype(SANS, 16))

bx = 64
for badge in ["Router", "Parser", "Resolver", "Pipeline", "Security"]:
    bx = add_badge(draw, bx, y+175, badge)

add_footer(draw)
save(img, "implementation")

print(f"\nDone. {len(os.listdir(OUT))} images in {OUT}")
