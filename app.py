"""
app.py — Flask web app for multi-color 3D print STL generation.

Routes:
  GET  /               → serves index.html
  POST /generate       → accepts PNG uploads + settings, returns ZIP of STLs + guide
  GET  /presets        → list saved presets
  POST /presets        → save a preset
  GET  /presets/<name> → load a preset
  DELETE /presets/<name> → delete a preset
"""

import io
import json
import zipfile
from pathlib import Path

from flask import Flask, jsonify, render_template, request, send_file

from core.converter import convert_layer, mesh_to_bytes
from core.guide import generate_guide

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 100 * 1024 * 1024  # 100MB upload limit

PRESETS_DIR = Path(__file__).parent / "presets"
PRESETS_DIR.mkdir(exist_ok=True)


# ---------------------------------------------------------------------------
# Main UI
# ---------------------------------------------------------------------------

@app.route("/")
def index():
    return render_template("index.html")


# ---------------------------------------------------------------------------
# STL Generation
# ---------------------------------------------------------------------------

@app.route("/generate", methods=["POST"])
def generate():
    """
    Accepts multipart form data:
      - width_mm: float
      - height_mm: float
      - nozzle_mm: float
      - layer_height_mm: float
      - layer_name[]: list of str
      - layer_height[]: list of float (per-layer extrusion height)
      - layer_threshold[]: list of int
      - layer_color[]: list of hex color str
      - layer_file[]: list of PNG file uploads (same order as above)

    Returns a ZIP file containing:
      - layer1.stl, layer2.stl, ... (one per layer)
      - slicer_guide.md
    """
    try:
        width_mm = float(request.form["width_mm"])
        height_mm = float(request.form["height_mm"])
        nozzle_mm = float(request.form.get("nozzle_mm", 0.4))
        layer_height_mm = float(request.form.get("layer_height_mm", 0.2))

        names = request.form.getlist("layer_name[]")
        heights = [float(h) for h in request.form.getlist("layer_height[]")]
        thresholds = [int(t) for t in request.form.getlist("layer_threshold[]")]
        colors = request.form.getlist("layer_color[]")
        files = request.files.getlist("layer_file[]")

        if not files or len(files) != len(heights):
            return jsonify({"error": "Layer count mismatch between files and heights"}), 400

        # Auto-calculate Z offsets
        z_offsets = []
        cumulative = 0.0
        for h in heights:
            z_offsets.append(cumulative)
            cumulative += h

        # Build layer metadata for guide
        guide_layers = []
        for i, (name, h, color) in enumerate(zip(names, heights, colors)):
            guide_layers.append({
                "name": name or f"Layer {i+1}",
                "height_mm": h,
                "z_bottom": z_offsets[i],
                "z_top": z_offsets[i] + h,
                "color": color or "—",
            })

        # Build ZIP in memory
        zip_buf = io.BytesIO()
        with zipfile.ZipFile(zip_buf, "w", zipfile.ZIP_DEFLATED) as zf:
            for i, (f, h, z, threshold) in enumerate(zip(files, heights, z_offsets, thresholds)):
                # Read file bytes into BytesIO so PIL can seek
                file_bytes = io.BytesIO(f.read())
                stl_mesh = convert_layer(
                    source=file_bytes,
                    width_mm=width_mm,
                    height_mm=height_mm,
                    layer_height_mm=h,
                    z_offset_mm=z,
                    threshold=threshold,
                )
                stl_bytes = mesh_to_bytes(stl_mesh)
                zf.writestr(f"layer{i+1}.stl", stl_bytes)

            # Add slicer guide
            guide_md = generate_guide(
                layers=guide_layers,
                nozzle_mm=nozzle_mm,
                layer_height_mm=layer_height_mm,
                print_width_mm=width_mm,
                print_height_mm=height_mm,
            )
            zf.writestr("slicer_guide.md", guide_md)

        zip_buf.seek(0)
        return send_file(
            zip_buf,
            mimetype="application/zip",
            as_attachment=True,
            download_name="multicolor_print.zip",
        )

    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        app.logger.exception("Generation failed")
        return jsonify({"error": str(e)}), 500


# ---------------------------------------------------------------------------
# Presets
# ---------------------------------------------------------------------------

@app.route("/presets", methods=["GET"])
def list_presets():
    presets = []
    for p in sorted(PRESETS_DIR.glob("*.json")):
        try:
            data = json.loads(p.read_text())
            presets.append({
                "name": p.stem,
                "width_mm": data.get("width_mm"),
                "height_mm": data.get("height_mm"),
                "num_layers": len(data.get("layers", [])),
            })
        except Exception:
            pass
    return jsonify(presets)


@app.route("/presets", methods=["POST"])
def save_preset():
    data = request.get_json()
    if not data or not data.get("name"):
        return jsonify({"error": "Missing preset name"}), 400

    name = data["name"].strip().replace("/", "_").replace("\\", "_")
    path = PRESETS_DIR / f"{name}.json"
    path.write_text(json.dumps(data, indent=2))
    return jsonify({"ok": True, "name": name})


@app.route("/presets/<name>", methods=["GET"])
def load_preset(name):
    path = PRESETS_DIR / f"{name}.json"
    if not path.exists():
        return jsonify({"error": "Preset not found"}), 404
    return jsonify(json.loads(path.read_text()))


@app.route("/presets/<name>", methods=["DELETE"])
def delete_preset(name):
    path = PRESETS_DIR / f"{name}.json"
    if not path.exists():
        return jsonify({"error": "Preset not found"}), 404
    path.unlink()
    return jsonify({"ok": True})


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    app.run(debug=True, port=5000)
