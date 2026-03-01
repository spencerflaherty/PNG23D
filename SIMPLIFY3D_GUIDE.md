# Simplify3D Multi-Process Setup — 3-Color Business Cards

## Overview
This guide walks through setting up Simplify3D to print 3-color business cards using filament swaps. Each color is a separate "Process" in Simplify3D, restricted to specific Z-height ranges.

---

## Step 1: Import STLs

1. Open Simplify3D
2. **File → Import** all 3 plate STLs (or single-card STLs if testing)
   - `plate_layer1.stl` (purple base)
   - `plate_layer2.stl` (cyan details)
   - `plate_layer3.stl` (pink accents)
3. Z positions are baked into the STL files — import and they stack automatically:
   - Purple base: Z 0.0–0.8mm
   - Cyan details: Z 0.8–1.2mm
   - Pink accents: Z 1.2–1.4mm
4. Verify in the preview: cyan should sit directly on top of purple, pink on top of cyan.

## Step 2: Create Process 1 — Purple Base

1. Click **Add** under the Process list
2. Name it: `Purple Base`
3. **Layer tab:**
   - Primary Layer Height: `0.20mm`
   - Top Solid Layers: `0` (cyan prints on top)
   - Bottom Solid Layers: `4`
4. **Advanced tab → Process Range:**
   - Start: `0.0mm`
   - Stop: `0.8mm`
5. **Infill tab:**
   - Infill: `100%` — these are thin cards, you want solid
   - Pattern: Rectilinear
6. **Speed tab:**
   - Default Speed: `40-50 mm/s` (slower = cleaner for thin parts)
   - First Layer Speed: `50%`
7. **Additions tab:**
   - Skirt: 2-3 outlines, 0.1mm offset (helps prime nozzle)
   - Raft/Brim: Consider a brim (3-5mm) for bed adhesion on thin cards
8. **Temperature tab:**
   - Extruder: Per your filament (typically 200-210°C for PLA)
   - Bed: 60°C
9. **Scripts tab → Ending Script:**
   Add BEFORE the existing ending code:
   ```gcode
   ; === FILAMENT CHANGE — SWAP TO CYAN ===
   M600 ; Filament change
   ; If your firmware doesn't support M600, use:
   ; M0 ; Unconditional stop — press resume after swap
   ; OR add to "Post Processing" tab
   ```

## Step 3: Create Process 2 — Cyan Layer

1. **Add** new Process, name it: `Cyan Details`
2. **Layer tab:**
   - Primary Layer Height: `0.20mm`
   - Top Solid Layers: `0`
   - Bottom Solid Layers: `2`
3. **Advanced tab → Process Range:**
   - Start: `0.8mm`
   - Stop: `1.2mm`
4. **Infill:** `100%` Rectilinear
5. **Speed:** `30-40 mm/s` (detail work, go slower)
6. **Temperature:** Same as purple (adjust if different filament brand)
7. **Scripts tab → Ending Script:**
   ```gcode
   ; === FILAMENT CHANGE — SWAP TO HOT PINK ===
   M600 ; Filament change
   ```

## Step 4: Create Process 3 — Hot Pink Layer

1. **Add** new Process, name it: `Pink Accents`
2. **Layer tab:**
   - Primary Layer Height: `0.20mm`
   - Top Solid Layers: `1`
   - Bottom Solid Layers: `1`
3. **Advanced tab → Process Range:**
   - Start: `1.2mm`
   - Stop: `1.4mm`
4. **Infill:** `100%` Rectilinear
5. **Speed:** `25-35 mm/s` (final detail layer, go slow)
6. **Temperature:** Same PLA temps

## Step 5: Prepare to Print

1. Click **Prepare to Print**
2. **IMPORTANT:** Select ALL 3 processes and choose **"Continuous printing"**
   - This prints Process 1 → Process 2 → Process 3 sequentially
   - The M600/M0 commands between processes handle the pause
3. Review the preview layer-by-layer to confirm:
   - Purple fills layers 1-4
   - Cyan prints on layers 5-6
   - Pink prints on layer 7
4. Save the combined G-code

## Step 6: Print Execution

### Print 1 — Purple Base
1. Load dark purple filament
2. Level bed carefully (thin parts are unforgiving)
3. Start print
4. Cards print at 0.8mm height
5. Printer pauses (M600 or M0)

### Filament Swap 1 → Cyan
1. **DO NOT** remove the print from the bed
2. **DO NOT** home Z — leave the nozzle where it is
3. Retract purple filament
4. Load cyan filament
5. Purge ~50mm of filament manually (use Simplify3D's jog controls or your LCD)
6. Verify clean cyan is extruding
7. Resume print

### Print 2 — Cyan Layer
1. Cyan details print on top of purple base
2. Printer pauses again after cyan completes

### Filament Swap 2 → Hot Pink
1. Same swap procedure — retract cyan, load pink, purge
2. Resume print

### Print 3 — Pink Accents
1. Final detail layer prints
2. Print completes

## Troubleshooting

### Cards warping/lifting
- Add brim (5mm+)
- Use glue stick or hairspray on bed
- Ensure bed is 60°C throughout

### Layers not aligning
- Verify STLs are all centered at the same XY origin
- Don't touch the bed or print between swaps
- Check that Z doesn't home between processes

### M600 not working
- Ender 3 stock firmware may not support M600
- **Fix:** Flash Marlin firmware with `ADVANCED_PAUSE_FEATURE` enabled
- **Alternative:** Use `M0` (unconditional stop) instead
- **Alternative:** Manually split into 3 separate G-code files and note the Z-height to resume

### QR code not scanning
- Ensure QR modules are ≥1.2mm
- Print a single test card first
- Try scanning from further away
- The color contrast (cyan/pink on purple) should be fine for most scanners

### Filament oozing during swap
- After loading new filament, do a cold pull to clean the nozzle
- Wipe the nozzle before resuming
- Consider adding a "prime pillar" in Simplify3D (Additions tab)

## Alternative: M600-Free Approach (Manual G-code Split)

If firmware doesn't support M600:

1. Prepare all 3 processes normally
2. Export EACH process as a separate G-code file
3. Print file 1 (purple). When done, DON'T remove print.
4. Swap filament to cyan.
5. Open file 2 (cyan) G-code in a text editor:
   - Remove all initial homing commands (`G28`)
   - Remove bed leveling commands (`G29`)
   - Ensure it starts at the correct Z-height (0.8mm)
   - Keep the `G92 E0` (reset extruder)
6. Print file 2 from SD card
7. Repeat for file 3 (pink)

⚠️ **Critical:** In the split approach, you MUST remove G28 from files 2 and 3, or the nozzle will crash into your print while homing.
