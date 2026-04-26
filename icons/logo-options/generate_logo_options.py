from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageFont
import math


OUT_DIR = Path(__file__).resolve().parent
BASE = 1024
SCALE = BASE / 128


def sp(value):
    return int(round(value * SCALE))


def rgba(color, alpha=255):
    color = color.lstrip("#")
    return tuple(int(color[i : i + 2], 16) for i in (0, 2, 4)) + (alpha,)


def mix(a, b, t):
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(4))


def load_font(size, bold=False):
    names = [
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf" if bold else "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
        "/Library/Fonts/Arial.ttf",
    ]
    for name in names:
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            pass
    return ImageFont.load_default()


def rounded_bg(colors, pad=8, radius=27, glow=None):
    img = Image.new("RGBA", (BASE, BASE), (0, 0, 0, 0))
    px = img.load()
    c1, c2, c3 = [rgba(c) for c in colors]
    for y in range(BASE):
        for x in range(BASE):
            diag = (x * 0.78 + y) / (BASE * 1.78)
            col = mix(c1, c2, min(diag / 0.58, 1)) if diag < 0.58 else mix(c2, c3, (diag - 0.58) / 0.42)
            if glow:
                gx, gy, gr, gc, amount = glow
                dist = math.hypot(x - sp(gx), y - sp(gy)) / sp(gr)
                power = max(0.0, 1 - dist) ** 1.9
                if power:
                    col = mix(col, rgba(gc), amount * power)
            px[x, y] = col

    mask = Image.new("L", (BASE, BASE), 0)
    d = ImageDraw.Draw(mask)
    d.rounded_rectangle([sp(pad), sp(pad), sp(128 - pad), sp(128 - pad)], radius=sp(radius), fill=255)
    img.putalpha(mask)
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([sp(pad + 0.4), sp(pad + 0.4), sp(128 - pad - 0.4), sp(128 - pad - 0.4)], radius=sp(radius - 0.4), outline=rgba("#071f1c", 70), width=sp(1.6))
    return img


def shadow_layer(mask, offset=(0, 6), blur=5, alpha=72, color="#051f1b"):
    shadow = Image.new("L", (BASE, BASE), 0)
    shadow.paste(mask, (sp(offset[0]), sp(offset[1])))
    shadow = shadow.filter(ImageFilter.GaussianBlur(sp(blur)))
    layer = Image.new("RGBA", (BASE, BASE), rgba(color))
    layer.putalpha(shadow.point(lambda p: int(p * alpha / 255)))
    return layer


def paint_mask(img, mask, color, shadow=True, shadow_alpha=72):
    if shadow:
        img.alpha_composite(shadow_layer(mask, alpha=shadow_alpha))
    layer = Image.new("RGBA", (BASE, BASE), rgba(color) if isinstance(color, str) else color)
    layer.putalpha(mask)
    img.alpha_composite(layer)


def bookmark_mask(x, y, w, h, radius=9, notch=20):
    mask = Image.new("L", (BASE, BASE), 0)
    d = ImageDraw.Draw(mask)
    d.rounded_rectangle([sp(x), sp(y), sp(x + w), sp(y + radius * 2.1)], radius=sp(radius), fill=255)
    d.rectangle([sp(x), sp(y + radius), sp(x + w), sp(y + h - notch)], fill=255)
    d.polygon(
        [
            (sp(x), sp(y + h - notch)),
            (sp(x), sp(y + h)),
            (sp(x + w / 2), sp(y + h - notch * 0.58)),
            (sp(x + w), sp(y + h)),
            (sp(x + w), sp(y + h - notch)),
        ],
        fill=255,
    )
    return mask


def rounded_shape_mask(box, radius):
    mask = Image.new("L", (BASE, BASE), 0)
    d = ImageDraw.Draw(mask)
    d.rounded_rectangle([sp(box[0]), sp(box[1]), sp(box[2]), sp(box[3])], radius=sp(radius), fill=255)
    return mask


def option_01():
    img = rounded_bg(["#1f8a6b", "#17614f", "#0d3e37"], glow=(34, 24, 78, "#55d6a7", 0.25))
    bm = bookmark_mask(38, 22, 52, 81, radius=10, notch=22)
    paint_mask(img, bm, "#fff6df", shadow_alpha=78)
    d = ImageDraw.Draw(img)
    green = rgba("#17614f")
    for y, w in [(49, 25), (63, 33), (77, 21)]:
        d.rounded_rectangle([sp(52), sp(y), sp(52 + w), sp(y + 5.4)], radius=sp(2.7), fill=green)
        d.ellipse([sp(44.5), sp(y - 0.4), sp(50), sp(y + 5.1)], fill=green)
    return img


def option_02():
    img = rounded_bg(["#12343b", "#1f6f61", "#0b2e34"], glow=(90, 25, 80, "#5fe0c0", 0.2))
    tab = rounded_shape_mask((24, 32, 64, 48), 8)
    body = rounded_shape_mask((20, 41, 108, 90), 12)
    paint_mask(img, tab, "#ffcf5a", shadow=False)
    paint_mask(img, body, "#f8bd3a", shadow=True, shadow_alpha=74)
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([sp(29), sp(51), sp(99), sp(80)], radius=sp(7), fill=rgba("#ffe58a"))
    tag = bookmark_mask(50, 38, 27, 57, radius=6, notch=13)
    paint_mask(img, tag, "#ef6b55", shadow=True, shadow_alpha=38)
    d.line([(sp(58), sp(58)), (sp(66), sp(66)), (sp(58), sp(74))], fill=rgba("#ffffff"), width=sp(4), joint="curve")
    for x, y in [(58, 58), (66, 66), (58, 74)]:
        d.ellipse([sp(x - 2.8), sp(y - 2.8), sp(x + 2.8), sp(y + 2.8)], fill=rgba("#ffffff"))
    return img


def option_03():
    img = rounded_bg(["#f8f0de", "#f4f7f1", "#e5f0ec"], glow=(20, 22, 86, "#ffd978", 0.18))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([sp(8.5), sp(8.5), sp(119.5), sp(119.5)], radius=sp(26), outline=rgba("#174f47", 150), width=sp(3.4))
    bm = bookmark_mask(35, 18, 58, 89, radius=11, notch=23)
    paint_mask(img, bm, "#1c7a64", shadow_alpha=62)
    d = ImageDraw.Draw(img)
    pts = [(52, 43), (76, 51), (55, 70), (78, 82)]
    for a, b in [(0, 1), (1, 2), (2, 3), (1, 3)]:
        d.line([(sp(pts[a][0]), sp(pts[a][1])), (sp(pts[b][0]), sp(pts[b][1]))], fill=rgba("#d9fff1"), width=sp(4))
    colors = ["#ffffff", "#f6c74a", "#ffffff", "#f26d5b"]
    for (x, y), c in zip(pts, colors):
        d.ellipse([sp(x - 5), sp(y - 5), sp(x + 5), sp(y + 5)], fill=rgba(c))
    return img


def option_04():
    img = rounded_bg(["#0f2e2b", "#164e43", "#071d1b"], glow=(42, 24, 76, "#ffd66a", 0.14))
    bm = bookmark_mask(31, 18, 66, 93, radius=13, notch=24)
    paint_mask(img, bm, "#f7c64b", shadow_alpha=90)
    d = ImageDraw.Draw(img)
    font = load_font(sp(55), bold=True)
    text = "B"
    bbox = d.textbbox((0, 0), text, font=font)
    x = sp(64) - (bbox[2] - bbox[0]) // 2
    y = sp(57) - (bbox[3] - bbox[1]) // 2 - sp(6)
    d.text((x, y), text, font=font, fill=rgba("#103a35"))
    d.rounded_rectangle([sp(43), sp(83), sp(85), sp(89)], radius=sp(3), fill=rgba("#103a35", 220))
    return img


def option_05():
    img = rounded_bg(["#103b5c", "#146a75", "#102a43"], glow=(35, 30, 82, "#64dcff", 0.2))
    d = ImageDraw.Draw(img)
    d.ellipse([sp(25), sp(22), sp(86), sp(83)], outline=rgba("#dff8ff"), width=sp(9))
    d.line([(sp(78), sp(78)), (sp(103), sp(103))], fill=rgba("#ffb34d"), width=sp(13))
    d.line([(sp(78), sp(78)), (sp(103), sp(103))], fill=rgba("#103b5c"), width=sp(4))
    bm = bookmark_mask(44, 30, 31, 57, radius=6, notch=15)
    paint_mask(img, bm, "#fff6df", shadow=True, shadow_alpha=35)
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([sp(52), sp(48), sp(68), sp(53)], radius=sp(2.5), fill=rgba("#146a75"))
    d.rounded_rectangle([sp(52), sp(62), sp(65), sp(67)], radius=sp(2.5), fill=rgba("#146a75"))
    return img


def option_06():
    img = rounded_bg(["#243b53", "#1e5f59", "#0b2d2e"], glow=(92, 26, 80, "#ffcf5a", 0.14))
    d = ImageDraw.Draw(img)
    shelf = rounded_shape_mask((25, 29, 103, 97), 12)
    paint_mask(img, shelf, "#f6f3e8", shadow_alpha=70)
    colors = ["#1f8a6b", "#ef6b55", "#f6c74a", "#2f80ed"]
    xs = [35, 49, 63, 77]
    heights = [50, 59, 45, 54]
    for x, h, c in zip(xs, heights, colors):
        m = bookmark_mask(x, 39, 12, h, radius=3, notch=6)
        paint_mask(img, m, c, shadow=False)
    d.rounded_rectangle([sp(33), sp(82), sp(95), sp(88)], radius=sp(3), fill=rgba("#173f3a"))
    d.rounded_rectangle([sp(39), sp(34), sp(73), sp(40)], radius=sp(3), fill=rgba("#173f3a"))
    return img


OPTIONS = [
    ("01", "Clean Ribbon", option_01),
    ("02", "Folder Tag", option_02),
    ("03", "Neural Mark", option_03),
    ("04", "Bold B", option_04),
    ("05", "Search Mark", option_05),
    ("06", "Tidy Tiles", option_06),
]


def export_all():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    previews = []
    for number, name, fn in OPTIONS:
        img = fn()
        for size in (16, 32, 48, 128, 512):
            out = OUT_DIR / f"option-{number}-{size}.png"
            img.resize((size, size), Image.Resampling.LANCZOS).save(out, optimize=True)
        previews.append((number, name, img.resize((256, 256), Image.Resampling.LANCZOS)))

    cell_w, cell_h = 360, 380
    sheet = Image.new("RGBA", (cell_w * 3, cell_h * 2), rgba("#f7f7f2"))
    d = ImageDraw.Draw(sheet)
    title_font = load_font(26, bold=True)
    name_font = load_font(24, bold=True)
    small_font = load_font(16, bold=False)
    for i, (number, name, img) in enumerate(previews):
        col, row = i % 3, i // 3
        x, y = col * cell_w, row * cell_h
        d.rounded_rectangle([x + 28, y + 24, x + cell_w - 28, y + cell_h - 24], radius=18, fill=rgba("#ffffff"), outline=rgba("#dde2d7"))
        sheet.alpha_composite(img, (x + 52, y + 46))
        d.text((x + 52, y + 318), number, font=title_font, fill=rgba("#17614f"))
        d.text((x + 96, y + 320), name, font=name_font, fill=rgba("#171b17"))
        d.text((x + 52, y + 350), f"icons/logo-options/option-{number}-128.png", font=small_font, fill=rgba("#697168"))
    sheet.save(OUT_DIR / "logo-options-sheet.png", optimize=True)

    size_sheet = Image.new("RGBA", (940, 860), rgba("#f7f7f2"))
    d = ImageDraw.Draw(size_sheet)
    header_font = load_font(24, bold=True)
    label_font = load_font(18, bold=True)
    d.text((32, 24), "Small-size check", font=header_font, fill=rgba("#171b17"))
    column_x = 280
    column_gap = 150
    for j, size in enumerate((16, 32, 48, 128)):
        d.text((column_x + j * column_gap, 28), f"{size}px", font=label_font, fill=rgba("#697168"))
    for i, (number, name, _) in enumerate(previews):
        y = 84 + i * 124
        d.text((32, y + 44), f"{number} {name}", font=label_font, fill=rgba("#171b17"))
        for j, size in enumerate((16, 32, 48, 128)):
            icon = Image.open(OUT_DIR / f"option-{number}-{size}.png").convert("RGBA")
            if size < 128:
                icon = icon.resize((96, 96), Image.Resampling.NEAREST)
            x = column_x - 10 + j * column_gap + (96 - icon.width) // 2
            d.rounded_rectangle([x - 8, y + 8, x + icon.width + 8, y + icon.height + 8], radius=10, fill=rgba("#ffffff"), outline=rgba("#dde2d7"))
            size_sheet.alpha_composite(icon, (x, y + 16))
    size_sheet.save(OUT_DIR / "logo-options-size-check.png", optimize=True)


if __name__ == "__main__":
    export_all()
