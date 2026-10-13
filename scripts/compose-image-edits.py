"""Composite image-tool masks and edits sequentially over the original photo.

Run: python scripts/compose-image-edits.py
Requires Pillow, NumPy and OpenCV (opencv-python).
White mask pixels copy an addition, or restore original pixels for a removal;
black pixels retain the preceding composite.
The original stays at native resolution. Generated edits are resized to match it.
Raw image-tool masks are retained in masks/raw; registered binary masks in masks.
"""
from pathlib import Path
import json
import numpy as np
import cv2
from PIL import Image, ImageChops, ImageFilter, ImageOps

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "public/assets/blogs/image-editing"
EDITS = ["01-add-basket.png", "02-add-bicycle.png", "03-remove-basket.png",
         "04-add-kite.png", "05-remove-all-additions.png"]
original = ImageOps.exif_transpose(Image.open(ASSETS / "00-original.jpg")).convert("RGB")
grid = Image.open(ASSETS / EDITS[0]).size
original_pixels = np.asarray(original)
previous = original.copy()
union = Image.new("L", original.size, 0)
masks = []
records = []
(ASSETS / "composited").mkdir(exist_ok=True)

def tighten_object(photo, coarse, index, delta=None):
    """Use the generated mask as a prior, then fit the actual object edges.

    Search margins are uncertain background, never automatically white pixels.
    Foreground seeds come from the object's colours in the actual photograph.
    """
    rgb = np.asarray(photo.convert("RGB"), dtype=np.int16)
    r, g, b = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]
    brown_red = (r > g * (1.17 if index == 1 else 1.3)) & (r > b * 1.2) & (r - b > 20)
    coarse_pixels = np.asarray(coarse) > 0
    support = np.asarray(coarse.filter(ImageFilter.MaxFilter(7 if index == 1 else 31))) > 0
    if index == 2:
        # Keep the search constrained to the actual bicycle, including pedals.
        support[675:1040, 435:1065] = True
        support[:675] = False
        support[1040:] = False
        support[:, :435] = False
        support[:, 1065:] = False
    labels = np.full(support.shape, cv2.GC_BGD, dtype=np.uint8)
    labels[support] = cv2.GC_PR_BGD
    neutral = (rgb.max(axis=2) - rgb.min(axis=2)) < 45
    likely = coarse_pixels & (brown_red | neutral) if index == 2 else coarse_pixels & brown_red
    if delta is not None:
        likely &= delta > 12
    labels[likely & support] = cv2.GC_PR_FGD
    seeds = brown_red & support
    if delta is not None:
        seeds &= delta > 40
        seeds |= coarse_pixels & neutral & (delta > 75) & support
    seeds = cv2.erode(seeds.astype(np.uint8), np.ones((3, 3), np.uint8)) > 0
    labels[seeds] = cv2.GC_FGD
    if not seeds.any():
        raise ValueError("No foreground seeds for object mask")
    cv2.setRNGSeed(0)
    cv2.grabCut(rgb.astype(np.uint8)[:, :, ::-1].copy(), labels, None,
                np.zeros((1, 65), np.float64), np.zeros((1, 65), np.float64), 5, cv2.GC_INIT_WITH_MASK)
    selected = (labels == cv2.GC_FGD) | (labels == cv2.GC_PR_FGD)
    if delta is not None:
        selected &= delta > 8
    if index == 2:
        # Colour segmentation can drop subpixel silver spokes. Select these
        # directly from the photo within the two wheels, with no dilation.
        yy, xx = np.indices(support.shape)
        wheels = (((xx - 558) / 116) ** 2 + ((yy - 927) / 118) ** 2 < 1) | (((xx - 934) / 122) ** 2 + ((yy - 940) / 116) ** 2 < 1)
        # Silver spokes contrast against the yellow meadow most clearly in blue.
        edges = cv2.Canny(rgb[:, :, 2].astype(np.uint8), 20, 60)
        spoke_support = np.zeros(support.shape, np.uint8)
        for cx, cy, rx, ry in [(556, 934, 116, 118), (939, 952, 122, 116)]:
            wheel = (((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2 < .93)
            wheel_edges = edges.copy()
            wheel_edges[~wheel] = 0
            lines = cv2.HoughLinesP(wheel_edges, 1, np.pi / 720, 15, minLineLength=20, maxLineGap=8)
            if lines is None:
                continue
            for x1, y1, x2, y2 in lines[:, 0]:
                length = np.hypot(x2 - x1, y2 - y1)
                hub_distance = abs((y2 - y1) * cx - (x2 - x1) * cy + x2 * y1 - y2 * x1) / length
                if hub_distance > 5:
                    continue
                line = np.zeros(support.shape, np.uint8)
                cv2.line(line, (x1, y1), (x2, y2), 255, 2)
                pixels = (line > 0) & wheel
                if pixels.any() and (delta[pixels] > 18).mean() > .35:
                    spoke_support[pixels] = 255
        selected |= (spoke_support > 0) & (delta > 12)
        # Discard isolated background specks outside the wheel interiors.
        count, components, stats, _ = cv2.connectedComponentsWithStats(selected.astype(np.uint8), 8)
        largest = 1 + np.argmax(stats[1:, cv2.CC_STAT_AREA])
        selected &= (components == largest) | wheels
    return Image.fromarray(selected.astype(np.uint8) * 255)

for index, name in enumerate(EDITS, 1):
    kite_shape = None
    string_mask = None
    mask = Image.open(ASSETS / "masks/raw" / f"{index:02}.png").convert("L")
    mask = mask.resize(grid, Image.Resampling.NEAREST).point(lambda v: 255 if v >= 128 else 0)
    if index == 2:
        # The image-tool bicycle mask was shifted and stretched. Register its
        # bounding box to the bicycle's observed bounds in the edit photograph.
        bounds = mask.getbbox()
        target = (444, 682, 1056, 1030)
        crop = mask.crop(bounds).resize((target[2] - target[0], target[3] - target[1]), Image.Resampling.NEAREST)
        mask = Image.new("L", grid, 0)
        mask.paste(crop, target[:2])
    if index == 1:
        mask = tighten_object(Image.open(ASSETS / name), mask, index).filter(ImageFilter.MaxFilter(3))
    if index in (2, 4):
        current_pixels = np.asarray(Image.open(ASSETS / name).convert("RGB"), dtype=np.int16)
        before_pixels = np.asarray(Image.open(ASSETS / EDITS[index - 2]).convert("RGB"), dtype=np.int16)
        delta = np.max(np.abs(current_pixels - before_pixels), axis=2)
        if index == 2:
            mask = tighten_object(Image.open(ASSETS / name), mask, index, delta)
        else:
            # The faint string cannot be selected reliably by a difference
            # threshold: it produces gaps and copies stray sky changes. Keep
            # the image-tool kite silhouette and fit the ribbons by colour.
            yy, xx = np.indices(delta.shape)
            coarse = np.asarray(mask) > 0
            body = coarse & (yy < 258) & (xx > 280)
            ribbon_support = (np.asarray(mask.filter(ImageFilter.MaxFilter(15))) > 0) & (yy >= 242) & (yy < 330)
            r, g, b = current_pixels[:, :, 0], current_pixels[:, :, 1], current_pixels[:, :, 2]
            red_ribbon = (r > g * 1.3) & (r > b * 1.1)
            blue_ribbon = (b > r * 1.4) & (b > g * 1.15) & (g < 130) & (b < 210)
            ribbons = ribbon_support & (red_ribbon | blue_ribbon) & (delta > 12)
            mask = Image.fromarray((body | ribbons).astype(np.uint8) * 255).filter(ImageFilter.MaxFilter(5))
            kite_shape = mask.copy()
            # Select the string from the supplied image-tool mask. There is no
            # traced replacement geometry or newly painted image content.
            string_mask = Image.fromarray((coarse & (yy >= 245) & (xx > 330)).astype(np.uint8) * 255)
            string_mask = string_mask.filter(ImageFilter.MaxFilter(5))
            mask = ImageChops.lighter(mask, string_mask)
    if index == 3:
        # Restore precisely the area used by the addition, with no extra margin.
        mask = masks[0].copy()
    if index == 5:
        mask = ImageChops.lighter(masks[1], masks[3])
    masks.append(mask)
    alpha = mask
    if index in (1, 4):
        # Fade only the newly expanded guard edge; zero stays exactly zero.
        feather_shape = kite_shape if index == 4 else mask
        distance = cv2.distanceTransform((np.asarray(feather_shape) > 0).astype(np.uint8), cv2.DIST_L2, 5)
        edge_width = 1.5 if index == 1 else 2.5
        weights = np.clip((distance - .5) / edge_width, 0, 1)
        alpha = Image.fromarray(np.round(weights * 255).astype(np.uint8))
    if index == 4:
        # Copy the actual source-image string pixels at full mask strength.
        # Feathering must not attenuate this already antialiased thin feature.
        alpha = ImageChops.lighter(alpha, string_mask)
    native_mask = mask.resize(original.size, Image.Resampling.NEAREST)
    native_alpha = alpha.resize(original.size, Image.Resampling.NEAREST)
    edit = original if index in (3, 5) else Image.open(ASSETS / name).convert("RGB").resize(original.size, Image.Resampling.LANCZOS)
    composite = Image.composite(edit, previous, native_alpha)
    alpha.save(ASSETS / "masks" / f"{index:02}.png")
    union = ImageChops.lighter(union, native_mask)
    pixels = np.asarray(composite)
    previous_pixels = np.asarray(previous)
    black = np.asarray(native_mask) == 0
    opaque = np.asarray(native_alpha) == 255
    untouched = np.asarray(union) == 0
    assert np.array_equal(pixels[black], previous_pixels[black]), "Pixels escaped the current mask"
    assert np.array_equal(pixels[opaque], np.asarray(edit)[opaque]), "Opaque pixels must come directly from the supplied photo"
    assert np.array_equal(pixels[untouched], original_pixels[untouched]), "Unmasked original pixels changed"
    output = ASSETS / "composited" / f"{index:02}.png"
    composite.save(output)
    # Verify the lossless saved deliverable, not just the in-memory image.
    assert np.array_equal(np.asarray(Image.open(output)), pixels)
    records.append({"step": index, "edit": name, "mask": f"masks/{index:02}.png",
                    "composite": f"composited/{index:02}.png", "resolution": list(original.size),
                    "mask_coverage_percent": round(float((~black).mean() * 100), 4),
                    "cumulative_coverage_percent": round(float((~untouched).mean() * 100), 4),
                    "source": "original restoration" if index in (3, 5) else "generated addition",
                    "supplied_photos_only": True,
                    "outside_mask_identical": True})
    previous = composite
    print(f"Step {index}: {records[-1]['mask_coverage_percent']}% selected; original preserved outside cumulative masks")

assert np.array_equal(np.asarray(previous), original_pixels), "Final restoration must exactly match the original"
records[-1]["identical_to_original"] = True
(ASSETS / "composited" / "manifest.json").write_text(json.dumps(records, indent=2) + "\n", encoding="utf-8")
