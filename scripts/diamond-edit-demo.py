"""Create the procedural 10k original; composite only image-tool output pixels.

Run with --prepare before image generation, then without it after placing
image-tool outputs in diamonds/edited.png and diamonds/mask-raw.png.
"""
from pathlib import Path
import argparse
import json
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

Image.MAX_IMAGE_PIXELS = None  # This controlled example intentionally has 100M pixels.
ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "public/assets/blogs/image-editing/diamonds"
SIZE, PITCH, RADIUS = 10000, 240, 80
PREVIEW = 1400
TILE = 500

def preview(image, name, size=PREVIEW):
    image.convert("RGB").resize((size, size), Image.Resampling.LANCZOS).save(ASSETS / name)

def tiles(image, directory, tile_size=TILE):
    target = ASSETS / directory
    target.mkdir(exist_ok=True)
    for y in range(0, image.height, tile_size):
        for x in range(0, image.width, tile_size):
            image.crop((x, y, min(x + tile_size, image.width), min(y + tile_size, image.height))).save(target / f"{x // tile_size}-{y // tile_size}.png")

ASSETS.mkdir(parents=True, exist_ok=True)
parser = argparse.ArgumentParser()
parser.add_argument("--prepare", action="store_true")
args = parser.parse_args()
if args.prepare:
    original = Image.new("1", (SIZE, SIZE), 1)
    draw = ImageDraw.Draw(original)
    for y in range(200, 9801, PITCH):
        for x in range(200, 9801, PITCH):
            draw.polygon([(x, y - RADIUS), (x + RADIUS, y), (x, y + RADIUS), (x - RADIUS, y)], fill=0)
    original.save(ASSETS / "original.png")
    preview(original, "original-preview.png")
    tiles(original, "original-tiles")
    print("Prepared 10,000 × 10,000 original with 1,681 black diamonds; centre diamond is at (5000, 5000).")
else:
    original = Image.open(ASSETS / "original.png").convert("RGB")
    edited = Image.open(ASSETS / "edited.png").convert("RGB")
    preview(edited, "edited-preview.png", 800)
    tiles(edited, "edited-tiles", 256)
    raw_mask = Image.open(ASSETS / "mask-raw.png").convert("L")
    mask = raw_mask.resize(edited.size, Image.Resampling.NEAREST).point(lambda v: 255 if v >= 128 else 0)
    if not mask.getbbox():
        raise ValueError("Image-tool mask is empty")
    # Constrain the tool's mask to the yellow pixels actually present in its
    # supplied edit. No diamond, colour or replacement pixel is drawn here.
    rgb = np.asarray(edited, dtype=np.int16)
    yellow = (rgb[:, :, 0] > 150) & (rgb[:, :, 1] > 110) & (rgb[:, :, 2] < 125)
    support = np.asarray(mask.filter(ImageFilter.MaxFilter(5))) > 0
    mask = Image.fromarray((support & yellow).astype(np.uint8) * 255)
    if not mask.getbbox():
        raise ValueError("No yellow diamond selected by the supplied mask")
    native_mask = mask.resize((SIZE, SIZE), Image.Resampling.NEAREST)
    native_edit = edited.resize((SIZE, SIZE), Image.Resampling.LANCZOS)
    composite = Image.composite(native_edit, original, native_mask)
    composite.save(ASSETS / "composited.png")
    native_mask.save(ASSETS / "mask.png")
    preview(composite, "composited-preview.png")
    mask.resize((PREVIEW, PREVIEW), Image.Resampling.NEAREST).save(ASSETS / "mask-preview.png")
    tiles(composite, "composited-tiles")
    # Chunked verification avoids allocating several 100M-pixel RGB arrays.
    selected = 0
    saved = Image.open(ASSETS / "composited.png")
    for y in range(0, SIZE, TILE):
        box = (0, y, SIZE, y + TILE)
        m = np.asarray(native_mask.crop(box)) > 0
        a = np.asarray(original.crop(box))
        b = np.asarray(saved.crop(box))
        e = np.asarray(native_edit.crop(box))
        assert np.array_equal(a[~m], b[~m]), "Original pixels changed outside mask"
        assert np.array_equal(e[m], b[m]), "Selected pixels differ from supplied edit"
        selected += int(m.sum())
    metadata = {"original_size": list(original.size), "edited_size": list(edited.size),
                "composited_size": list(composite.size), "selected_pixels": selected,
                "outside_mask_identical": True, "selected_pixels_from_supplied_edit": True,
                "centre": [5000, 5000], "tile_size": TILE}
    (ASSETS / "manifest.json").write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(metadata))
