// procicon.js — Procedural Character Sigils
// ════════════════════════════════════════════════════════════════
// Generates a unique, deterministic SVG "sigil" for any character
// based on their name + source. Same inputs always produce the same
// icon — no storage needed, computed at render time.
//
// This exists so the app never depends on third-party character art:
// every entry has a visually distinct, on-brand placeholder by default.
// Images (when attached) are a strictly optional, user-warrantied layer
// on top of this — see the image-rights-checkbox system in gacha.js.
//
// Shared verbatim between the full (Flask) and public (static) builds.
// ════════════════════════════════════════════════════════════════

// ── Deterministic string hash (xmur3) → 32-bit seed ──────────────
function _sigilHash(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function() {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

// ── Seeded PRNG (mulberry32) fed by the hash above ────────────────
function _seededRng(seed) {
  return function() {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function _rngFor(name, source) {
  const seedFn = _sigilHash((name || '') + '::' + (source || ''));
  return _seededRng(seedFn());
}

// ── Pattern variants — each returns inner SVG markup for a 100×100 viewBox ──
// All patterns are centered on (50,50) and stay within a r=38 circle
// so they read cleanly at small (40px) and large (160px) sizes alike.

function _patternTriangleCluster(rng, stroke) {
  const count = 3 + Math.floor(rng() * 3); // 3-5
  const baseR = 14 + rng() * 6;
  let out = '';
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + rng() * 0.4;
    const r = baseR + rng() * 10;
    const size = 6 + rng() * 7;
    const cx = 50 + Math.cos(angle) * r;
    const cy = 50 + Math.sin(angle) * r;
    const rot = rng() * 360;
    out += `<polygon points="${cx},${cy-size} ${cx+size*0.87},${cy+size*0.5} ${cx-size*0.87},${cy+size*0.5}"
      transform="rotate(${rot.toFixed(1)} ${cx.toFixed(1)} ${cy.toFixed(1)})"
      fill="none" stroke="${stroke}" stroke-width="1.3" opacity="${(0.55+rng()*0.35).toFixed(2)}"/>`;
  }
  return out;
}

function _patternHexLattice(rng, stroke) {
  const rings = 1 + Math.floor(rng() * 2); // 1-2
  let out = '';
  for (let ring = 0; ring <= rings; ring++) {
    const r = 8 + ring * 11;
    const sides = 6;
    const rot = rng() * 60;
    let pts = '';
    for (let s = 0; s < sides; s++) {
      const a = (s / sides) * Math.PI * 2 + (rot * Math.PI / 180);
      pts += `${(50 + Math.cos(a) * r).toFixed(1)},${(50 + Math.sin(a) * r).toFixed(1)} `;
    }
    out += `<polygon points="${pts.trim()}" fill="none" stroke="${stroke}" stroke-width="1.1" opacity="${(0.65 - ring*0.15).toFixed(2)}"/>`;
  }
  return out;
}

function _patternRadialSpokes(rng, stroke) {
  const count = 5 + Math.floor(rng() * 4); // 5-8
  const innerR = 9 + rng() * 4;
  const outerR = 26 + rng() * 8;
  let out = '';
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + rng() * 0.2;
    const x1 = 50 + Math.cos(a) * innerR, y1 = 50 + Math.sin(a) * innerR;
    const x2 = 50 + Math.cos(a) * outerR, y2 = 50 + Math.sin(a) * outerR;
    out += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"
      stroke="${stroke}" stroke-width="1.2" opacity="${(0.5+rng()*0.4).toFixed(2)}"/>`;
    if (rng() > 0.5) {
      out += `<circle cx="${x2.toFixed(1)}" cy="${y2.toFixed(1)}" r="${(1.3+rng()*1.4).toFixed(1)}"
        fill="${stroke}" opacity="${(0.5+rng()*0.3).toFixed(2)}"/>`;
    }
  }
  return out;
}

function _patternDiamondGrid(rng, stroke) {
  const count = 4 + Math.floor(rng() * 3); // 4-6
  let out = '';
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + rng() * 0.3;
    const r = 13 + rng() * 14;
    const w = 5 + rng() * 5, h = 8 + rng() * 7;
    const cx = 50 + Math.cos(angle) * r, cy = 50 + Math.sin(angle) * r;
    const rot = (angle * 180 / Math.PI) + 90;
    out += `<polygon points="${cx},${cy-h} ${cx+w},${cy} ${cx},${cy+h} ${cx-w},${cy}"
      transform="rotate(${rot.toFixed(1)} ${cx.toFixed(1)} ${cy.toFixed(1)})"
      fill="none" stroke="${stroke}" stroke-width="1.1" opacity="${(0.55+rng()*0.35).toFixed(2)}"/>`;
  }
  return out;
}

function _patternConcentricArcs(rng, stroke) {
  const count = 2 + Math.floor(rng() * 3); // 2-4
  let out = '';
  for (let i = 0; i < count; i++) {
    const r = 10 + i * 8 + rng() * 3;
    const start = rng() * 360;
    const sweep = 80 + rng() * 160;
    const x1 = 50 + Math.cos(start * Math.PI/180) * r;
    const y1 = 50 + Math.sin(start * Math.PI/180) * r;
    const end = start + sweep;
    const x2 = 50 + Math.cos(end * Math.PI/180) * r;
    const y2 = 50 + Math.sin(end * Math.PI/180) * r;
    const largeArc = sweep > 180 ? 1 : 0;
    out += `<path d="M ${x1.toFixed(1)} ${y1.toFixed(1)} A ${r.toFixed(1)} ${r.toFixed(1)} 0 ${largeArc} 1 ${x2.toFixed(1)} ${y2.toFixed(1)}"
      fill="none" stroke="${stroke}" stroke-width="1.2" opacity="${(0.5+rng()*0.4).toFixed(2)}"/>`;
  }
  return out;
}

const _PATTERN_FNS = [
  _patternTriangleCluster,
  _patternHexLattice,
  _patternRadialSpokes,
  _patternDiamondGrid,
  _patternConcentricArcs,
];

// ── Outer ring variants ───────────────────────────────────────────
function _outerRing(rng, stroke, variant) {
  const r = 37;
  if (variant === 0) {
    return `<circle cx="50" cy="50" r="${r}" fill="none" stroke="${stroke}" stroke-width="1.4" opacity="0.85"/>`;
  }
  if (variant === 1) {
    const sides = 5 + Math.floor(rng() * 3); // pentagon-heptagon
    const rot = rng() * 360;
    let pts = '';
    for (let s = 0; s < sides; s++) {
      const a = (s / sides) * Math.PI * 2 + (rot * Math.PI / 180);
      pts += `${(50 + Math.cos(a) * r).toFixed(1)},${(50 + Math.sin(a) * r).toFixed(1)} `;
    }
    return `<polygon points="${pts.trim()}" fill="none" stroke="${stroke}" stroke-width="1.4" opacity="0.85"/>`;
  }
  // Double ring with tick marks
  let ticks = '';
  const tickCount = 16;
  for (let i = 0; i < tickCount; i++) {
    const a = (i / tickCount) * Math.PI * 2;
    const x1 = 50 + Math.cos(a) * (r - 2), y1 = 50 + Math.sin(a) * (r - 2);
    const x2 = 50 + Math.cos(a) * (r + 2), y2 = 50 + Math.sin(a) * (r + 2);
    ticks += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${stroke}" stroke-width="1" opacity="0.5"/>`;
  }
  return `<circle cx="50" cy="50" r="${r}" fill="none" stroke="${stroke}" stroke-width="1.4" opacity="0.85"/>${ticks}`;
}

// ── Public API ─────────────────────────────────────────────────────
// Returns raw inline SVG markup (no wrapping <svg> tag attributes set —
// caller embeds via an <svg> element with viewBox="0 0 100 100").
function generateSigilSVG(name, source, tierColor) {
  const rng = _rngFor(name, source);
  const patternFn = _PATTERN_FNS[Math.floor(rng() * _PATTERN_FNS.length)];
  const ringVariant = Math.floor(rng() * 3);
  const stroke = tierColor === 'rainbow' ? '#fff' : (tierColor || '#E0B65C');

  const ring = _outerRing(rng, stroke, ringVariant);
  const inner = patternFn(rng, stroke);
  // Small center mark — consistent anchor point across all sigils
  const centerR = 1.6 + rng() * 1.2;
  const center = `<circle cx="50" cy="50" r="${centerR.toFixed(1)}" fill="${stroke}" opacity="0.9"/>`;

  return `${ring}${inner}${center}`;
}

// Returns a full <svg> element string, ready to drop into innerHTML.
// `extraClass` lets callers hook CSS animations (e.g. slow rotation) if desired.
function sigilHtml(name, source, tierColor, extraClass) {
  const inner = generateSigilSVG(name, source, tierColor);
  const cls = extraClass ? ` ${extraClass}` : '';
  return `<svg class="char-sigil${cls}" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${inner}</svg>`;
}
