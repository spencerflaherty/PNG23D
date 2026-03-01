"""
png_to_stl.py — Convert transparent-background PNGs into extruded STL files
for multi-color 3D printed business cards.

Usage:
    python png_to_stl.py "input/Layer 1.png" --height 0.8 --z-offset 0.0 --output output/layer1.stl
    python png_to_stl.py "input/Layer 2.png" --height 0.4 --z-offset 0.8 --output output/layer2.stl

Or use --batch mode to convert all 2 layers at once:
    python png_to_stl.py --batch

Z offsets are baked into the STL. A sub-layer anchor rectangle (0.001mm tall) is added
at Z=0 to layers with z_offset > 0, preventing slicers from auto-dropping geometry.
"""

import argparse
import numpy as np
from PIL import Image
from stl import mesh
from pathlib import Path


# === CONFIGURATION ===
CARD_WIDTH_MM = 53.975   # 2.125 inches (portrait)
CARD_HEIGHT_MM = 85.725  # 3.375 inches (portrait)

# Layer definitions for batch mode
LAYERS = [
    {
        "name": "layer1",
        "input": "input/Layer 1.png",
        "output": "output/layer1.stl",
        "height_mm": 0.8,
        "z_offset_mm": 0.0,
    },
    {
        "name": "layer2",
        "input": "input/Layer 2.png",
        "output": "output/layer2.stl",
        "height_mm": 0.4,
        "z_offset_mm": 0.8,
    },
]


def load_alpha_mask(png_path: str, threshold: int = 128) -> np.ndarray:
    """Load a PNG and return a binary mask from the alpha channel.
    
    Returns:
        2D numpy array (height x width) where True = solid (opaque pixel)
    """
    img = Image.open(png_path).convert("RGBA")
    alpha = np.array(img)[:, :, 3]  # Extract alpha channel
    mask = alpha >= threshold
    # Force 4 corner pixels solid so every layer shares the same XY bounding
    # box regardless of content — ensures correct alignment when slicer auto-centers.
    # At ~0.085mm/px these are sub-nozzle and won't print.
    mask[0, 0] = mask[0, -1] = mask[-1, 0] = mask[-1, -1] = True
    print(f"  Loaded {png_path}: {img.size[0]}x{img.size[1]}px, "
          f"{mask.sum()} opaque pixels ({mask.sum() / mask.size * 100:.1f}%)")
    return mask


def mask_to_stl(mask: np.ndarray, card_width_mm: float, card_height_mm: float,
                extrude_height_mm: float, z_offset_mm: float) -> mesh.Mesh:
    """Convert a binary mask into an extruded STL mesh.
    
    Each opaque pixel becomes a rectangular column (voxel) extruded to the
    specified height. This is a simple but reliable approach that produces
    watertight meshes.
    
    Args:
        mask: 2D boolean array (rows x cols), True = solid
        card_width_mm: Physical width of the card
        card_height_mm: Physical height of the card  
        extrude_height_mm: How tall to extrude the solid regions
        z_offset_mm: Z position of the bottom of this layer
    """
    rows, cols = mask.shape
    pixel_w = card_width_mm / cols   # mm per pixel (X)
    pixel_h = card_height_mm / rows  # mm per pixel (Y)
    
    z_bottom = z_offset_mm
    z_top = z_offset_mm + extrude_height_mm

    # Collect all triangles
    triangles = []

    # Anchor rectangle: a sub-layer-height (0.001mm) full-card box at Z=0.
    # Gives slicers a geometry floor at Z=0 so "drop to floor" / "auto-place"
    # never shifts the real geometry away from its intended z_offset position.
    # Only needed when z_offset > 0; sub-layer so it won't print.
    if z_offset_mm > 0:
        ax, ay, az0, az1 = 0.0, 0.0, 0.0, 0.001
        bx, by = card_width_mm, card_height_mm
        triangles += [
            # Top
            ([ax, ay, az1], [bx, ay, az1], [bx, by, az1]),
            ([ax, ay, az1], [bx, by, az1], [ax, by, az1]),
            # Bottom
            ([ax, ay, az0], [bx, by, az0], [bx, ay, az0]),
            ([ax, ay, az0], [ax, by, az0], [bx, by, az0]),
            # Front
            ([ax, ay, az0], [bx, ay, az0], [bx, ay, az1]),
            ([ax, ay, az0], [bx, ay, az1], [ax, ay, az1]),
            # Back
            ([ax, by, az0], [ax, by, az1], [bx, by, az1]),
            ([ax, by, az0], [bx, by, az1], [bx, by, az0]),
            # Left
            ([ax, ay, az0], [ax, ay, az1], [ax, by, az1]),
            ([ax, ay, az0], [ax, by, az1], [ax, by, az0]),
            # Right
            ([bx, ay, az0], [bx, by, az1], [bx, ay, az1]),
            ([bx, ay, az0], [bx, by, az0], [bx, by, az1]),
        ]

    for r in range(rows):
        for c in range(cols):
            if not mask[r, c]:
                continue
            
            # Pixel bounds in mm
            x0 = c * pixel_w
            x1 = (c + 1) * pixel_w
            # Flip Y so image top = card top (positive Y direction)
            y0 = (rows - 1 - r) * pixel_h
            y1 = (rows - r) * pixel_h
            
            # === TOP FACE (2 triangles) ===
            triangles.append(([x0, y0, z_top], [x1, y0, z_top], [x1, y1, z_top]))
            triangles.append(([x0, y0, z_top], [x1, y1, z_top], [x0, y1, z_top]))
            
            # === BOTTOM FACE (2 triangles) ===
            triangles.append(([x0, y0, z_bottom], [x1, y1, z_bottom], [x1, y0, z_bottom]))
            triangles.append(([x0, y0, z_bottom], [x0, y1, z_bottom], [x1, y1, z_bottom]))
            
            # === SIDE FACES — only add if neighbor is empty (exposed edge) ===
            # Left side (c-1 empty)
            if c == 0 or not mask[r, c - 1]:
                triangles.append(([x0, y0, z_bottom], [x0, y0, z_top], [x0, y1, z_top]))
                triangles.append(([x0, y0, z_bottom], [x0, y1, z_top], [x0, y1, z_bottom]))
            
            # Right side (c+1 empty)
            if c == cols - 1 or not mask[r, c + 1]:
                triangles.append(([x1, y0, z_bottom], [x1, y1, z_top], [x1, y0, z_top]))
                triangles.append(([x1, y0, z_bottom], [x1, y1, z_bottom], [x1, y1, z_top]))
            
            # Front side (r+1 empty — remember Y is flipped)
            if r == rows - 1 or not mask[r + 1, c]:
                triangles.append(([x0, y0, z_bottom], [x1, y0, z_top], [x0, y0, z_top]))
                triangles.append(([x0, y0, z_bottom], [x1, y0, z_bottom], [x1, y0, z_top]))
            
            # Back side (r-1 empty)
            if r == 0 or not mask[r - 1, c]:
                triangles.append(([x0, y1, z_bottom], [x0, y1, z_top], [x1, y1, z_top]))
                triangles.append(([x0, y1, z_bottom], [x1, y1, z_top], [x1, y1, z_bottom]))
    
    if not triangles:
        raise ValueError("No opaque pixels found in the image — nothing to extrude!")
    
    # Build numpy-stl mesh
    stl_mesh = mesh.Mesh(np.zeros(len(triangles), dtype=mesh.Mesh.dtype))
    for i, (v0, v1, v2) in enumerate(triangles):
        stl_mesh.vectors[i][0] = v0
        stl_mesh.vectors[i][1] = v1
        stl_mesh.vectors[i][2] = v2
    
    return stl_mesh


def convert_png_to_stl(png_path: str, output_path: str,
                        height_mm: float, z_offset_mm: float,
                        card_width_mm: float = CARD_WIDTH_MM,
                        card_height_mm: float = CARD_HEIGHT_MM,
                        threshold: int = 128):
    """Full pipeline: PNG → binary mask → extruded STL."""
    print(f"\n{'='*60}")
    print(f"Converting: {png_path}")
    print(f"  Extrude height: {height_mm}mm, Z-offset: {z_offset_mm}mm")
    print(f"  Card size: {card_width_mm}mm x {card_height_mm}mm")
    
    # Load and threshold
    mask = load_alpha_mask(png_path, threshold)
    
    # Check resolution
    rows, cols = mask.shape
    px_size_mm = card_width_mm / cols
    print(f"  Pixel size: {px_size_mm:.3f}mm/px")
    if px_size_mm > 0.4:
        print(f"  ⚠️  WARNING: Pixel size ({px_size_mm:.2f}mm) > nozzle width (0.4mm).")
        print(f"     Consider using a higher resolution PNG for cleaner results.")
        print(f"     Recommended minimum width: {int(card_width_mm / 0.4)}px")
    
    # Convert
    stl_mesh = mask_to_stl(mask, card_width_mm, card_height_mm, height_mm, z_offset_mm)
    
    # Save
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    stl_mesh.save(output_path)
    
    tri_count = len(stl_mesh.vectors)
    file_size_mb = Path(output_path).stat().st_size / (1024 * 1024)
    print(f"  ✅ Saved: {output_path}")
    print(f"     Triangles: {tri_count:,} | File size: {file_size_mb:.1f}MB")
    
    return stl_mesh


def batch_convert():
    """Convert all 2 layers using the predefined LAYERS config."""
    print("=" * 60)
    print("BATCH MODE — Converting all 2 layers")
    print("=" * 60)
    
    for layer in LAYERS:
        input_path = Path(layer["input"])
        if not input_path.exists():
            print(f"\n⚠️  Skipping {layer['name']}: {input_path} not found")
            print(f"   Place your PNG at: {input_path.resolve()}")
            continue
        
        convert_png_to_stl(
            png_path=str(input_path),
            output_path=layer["output"],
            height_mm=layer["height_mm"],
            z_offset_mm=layer["z_offset_mm"],
        )
    
    print(f"\n{'='*60}")
    print("Done! STL files are in the output/ directory.")
    print("Next: Run array_cards.py to create print bed layouts.")


def main():
    parser = argparse.ArgumentParser(
        description="Convert transparent-background PNGs to extruded STL files"
    )
    parser.add_argument("png_path", nargs="?", help="Path to input PNG file")
    parser.add_argument("--height", type=float, default=0.8,
                        help="Extrusion height in mm (default: 0.8)")
    parser.add_argument("--z-offset", type=float, default=0.0,
                        help="Z offset in mm (default: 0.0)")
    parser.add_argument("--output", "-o", type=str, default=None,
                        help="Output STL path")
    parser.add_argument("--threshold", type=int, default=128,
                        help="Alpha threshold 0-255 (default: 128)")
    parser.add_argument("--batch", action="store_true",
                        help="Convert all 2 layers using built-in config")
    
    args = parser.parse_args()
    
    if args.batch:
        batch_convert()
    elif args.png_path:
        output = args.output or args.png_path.replace(".png", ".stl")
        convert_png_to_stl(args.png_path, output, args.height, args.z_offset,
                           threshold=args.threshold)
    else:
        parser.print_help()
        print("\nExamples:")
        print("  python png_to_stl.py --batch")
        print('  python png_to_stl.py "input/Layer 2.png" --height 0.4 --z-offset 0.8 -o output/layer2.stl')


if __name__ == "__main__":
    main()
