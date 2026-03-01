"""
core/converter.py — Importable STL conversion logic.

Extracted from png_to_stl.py. Accepts file paths or file-like objects
so it can be called from both the Flask web app and the CLI.
"""

import io
import numpy as np
from PIL import Image
from stl import mesh


def load_alpha_mask(source, threshold: int = 128) -> np.ndarray:
    """Load a PNG and return a binary mask from the alpha channel.

    Args:
        source: File path (str/Path) OR file-like object (BytesIO, Flask upload)
        threshold: Alpha value 0-255 above which a pixel is considered solid

    Returns:
        2D numpy array (height x width) where True = solid (opaque pixel)
    """
    img = Image.open(source).convert("RGBA")
    alpha = np.array(img)[:, :, 3]
    mask = alpha >= threshold
    # Force 4 corner pixels solid so every layer shares the same XY bounding
    # box regardless of content — ensures correct alignment when slicer auto-centers.
    mask[0, 0] = mask[0, -1] = mask[-1, 0] = mask[-1, -1] = True
    return mask


def mask_to_stl(mask: np.ndarray, width_mm: float, height_mm: float,
                extrude_height_mm: float, z_offset_mm: float) -> mesh.Mesh:
    """Convert a binary mask into an extruded STL mesh.

    Each opaque pixel becomes a rectangular column (voxel) extruded to the
    specified height. Only exposes side faces adjacent to empty pixels to keep
    meshes clean.

    Args:
        mask: 2D boolean array (rows x cols), True = solid
        width_mm: Physical width of the print area
        height_mm: Physical height of the print area
        extrude_height_mm: How tall to extrude the solid regions
        z_offset_mm: Z position of the bottom of this layer
    """
    rows, cols = mask.shape
    pixel_w = width_mm / cols
    pixel_h = height_mm / rows

    z_bottom = z_offset_mm
    z_top = z_offset_mm + extrude_height_mm

    triangles = []

    # Anchor rectangle: a sub-layer-height (0.001mm) full-card box at Z=0.
    # Gives slicers a geometry floor at Z=0 so "drop to floor" / "auto-place"
    # never shifts the real geometry away from its intended z_offset position.
    # Only needed when z_offset > 0; sub-layer so it won't print.
    if z_offset_mm > 0:
        ax, ay, az0, az1 = 0.0, 0.0, 0.0, 0.001
        bx, by = width_mm, height_mm
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

            x0 = c * pixel_w
            x1 = (c + 1) * pixel_w
            # Flip Y so image top = print top
            y0 = (rows - 1 - r) * pixel_h
            y1 = (rows - r) * pixel_h

            # Top face
            triangles.append(([x0, y0, z_top], [x1, y0, z_top], [x1, y1, z_top]))
            triangles.append(([x0, y0, z_top], [x1, y1, z_top], [x0, y1, z_top]))

            # Bottom face
            triangles.append(([x0, y0, z_bottom], [x1, y1, z_bottom], [x1, y0, z_bottom]))
            triangles.append(([x0, y0, z_bottom], [x0, y1, z_bottom], [x1, y1, z_bottom]))

            # Side faces — only add if neighbor is empty (exposed edge)
            if c == 0 or not mask[r, c - 1]:
                triangles.append(([x0, y0, z_bottom], [x0, y0, z_top], [x0, y1, z_top]))
                triangles.append(([x0, y0, z_bottom], [x0, y1, z_top], [x0, y1, z_bottom]))

            if c == cols - 1 or not mask[r, c + 1]:
                triangles.append(([x1, y0, z_bottom], [x1, y1, z_top], [x1, y0, z_top]))
                triangles.append(([x1, y0, z_bottom], [x1, y1, z_bottom], [x1, y1, z_top]))

            if r == rows - 1 or not mask[r + 1, c]:
                triangles.append(([x0, y0, z_bottom], [x1, y0, z_top], [x0, y0, z_top]))
                triangles.append(([x0, y0, z_bottom], [x1, y0, z_bottom], [x1, y0, z_top]))

            if r == 0 or not mask[r - 1, c]:
                triangles.append(([x0, y1, z_bottom], [x0, y1, z_top], [x1, y1, z_top]))
                triangles.append(([x0, y1, z_bottom], [x1, y1, z_top], [x1, y1, z_bottom]))

    if not triangles:
        raise ValueError("No opaque pixels found in the image — nothing to extrude!")

    stl_mesh = mesh.Mesh(np.zeros(len(triangles), dtype=mesh.Mesh.dtype))
    for i, (v0, v1, v2) in enumerate(triangles):
        stl_mesh.vectors[i][0] = v0
        stl_mesh.vectors[i][1] = v1
        stl_mesh.vectors[i][2] = v2

    return stl_mesh


def convert_layer(source, width_mm: float, height_mm: float,
                  layer_height_mm: float, z_offset_mm: float,
                  threshold: int = 128) -> mesh.Mesh:
    """Full pipeline: PNG (path or file-like) → binary mask → STL mesh.

    Returns the mesh object; the caller is responsible for saving or streaming.

    Args:
        source: File path OR file-like object (BytesIO, werkzeug FileStorage)
        width_mm: Physical width of the print
        height_mm: Physical height of the print
        layer_height_mm: Extrusion height for this layer
        z_offset_mm: Z position of the bottom of this layer (auto-calculated)
        threshold: Alpha threshold 0-255
    """
    mask = load_alpha_mask(source, threshold)
    return mask_to_stl(mask, width_mm, height_mm, layer_height_mm, z_offset_mm)


def mesh_to_bytes(stl_mesh: mesh.Mesh) -> bytes:
    """Serialize a numpy-stl Mesh to binary STL bytes (in-memory, no file I/O)."""
    buf = io.BytesIO()
    stl_mesh.save("model.stl", fh=buf)
    return buf.getvalue()
