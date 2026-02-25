/**
 * app.js — Map Token Creator
 * Canvas rendering, image interaction (pan / corner-resize / scroll-zoom), and PNG export.
 */

'use strict';

// ── Constants ──────────────────────────────────────────────────────────────

const SIZE       = 512;
const CX         = SIZE / 2;
const CY         = SIZE / 2;
const CLIP_R     = 232;   // radius of the visible image circle
const THUMB      = 64;    // thumbnail canvas size
const HANDLE_R   = 8;     // corner handle draw radius (canvas px)
const HANDLE_HIT = 16;    // corner handle hit-test radius (canvas px)

// Corner index → resize cursor name
const CORNER_CURSORS = ['nw-resize', 'ne-resize', 'sw-resize', 'se-resize'];

// ── State ──────────────────────────────────────────────────────────────────

const state = {
  image:          null,   // HTMLImageElement
  panX:           0,
  panY:           0,
  zoom:           1,
  frameIndex:     0,
  color:          '#c0922a',
  // interaction
  mode:           'none', // 'none' | 'pan' | 'resize'
  resizeCorner:   -1,     // 0=TL  1=TR  2=BL  3=BR
  // anchor data captured at the start of each resize drag
  resizeStartZoom:    1,
  resizeFixedCorner:  [0, 0],   // actual fixed corner in canvas px
  resizeActiveCorner: [0, 0],   // actual dragged corner in canvas px
  resizeMouseStartX:  0,
  resizeMouseStartY:  0,
  lastX:          0,
  lastY:          0,
  // pinch
  lastPinchDist:  null,
};

// ── DOM refs ───────────────────────────────────────────────────────────────

const canvas      = document.getElementById('preview');
const ctx         = canvas.getContext('2d');
const overlay     = document.getElementById('overlay');
const octx        = overlay.getContext('2d');
const imageInput  = document.getElementById('imageUpload');
const colorInput  = document.getElementById('frameColor');
const colorHex    = document.getElementById('colorHex');
const downloadBtn = document.getElementById('downloadBtn');
const framePicker = document.getElementById('framePicker');

// ── SVG → Image helper ─────────────────────────────────────────────────────

function svgToImage(svgString) {
  return new Promise((resolve, reject) => {
    const blob = new Blob([svgString], { type: 'image/svg+xml' });
    const url  = URL.createObjectURL(blob);
    const img  = new Image();
    img.onload  = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('SVG load failed')); };
    img.src = url;
  });
}

// ── Corner geometry ────────────────────────────────────────────────────────

/** Returns the 4 image corners in canvas-pixel space: [TL, TR, BL, BR]. */
function getCorners() {
  if (!state.image) return [];
  const w = state.image.width  * state.zoom;
  const h = state.image.height * state.zoom;
  return [
    [state.panX,     state.panY    ],   // 0 TL
    [state.panX + w, state.panY    ],   // 1 TR
    [state.panX,     state.panY + h],   // 2 BL
    [state.panX + w, state.panY + h],   // 3 BR
  ];
}

/**
 * Clamp a corner position so the handle stays within the canvas.
 * Handles for corners that are off-canvas get pushed to the nearest edge
 * so they're always reachable by the user.
 */
function clampHandle(x, y) {
  const pad = HANDLE_R + 2;
  return [
    Math.max(pad, Math.min(SIZE - pad, x)),
    Math.max(pad, Math.min(SIZE - pad, y)),
  ];
}

/** Returns the corner index (0-3) whose clamped handle is under (mx, my), or -1. */
function hitTestCorner(mx, my) {
  const corners = getCorners();
  for (let i = 0; i < corners.length; i++) {
    const [hx, hy] = clampHandle(...corners[i]);
    const dx = mx - hx, dy = my - hy;
    if (dx * dx + dy * dy <= HANDLE_HIT * HANDLE_HIT) return i;
  }
  return -1;
}

// ── Preview canvas render ──────────────────────────────────────────────────

async function render(targetCtx = ctx, targetSize = SIZE) {
  const s = targetSize / SIZE;
  const c = targetCtx;

  c.clearRect(0, 0, targetSize, targetSize);

  // Clip to circle then draw image
  c.save();
  c.beginPath();
  c.arc(CX * s, CY * s, CLIP_R * s, 0, Math.PI * 2);
  c.clip();

  if (!state.image) {
    c.fillStyle = '#2a2a3a';
    c.fillRect(0, 0, targetSize, targetSize);
    c.fillStyle = '#555';
    c.font = `${14 * s}px sans-serif`;
    c.textAlign    = 'center';
    c.textBaseline = 'middle';
    c.fillText('Upload an image', CX * s, CY * s);
  } else {
    c.drawImage(
      state.image,
      state.panX * s,
      state.panY * s,
      state.image.width  * state.zoom * s,
      state.image.height * state.zoom * s
    );
  }

  c.restore();

  // Draw frame SVG on top
  const svgStr = FRAMES[state.frameIndex].fn(state.color);
  try {
    const frameImg = await svgToImage(svgStr);
    c.drawImage(frameImg, 0, 0, targetSize, targetSize);
  } catch (e) {
    console.warn('Frame render failed:', e);
  }
}

// ── Overlay canvas render ──────────────────────────────────────────────────

function renderOverlay() {
  octx.clearRect(0, 0, SIZE, SIZE);
  if (!state.image) return;

  const corners = getCorners();
  const w = state.image.width  * state.zoom;
  const h = state.image.height * state.zoom;

  // Dashed bounding rect (may be clipped by the canvas edge for large images)
  octx.save();
  octx.strokeStyle = 'rgba(255,255,255,0.5)';
  octx.lineWidth   = 1;
  octx.setLineDash([5, 4]);
  octx.strokeRect(state.panX + 0.5, state.panY + 0.5, w, h);
  octx.restore();

  // Corner handles — drawn at their clamped positions
  for (let i = 0; i < 4; i++) {
    const [hx, hy] = clampHandle(...corners[i]);
    octx.beginPath();
    octx.arc(hx, hy, HANDLE_R, 0, Math.PI * 2);
    octx.fillStyle   = 'rgba(255,255,255,0.92)';
    octx.fill();
    octx.strokeStyle = 'rgba(0,0,0,0.4)';
    octx.lineWidth   = 1.5;
    octx.setLineDash([]);
    octx.stroke();
  }
}

function scheduleRender() {
  render().catch(console.error);
  renderOverlay();
}

// ── Image upload ───────────────────────────────────────────────────────────

imageInput.addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    URL.revokeObjectURL(url);
    state.image = img;
    fitImage();
    scheduleRender();
  };
  img.src = url;
});

function fitImage() {
  if (!state.image) return;
  const diameter = CLIP_R * 2;
  const scale = Math.max(diameter / state.image.width, diameter / state.image.height);
  state.zoom = scale;
  state.panX = CX - (state.image.width  * scale) / 2;
  state.panY = CY - (state.image.height * scale) / 2;
}

// ── Pointer coordinate helper ──────────────────────────────────────────────

/** Convert a mouse/touch clientX/Y into canvas-pixel coordinates. */
function canvasCoords(clientX, clientY) {
  const rect   = overlay.getBoundingClientRect();
  const cScale = SIZE / rect.width;
  return [
    (clientX - rect.left) * cScale,
    (clientY - rect.top)  * cScale,
  ];
}

// ── Resize math ────────────────────────────────────────────────────────────

/**
 * Called while dragging a corner handle.
 *
 * Uses the positions snapshotted at drag-start (resizeFixedCorner /
 * resizeActiveCorner) so:
 *   • No jump when clicking a clamped handle (whose screen position differs
 *     from the actual image corner).
 *   • Scale is computed relative to the start-of-drag state, not accumulated,
 *     so there's no floating-point drift over a long drag.
 *
 * Aspect ratio is preserved: the diagonal from the fixed corner to the
 * effective dragged-corner position drives the new zoom uniformly.
 */
function applyResize(mx, my) {
  if (!state.image) return;

  const [fX, fY] = state.resizeFixedCorner;
  const [aX, aY] = state.resizeActiveCorner;

  // Mouse delta from where the drag started → shift the active corner by that delta
  const dx   = mx - state.resizeMouseStartX;
  const dy   = my - state.resizeMouseStartY;
  const newAX = aX + dx;
  const newAY = aY + dy;

  // Original diagonal (fixed → active at drag-start) used as the reference length
  const origDiag = Math.sqrt((aX - fX) ** 2 + (aY - fY) ** 2);
  const newDiag  = Math.sqrt((newAX - fX) ** 2 + (newAY - fY) ** 2);
  if (origDiag === 0 || newDiag < 1) return;

  const newZoom = Math.max(0.05, state.resizeStartZoom * (newDiag / origDiag));
  const newW    = state.image.width  * newZoom;
  const newH    = state.image.height * newZoom;

  // Reposition so the fixed corner stays at (fX, fY)
  const fixedIndex = 3 - state.resizeCorner;
  switch (fixedIndex) {
    case 0: state.panX = fX;        state.panY = fY;        break; // TL fixed
    case 1: state.panX = fX - newW; state.panY = fY;        break; // TR fixed
    case 2: state.panX = fX;        state.panY = fY - newH; break; // BL fixed
    case 3: state.panX = fX - newW; state.panY = fY - newH; break; // BR fixed
  }
  state.zoom = newZoom;
}

// ── Mouse events (on overlay) ──────────────────────────────────────────────

overlay.addEventListener('mousedown', e => {
  const [mx, my] = canvasCoords(e.clientX, e.clientY);

  if (state.image) {
    const corner = hitTestCorner(mx, my);
    if (corner !== -1) {
      const corners    = getCorners();
      const fixedIndex = 3 - corner;
      // Snapshot the actual (unclamped) corner positions at drag-start.
      // applyResize works from these anchors so the image doesn't jump when
      // the user clicks a clamped handle that isn't at the real corner.
      state.mode              = 'resize';
      state.resizeCorner      = corner;
      state.resizeStartZoom   = state.zoom;
      state.resizeFixedCorner  = [...corners[fixedIndex]];
      state.resizeActiveCorner = [...corners[corner]];
      state.resizeMouseStartX  = mx;
      state.resizeMouseStartY  = my;
      overlay.style.cursor = CORNER_CURSORS[corner];
      return;
    }
  }

  state.mode  = 'pan';
  state.lastX = e.clientX;
  state.lastY = e.clientY;
  overlay.style.cursor = 'grabbing';
});

window.addEventListener('mousemove', e => {
  if (state.mode === 'pan') {
    const rect   = overlay.getBoundingClientRect();
    const cScale = SIZE / rect.width;
    state.panX += (e.clientX - state.lastX) * cScale;
    state.panY += (e.clientY - state.lastY) * cScale;
    state.lastX = e.clientX;
    state.lastY = e.clientY;
    scheduleRender();

  } else if (state.mode === 'resize') {
    const [mx, my] = canvasCoords(e.clientX, e.clientY);
    applyResize(mx, my);
    scheduleRender();
  }
});

window.addEventListener('mouseup', () => {
  state.mode         = 'none';
  state.resizeCorner = -1;
  overlay.style.cursor = 'grab';
});

// Hover cursor — update when not actively dragging
overlay.addEventListener('mousemove', e => {
  if (state.mode !== 'none') return;
  if (!state.image) return;
  const [mx, my] = canvasCoords(e.clientX, e.clientY);
  const corner = hitTestCorner(mx, my);
  overlay.style.cursor = corner !== -1 ? CORNER_CURSORS[corner] : 'grab';
});

// ── Scroll to zoom (on overlay) ────────────────────────────────────────────

overlay.addEventListener('wheel', e => {
  e.preventDefault();
  const [mx, my] = canvasCoords(e.clientX, e.clientY);
  const factor  = e.deltaY < 0 ? 1.08 : 0.93;
  const newZoom = Math.max(0.05, state.zoom * factor);
  state.panX = mx - (mx - state.panX) * (newZoom / state.zoom);
  state.panY = my - (my - state.panY) * (newZoom / state.zoom);
  state.zoom = newZoom;
  scheduleRender();
}, { passive: false });

// ── Touch — pan & pinch (on overlay) ──────────────────────────────────────

function touchDist(t1, t2) {
  const dx = t1.clientX - t2.clientX;
  const dy = t1.clientY - t2.clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

overlay.addEventListener('touchstart', e => {
  e.preventDefault();
  if (e.touches.length === 1) {
    state.mode  = 'pan';
    state.lastX = e.touches[0].clientX;
    state.lastY = e.touches[0].clientY;
    state.lastPinchDist = null;
  } else if (e.touches.length === 2) {
    state.mode = 'none'; // pinch overrides pan
    state.lastPinchDist = touchDist(e.touches[0], e.touches[1]);
  }
}, { passive: false });

overlay.addEventListener('touchmove', e => {
  e.preventDefault();
  const rect   = overlay.getBoundingClientRect();
  const cScale = SIZE / rect.width;

  if (e.touches.length === 1 && state.mode === 'pan') {
    const dx = e.touches[0].clientX - state.lastX;
    const dy = e.touches[0].clientY - state.lastY;
    state.lastX = e.touches[0].clientX;
    state.lastY = e.touches[0].clientY;
    state.panX += dx * cScale;
    state.panY += dy * cScale;
    scheduleRender();

  } else if (e.touches.length === 2 && state.lastPinchDist !== null) {
    const dist   = touchDist(e.touches[0], e.touches[1]);
    const factor = dist / state.lastPinchDist;
    const mx = ((e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left) * cScale;
    const my = ((e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top)  * cScale;
    const newZoom = Math.max(0.05, state.zoom * factor);
    state.panX = mx - (mx - state.panX) * (newZoom / state.zoom);
    state.panY = my - (my - state.panY) * (newZoom / state.zoom);
    state.zoom = newZoom;
    state.lastPinchDist = dist;
    scheduleRender();
  }
}, { passive: false });

overlay.addEventListener('touchend', e => {
  e.preventDefault();
  if (e.touches.length < 2) state.lastPinchDist = null;
  if (e.touches.length === 0) state.mode = 'none';
}, { passive: false });

// ── Frame picker ───────────────────────────────────────────────────────────

async function buildFramePicker() {
  for (let i = 0; i < FRAMES.length; i++) {
    const frame = FRAMES[i];

    const wrapper = document.createElement('div');
    wrapper.className   = 'frame-thumb' + (i === 0 ? ' active' : '');
    wrapper.dataset.index = i;

    const tc = document.createElement('canvas');
    tc.width  = THUMB;
    tc.height = THUMB;
    wrapper.appendChild(tc);

    const label = document.createElement('div');
    label.className   = 'thumb-label';
    label.textContent = frame.label;
    wrapper.appendChild(label);

    framePicker.appendChild(wrapper);
    renderThumb(tc, i, state.color);

    wrapper.addEventListener('click', () => {
      document.querySelectorAll('.frame-thumb').forEach(el => el.classList.remove('active'));
      wrapper.classList.add('active');
      state.frameIndex = i;
      scheduleRender();
    });
  }
}

async function renderThumb(tc, frameIndex, color) {
  const tctx = tc.getContext('2d');
  tctx.clearRect(0, 0, THUMB, THUMB);
  tctx.save();
  tctx.beginPath();
  tctx.arc(THUMB / 2, THUMB / 2, THUMB * 0.45, 0, Math.PI * 2);
  tctx.fillStyle = '#2a2a3a';
  tctx.fill();
  tctx.restore();

  const svgStr = FRAMES[frameIndex].fn(color);
  try {
    const img = await svgToImage(svgStr);
    tctx.drawImage(img, 0, 0, THUMB, THUMB);
  } catch (e) {
    console.warn('Thumb render failed:', e);
  }
}

function refreshAllThumbs() {
  document.querySelectorAll('.frame-thumb').forEach(wrapper => {
    const i  = parseInt(wrapper.dataset.index);
    const tc = wrapper.querySelector('canvas');
    renderThumb(tc, i, state.color);
  });
}

// ── Color picker ───────────────────────────────────────────────────────────

colorInput.addEventListener('input', e => {
  state.color = e.target.value;
  colorHex.textContent = e.target.value;
  scheduleRender();
  refreshAllThumbs();
});

// ── Download ───────────────────────────────────────────────────────────────

downloadBtn.addEventListener('click', async () => {
  const exportCanvas = document.createElement('canvas');
  exportCanvas.width  = SIZE;
  exportCanvas.height = SIZE;
  const exportCtx = exportCanvas.getContext('2d');
  await render(exportCtx, SIZE);

  exportCanvas.toBlob(blob => {
    const a = document.createElement('a');
    a.download = 'token.png';
    a.href = URL.createObjectURL(blob);
    a.click();
    URL.revokeObjectURL(a.href);
  }, 'image/png');
});

// ── Init ───────────────────────────────────────────────────────────────────

buildFramePicker().then(() => scheduleRender());
