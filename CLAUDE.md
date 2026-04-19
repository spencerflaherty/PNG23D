# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## ⚡ Auto-Update This File

**Whenever you make changes to this codebase, update this CLAUDE.md before ending the turn.** Do not wait for the user to ask. If you add/remove/rename a file, change a command, alter the architecture, change a constraint, or add a new feature, the corresponding section here must be updated in the same turn so this file always reflects the current state of the repo. If a change makes a section obsolete, delete it. Treat stale documentation as a bug.

---

## Project

PNG23D is a tool that converts layered transparent-background PNGs/SVGs into an extruded multi-color 3MF plus a matching `.3dp` project file for 3D printed business cards and other flat prints.

**Primary deliverable: `index.html` — a single-file, serverless web app.**

It runs entirely in the browser. The user opens the HTML file (locally or via GitHub Pages), uploads PNGs, configures settings, and downloads a print-ready `.3mf` plus the saved `.3dp` project file. No server, no Python, no install. Hosted free on GitHub Pages.

## Commands

```bash
# Open the serverless app locally
open index.html
# or serve via any static server (e.g.):
python3 -m http.server 8000   # → http://localhost:8000

# Deploy: push to GitHub, enable Pages on main branch (root)
```

## Architecture

### `index.html` — the serverless app (primary)

One file. Everything lives inside it: HTML, CSS, JS. Sections:

1. **UI** — 4-step wizard (Start → Size & DPI → Print Settings → Arrange Layers), cyberpunk terminal theme with B/W classic toggle. The interface is stripped to minimal labels with no verbose subtitle copy — all guidance lives in the Help modal. Step 1: project name field + New Project button + "Drop .3dp Project File" dropzone (with upload SVG icon). Step 1 auto-focuses the project-name field and shows an inline terminal-style white block cursor while empty. Step 2: preset sizing, aspect-ratio lock, inline reference PNG dropzone, editable DPI field (just label + input, no readout line or "if blank" note). When dimensions match a preset the status shows "Preset · W mm × H mm"; when custom it shows "Custom size". Steps 3–4 have no subtitles. Step 4 is a single-column layout: 3D isometric canvas preview at top, layer stack below. The 3D preview supports full orbital drag: left-right changes azimuth, up-down changes elevation (pitch clamped −83° to +83° so the user can look at the underside); touch drag also supported. Camera distance auto-fits to the model's diagonal accounting for canvas aspect (`max(fitV, fitH) * 1.25`) so no edge clips at any orbit angle. Before any layers are added the canvas is hidden and a dashed-border placeholder box (same 240px height as the canvas) shows a `[ + ]` glyph, "Add a layer to get started.", and a muted `// preview will render here` hint — disappears as soon as the first layer is added. New projects start with zero layers. Layer card is compact: [snap-thumb canvas] [artwork dropzone] [name input] [color] [+Inlay] [trash] on the top row; mm and layers inputs side-by-side on the second row; optional inlay row below. The snap-thumb is a live canvas rendering the layer+inlay composite — artwork is aspect-fit at 90% scale (5% inset on every side) so the bounding box never crops it. Stats below the preview are a fixed 12-col grid arranged as two rows: row 1 has 3 wider chips (Card, Total Height, Layers — each `span 4`) and row 2 has 4 narrower chips (Nozzle, Layer H, Alpha, Quality — each `span 3`); collapses to a 2-col grid at ≤620px. Each chip has its own bordered card with uppercase label above a pink value. Add Layer button is centered. No drag handle — the whole card drags. The layer list never scrolls; the container grows. Default layer colors are black (`#000000`) and white (`#ffffff`) cycling; default inlay color is the opposite of the layer color (`defaultInlayColor()`). Layer names auto-name as L1, L2, etc. Thickness has two linked inputs: mm (80px wide so values aren't truncated) and print layers. Back/Next buttons are centered at the bottom of the app window (no top nav bar); Next/Generate are pink (`btn-generate`), Back is muted secondary. While generating, the Generate button is replaced inline by a progress bar with label ("Layer N of M · name", then "Packaging 3MF…", then "Downloading…") and an estimated-time-remaining readout (`elapsed / progress * (1 − progress)`); per-layer work units = 1 + (1 if inlay) + 1 packaging step. Help lives in a `site-footer` outside the `.app-window`. The portfolio logo (`logo.png`, 80px tall) appears above the app window. Background color matches the portfolio terminal bg (`#1a0022`). Stage transitions use a `dialupReveal` clip-path animation. **App window width matches the portfolio: `max-width: 800px`.** The 2-col layouts (start-grid) stack at ≤620px.
   The `<head>` points `rel="icon"` at the repo-local `favicon.png` (the S-letter favicon from the portfolio). `logo.png` (Logo Tall.png from the portfolio) is referenced above the window.
2. **Converter** — `loadMask()` reads a File via `<canvas>` getImageData, applies quality downscale and alpha threshold, returns a Uint8Array boolean mask. Handles PNG and SVG (browser renders SVG to canvas natively — no libcairo).
3. **Mesh builder** — `maskToTriangles()` voxelizes the mask; only emits side faces where the neighbor pixel is empty; flips Y so image-top is card-top.
4. **Exporter** — `write3MF()` produces a ZIP-packaged 3MF with one `<object>` per mesh (vertices deduplicated). The XML is assembled as an array of ~1MB string chunks fed into `new Blob(chunks)` (never a single concatenated string) so dense meshes don't trip V8's ~256M-char max-string limit (`RangeError: Invalid string length`). Final downloads always include both the `.3mf` and `.3dp`.
5. **Project save/load** — `.3dp` is a JSON file containing `{projectName, settings, layers}` with PNG file bytes inlined as base64 data URIs; each layer persists `flipX`/`flipY` alongside name/color/thickness/dataUrl/inlay. Saved and generated filenames use the sanitized project name plus a timestamp token like `YYYYMMDD_HHMMSS` so each output is unique.

### Inputs (`index.html` UI controls)

| Control | Range / values | Effect |
|--------|---------------|--------|
| Size presets | US business card / 50×50 / 100×100 / 235×235 | Sets width and height together from Step 2 |
| Card width / height (mm) | floats | Sets physical card size — default 85.725 × 53.975mm (landscape) |
| Lock proportions | on/off | Preserves the current aspect ratio while editing one dimension |
| Reference PNG | `.png` dropzone in Physical Dimensions | Loads a PNG whose pixel dimensions can drive width/height sizing |
| Reference DPI | numeric | Editable DPI field used with the reference PNG to convert pixels to mm |
| Nozzle diameter | 0.2 / 0.4 / 0.6 / 0.8 | Used for resolution warnings only |
| Layer height | 0.05–0.32mm | Defaults to half the selected nozzle, then can be fine-tuned manually |
| Alpha threshold | 0–255 | Project-wide alpha cutoff used for every layer and inlay mask |
| Quality | 10–100% | Canvas downscale before threshold (quadratic effect on triangle count), default 50% |
| Per-layer thickness | mm + print-layers (linked) | Extrusion height; changing mm auto-updates layers count and vice versa |
| Per-layer color | hex | Cosmetic — written into the 3MF object name |
| Per-layer flip X/Y | two toggle buttons (⇆ / ⇅) | Mirrors the layer mask (and its inlay) horizontally or vertically. Use for double-sided prints where the back face would otherwise render inverted. Mask cache invalidates on toggle; snap-thumb and 3D preview both reflect the flip. |
| Inlay toggle | on/off | Adds a second PNG punched out of the base mask, same Z range |
| Project name | text, required on Step 1 for new projects | Used to unlock new-project creation and to name generated `.3mf` / `.3dp` files |

### Card orientation

Landscape — **85.725mm wide × 53.975mm tall** (3.375" × 2.125").

### Default layer stack

| Layer | Z range | Height |
|-------|---------|--------|
| 1 | 0.0–0.8mm | 0.8mm |
| 2 | 0.8–1.2mm | 0.4mm |

## Critical Constraints

- **PNG/SVG resolution:** minimum 214px wide (0.4mm/px at 85.725mm); recommended 857px+ (0.1mm/px).
- **Inlay layers:** both files must be the same pixel dimensions (auto-resized in the JS port if not).
- **Minimum printable feature:** ~1.2mm (3× the 0.4mm nozzle).
- **Alpha threshold** defaults to 128 and is now project-wide; lower if detail is lost, raise to clip faint edges.
- **Quality downscaling** applied before threshold — 50% quality → 25% pixel count → ~25% triangles.
- **Browser memory:** very large meshes (>2M triangles) may stall a tab. Quality slider is the primary lever.
- **Three.js CDN pin:** `three@0.160.0/build/three.min.js` is the **last UMD build** published by Three.js — r161+ only ships ESM, so `three@0.166+/build/three.min.js` returns 404 (Chrome then blocks it via ORB and `THREE` is undefined). Do not bump the CDN version past `0.160.0` without also switching to an ESM import map. A `_threeAvailable()` guard in `index.html` lets uploads and generation still work if THREE fails to load — only the 3D preview is disabled.
- **File-read vs render errors:** `attachFileToLayer` / `attachFileToInlay` only wrap `fileToDataUrl` + `loadPreviewData` in their "Couldn't read" try/catch. `renderLayers()` / `renderPreview()` run outside the try/catch so a preview/render glitch never surfaces as a misleading file-read toast.

## Output Notes

- Final generation downloads two files: `PROJECTNAME_YYYYMMDD_HHMMSS.3mf` and `PROJECTNAME_YYYYMMDD_HHMMSS.3dp`.
- The hidden toast now uses opacity plus a full offscreen translate so no bottom-center sliver remains visible between messages.
