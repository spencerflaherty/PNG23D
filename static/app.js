/* =====================================================
   Multi-Color 3D Print — Frontend Logic
   ===================================================== */

// ── State ────────────────────────────────────────────
let layers = [];      // [{name, file, color, height, threshold, imageData}]
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
      // Render image to an offscreen canvas to get pixel data
      const off = document.createElement("canvas");
      off.width  = img.width;
      off.height = img.height;
      const offCtx = off.getContext("2d");
      offCtx.drawImage(img, 0, 0);
      layerData.imageData = offCtx.getImageData(0, 0, img.width, img.height);
      layerData.width  = img.width;
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

  // Use first loaded image's dimensions for canvas size
  const ref = loaded[0];
  const W = ref.width;
  const H = ref.height_px;
  previewCanvas.width  = W;
  previewCanvas.height = H;

  // Start with black background
  ctx.fillStyle = "#111318";
  ctx.fillRect(0, 0, W, H);

  // Composite each layer: for each opaque pixel, tint to the layer color
  for (const layer of loaded) {
    if (!layer.imageData) continue;

    // Scale if dimensions differ from reference
    let data = layer.imageData;
    let w = layer.width;
    let h = layer.height_px;

    // If different size, scale to match first layer
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

    // Create tinted image
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

    // Draw tinted layer onto canvas
    const off3 = document.createElement("canvas");
    off3.width = W;
    off3.height = H;
    off3.getContext("2d").putImageData(tinted, 0, 0);
    ctx.drawImage(off3, 0, 0);
  }

  // Legend
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

// ── Presets ───────────────────────────────────────────

async function fetchPresets() {
  try {
    const res = await fetch("/presets");
    const list = await res.json();
    presetSelect.innerHTML = '<option value="">— Load preset —</option>';
    for (const p of list) {
      const opt = document.createElement("option");
      opt.value = p.name;
      opt.textContent = `${p.name} (${p.num_layers}L, ${p.width_mm}×${p.height_mm}mm)`;
      presetSelect.appendChild(opt);
    }
  } catch (e) {
    console.warn("Failed to fetch presets", e);
  }
}

loadPresetBtn.addEventListener("click", async () => {
  const name = presetSelect.value;
  if (!name) return;
  try {
    const res = await fetch(`/presets/${encodeURIComponent(name)}`);
    if (!res.ok) throw new Error("Not found");
    const preset = await res.json();
    applyPreset(preset);
  } catch (e) {
    alert("Failed to load preset: " + e.message);
  }
});

function applyPreset(preset) {
  // Set print settings
  if (preset.width_mm)       document.getElementById("width_mm").value       = preset.width_mm;
  if (preset.height_mm)      document.getElementById("height_mm").value      = preset.height_mm;
  if (preset.nozzle_mm)      document.getElementById("nozzle_mm").value      = preset.nozzle_mm;
  if (preset.layer_height_mm) document.getElementById("layer_height_mm").value = preset.layer_height_mm;

  // Rebuild layers (without files — user must re-upload)
  layers.forEach(l => l.domRow.remove());
  layers = [];
  layerCounter = 0;

  const presetLayers = preset.layers || [];
  for (const l of presetLayers) {
    addLayer({ name: l.name, height: l.height, color: l.color, threshold: l.threshold });
  }
}

savePresetBtn.addEventListener("click", async () => {
  const name = presetNameInput.value.trim();
  if (!name) { alert("Enter a preset name first."); return; }

  const preset = {
    name,
    width_mm:       parseFloat(document.getElementById("width_mm").value),
    height_mm:      parseFloat(document.getElementById("height_mm").value),
    nozzle_mm:      parseFloat(document.getElementById("nozzle_mm").value),
    layer_height_mm: parseFloat(document.getElementById("layer_height_mm").value),
    layers: layers.map(l => ({
      name:      l.name,
      height:    l.height,
      color:     l.color,
      threshold: l.threshold,
    })),
  };

  try {
    const res = await fetch("/presets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(preset),
    });
    if (!res.ok) throw new Error((await res.json()).error);
    presetNameInput.value = "";
    await fetchPresets();
    // Select the just-saved preset
    presetSelect.value = name;
  } catch (e) {
    alert("Failed to save preset: " + e.message);
  }
});

deletePresetBtn.addEventListener("click", async () => {
  const name = presetSelect.value;
  if (!name) return;
  if (!confirm(`Delete preset "${name}"?`)) return;
  try {
    await fetch(`/presets/${encodeURIComponent(name)}`, { method: "DELETE" });
    await fetchPresets();
  } catch (e) {
    alert("Failed to delete preset: " + e.message);
  }
});

// ── Generate ──────────────────────────────────────────

generateBtn.addEventListener("click", async () => {
  // Validate
  if (!layers.length) {
    setStatus("Add at least one layer.", "error");
    return;
  }
  const missing = layers.filter(l => !l.file).map(l => l.name || `Layer ${layers.indexOf(l)+1}`);
  if (missing.length) {
    setStatus(`Upload PNG for: ${missing.join(", ")}`, "error");
    return;
  }

  generateBtn.disabled = true;
  setStatus("Generating... (may take a moment for large PNGs)", "");

  const formData = new FormData();
  formData.append("width_mm",        document.getElementById("width_mm").value);
  formData.append("height_mm",       document.getElementById("height_mm").value);
  formData.append("nozzle_mm",       document.getElementById("nozzle_mm").value);
  formData.append("layer_height_mm", document.getElementById("layer_height_mm").value);

  for (const layer of layers) {
    formData.append("layer_name[]",      layer.name);
    formData.append("layer_height[]",    layer.height);
    formData.append("layer_threshold[]", layer.threshold);
    formData.append("layer_color[]",     layer.color);
    formData.append("layer_file[]",      layer.file);
  }

  try {
    const res = await fetch("/generate", { method: "POST", body: formData });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Unknown error" }));
      throw new Error(err.error || res.statusText);
    }

    // Trigger ZIP download
    const blob = await res.blob();
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
  generateStatus.className = type;
}

// ── Init ──────────────────────────────────────────────

addLayerBtn.addEventListener("click", () => addLayer());

// Seed with 2 default layers
for (const d of DEFAULTS) addLayer(d);

// Load presets from server
fetchPresets();
