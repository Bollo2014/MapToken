/**
 * frames.js — SVG frame definitions as JavaScript template string functions.
 *
 * Each frame is (color: string) => svgString.
 * The SVG is 512×512. The inner circle (r=232) is kept transparent so the
 * clipped image shows through. All artwork lives in the outer 24px ring.
 *
 * Multi-tone frames use toneVariants(hex) to derive light/dark shades from
 * a single hue so the single color-picker drives all frames.
 */

// ── Tone helper ────────────────────────────────────────────────────────────

function hexToHSL(hex) {
  let r = parseInt(hex.slice(1, 3), 16) / 255;
  let g = parseInt(hex.slice(3, 5), 16) / 255;
  let b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;
  if (max === min) {
    h = s = 0;
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
}

function hslToHex(h, s, l) {
  s /= 100; l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = n => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function toneVariants(hex) {
  const [h, s, l] = hexToHSL(hex);
  return {
    base:  hslToHex(h, s, l),
    light: hslToHex(h, Math.max(s - 5, 0), Math.min(l + 22, 92)),
    dark:  hslToHex(h, Math.min(s + 5, 100), Math.max(l - 22, 8)),
    vdark: hslToHex(h, Math.min(s + 10, 100), Math.max(l - 38, 4)),
    shine: hslToHex(h, Math.max(s - 15, 0), Math.min(l + 38, 96)),
  };
}

// ── SVG wrapper helper ─────────────────────────────────────────────────────

function svgWrap(content) {
  // The mask cuts out the inner circle (r < 232) so the canvas image shows through.
  // SVG filled circles are discs — without this mask the innermost circle would
  // cover the user's photo with a solid fill (fill="transparent" is a compositing
  // no-op in SVG source-over and does NOT erase underlying paint).
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="512" height="512" viewBox="0 0 512 512">
    <defs>
      <mask id="fm">
        <rect width="512" height="512" fill="white"/>
        <circle cx="256" cy="256" r="232" fill="black"/>
      </mask>
    </defs>
    <g mask="url(#fm)">${content}</g>
  </svg>`;
}

// ── Frame 1 — Simple Ring ──────────────────────────────────────────────────

function frameSimpleRing(color) {
  const t = toneVariants(color);
  return svgWrap(`
    <circle cx="256" cy="256" r="248" fill="${t.dark}" />
    <circle cx="256" cy="256" r="240" fill="${t.base}" />
    <circle cx="256" cy="256" r="234" fill="${t.dark}" />
  `);
}

// ── Frame 2 — Double Ring ─────────────────────────────────────────────────

function frameDoubleRing(color) {
  const t = toneVariants(color);
  return svgWrap(`
    <!-- outer ring -->
    <circle cx="256" cy="256" r="252" fill="${t.vdark}" />
    <circle cx="256" cy="256" r="248" fill="${t.base}" />
    <circle cx="256" cy="256" r="243" fill="${t.vdark}" />
    <!-- gap -->
    <circle cx="256" cy="256" r="240" fill="${t.dark}" />
    <!-- inner ring -->
    <circle cx="256" cy="256" r="238" fill="${t.vdark}" />
    <circle cx="256" cy="256" r="235" fill="${t.light}" />
    <circle cx="256" cy="256" r="232" fill="${t.vdark}" />
  `);
}

// ── Frame 3 — Rope Twist ──────────────────────────────────────────────────
// Simulated rope using alternating arc dashes around the ring.

function frameRopeTwist(color) {
  const t = toneVariants(color);
  const cx = 256, cy = 256, r = 242;
  const segments = 36;
  const step = (2 * Math.PI) / segments;
  let strands = '';
  for (let i = 0; i < segments; i++) {
    const a0 = i * step - Math.PI / 2;
    const a1 = a0 + step * 0.55;
    const x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0);
    const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
    const fill = i % 2 === 0 ? t.base : t.dark;
    // offset inner point for twist effect
    const ri = 234;
    const am = a0 + step * 0.275 + (i % 2 === 0 ? 0.08 : -0.08);
    const xm = cx + ri * Math.cos(am), ym = cy + ri * Math.sin(am);
    strands += `<path d="M${x0.toFixed(1)},${y0.toFixed(1)} Q${xm.toFixed(1)},${ym.toFixed(1)} ${x1.toFixed(1)},${y1.toFixed(1)}" stroke="${fill}" stroke-width="9" fill="none" stroke-linecap="round"/>`;
  }
  return svgWrap(`
    <circle cx="256" cy="256" r="252" fill="${t.vdark}" />
    <circle cx="256" cy="256" r="248" fill="${t.dark}" />
    ${strands}
    <circle cx="256" cy="256" r="233" fill="${t.vdark}" />
  `);
}

// ── Frame 4 — Ornate Fantasy ──────────────────────────────────────────────
// Filigree vines and flourishes at cardinal and intercardinal points.

function frameOrnateFantasy(color) {
  const t = toneVariants(color);
  // 8-point ornament generator
  function petal(cx, cy, angle, size) {
    const a = angle * Math.PI / 180;
    const r1 = 238, r2 = 248;
    const px = cx + r1 * Math.cos(a);
    const py = cy + r1 * Math.sin(a);
    const tip_x = cx + r2 * Math.cos(a);
    const tip_y = cy + r2 * Math.sin(a);
    const lx = cx + r1 * Math.cos(a - 0.18);
    const ly = cy + r1 * Math.sin(a - 0.18);
    const rx = cx + r1 * Math.cos(a + 0.18);
    const ry = cy + r1 * Math.sin(a + 0.18);
    return `<path d="M${lx.toFixed(1)},${ly.toFixed(1)} Q${tip_x.toFixed(1)},${tip_y.toFixed(1)} ${rx.toFixed(1)},${ry.toFixed(1)}" stroke="${t.shine}" stroke-width="2.5" fill="none"/>
            <circle cx="${tip_x.toFixed(1)}" cy="${tip_y.toFixed(1)}" r="${(size * 0.35).toFixed(1)}" fill="${t.light}"/>`;
  }
  let petals = '';
  for (let i = 0; i < 8; i++) {
    petals += petal(256, 256, i * 45 - 90, 6);
  }
  // vine arcs between petals
  let vines = '';
  for (let i = 0; i < 8; i++) {
    const a0 = (i * 45 - 90 + 22) * Math.PI / 180;
    const a1 = (i * 45 - 90 + 44) * Math.PI / 180;
    const rv = 241;
    const x0 = 256 + rv * Math.cos(a0), y0 = 256 + rv * Math.sin(a0);
    const x1 = 256 + rv * Math.cos(a1), y1 = 256 + rv * Math.sin(a1);
    const xc = 256 + (rv + 4) * Math.cos((a0 + a1) / 2);
    const yc = 256 + (rv + 4) * Math.sin((a0 + a1) / 2);
    vines += `<path d="M${x0.toFixed(1)},${y0.toFixed(1)} Q${xc.toFixed(1)},${yc.toFixed(1)} ${x1.toFixed(1)},${y1.toFixed(1)}" stroke="${t.base}" stroke-width="2" fill="none"/>`;
  }
  return svgWrap(`
    <circle cx="256" cy="256" r="252" fill="${t.vdark}" />
    <circle cx="256" cy="256" r="248" fill="${t.dark}" />
    <circle cx="256" cy="256" r="244" fill="${t.base}" />
    <circle cx="256" cy="256" r="237" fill="${t.dark}" />
    ${vines}
    ${petals}
    <circle cx="256" cy="256" r="233" fill="${t.vdark}" />
  `);
}

// ── Frame 5 — Riveted Metal ───────────────────────────────────────────────

function frameRivetedMetal(color) {
  const t = toneVariants(color);
  // rivets evenly spaced around the ring
  const n = 24;
  let rivets = '';
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 2 * Math.PI - Math.PI / 2;
    const r = 242;
    const x = (256 + r * Math.cos(a)).toFixed(1);
    const y = (256 + r * Math.sin(a)).toFixed(1);
    rivets += `<circle cx="${x}" cy="${y}" r="5" fill="${t.vdark}" stroke="${t.shine}" stroke-width="1.5"/>
               <circle cx="${x}" cy="${y}" r="2" fill="${t.light}"/>`;
  }
  // brushed-metal band using subtle gradient simulation via concentric strokes
  let bands = '';
  for (let i = 0; i < 5; i++) {
    const ri = 234 + i * 3;
    const op = 0.12 + i * 0.04;
    bands += `<circle cx="256" cy="256" r="${ri}" fill="none" stroke="${t.light}" stroke-width="1.5" opacity="${op}"/>`;
  }
  return svgWrap(`
    <circle cx="256" cy="256" r="252" fill="${t.vdark}" />
    <circle cx="256" cy="256" r="249" fill="${t.dark}" />
    <circle cx="256" cy="256" r="237" fill="${t.base}" />
    ${bands}
    ${rivets}
    <circle cx="256" cy="256" r="233" fill="${t.vdark}" />
  `);
}

// ── Frame 6 — Gem Border ──────────────────────────────────────────────────
// Faceted gem shapes at cardinal + intercardinal points; beaded ring between.

function frameGemBorder(color) {
  const t = toneVariants(color);

  function gem(cx, cy, angle, size) {
    const a = angle * Math.PI / 180;
    const rc = 242; // ring radius for gem center
    const gx = cx + rc * Math.cos(a);
    const gy = cy + rc * Math.sin(a);
    const s = size;
    // hexagonal gem shape oriented radially
    const cos30 = Math.cos(Math.PI / 6), sin30 = Math.sin(Math.PI / 6);
    // top facets
    const pts = [
      [gx + Math.cos(a) * s * 0.4,       gy + Math.sin(a) * s * 0.4],       // tip
      [gx + Math.cos(a + 1.2) * s * 0.55, gy + Math.sin(a + 1.2) * s * 0.55],
      [gx + Math.cos(a + Math.PI) * s * 0.35, gy + Math.sin(a + Math.PI) * s * 0.35], // base
      [gx + Math.cos(a - 1.2) * s * 0.55, gy + Math.sin(a - 1.2) * s * 0.55],
    ].map(p => p.map(v => v.toFixed(1)).join(',')).join(' ');
    return `
      <polygon points="${pts}" fill="${t.base}" stroke="${t.vdark}" stroke-width="1"/>
      <polygon points="${pts}" fill="url(#gemGrad)" opacity="0.4"/>
      <circle cx="${gx.toFixed(1)}" cy="${gy.toFixed(1)}" r="${(size * 0.18).toFixed(1)}" fill="${t.shine}" opacity="0.7"/>
    `;
  }

  let gems = '';
  for (let i = 0; i < 8; i++) {
    gems += gem(256, 256, i * 45 - 90, 13);
  }

  // small beads between gems
  let beads = '';
  for (let i = 0; i < 8; i++) {
    const a = ((i + 0.5) * 45 - 90) * Math.PI / 180;
    const r = 242;
    const bx = (256 + r * Math.cos(a)).toFixed(1);
    const by = (256 + r * Math.sin(a)).toFixed(1);
    beads += `<circle cx="${bx}" cy="${by}" r="3.5" fill="${t.light}" stroke="${t.vdark}" stroke-width="1"/>`;
  }

  return svgWrap(`
    <defs>
      <radialGradient id="gemGrad" cx="35%" cy="35%" r="65%">
        <stop offset="0%" stop-color="white" stop-opacity="0.9"/>
        <stop offset="100%" stop-color="white" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <circle cx="256" cy="256" r="252" fill="${t.vdark}" />
    <circle cx="256" cy="256" r="249" fill="${t.dark}" />
    <circle cx="256" cy="256" r="236" fill="${t.base}" />
    <circle cx="256" cy="256" r="233" fill="${t.dark}" />
    ${beads}
    ${gems}
  `);
}

// ── Export ─────────────────────────────────────────────────────────────────

const FRAMES = [
  { id: 'simple-ring',    label: 'Simple Ring',  fn: frameSimpleRing    },
  { id: 'double-ring',    label: 'Double Ring',  fn: frameDoubleRing    },
  { id: 'rope-twist',     label: 'Rope Twist',   fn: frameRopeTwist     },
  { id: 'ornate-fantasy', label: 'Ornate',       fn: frameOrnateFantasy },
  { id: 'riveted-metal',  label: 'Riveted',      fn: frameRivetedMetal  },
  { id: 'gem-border',     label: 'Gems',         fn: frameGemBorder     },
];
