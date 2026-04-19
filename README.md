# Multi-Color 3D Print Generator

Converts layered PNG/SVG images into STL or 3MF files for multi-color FDM printing.

## One-time setup

**macOS (for SVG support):**
```bash
brew install cairo
pip3 install -r requirements.txt
```

**Linux:**
```bash
sudo apt install libcairo2
pip3 install -r requirements.txt
```

## Open the app

```bash
python3 app.py
```

Then open **http://localhost:8080** in your browser.

Or double-click `launch.command` (macOS — sets up on first run).

---

## How to use

### 1. Print Settings (top-left card)

| Setting | What it does |
|---------|-------------|
| Width / Height | Physical size of the print in mm. Default is a standard business card (85.725 × 53.975mm). |
| 🔓 Lock ratio | Toggle to keep aspect ratio locked when you change one dimension. |
| Nozzle / Layer height | Used to generate the slicer guide — match your printer. |
| Quality | Scales down image resolution before voxelizing. **50% quality → ~25% the file size.** Use 100% for final prints, 50–70% for iteration. |
| Export as | **ZIP** = one STL per color. **3MF** = all colors in one file as separate objects (best for PrusaSlicer / Bambu Studio). |

### 2. Layer Groups

Each group is one Z-slice of your print. Groups stack **bottom → top**.

**Adding a layer:**
1. Click **+ Add Layer Group**
2. Set a name, height (mm), and alpha threshold
3. Pick a filament color
4. Upload a PNG or SVG (transparent background — opaque pixels = solid printed volume)

**Inlay (two interlocking colors at the same Z height):**
1. Click **+ Add Inlay Color** on any group
2. Upload a second file for Color 2
3. The generator automatically punches Color 2's shape out of Color 1 so they interlock perfectly

**Reorder:** drag the ⠿ handle. Z ranges on each group update automatically.

### 3. Preview

The right panel shows a real-time top-down composite. Colors match the filament pickers. Updates live as you upload files or change settings.

### 4. Generate

Click **Generate & Download**. Large/high-res files take a few seconds.

- **ZIP:** contains `layer1.stl`, `layer2.stl`, ..., and `slicer_guide.md` with step-by-step Simplify3D instructions.
- **3MF:** open in PrusaSlicer or Bambu Studio, right-click each object → assign filament/color.

---

## Slicer setup (quick version)

1. Import all STLs (or open the .3mf). Z positions are baked in — don't move them.
2. One process per STL, restricted to its Z range.
3. Filament change between layers via `M600` (requires Marlin with `ADVANCED_PAUSE_FEATURE`) or `M0`, or split into separate G-code files.

See `SIMPLIFY3D_GUIDE.md` for the full walkthrough, or open `slicer_guide.md` from any ZIP you download.

---

## Alpha threshold

Pixels with alpha ≥ threshold print solid; below threshold are empty. Default is 128. Lower it if your design is losing fine detail; raise it to clip faint edges.

---

## Repo structure

```
app.py              Web app (Flask)
png_to_stl.py       CLI: PNG → STL
array_cards.py      CLI: tile single card across the bed
core/
  converter.py      PNG/SVG → mask → mesh
  exporter.py       3MF writer
  guide.py          Slicer guide generator
static/             CSS + JS
templates/          HTML template
input/              Source PNGs/SVGs (CLI use)
output/             Generated STLs (CLI use)
presets/            Saved UI presets
docs/               Static GitHub Pages version (no server needed)
```
