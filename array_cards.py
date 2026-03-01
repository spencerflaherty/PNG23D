"""
array_cards.py — Arrange single business card STLs into a grid for the print bed.

Usage:
    python array_cards.py                          # Default: 3x2 grid, all layers
    python array_cards.py --cols 4 --rows 2        # Custom 4x2 grid
    python array_cards.py --input output/layer1_purple.stl --cols 3 --rows 2

The script copies and translates the single-card STL into a grid layout
with configurable spacing, centered on the Ender 3 print bed.
"""

import argparse
import numpy as np
from stl import mesh
from pathlib import Path
import copy


# === CONFIGURATION ===
CARD_WIDTH_MM = 53.975   # 2.125 inches (portrait)
CARD_HEIGHT_MM = 85.725  # 3.375 inches (portrait)
BED_WIDTH_MM = 235.0
BED_HEIGHT_MM = 235.0
DEFAULT_GAP_MM = 3.0  # Space between cards


def array_stl(input_path: str, output_path: str,
              cols: int = 3, rows: int = 2, gap_mm: float = DEFAULT_GAP_MM,
              center_on_bed: bool = True):
    """Load a single-card STL and arrange copies in a grid.
    
    Args:
        input_path: Path to single card STL
        output_path: Path for arrayed output STL
        cols: Number of columns
        rows: Number of rows
        gap_mm: Gap between cards in mm
        center_on_bed: Center the grid on the Ender 3 bed
    """
    print(f"\nArraying: {input_path}")
    print(f"  Grid: {cols}x{rows} = {cols * rows} cards")
    
    # Calculate total grid size
    grid_width = cols * CARD_WIDTH_MM + (cols - 1) * gap_mm
    grid_height = rows * CARD_HEIGHT_MM + (rows - 1) * gap_mm
    
    print(f"  Grid dimensions: {grid_width:.1f}mm x {grid_height:.1f}mm")
    
    if grid_width > BED_WIDTH_MM or grid_height > BED_HEIGHT_MM:
        print(f"  ⚠️  WARNING: Grid exceeds bed size ({BED_WIDTH_MM}x{BED_HEIGHT_MM}mm)!")
        print(f"     Reduce grid size or gap.")
        return
    
    # Load source mesh
    source = mesh.Mesh.from_file(input_path)
    source_triangles = len(source.vectors)
    
    # Calculate offset to center on bed
    if center_on_bed:
        x_offset = (BED_WIDTH_MM - grid_width) / 2
        y_offset = (BED_HEIGHT_MM - grid_height) / 2
    else:
        x_offset = 0
        y_offset = 0
    
    # Build arrayed mesh
    all_vectors = []
    
    for row in range(rows):
        for col in range(cols):
            # Translation for this card
            tx = x_offset + col * (CARD_WIDTH_MM + gap_mm)
            ty = y_offset + row * (CARD_HEIGHT_MM + gap_mm)
            
            # Copy and translate
            card_vectors = source.vectors.copy()
            card_vectors[:, :, 0] += tx  # X
            card_vectors[:, :, 1] += ty  # Y
            # Z stays the same
            
            all_vectors.append(card_vectors)
    
    # Combine into single mesh
    combined_vectors = np.concatenate(all_vectors, axis=0)
    combined_mesh = mesh.Mesh(np.zeros(len(combined_vectors), dtype=mesh.Mesh.dtype))
    combined_mesh.vectors = combined_vectors
    
    # Save
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    combined_mesh.save(output_path)
    
    total_triangles = len(combined_vectors)
    file_size_mb = Path(output_path).stat().st_size / (1024 * 1024)
    print(f"  ✅ Saved: {output_path}")
    print(f"     Triangles: {total_triangles:,} ({source_triangles:,} per card)")
    print(f"     File size: {file_size_mb:.1f}MB")
    print(f"     Bed position: centered at ({BED_WIDTH_MM/2:.0f}, {BED_HEIGHT_MM/2:.0f})")


def max_grid(gap_mm: float = DEFAULT_GAP_MM):
    """Calculate maximum grid that fits the Ender 3 bed."""
    max_cols = int((BED_WIDTH_MM + gap_mm) / (CARD_WIDTH_MM + gap_mm))
    max_rows = int((BED_HEIGHT_MM + gap_mm) / (CARD_HEIGHT_MM + gap_mm))
    return max_cols, max_rows


def batch_array(cols: int = 3, rows: int = 2, gap_mm: float = DEFAULT_GAP_MM):
    """Array all 2 layer STLs into plate versions."""
    layers = [
        ("output/layer1.stl", "output/full_plate/plate_layer1.stl"),
        ("output/layer2.stl", "output/full_plate/plate_layer2.stl"),
    ]

    print("=" * 60)
    print(f"BATCH ARRAY — {cols}x{rows} grid ({cols * rows} cards)")
    print("=" * 60)

    for input_path, output_path in layers:
        if not Path(input_path).exists():
            print(f"\n⚠️  Skipping: {input_path} not found")
            continue
        array_stl(input_path, output_path, cols, rows, gap_mm)

    print(f"\n{'='*60}")
    print("Done! Plate STLs are in output/full_plate/")
    print("Import both plate STLs into Simplify3D and follow SIMPLIFY3D_GUIDE.md")


def main():
    max_c, max_r = max_grid()
    
    parser = argparse.ArgumentParser(
        description="Arrange business card STLs into a print bed grid"
    )
    parser.add_argument("--input", "-i", type=str, default=None,
                        help="Single STL to array (or use --batch for all 3)")
    parser.add_argument("--output", "-o", type=str, default=None,
                        help="Output path for arrayed STL")
    parser.add_argument("--cols", type=int, default=3,
                        help=f"Number of columns (max {max_c} for Ender 3)")
    parser.add_argument("--rows", type=int, default=2,
                        help=f"Number of rows (max {max_r} for Ender 3)")
    parser.add_argument("--gap", type=float, default=DEFAULT_GAP_MM,
                        help=f"Gap between cards in mm (default: {DEFAULT_GAP_MM})")
    parser.add_argument("--batch", action="store_true",
                        help="Array all 2 layer STLs")
    parser.add_argument("--max-fit", action="store_true",
                        help="Show maximum cards that fit the bed")
    
    args = parser.parse_args()
    
    if args.max_fit:
        mc, mr = max_grid(args.gap)
        print(f"Max grid for Ender 3 ({BED_WIDTH_MM}x{BED_HEIGHT_MM}mm):")
        print(f"  {mc}x{mr} = {mc * mr} cards (with {args.gap}mm gap)")
        grid_w = mc * CARD_WIDTH_MM + (mc - 1) * args.gap
        grid_h = mr * CARD_HEIGHT_MM + (mr - 1) * args.gap
        print(f"  Grid: {grid_w:.1f}mm x {grid_h:.1f}mm")
        return
    
    if args.batch:
        batch_array(args.cols, args.rows, args.gap)
    elif args.input:
        output = args.output or args.input.replace(".stl", f"_plate_{args.cols}x{args.rows}.stl")
        array_stl(args.input, output, args.cols, args.rows, args.gap)
    else:
        parser.print_help()
        print(f"\nMax fit: {max_c}x{max_r} = {max_c * max_r} cards")
        print(f"\nExamples:")
        print(f"  python array_cards.py --batch")
        print(f"  python array_cards.py --batch --cols 2 --rows 3")
        print(f"  python array_cards.py --max-fit")
        print(f"  python array_cards.py -i output/layer1_purple.stl --cols 3 --rows 2")


if __name__ == "__main__":
    main()
