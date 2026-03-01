"""
core/guide.py — Simplify3D slicer guide generator.

Produces a markdown string with pre-filled values based on the user's
layer stack and printer settings.
"""


def generate_guide(layers: list, nozzle_mm: float, layer_height_mm: float,
                   print_width_mm: float, print_height_mm: float) -> str:
    """Generate a Simplify3D setup guide in markdown.

    Args:
        layers: List of dicts with keys: name, z_bottom, z_top, height_mm, color
        nozzle_mm: Nozzle diameter in mm
        layer_height_mm: Slicer layer height in mm
        print_width_mm: Width of the print area in mm
        print_height_mm: Height of the print area in mm

    Returns:
        Markdown string
    """
    num_layers = len(layers)
    total_height = sum(l["height_mm"] for l in layers)
    min_feature = nozzle_mm * 3

    lines = []
    lines.append("# Simplify3D Multi-Color Setup Guide")
    lines.append("")
    lines.append("## Print Summary")
    lines.append("")
    lines.append(f"| Setting | Value |")
    lines.append(f"|---------|-------|")
    lines.append(f"| Print size | {print_width_mm}mm × {print_height_mm}mm |")
    lines.append(f"| Total height | {total_height:.3f}mm |")
    lines.append(f"| Number of layers | {num_layers} |")
    lines.append(f"| Nozzle diameter | {nozzle_mm}mm |")
    lines.append(f"| Layer height | {layer_height_mm}mm |")
    lines.append(f"| Min printable feature | ~{min_feature:.1f}mm (3× nozzle) |")
    lines.append("")
    lines.append("---")
    lines.append("")

    # Layer stack table
    lines.append("## Layer Stack")
    lines.append("")
    lines.append("| # | Name | Color | Z Start | Z End | Height |")
    lines.append("|---|------|-------|---------|-------|--------|")
    for i, layer in enumerate(layers):
        color = layer.get("color", "—")
        lines.append(
            f"| {i+1} | {layer['name']} | {color} "
            f"| {layer['z_bottom']:.3f}mm | {layer['z_top']:.3f}mm "
            f"| {layer['height_mm']:.3f}mm |"
        )
    lines.append("")
    lines.append("---")
    lines.append("")

    # Step 1: Import
    lines.append("## Step 1: Import STLs")
    lines.append("")
    lines.append("1. Open Simplify3D")
    lines.append("2. **File → Import** all STLs from the ZIP:")
    for i, layer in enumerate(layers):
        lines.append(f"   - `layer{i+1}.stl` ({layer['name']})")
    lines.append("3. Z positions are baked into the STL files — import and they stack automatically.")
    lines.append("4. Verify in the preview that layers stack correctly (no gaps or overlaps).")
    lines.append("")
    lines.append("---")
    lines.append("")

    # Per-layer process setup
    lines.append("## Step 2: Create Processes")
    lines.append("")
    lines.append(
        "Create one **Process** per layer. Each process is restricted to its Z range "
        "so Simplify3D only slices that layer's geometry."
    )
    lines.append("")

    speed_base = 50 if nozzle_mm <= 0.4 else 60
    for i, layer in enumerate(layers):
        is_first = i == 0
        is_last = i == num_layers - 1
        speed = speed_base - (i * 5)  # slow down for detail layers
        speed = max(speed, 20)

        lines.append(f"### Process {i+1} — {layer['name']}")
        lines.append("")
        lines.append(f"1. Click **Add** under the Process list, name it: `{layer['name']}`")
        lines.append("2. **Layer tab:**")
        lines.append(f"   - Primary Layer Height: `{layer_height_mm}mm`")
        if is_last:
            lines.append("   - Top Solid Layers: `3`")
        else:
            lines.append("   - Top Solid Layers: `0` (next layer prints on top)")
        if is_first:
            lines.append("   - Bottom Solid Layers: `4`")
        else:
            lines.append("   - Bottom Solid Layers: `2`")
        lines.append("3. **Advanced tab → Process Range:**")
        lines.append(f"   - Start: `{layer['z_bottom']:.3f}mm`")
        lines.append(f"   - Stop: `{layer['z_top']:.3f}mm`")
        lines.append("4. **Infill tab:**")
        lines.append("   - Infill: `100%` — solid fill for thin prints")
        lines.append("   - Pattern: Rectilinear")
        lines.append("5. **Speed tab:**")
        lines.append(f"   - Default Speed: `{speed}mm/s`")
        if is_first:
            lines.append("   - First Layer Speed: `50%`")
        lines.append("6. **Temperature tab:**")
        lines.append("   - Extruder: Per your filament (typically 200–210°C for PLA)")
        lines.append("   - Bed: 60°C")

        if is_first:
            lines.append("7. **Additions tab:**")
            lines.append("   - Skirt: 2–3 outlines, 0.1mm offset")
            lines.append("   - Consider a brim (3–5mm) for bed adhesion on thin prints")

        if not is_last:
            next_layer = layers[i + 1]
            lines.append(f"8. **Scripts tab → Ending Script** (add before existing ending code):")
            lines.append("   ```gcode")
            lines.append(f"   ; === FILAMENT CHANGE — SWAP TO {next_layer['name'].upper()} ===")
            lines.append("   M600 ; Filament change (pause and prompt swap)")
            lines.append("   ; If your firmware doesn't support M600, use:")
            lines.append("   ; M0 ; Unconditional stop — press resume after swap")
            lines.append("   ```")

        lines.append("")

    lines.append("---")
    lines.append("")

    # Print execution
    lines.append("## Step 3: Prepare & Print")
    lines.append("")
    lines.append("1. Click **Prepare to Print**")
    lines.append(f"2. Select **all {num_layers} processes** and choose **\"Continuous printing\"**")
    lines.append("3. Review the preview layer-by-layer to confirm correct layer ranges")
    lines.append("4. Save the combined G-code")
    lines.append("")
    lines.append("### Filament Swap Procedure")
    lines.append("")
    lines.append("When the printer pauses for a filament change:")
    lines.append("")
    lines.append("1. **DO NOT** remove the print from the bed")
    lines.append("2. **DO NOT** home Z — leave the nozzle where it is")
    lines.append("3. Retract the current filament")
    lines.append("4. Load the next color")
    lines.append("5. Purge ~50mm of filament until the new color runs clean")
    lines.append("6. Resume the print")
    lines.append("")
    lines.append("---")
    lines.append("")

    # Troubleshooting
    lines.append("## Troubleshooting")
    lines.append("")
    lines.append("### M600 not working")
    lines.append("- Ender 3 stock firmware may not support `M600`")
    lines.append("- **Fix:** Flash Marlin with `ADVANCED_PAUSE_FEATURE` enabled")
    lines.append("- **Alternative:** Use `M0` (unconditional stop) instead")
    lines.append("- **Alternative:** Split into separate G-code files (see below)")
    lines.append("")
    lines.append("### Layers not aligning")
    lines.append("- Verify all STLs are centered at the same XY origin")
    lines.append("- Don't touch the bed or print between swaps")
    lines.append("- Ensure Z doesn't home between processes")
    lines.append("")
    lines.append("### Warping / lifting")
    lines.append("- Add brim (5mm+)")
    lines.append("- Use glue stick or hairspray on bed")
    lines.append("- Ensure bed stays at 60°C throughout")
    lines.append("")
    lines.append("### Filament oozing during swap")
    lines.append("- Do a cold pull to clean the nozzle before resuming")
    lines.append("- Consider adding a prime pillar (Additions tab)")
    lines.append("")
    lines.append("---")
    lines.append("")

    # M600-free alternative
    lines.append("## Alternative: M600-Free Approach (Manual G-code Split)")
    lines.append("")
    lines.append("If your firmware doesn't support `M600`:")
    lines.append("")
    lines.append("1. Prepare all processes normally")
    lines.append("2. Export **each process** as a separate G-code file")
    for i, layer in enumerate(layers):
        lines.append(f"3. Print file {i+1} ({layer['name']}, Z {layer['z_bottom']:.3f}–{layer['z_top']:.3f}mm)")
        if i < num_layers - 1:
            lines.append(f"   - When done, **don't remove the print**. Swap to next filament.")
            lines.append(f"   - Open file {i+2} in a text editor:")
            lines.append("     - Remove all homing commands (`G28`)")
            lines.append("     - Remove bed leveling (`G29`)")
            lines.append(f"     - Confirm it starts at Z {layers[i+1]['z_bottom']:.3f}mm")
    lines.append("")
    lines.append(
        "> **Critical:** In the split approach, you MUST remove `G28` from all files "
        "except the first, or the nozzle will crash into your print while homing."
    )
    lines.append("")

    return "\n".join(lines)
