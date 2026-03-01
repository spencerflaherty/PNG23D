/* =====================================================
   Multi-Color 3D Print — Frontend Logic (Static / GitHub Pages)
   All STL generation, guide generation, and preset management
   run entirely client-side. No server required.
   ===================================================== */

// ── State ────────────────────────────────────────────
let layers = [];      // [{id, name, file, color, height, threshold, imageData, ...}]
let layerCounter = 0; // monotonic ID for DOM keys

// ── DOM refs ─────────────────────────────────────────
const layersList      = document.getElementById("layers_list");
const addLayerBtn     = document.getElementById("add_layer_btn");
const generateBtn     = document.getElementById("generate_btn");
const generateStatus  = document.getElementById("generate_status");
const previewCanvas   = document.getElementById("preview_canvas");
const previewLegend   = document.getElementById("preview_legend");
const previewHint     = document.querySelector(".preview-hint");
const presetSelect    = document.getElementById("preset_select");
const loadPresetBtn   = document.getElementById("load_preset_btn");
const savePresetBtn   = document.getElementById("save_preset_btn");
const deletePresetBtn = document.getElementById("delete_preset_btn");
const presetNameInput = document.getElementById("preset_name");
const ctx             = previewCanvas.getContext("2d");

const DEFAULTS = [
  { name: "Layer 1", height: 0.8, color: "#2563eb", threshold: 128 },
  { name: "Layer 2", height: 0.4, color: "#10b981", threshold: 128 },
];

const PRESETS_KEY = "multicolor3d_presets";

// ── Layer management ──────────────────────────────────

function addLayer(opts = {}) {
  const id = layerCounter++;
  const tmpl = document.getElementById("layer_template").content.cloneNode(true);
  const row = tmpl.querySelector(".layer-row");
  row.dataset.id = id;

  const idx = layers.length + 1;
  row.querySelector(".layer-num").textContent = `#${idx}`;

  const nameInput = row.querySelector(".layer-name");
  nameInput.value = opts.name || `Layer ${idx}`;

  const colorInput = row.querySelector(".layer-color");
  colorInput.value = opts.color || "#ffffff";

  const heightInput = row.querySelector(".layer-height");
  heightInput.value = opts.height || 0.8;

  const thresholdInput = row.querySelector(".layer-threshold");
  thresholdInput.value = opts.threshold !== undefined ? opts.threshold : 128;

  const fileInput = row.querySelector(".layer-file");
  const fileName  = row.querySelector(".file-name");

  // File selection
  fileName.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    fileName.textContent = file.name;
    fileName.classList.add("has-file");
    const layerData = layers.find(l => l.id === id);
    if (layerData) {
      layerData.file = file;
      loadImagePreview(layerData);
    }
  });

  // Color change → re-render preview
  colorInput.addEventListener("input", () => {
    const layerData = layers.find(l => l.id === id);
    if (layerData) {
      layerData.color = colorInput.value;
      renderPreview();
    }
  });

  // Name change
  nameInput.addEventListener("input", () => {
    const layerData = layers.find(l => l.id === id);
    if (layerData) layerData.name = nameInput.value;
  });

  // Height change
  heightInput.addEventListener("input", () => {
    const layerData = layers.find(l => l.id === id);
    if (layerData) layerData.height = parseFloat(heightInput.value) || 0.8;
  });

  // Threshold change
  thresholdInput.addEventListener("input", () => {
    const layerData = layers.find(l => l.id === id);
    if (layerData) layerData.threshold = parseInt(thresholdInput.value, 10);
  });

  // Remove
  row.querySelector(".remove-layer-btn").addEventListener("click", () => {
    removeLayer(id);
  });

  layersList.appendChild(row);

  layers.push({
    id,
    name: nameInput.value,
    file: null,
    imageData: null,
    color: colorInput.value,
    height: parseFloat(heightInput.value),
    threshold: parseInt(thresholdInput.value, 10),
    domRow: row,
  });

  updateLayerNumbers();
}

function removeLayer(id) {
  const idx = layers.findIndex(l => l.id === id);
  if (idx === -1) return;
  layers[idx].domRow.remove();
  layers.splice(idx, 1);
  updateLayerNumbers();
  renderPreview();
}

function updateLayerNumbers() {
  layers.forEach((l, i) => {
    l.domRow.querySelector(".layer-num").textContent = `#${i + 1}`;
  });
}

// ── Preview ───────────────────────────────────────────

function loadImagePreview(layerData) {
  if (!layerData.file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      const off = document.createElement("canvas");
      off.width  = img.width;
      off.height = img.height;
      const offCtx = off.getContext("2d");
      offCtx.drawImage(img, 0, 0);
      layerData.imageData = offCtx.getImageData(0, 0, img.width, img.height);
      layerData.width     = img.width;
      layerData.height_px = img.height;
      renderPreview();
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(layerData.file);
}

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return [r, g, b];
}

function renderPreview() {
  const loaded = layers.filter(l => l.imageData);
  if (!loaded.length) {
    previewHint.style.display = "";
    ctx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
    previewLegend.innerHTML = "";
    return;
  }

  previewHint.style.display = "none";

  const ref = loaded[0];
  const W = ref.width;
  const H = ref.height_px;
  previewCanvas.width  = W;
  previewCanvas.height = H;

  ctx.fillStyle = "#111318";
  ctx.fillRect(0, 0, W, H);

  for (const layer of loaded) {
    if (!layer.imageData) continue;

    let data = layer.imageData;
    let w = layer.width;
    let h = layer.height_px;

    if (w !== W || h !== H) {
      const off2 = document.createElement("canvas");
      off2.width = W;
      off2.height = H;
      const off2Ctx = off2.getContext("2d");
      const tempCanvas = document.createElement("canvas");
      tempCanvas.width = w;
      tempCanvas.height = h;
      tempCanvas.getContext("2d").putImageData(data, 0, 0);
      off2Ctx.drawImage(tempCanvas, 0, 0, W, H);
      data = off2Ctx.getImageData(0, 0, W, H);
      w = W;
      h = H;
    }

    const [lr, lg, lb] = hexToRgb(layer.color);
    const src = data.data;

    const tinted = ctx.createImageData(W, H);
    const dst = tinted.data;
    for (let i = 0; i < src.length; i += 4) {
      const a = src[i + 3];
      if (a < 1) continue;
      const alpha = a / 255;
      dst[i]     = lr;
      dst[i + 1] = lg;
      dst[i + 2] = lb;
      dst[i + 3] = Math.round(alpha * 255);
    }

    const off3 = document.createElement("canvas");
    off3.width = W;
    off3.height = H;
    off3.getContext("2d").putImageData(tinted, 0, 0);
    ctx.drawImage(off3, 0, 0);
  }

  previewLegend.innerHTML = "";
  for (const layer of layers) {
    const item = document.createElement("div");
    item.className = "legend-item";
    item.innerHTML = `
      <span class="legend-swatch" style="background:${layer.color}"></span>
      <span>${layer.name || "Layer"}</span>
    `;
    previewLegend.appendChild(item);
  }
}

// ── STL Generation ────────────────────────────────────

/**
 * Load a PNG File and extract a binary alpha mask.
 * Port of core/converter.py load_alpha_mask().
 * @param {File} file
 * @param {number} threshold  0–255
 * @returns {Promise<{mask: Uint8Array, rows: number, cols: number}>}
 */
function loadAlphaMask(file, threshold) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const cols = img.width;
        const rows = img.height;
        const off = document.createElement("canvas");
        off.width  = cols;
        off.height = rows;
        const offCtx = off.getContext("2d");
        offCtx.drawImage(img, 0, 0);
        const px = offCtx.getImageData(0, 0, cols, rows).data;

        const mask = new Uint8Array(rows * cols);
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const alpha = px[(r * cols + c) * 4 + 3];
            mask[r * cols + c] = alpha >= threshold ? 1 : 0;
          }
        }

        // Force 4 corner pixels solid — ensures identical XY bounding box
        // across all layers so the slicer auto-centers them correctly.
        mask[0]                             = 1; // top-left
        mask[cols - 1]                      = 1; // top-right
        mask[(rows - 1) * cols]             = 1; // bottom-left
        mask[(rows - 1) * cols + cols - 1]  = 1; // bottom-right

        resolve({ mask, rows, cols });
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Convert a binary mask to a binary STL ArrayBuffer.
 * Direct port of core/converter.py mask_to_stl().
 *
 * @param {Uint8Array} mask      flat row-major array, 1 = solid
 * @param {number}     rows
 * @param {number}     cols
 * @param {number}     widthMm
 * @param {number}     heightMm
 * @param {number}     extrudeMm
 * @param {number}     zOffsetMm
 * @returns {ArrayBuffer}  binary STL (80-byte header + uint32 count + 50 bytes/tri)
 */
function maskToSTL(mask, rows, cols, widthMm, heightMm, extrudeMm, zOffsetMm) {
  const pixelW  = widthMm  / cols;
  const pixelH  = heightMm / rows;
  const zBottom = zOffsetMm;
  const zTop    = zOffsetMm + extrudeMm;

  // Accumulate triangles as flat [v0x,v0y,v0z, v1x,v1y,v1z, v2x,v2y,v2z]
  const tris = [];

  function addTri(v0, v1, v2) {
    tris.push([v0[0], v0[1], v0[2], v1[0], v1[1], v1[2], v2[0], v2[1], v2[2]]);
  }

  // Anchor rectangle at Z=0 (0.001mm tall) for layers with z_offset > 0.
  // Gives slicers a geometry floor at Z=0 so "drop to floor" never shifts
  // the real geometry away from its intended z_offset position.
  if (zOffsetMm > 0) {
    const ax = 0, ay = 0, az0 = 0, az1 = 0.001;
    const bx = widthMm, by = heightMm;
    // Top
    addTri([ax,ay,az1], [bx,ay,az1], [bx,by,az1]);
    addTri([ax,ay,az1], [bx,by,az1], [ax,by,az1]);
    // Bottom
    addTri([ax,ay,az0], [bx,by,az0], [bx,ay,az0]);
    addTri([ax,ay,az0], [ax,by,az0], [bx,by,az0]);
    // Front
    addTri([ax,ay,az0], [bx,ay,az0], [bx,ay,az1]);
    addTri([ax,ay,az0], [bx,ay,az1], [ax,ay,az1]);
    // Back
    addTri([ax,by,az0], [ax,by,az1], [bx,by,az1]);
    addTri([ax,by,az0], [bx,by,az1], [bx,by,az0]);
    // Left
    addTri([ax,ay,az0], [ax,ay,az1], [ax,by,az1]);
    addTri([ax,ay,az0], [ax,by,az1], [ax,by,az0]);
    // Right
    addTri([bx,ay,az0], [bx,by,az1], [bx,ay,az1]);
    addTri([bx,ay,az0], [bx,ay,az0], [bx,by,az1]);
  }

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!mask[r * cols + c]) continue;

      const x0 = c * pixelW;
      const x1 = (c + 1) * pixelW;
      // Flip Y so image top maps to print top
      const y0 = (rows - 1 - r) * pixelH;
      const y1 = (rows - r)     * pixelH;

      // Top face
      addTri([x0,y0,zTop], [x1,y0,zTop], [x1,y1,zTop]);
      addTri([x0,y0,zTop], [x1,y1,zTop], [x0,y1,zTop]);

      // Bottom face
      addTri([x0,y0,zBottom], [x1,y1,zBottom], [x1,y0,zBottom]);
      addTri([x0,y0,zBottom], [x0,y1,zBottom], [x1,y1,zBottom]);

      // Left side (x0 face) — only if neighbor is empty
      if (c === 0 || !mask[r * cols + (c - 1)]) {
        addTri([x0,y0,zBottom], [x0,y0,zTop], [x0,y1,zTop]);
        addTri([x0,y0,zBottom], [x0,y1,zTop], [x0,y1,zBottom]);
      }

      // Right side (x1 face)
      if (c === cols - 1 || !mask[r * cols + (c + 1)]) {
        addTri([x1,y0,zBottom], [x1,y1,zTop], [x1,y0,zTop]);
        addTri([x1,y0,zBottom], [x1,y1,zBottom], [x1,y1,zTop]);
      }

      // Front (y0 face, r == rows-1 in image = low y in 3D)
      if (r === rows - 1 || !mask[(r + 1) * cols + c]) {
        addTri([x0,y0,zBottom], [x1,y0,zTop], [x0,y0,zTop]);
        addTri([x0,y0,zBottom], [x1,y0,zBottom], [x1,y0,zTop]);
      }

      // Back (y1 face, r == 0 in image = high y in 3D)
      if (r === 0 || !mask[(r - 1) * cols + c]) {
        addTri([x0,y1,zBottom], [x0,y1,zTop], [x1,y1,zTop]);
        addTri([x0,y1,zBottom], [x1,y1,zTop], [x1,y1,zBottom]);
      }
    }
  }

  if (tris.length === 0) {
    throw new Error("No opaque pixels found in the image — nothing to extrude!");
  }

  // Serialize as binary STL:
  //   80-byte header | uint32 count | (12 normal + 36 verts + 2 attr) × n
  const numTris = tris.length;
  const buf  = new ArrayBuffer(84 + numTris * 50);
  const view = new DataView(buf);

  view.setUint32(80, numTris, true); // triangle count at offset 80

  let off = 84;
  for (const tri of tris) {
    // Normal vector (zero — slicers recompute)
    view.setFloat32(off, 0, true); off += 4;
    view.setFloat32(off, 0, true); off += 4;
    view.setFloat32(off, 0, true); off += 4;
    // Vertex 0
    view.setFloat32(off, tri[0], true); off += 4;
    view.setFloat32(off, tri[1], true); off += 4;
    view.setFloat32(off, tri[2], true); off += 4;
    // Vertex 1
    view.setFloat32(off, tri[3], true); off += 4;
    view.setFloat32(off, tri[4], true); off += 4;
    view.setFloat32(off, tri[5], true); off += 4;
    // Vertex 2
    view.setFloat32(off, tri[6], true); off += 4;
    view.setFloat32(off, tri[7], true); off += 4;
    view.setFloat32(off, tri[8], true); off += 4;
    // Attribute byte count
    view.setUint16(off, 0, true); off += 2;
  }

  return buf;
}

// ── Guide generation ──────────────────────────────────

/**
 * Generate a Simplify3D slicer setup guide in markdown.
 * Direct port of core/guide.py generate_guide().
 *
 * @param {Array}  guideLayers  [{name, z_bottom, z_top, height_mm, color}]
 * @param {number} nozzleMm
 * @param {number} layerHeightMm
 * @param {number} printWidthMm
 * @param {number} printHeightMm
 * @returns {string}  markdown
 */
function generateGuide(guideLayers, nozzleMm, layerHeightMm, printWidthMm, printHeightMm) {
  const numLayers   = guideLayers.length;
  const totalHeight = guideLayers.reduce((s, l) => s + l.height_mm, 0);
  const minFeature  = nozzleMm * 3;

  const lines = [];
  lines.push("# Simplify3D Multi-Color Setup Guide");
  lines.push("");
  lines.push("## Print Summary");
  lines.push("");
  lines.push("| Setting | Value |");
  lines.push("|---------|-------|");
  lines.push(`| Print size | ${printWidthMm}mm × ${printHeightMm}mm |`);
  lines.push(`| Total height | ${totalHeight.toFixed(3)}mm |`);
  lines.push(`| Number of layers | ${numLayers} |`);
  lines.push(`| Nozzle diameter | ${nozzleMm}mm |`);
  lines.push(`| Layer height | ${layerHeightMm}mm |`);
  lines.push(`| Min printable feature | ~${minFeature.toFixed(1)}mm (3× nozzle) |`);
  lines.push("");
  lines.push("---");
  lines.push("");

  // Layer stack table
  lines.push("## Layer Stack");
  lines.push("");
  lines.push("| # | Name | Color | Z Start | Z End | Height |");
  lines.push("|---|------|-------|---------|-------|--------|");
  for (let i = 0; i < guideLayers.length; i++) {
    const layer = guideLayers[i];
    const color = layer.color || "—";
    lines.push(
      `| ${i+1} | ${layer.name} | ${color} ` +
      `| ${layer.z_bottom.toFixed(3)}mm | ${layer.z_top.toFixed(3)}mm ` +
      `| ${layer.height_mm.toFixed(3)}mm |`
    );
  }
  lines.push("");
  lines.push("---");
  lines.push("");

  // Step 1
  lines.push("## Step 1: Import STLs");
  lines.push("");
  lines.push("1. Open Simplify3D");
  lines.push("2. **File → Import** all STLs from the ZIP:");
  for (let i = 0; i < guideLayers.length; i++) {
    lines.push(`   - \`layer${i+1}.stl\` (${guideLayers[i].name})`);
  }
  lines.push("3. Z positions are baked into the STL files — import and they stack automatically.");
  lines.push("4. Verify in the preview that layers stack correctly (no gaps or overlaps).");
  lines.push("");
  lines.push("---");
  lines.push("");

  // Step 2
  lines.push("## Step 2: Create Processes");
  lines.push("");
  lines.push(
    "Create one **Process** per layer. Each process is restricted to its Z range " +
    "so Simplify3D only slices that layer's geometry."
  );
  lines.push("");

  const speedBase = nozzleMm <= 0.4 ? 50 : 60;
  for (let i = 0; i < guideLayers.length; i++) {
    const layer   = guideLayers[i];
    const isFirst = i === 0;
    const isLast  = i === numLayers - 1;
    const speed   = Math.max(speedBase - i * 5, 20);

    lines.push(`### Process ${i+1} — ${layer.name}`);
    lines.push("");
    lines.push(`1. Click **Add** under the Process list, name it: \`${layer.name}\``);
    lines.push("2. **Layer tab:**");
    lines.push(`   - Primary Layer Height: \`${layerHeightMm}mm\``);
    if (isLast) {
      lines.push("   - Top Solid Layers: `3`");
    } else {
      lines.push("   - Top Solid Layers: `0` (next layer prints on top)");
    }
    if (isFirst) {
      lines.push("   - Bottom Solid Layers: `4`");
    } else {
      lines.push("   - Bottom Solid Layers: `2`");
    }
    lines.push("3. **Advanced tab → Process Range:**");
    lines.push(`   - Start: \`${layer.z_bottom.toFixed(3)}mm\``);
    lines.push(`   - Stop: \`${layer.z_top.toFixed(3)}mm\``);
    lines.push("4. **Infill tab:**");
    lines.push("   - Infill: `100%` — solid fill for thin prints");
    lines.push("   - Pattern: Rectilinear");
    lines.push("5. **Speed tab:**");
    lines.push(`   - Default Speed: \`${speed}mm/s\``);
    if (isFirst) {
      lines.push("   - First Layer Speed: `50%`");
    }
    lines.push("6. **Temperature tab:**");
    lines.push("   - Extruder: Per your filament (typically 200–210°C for PLA)");
    lines.push("   - Bed: 60°C");

    if (isFirst) {
      lines.push("7. **Additions tab:**");
      lines.push("   - Skirt: 2–3 outlines, 0.1mm offset");
      lines.push("   - Consider a brim (3–5mm) for bed adhesion on thin prints");
    }

    if (!isLast) {
      const nextLayer = guideLayers[i + 1];
      lines.push(`8. **Scripts tab → Ending Script** (add before existing ending code):`);
      lines.push("   ```gcode");
      lines.push(`   ; === FILAMENT CHANGE — SWAP TO ${nextLayer.name.toUpperCase()} ===`);
      lines.push("   M600 ; Filament change (pause and prompt swap)");
      lines.push("   ; If your firmware doesn't support M600, use:");
      lines.push("   ; M0 ; Unconditional stop — press resume after swap");
      lines.push("   ```");
    }

    lines.push("");
  }

  lines.push("---");
  lines.push("");

  // Step 3
  lines.push("## Step 3: Prepare & Print");
  lines.push("");
  lines.push("1. Click **Prepare to Print**");
  lines.push(`2. Select **all ${numLayers} processes** and choose **"Continuous printing"**`);
  lines.push("3. Review the preview layer-by-layer to confirm correct layer ranges");
  lines.push("4. Save the combined G-code");
  lines.push("");
  lines.push("### Filament Swap Procedure");
  lines.push("");
  lines.push("When the printer pauses for a filament change:");
  lines.push("");
  lines.push("1. **DO NOT** remove the print from the bed");
  lines.push("2. **DO NOT** home Z — leave the nozzle where it is");
  lines.push("3. Retract the current filament");
  lines.push("4. Load the next color");
  lines.push("5. Purge ~50mm of filament until the new color runs clean");
  lines.push("6. Resume the print");
  lines.push("");
  lines.push("---");
  lines.push("");

  // Troubleshooting
  lines.push("## Troubleshooting");
  lines.push("");
  lines.push("### M600 not working");
  lines.push("- Ender 3 stock firmware may not support `M600`");
  lines.push("- **Fix:** Flash Marlin with `ADVANCED_PAUSE_FEATURE` enabled");
  lines.push("- **Alternative:** Use `M0` (unconditional stop) instead");
  lines.push("- **Alternative:** Split into separate G-code files (see below)");
  lines.push("");
  lines.push("### Layers not aligning");
  lines.push("- Verify all STLs are centered at the same XY origin");
  lines.push("- Don't touch the bed or print between swaps");
  lines.push("- Ensure Z doesn't home between processes");
  lines.push("");
  lines.push("### Warping / lifting");
  lines.push("- Add brim (5mm+)");
  lines.push("- Use glue stick or hairspray on bed");
  lines.push("- Ensure bed stays at 60°C throughout");
  lines.push("");
  lines.push("### Filament oozing during swap");
  lines.push("- Do a cold pull to clean the nozzle before resuming");
  lines.push("- Consider adding a prime pillar (Additions tab)");
  lines.push("");
  lines.push("---");
  lines.push("");

  // M600-free alternative
  lines.push("## Alternative: M600-Free Approach (Manual G-code Split)");
  lines.push("");
  lines.push("If your firmware doesn't support `M600`:");
  lines.push("");
  lines.push("1. Prepare all processes normally");
  lines.push("2. Export **each process** as a separate G-code file");
  for (let i = 0; i < guideLayers.length; i++) {
    const layer = guideLayers[i];
    lines.push(`3. Print file ${i+1} (${layer.name}, Z ${layer.z_bottom.toFixed(3)}–${layer.z_top.toFixed(3)}mm)`);
    if (i < numLayers - 1) {
      lines.push(`   - When done, **don't remove the print**. Swap to next filament.`);
      lines.push(`   - Open file ${i+2} in a text editor:`);
      lines.push("     - Remove all homing commands (`G28`)");
      lines.push("     - Remove bed leveling (`G29`)");
      lines.push(`     - Confirm it starts at Z ${guideLayers[i+1].z_bottom.toFixed(3)}mm`);
    }
  }
  lines.push("");
  lines.push(
    "> **Critical:** In the split approach, you MUST remove `G28` from all files " +
    "except the first, or the nozzle will crash into your print while homing."
  );
  lines.push("");

  return lines.join("\n");
}

// ── ZIP generation ────────────────────────────────────

generateBtn.addEventListener("click", async () => {
  if (!layers.length) {
    setStatus("Add at least one layer.", "error");
    return;
  }
  const missing = layers
    .filter(l => !l.file)
    .map(l => l.name || `Layer ${layers.indexOf(l) + 1}`);
  if (missing.length) {
    setStatus(`Upload PNG for: ${missing.join(", ")}`, "error");
    return;
  }

  generateBtn.disabled = true;
  setStatus("Generating… (may take a moment for large PNGs)", "");

  try {
    const widthMm       = parseFloat(document.getElementById("width_mm").value);
    const heightMm      = parseFloat(document.getElementById("height_mm").value);
    const nozzleMm      = parseFloat(document.getElementById("nozzle_mm").value);
    const layerHeightMm = parseFloat(document.getElementById("layer_height_mm").value);

    const zip         = new JSZip();
    const guideLayers = [];
    let   zOffset     = 0;

    for (let i = 0; i < layers.length; i++) {
      const layer   = layers[i];
      const zBottom = zOffset;
      const zTop    = zBottom + layer.height;

      // Load alpha mask from the uploaded PNG
      const { mask, rows, cols } = await loadAlphaMask(layer.file, layer.threshold);

      // Convert mask to binary STL and add to ZIP
      const stlBuf = maskToSTL(mask, rows, cols, widthMm, heightMm, layer.height, zBottom);
      zip.file(`layer${i + 1}.stl`, stlBuf);

      guideLayers.push({
        name:      layer.name,
        z_bottom:  zBottom,
        z_top:     zTop,
        height_mm: layer.height,
        color:     layer.color,
      });

      zOffset = zTop;
    }

    // Generate slicer guide and add to ZIP
    const guide = generateGuide(guideLayers, nozzleMm, layerHeightMm, widthMm, heightMm);
    zip.file("slicer_guide.md", guide);

    // Trigger download
    const blob = await zip.generateAsync({ type: "blob" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = "multicolor_print.zip";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    setStatus("Downloaded!", "success");
  } catch (e) {
    setStatus("Error: " + e.message, "error");
  } finally {
    generateBtn.disabled = false;
  }
});

function setStatus(msg, type) {
  generateStatus.textContent = msg;
  generateStatus.className   = type;
}

// ── Presets (localStorage) ────────────────────────────

function getStoredPresets() {
  try {
    return JSON.parse(localStorage.getItem(PRESETS_KEY) || "{}");
  } catch {
    return {};
  }
}

function loadPresetsList() {
  const presets = getStoredPresets();
  presetSelect.innerHTML = '<option value="">— Load preset —</option>';
  for (const name of Object.keys(presets)) {
    const p   = presets[name];
    const opt = document.createElement("option");
    opt.value       = name;
    opt.textContent = `${name} (${(p.layers || []).length}L, ${p.width_mm}×${p.height_mm}mm)`;
    presetSelect.appendChild(opt);
  }
}

loadPresetBtn.addEventListener("click", () => {
  const name = presetSelect.value;
  if (!name) return;
  const presets = getStoredPresets();
  const preset  = presets[name];
  if (!preset) { alert("Preset not found."); return; }
  applyPreset(preset);
});

function applyPreset(preset) {
  if (preset.width_mm)        document.getElementById("width_mm").value        = preset.width_mm;
  if (preset.height_mm)       document.getElementById("height_mm").value       = preset.height_mm;
  if (preset.nozzle_mm)       document.getElementById("nozzle_mm").value       = preset.nozzle_mm;
  if (preset.layer_height_mm) document.getElementById("layer_height_mm").value = preset.layer_height_mm;

  layers.forEach(l => l.domRow.remove());
  layers       = [];
  layerCounter = 0;

  for (const l of (preset.layers || [])) {
    addLayer({ name: l.name, height: l.height, color: l.color, threshold: l.threshold });
  }
}

savePresetBtn.addEventListener("click", () => {
  const name = presetNameInput.value.trim();
  if (!name) { alert("Enter a preset name first."); return; }

  const preset = {
    name,
    width_mm:        parseFloat(document.getElementById("width_mm").value),
    height_mm:       parseFloat(document.getElementById("height_mm").value),
    nozzle_mm:       parseFloat(document.getElementById("nozzle_mm").value),
    layer_height_mm: parseFloat(document.getElementById("layer_height_mm").value),
    layers: layers.map(l => ({
      name:      l.name,
      height:    l.height,
      color:     l.color,
      threshold: l.threshold,
    })),
  };

  const presets  = getStoredPresets();
  presets[name]  = preset;
  localStorage.setItem(PRESETS_KEY, JSON.stringify(presets));

  presetNameInput.value = "";
  loadPresetsList();
  presetSelect.value = name;
});

deletePresetBtn.addEventListener("click", () => {
  const name = presetSelect.value;
  if (!name) return;
  if (!confirm(`Delete preset "${name}"?`)) return;

  const presets = getStoredPresets();
  delete presets[name];
  localStorage.setItem(PRESETS_KEY, JSON.stringify(presets));
  loadPresetsList();
});

// ── Init ──────────────────────────────────────────────

addLayerBtn.addEventListener("click", () => addLayer());

// Seed with 2 default layers
for (const d of DEFAULTS) addLayer(d);

// Populate presets dropdown from localStorage
loadPresetsList();
