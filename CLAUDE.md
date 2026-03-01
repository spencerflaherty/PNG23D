# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Python toolchain to convert layered transparent-background PNGs into extruded STL files for multi-color 3D printed business cards (Creality Ender 3, Simplify3D slicer). Two filament colors are achieved via a filament swap between separately sliced Z-range processes.

## Commands

```bash
# Install dependencies
pip install -r requirements.txt

# Convert a single PNG to STL
python png_to_stl.py "input/Layer 1.png" --height 0.8 --z-offset 0.0 -o output/layer1.stl
python png_to_stl.py "input/Layer 2.png" --height 0.4 --z-offset 0.8 -o output/layer2.stl

# Convert all 2 layers at once
python png_to_stl.py --batch

# Array single-card STLs into a print bed grid (default 3x2)
python array_cards.py --batch
python array_cards.py --batch --cols 2 --rows 3

# Array a single STL
python array_cards.py -i output/layer1.stl --cols 3 --rows 2

# Check max cards that fit the bed
python array_cards.py --max-fit
```

## Architecture

**Two-script pipeline:**

1. `png_to_stl.py` — Loads a PNG alpha channel, thresholds it to a binary mask, then voxelizes each opaque pixel into a rectangular column (6 faces, 12 triangles each) using `numpy-stl`. Only exposes side faces adjacent to empty pixels to keep meshes clean. Two slicer-compatibility fixes are baked in: (a) 4 corner pixels forced solid so all layers share identical XY bounding boxes for correct auto-centering; (b) layers with z_offset > 0 get a 0.001mm anchor rectangle at Z=0 so slicers' "drop to floor" doesn't shift the geometry off its intended Z position.

2. `array_cards.py` — Loads a single-card STL, copies its triangle vectors N×M times with XY translations, centers the grid on the Ender 3 bed (235×235mm), and saves a combined mesh. Used to fill the bed for production runs.

**Card orientation:** landscape — 85.725mm wide × 53.975mm tall (3.375" × 2.125").

**Layer stack (bottom to top):**
| Layer | File | Z range | Height |
|-------|------|---------|--------|
| 1 | `Layer 1.png` | 0.0–0.8mm | 0.8mm |
| 2 | `Layer 2.png` | 0.8–1.2mm | 0.4mm |

**Expected directory layout at runtime:**
```
input/          # User-provided PNGs (must be same pixel dimensions)
output/         # Generated single-card STLs
output/full_plate/  # Arrayed plate STLs for full bed
```

## Critical Constraints

- **PNG resolution:** Minimum 214px wide (0.4mm/px at 85.725mm); recommended 857px+ (0.1mm/px)
- **Both input PNGs must be identical pixel dimensions** — they share the same XY scale mapping
- **Minimum printable feature:** ~1.2mm (3× the 0.4mm nozzle); QR code modules must be ≥1.2mm
- **Alpha threshold** defaults to 128; adjust with `--threshold` if edges are jagged
- The voxel approach produces large STL files for high-res PNGs (many triangles per card) — this is expected

## Slicer Notes

See `SIMPLIFY3D_GUIDE.md` for full setup. Key point: Ender 3 stock firmware may not support `M600` (filament change G-code). If not, flash Marlin with `ADVANCED_PAUSE_FEATURE` or use the manual G-code split approach (split into 2 files, strip `G28` homing from file 2).
