#!/usr/bin/env python3
"""Safely unpack the seven unmodified owner-supplied JPEGs from incoming/final-product-images.zip."""
import hashlib
import json
from pathlib import Path
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[1]
manifest = json.loads((ROOT / "config/final-product-media-2026-10-29.json").read_text())
source = ROOT / "incoming/final-product-images.zip"
dest = ROOT / "public/final-product-images/2026-10-29"
expected = {x["file"] for x in manifest["images"]}
assert len(expected) == len(manifest["images"]) == 7
with ZipFile(source) as archive:
    available = {x.filename for x in archive.infolist() if not x.is_dir()}
    if not expected.issubset(available):
        raise RuntimeError("The ZIP does not contain all seven exact image filenames.")
    if available - expected - {"final-product-image-manifest.json"}:
        raise RuntimeError("Unexpected file in the image ZIP.")
    # Verify everything BEFORE modifying the destination.
    validated = {}
    for item in manifest["images"]:
        raw = archive.read(item["file"])
        if len(raw) != item["sizeBytes"] or hashlib.sha256(raw).hexdigest() != item["sha256"]:
            raise RuntimeError(f"Unexpected bytes for {item['file']}; original photo must be unchanged.")
        if not raw.startswith(b"\xff\xd8\xff") or not raw.endswith(b"\xff\xd9"):
            raise RuntimeError(f"Invalid JPEG markers in {item['file']}")
        validated[item["file"]] = raw

dest.mkdir(parents=True, exist_ok=True)
for name, raw in validated.items():
    (dest / name).write_bytes(raw)
images = sorted(x.name for x in dest.iterdir() if x.is_file())
if images != sorted(expected):
    raise RuntimeError(f"Unexpected additional files in final images directory: {images}")
print("Verified and extracted seven exact original JPEGs (no transcode, no resize).")
