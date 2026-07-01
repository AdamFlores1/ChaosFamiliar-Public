// gacha.js — PUBLIC version. Gameplay, rendering, writing tools.
// No admin, no add, no suggest. Talks to data.js.

let activeTagFilters = [];

// ── XSS-safe HTML escape ────────────────────────────────────────
// All user-supplied strings go through this before innerHTML injection.
function esc(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

let historyFilter = "all"; // "all" | "6star" | "dupes"

// ── Summoning circle asset config ──────────────────────────────
// Four CC0 circle SVGs, tinted via CSS filter per pull tier.
// Tier → which circle SVG to show (all white, tinted by JS)
const CIRCLE_ASSETS = {
  1: { svg: 'circle6', tint: 'hue-rotate(180deg) saturate(0.4) brightness(0.7)' },
  2: { svg: 'circle7', tint: 'hue-rotate(100deg) saturate(1.2) brightness(0.9)' },
  3: { svg: 'circle5', tint: 'hue-rotate(195deg) saturate(1.5) brightness(1.0)' },
  4: { svg: 'circle4', tint: 'hue-rotate(270deg) saturate(1.8) brightness(1.1)' },
  5: { svg: 'circle7', tint: 'hue-rotate(35deg) saturate(2.0) brightness(1.2)'  },
  6: { svg: 'circle4', tint: 'none'  }, // rainbow via CSS animation instead
};

// VFX sprite frames — 5 sets of 5 frames each (folders 1-5)
const VFX_SETS = [
  ['Cosmic_01','Cosmic_02','Cosmic_03','Cosmic_04','Cosmic_05'],
  ['Cosmic_06','Cosmic_07','Cosmic_08','Cosmic_09','Cosmic_10'],
  ['Cosmic_11','Cosmic_12','Cosmic_13','Cosmic_14','Cosmic_15'],
  ['Cosmic_16','Cosmic_17','Cosmic_18','Cosmic_19','Cosmic_20'],
  ['Cosmic_21','Cosmic_22','Cosmic_23','Cosmic_24','Cosmic_25'],
];

// Map tier → which VFX set (0-indexed)
const TIER_VFX = { 1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 4 };

window.addEventListener('DOMContentLoaded', async () => {
  buildCosmicBackground();
  buildSummonCircleAsset();
  showLoadingOverlay();
  await initData();
  hideLoadingOverlay();
  updateStats();
  renderHistory();
  buildTagFilterUI();
  renderPowerBondsBar();
  buildAboutTables();
  buildSpaceDecoration();
  buildInspirationRow();
});

// ─── Asset-based Summoning Circle ──────────────────────────────
// Replaces the inline SVG with a real CC0 SVG image, tinted per tier
function buildSummonCircleAsset() {
  const wrap = document.getElementById('summon-circle-wrap');
  if (!wrap) return;

  // Build layered structure:
  // Layer 1: base circle SVG (always circle6, dimmed, slow-rotating)
  // Layer 2: reactive circle SVG (switches on pull, tinted, faster)
  // Layer 3: VFX sprites (animated on pull)
  wrap.innerHTML = `
    <div class="sc-layer sc-base" id="sc-base">
      <img src="img/circles/circle6.svg" class="sc-img sc-img-base" id="sc-img-base" />
    </div>
    <div class="sc-layer sc-reactive" id="sc-reactive">
      <img src="img/circles/circle5.svg" class="sc-img sc-img-reactive" id="sc-img-reactive" />
    </div>
    <div class="sc-layer sc-vfx" id="sc-vfx-layer" style="display:none">
      <img src="" class="sc-vfx-frame" id="sc-vfx-frame" />
    </div>
    <div class="sc-center-rune" id="sc-center-rune">⟡</div>
  `;
}

// ─── Reactive Circle + VFX on Pull ─────────────────────────────
function triggerSummonCircleGlow(results) {
  const wrap = document.getElementById('summon-circle-wrap');
  if (!wrap || !results.length) return;

  const realResults = results.filter(r => !r.__isChaosTicket);
  if (!realResults.length) { triggerVFX(6); triggerAmbientCircleSync('#fff', true); return; }
  const highestTier = Math.max(...realResults.map(r => r.tier || 1));
  const cfg = CIRCLE_ASSETS[highestTier] || CIRCLE_ASSETS[1];
  const r = RARITIES[highestTier] || RARITIES[1];

  // Swap reactive circle image
  const reactImg = document.getElementById('sc-img-reactive');
  if (reactImg) {
    reactImg.src = `img/circles/${cfg.svg}.svg`;
    if (highestTier === 6) {
      reactImg.style.filter = '';
      reactImg.classList.add('sc-rainbow');
    } else {
      reactImg.style.filter = cfg.tint;
      reactImg.classList.remove('sc-rainbow');
    }
  }

  // Glow on wrap
  wrap.classList.remove('sc-pulse', 'sc-tier-6');
  void wrap.offsetWidth;
  wrap.classList.add('sc-pulse');
  if (highestTier === 6) wrap.classList.add('sc-tier-6');

  const glowColor = r.color === 'rainbow' ? '#fff' : r.color;
  wrap.style.setProperty('--sc-glow-color', glowColor);

  // Trigger VFX sprite animation
  triggerVFX(highestTier);

  // Sync-glow all ambient circles in the pull colour
  triggerAmbientCircleSync(glowColor, highestTier === 6);

  setTimeout(() => {
    wrap.classList.remove('sc-pulse', 'sc-tier-6');
    if (reactImg) reactImg.classList.remove('sc-rainbow');
  }, 2400);
}

// ── Sync ambient circle burst ───────────────────────────────────
// Briefly overrides the idle acGlowPulse with a bright flash in the
// same colour as the main circle, then releases back to idle.
function triggerAmbientCircleSync(color, isRainbow) {
  const imgs = document.querySelectorAll('.bg-ambient-circle-img');
  imgs.forEach(img => {
    img.classList.remove('ac-surge', 'ac-surge-rainbow');
    img.style.setProperty('--ac-surge-color', isRainbow ? '#fff' : color);
    void img.offsetWidth; // reflow to restart animation
    img.classList.add(isRainbow ? 'ac-surge-rainbow' : 'ac-surge');
    setTimeout(() => {
      img.classList.remove('ac-surge', 'ac-surge-rainbow');
      img.style.removeProperty('--ac-surge-color');
    }, 2500);
  });
}

function triggerVFX(tier) {
  const layer = document.getElementById('sc-vfx-layer');
  const frame = document.getElementById('sc-vfx-frame');
  if (!layer || !frame) return;

  const setIdx = TIER_VFX[tier] || 0;
  const frames = VFX_SETS[setIdx];

  // Higher tiers: play the sequence twice for a more dramatic effect
  const plays = tier >= 5 ? 2 : 1;
  // Frame speed: slower for higher tiers so each frame is more visible
  const frameMs = tier >= 4 ? 130 : 100;

  let i = 0;
  let playCount = 0;

  layer.style.display = 'block';
  layer.style.opacity = '1';
  layer.style.transition = '';

  const interval = setInterval(() => {
    frame.src = `img/vfx/${frames[i]}.png`;
    i++;
    if (i >= frames.length) {
      playCount++;
      if (playCount < plays) {
        i = 0; // loop
      } else {
        clearInterval(interval);
        layer.style.transition = 'opacity 0.5s ease';
        layer.style.opacity = '0';
        setTimeout(() => {
          layer.style.display = 'none';
          layer.style.transition = '';
        }, 500);
      }
    }
  }, frameMs);
}

function buildCosmicBackground() {
  const container = document.getElementById('cosmic-bg');
  if (!container) return;

  // ── Nebula tile body bg handled via CSS ──
  // (applied as body::before in stylesheet)

  // ── NASA nebula corner / margin decorations ──
  const staticDecos = [
    // Helix "Eye" nebula — top-right corner glow
    { src: 'img/deco_helix.png',
      style: 'position:absolute;top:-40px;right:-60px;width:380px;opacity:.13;mix-blend-mode:screen;pointer-events:none;border-radius:50%;' },
    // Carina sky strip — bottom atmospheric band
    { src: 'img/deco_carina_sky.png',
      style: 'position:absolute;bottom:0;left:50%;transform:translateX(-50%);width:1200px;max-width:100%;opacity:.11;mix-blend-mode:screen;pointer-events:none;' },
    // Carina column — left margin accent
    { src: 'img/deco_carina_col.png',
      style: 'position:absolute;top:30%;left:-30px;width:150px;opacity:.10;mix-blend-mode:screen;pointer-events:none;' },
    // Pillars of Creation column — right margin accent
    { src: 'img/deco_pillars_col.png',
      style: 'position:absolute;top:20%;right:-25px;width:150px;opacity:.11;mix-blend-mode:screen;pointer-events:none;' },
    // Pillars footer strip
    { src: 'img/deco_pillars_footer.png',
      style: 'position:absolute;bottom:80px;left:50%;transform:translateX(-50%);width:1200px;max-width:100%;opacity:.09;mix-blend-mode:screen;pointer-events:none;' },
  ];
  staticDecos.forEach(d => {
    const img = document.createElement('img');
    img.src = d.src; img.style.cssText = d.style; img.draggable = false;
    container.appendChild(img);
  });

  // ── Soft colour blobs ──
  const galaxies = [
    { top: '5%',  left: '70%', size: '420px', color: 'rgba(212,86,201,0.10)' },
    { top: '65%', left: '5%',  size: '380px', color: 'rgba(155,111,224,0.09)' },
    { top: '40%', left: '85%', size: '300px', color: 'rgba(232,192,84,0.06)'  },
  ];
  galaxies.forEach(g => {
    const el = document.createElement('div');
    el.className = 'bg-galaxy';
    el.style.cssText = `top:${g.top};left:${g.left};width:${g.size};height:${g.size};background:radial-gradient(circle,${g.color},transparent 70%);`;
    container.appendChild(el);
  });

  // ── Ambient floating summoning circles (real SVGs + new arcane01) ──
  const ambientCircles = [
    { svg: 'circle7',  top: '6%',  left: '74%', size: '200px', dur: 68,  glowColor: '#9B6FE0', pulseDur: '5s'  },
    { svg: 'circle5',  top: '64%', left: '80%', size: '145px', dur: 52,  glowColor: '#3DA9F5', pulseDur: '7s'  },
    { svg: 'circle4',  top: '72%', left: '4%',  size: '170px', dur: 80,  glowColor: '#D456C9', pulseDur: '6s'  },
    { svg: 'circle6',  top: '30%', left: '-3%', size: '120px', dur: 110, glowColor: '#E8C054', pulseDur: '9s'  },
    // Arcane Contraption — different geometry, placed mid-right
    { svg: 'arcane01', top: '44%', left: '88%', size: '130px', dur: 140, glowColor: '#9B6FE0', pulseDur: '11s', dir: 'reverse' },
  ];
  ambientCircles.forEach((c, idx) => {
    const wrap = document.createElement('div');
    wrap.className = 'bg-ambient-circle-real';
    wrap.dataset.acIdx = idx;
    wrap.style.cssText = `top:${c.top};left:${c.left};width:${c.size};height:${c.size};--ac-glow:${c.glowColor};--ac-rotate-dur:${c.dur}s;--ac-pulse-dur:${c.pulseDur};animation-delay:${idx*-1.5}s;`;
    const img = document.createElement('img');
    img.src = `img/circles/${c.svg}.svg`;
    img.className = 'bg-ambient-circle-img';
    img.dataset.acIdx = idx;
    img.draggable = false;
    if (c.dir === 'reverse') img.style.animationDirection = 'reverse';
    wrap.appendChild(img);
    container.appendChild(wrap);
  });

  // ── Drifting star particles ──
  for (let i = 0; i < 55; i++) {
    const star = document.createElement('div');
    star.className = 'star-particle';
    const size = (Math.random()*2.2+0.4).toFixed(1);
    const left = (Math.random()*100).toFixed(1);
    const dur  = (Math.random()*28+18).toFixed(1);
    const delay = (Math.random()*-50).toFixed(1);
    const driftX = (Math.random()*70-35).toFixed(0);
    const opacity = (Math.random()*0.55+0.2).toFixed(2);
    star.style.cssText = `width:${size}px;height:${size}px;left:${left}%;top:100%;animation-duration:${dur}s;animation-delay:${delay}s;--drift-x:${driftX}px;--star-opacity:${opacity};`;
    container.appendChild(star);
  }

  // ── Background rune glyphs ──
  // ── Background rune glyphs ──
  const runeSymbols = ['⟡', '✦', '⟡'];
  const runePositions = [
    { top: '8%',  left: '-4%',  size: '9rem',  duration: 90  },
    { top: '55%', left: '92%',  size: '11rem', duration: 130 },
    { top: '85%', left: '8%',   size: '7rem',  duration: 75  },
  ];
  runePositions.forEach((pos, i) => {
    const rune = document.createElement('div');
    rune.className = 'bg-rune';
    rune.textContent = runeSymbols[i % runeSymbols.length];
    rune.style.cssText = `top:${pos.top}; left:${pos.left}; --rune-size:${pos.size}; animation-duration:${pos.duration}s;`;
    container.appendChild(rune);
  });
}

function showLoadingOverlay() {
  const overlay = document.createElement('div');
  overlay.id = 'boot-loading-overlay';
  overlay.className = 'boot-loading-overlay';
  overlay.innerHTML = `<div class="boot-loading-rune">⟡</div><div class="boot-loading-text">Summoning the multiverse...</div>`;
  document.body.appendChild(overlay);
}

function hideLoadingOverlay() {
  const overlay = document.getElementById('boot-loading-overlay');
  if (overlay) {
    overlay.classList.add('fade-out');
    setTimeout(() => overlay.remove(), 350);
  }
}

// ─── Gender Filter ───────────────────────────────────────────
function setGender(g) {
  STATE.gender = g;
  ['both', 'female', 'male'].forEach(id =>
    document.getElementById('f-' + id).classList.toggle('active', id === g)
  );
  updateStats();
  saveState();
}

// ─── Weighted Roll ───────────────────────────────────────────
function weightedRoll(pool) {
  const pity = STATE.pity;

  // Chaos Ticket: ~2% base chance (2.5% at low pity), independent of pity, never guaranteed
  const ticketChance = pity < 20 ? 2.5 : CHAOS_TICKET_WEIGHT;
  if (Math.random() * 100 < ticketChance) {
    return { __isChaosTicket: true };
  }

  const w = {};
  for (const [k, v] of Object.entries(RARITIES)) w[k] = v.weight;
  if (pity >= 75) w[6] += (pity - 74) * 3;
  if (pity >= PITY_MAX) { for (const k in w) w[k] = 0; w[6] = 1; }
  const total = Object.values(w).reduce((a, b) => a + b, 0);
  let rand = Math.random() * total;
  let tier = 1;
  for (const [k, wv] of Object.entries(w)) { rand -= wv; if (rand <= 0) { tier = parseInt(k); break; } }
  const tierPool = pool.filter(c => c.tier === tier);
  const draw = tierPool.length > 0 ? tierPool : pool;
  return draw[Math.floor(Math.random() * draw.length)];
}

function doPull(n) {
  const pool = getFilteredPool({ tags: activeTagFilters });
  if (!pool.length) { showNotif('No characters in pool for this filter!'); return; }

  // Pity-safety warning: hard pity at 90 needs a 6★ in the pool
  if (STATE.pity + n >= PITY_MAX && !pool.some(c => c.tier === 6)) {
    showNotif('⚠ Pity guarantee active but no 6★ in pool — add one first!', 4000);
    return;
  }

  const results = [];       // normal character pulls only
  let ticketsWon = 0;       // tickets pulled this batch

  for (let i = 0; i < n; i++) {
    STATE.pity++; STATE.totalPulls++;
    const char = weightedRoll(pool);
    if (char) {
      if (char.__isChaosTicket) {
        // Ticket: undo pity/pull counters, track separately, never enter history
        STATE.pity = Math.max(0, STATE.pity - 1);
        STATE.totalPulls = Math.max(0, STATE.totalPulls - 1);
        addChaosTicket();
        ticketsWon++;
      } else {
        const lower = char.name.toLowerCase();
        const alreadyOwned = STATE.history.some(h => h.name.toLowerCase() === lower);
        let newMod = getMod(char.name);
        if (alreadyOwned) newMod = incrementMod(char.name);
        results.push({ ...char, ts: Date.now(), isDupe: alreadyOwned, modAtPull: newMod });
        if (char.tier === 6) STATE.pity = 0;
      }
    }
  }

  // Only push real character pulls into history
  if (results.length) {
    STATE.history = [...results, ...STATE.history].slice(0, 400);
  }
  saveState();

  // Show character cards (if any real pulls happened)
  if (results.length) {
    renderCards(results);
  } else {
    document.getElementById('cards-grid').innerHTML = '';
  }

  // Show ticket notification after a short delay (after card animations start)
  if (ticketsWon > 0) {
    const delay = results.length ? 600 : 200;
    setTimeout(() => showTicketWonOverlay(ticketsWon), delay);
  }

  renderHistory();
  updateStats();
  renderPowerBondsBar();
  if (results.length) {
    triggerSummonCircleGlow(results);
    triggerBgSurge(Math.max(...results.map(r => r.tier || 1)));
  } else if (ticketsWon > 0) {
    // Pure ticket pull — still do a rainbow glow
    triggerSummonCircleGlow([{ tier: 6 }]);
    triggerBgSurge(6);
  }
}

// ── Dynamic background surge ────────────────────────────────────
function triggerBgSurge(tier) {
  const body = document.body;
  body.classList.remove('bg-surge-4','bg-surge-5','bg-surge-6');
  if (tier < 4) return;
  void body.offsetWidth;
  body.classList.add('bg-surge-' + tier);
  setTimeout(() => body.classList.remove('bg-surge-4','bg-surge-5','bg-surge-6'), 2600);
}

// ─── Portrait Block ─────────────────────────────────────────────
function portraitBlock(c, sizeClass) {
  const r = RARITIES[c.tier] || RARITIES[1];
  const ringColor = r.color === 'rainbow' ? '#fff' : r.color;
  const sigil = sigilHtml(c.name, c.source, ringColor, 'portrait-sigil-fallback');
  if (c.image) {
    return `<div class="portrait ${sizeClass} t${c.tier}-portrait-ring" style="border-color:${ringColor}">
      <img src="${c.image}" alt="${c.name}" class="portrait-img" onerror="this.parentElement.classList.add('img-fallback')" />
      <div class="portrait-fallback-icon">${sigil}</div>
    </div>`;
  }
  return `<div class="portrait ${sizeClass} t${c.tier}-portrait t${c.tier}-portrait-ring" style="border-color:${ringColor}">
    ${sigil}
  </div>`;
}

let tagPillUid = 0;
function renderTagPills(tags) {
  if (!tags || !tags.length) return '';
  const id = 'tp' + (tagPillUid++);
  const visible = tags.slice(0, 2);
  const rest = tags.slice(2);
  const visibleHtml = visible.map(t => `<span class="tag-pill">${esc(t)}</span>`).join('');
  if (!rest.length) return `<div class="tag-pills">${visibleHtml}</div>`;
  const restHtml = rest.map(t => `<span class="tag-pill">${esc(t)}</span>`).join('');
  return `<div class="tag-pills" id="${id}">
    ${visibleHtml}
    <span class="tag-pill-rest" style="display:none">${restHtml}</span>
    <button class="tag-pill-more" onclick="expandTagPills('${id}', this)">+${rest.length} more</button>
  </div>`;
}
function expandTagPills(id, btn) {
  const wrap = document.getElementById(id);
  wrap.querySelector('.tag-pill-rest').style.display = 'inline';
  btn.style.display = 'none';
}

function starHtml(tier) {
  const t = RARITIES[tier] || RARITIES[1];
  return `<span class="${t.cls}">${'★'.repeat(Math.min(tier, 6))}</span>`;
}
function tierEffectClass(tier) {
  return { 1:'fx-t1',2:'fx-t2',3:'fx-t3',4:'fx-t4',5:'fx-t5',6:'fx-t6' }[tier] || 'fx-t1';
}

function buildCardHTML(char, i) {
  // Special rendering for Chaos Ticket
  if (char.__isChaosTicket) {
    const wrap = document.createElement('div');
    wrap.className = 'card-wrap fx-t6 chaos-ticket-card';
    wrap.innerHTML = `
      <div class="card-inner" id="ci-${i}">
        <div class="card-face card-back">
          <div class="card-rune">⟡</div>
          <div style="font-family:'Cinzel',serif;font-size:.5rem;letter-spacing:.18em;color:var(--gold-dim);text-transform:uppercase">Unknown</div>
        </div>
        <div class="card-face card-front t6-border" style="border-color:#fff;overflow:hidden">
          <div class="card-bg t6-bg"></div>
          <div class="card-shine t6-shine"></div>
          <div class="chaos-ticket-shimmer"></div>
          <div class="card-overlay"></div>
          <div class="card-content">
            <div class="card-stars t6">★★★★★★</div>
            <div class="card-name" style="font-size:.62rem;line-height:1.3">Chaos<br>Ticket</div>
            <div class="card-source" style="color:rgba(255,255,255,.55)">Rare Item</div>
            <div class="card-rarity-badge t6-badge">Singularity</div>
          </div>
        </div>
      </div>`;
    return wrap;
  }
  const r = RARITIES[char.tier] || RARITIES[1];
  const dupeNote = char.isDupe
    ? `<div class="card-dupe" title="${modLabel(char.modAtPull)}">Mod +${char.modAtPull}</div>` : '';
  const borderColor = r.color === 'rainbow' ? '#fff' : r.color;
  const imgHtml = char.image
    ? `<img src="${char.image}" class="card-img-bg" onerror="this.style.display='none';this.nextElementSibling.style.display='block'" />
       <div class="card-sigil-wrap" style="display:none">${sigilHtml(char.name, char.source, borderColor, 'card-sigil')}</div>`
    : `<div class="card-sigil-wrap">${sigilHtml(char.name, char.source, borderColor, 'card-sigil')}</div>`;
  const wrap = document.createElement('div');
  wrap.className = 'card-wrap ' + tierEffectClass(char.tier);
  wrap.innerHTML = `
    <div class="card-inner" id="ci-${i}">
      <div class="card-face card-back">
        <div class="card-rune">⟡</div>
        <div style="font-family:'Cinzel',serif;font-size:.5rem;letter-spacing:.18em;color:var(--gold-dim);text-transform:uppercase">Unknown</div>
      </div>
      <div class="card-face card-front t${char.tier}-border" style="border-color:${borderColor}">
        ${imgHtml}
        <div class="card-bg t${char.tier}-bg"></div>
        <div class="card-shine t${char.tier}-shine"></div>
        <div class="card-overlay"></div>
        <div class="card-gender" style="color:${borderColor}">${G_ICON[char.gender] || '⚧'}</div>
        ${dupeNote}
        <div class="card-content">
          <div class="card-stars">${starHtml(char.tier || 1)}</div>
          <div class="card-name">${esc(char.name)}</div>
          <div class="card-source">${esc(char.source)}</div>
          <div class="card-rarity-badge t${char.tier}-badge">${r.label}</div>
        </div>
      </div>
    </div>`;
  return wrap;
}

function renderCards(results) {
  // Defensive: filter out any ticket entries that slipped through
  results = results.filter(r => !r.__isChaosTicket);
  if (!results.length) return;

  const grid = document.getElementById('cards-grid');
  grid.innerHTML = '';
  const maxTier = Math.max(...results.map(r => r.tier || 1));

  // For x1 pulls: instant (no stagger needed)
  if (results.length === 1) {
    const wrap = buildCardHTML(results[0], 0);
    grid.appendChild(wrap);
    setTimeout(() => {
      const ci = document.getElementById('ci-0');
      if (ci) ci.classList.add('flipped');
      if (results[0].tier >= 4) setTimeout(() => triggerBurst(wrap, results[0].tier), 350);
    }, 100);
    if (maxTier >= 6) setTimeout(() => triggerScreenFlash(), 500);
    return;
  }

  // For x10: staggered reveal with anticipation pause before high-rarity cards
  // Sort so lower tiers flip early, highest-tier card flips last
  const indexed = results.map((c, i) => ({ char: c, origIdx: i }));
  // Build all cards in original order first
  indexed.forEach(({ char, origIdx }) => {
    grid.appendChild(buildCardHTML(char, origIdx));
  });

  // Find the highest-tier card index for the dramatic pause
  const highestIdx = results.reduce((best, c, i) => c.tier > results[best].tier ? i : best, 0);
  const isHighTierLast = maxTier >= 4;

  let cumulativeDelay = 80;
  indexed.forEach(({ char, origIdx }, flipOrder) => {
    // If this is the highest-tier card AND tier≥4: add an anticipation pause
    const isSpecial = isHighTierLast && origIdx === highestIdx && maxTier >= 4;
    const flipDelay = isSpecial
      ? cumulativeDelay + 420   // extra pause before the big reveal
      : cumulativeDelay;
    cumulativeDelay += isSpecial ? 700 : 130;

    setTimeout(() => {
      const ci = document.getElementById('ci-' + origIdx);
      if (ci) {
        if (isSpecial && maxTier >= 5) ci.classList.add('pre-flip-glow');
        ci.classList.add('flipped');
        if (char.tier >= 4) setTimeout(() => triggerBurst(ci.closest('.card-wrap'), char.tier), 350);
        if (isSpecial && maxTier >= 5) setTimeout(() => ci.classList.remove('pre-flip-glow'), 1000);
      }
    }, flipDelay);
  });

  if (maxTier >= 6) setTimeout(() => triggerScreenFlash(), cumulativeDelay + 300);
}

function triggerBurst(wrapEl, tier) {
  const burst = document.createElement('div');
  burst.className = 'burst-fx t' + tier + '-burst';
  wrapEl.appendChild(burst);
  setTimeout(() => burst.remove(), 900);
}
function triggerScreenFlash() {
  const flash = document.createElement('div');
  flash.className = 'screen-flash';
  document.body.appendChild(flash);
  setTimeout(() => flash.remove(), 1100);
}

function setHistoryFilter(f) {
  historyFilter = f;
  document.querySelectorAll('.hist-filter-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.f === f));
  renderHistory();
}

function renderHistory() {
  const list = document.getElementById('history-list');
  if (!STATE.history.length) {
    list.innerHTML = '<div class="empty-state">No summons yet — call forth your first familiar</div>';
    return;
  }
  let entries = STATE.history;
  if (historyFilter === '6star') entries = entries.filter(c => c.tier === 6);
  else if (historyFilter === 'dupes') entries = entries.filter(c => c.name && c.isDupe);
  if (!entries.length) {
    list.innerHTML = '<div class="empty-state">No entries match this filter</div>';
    return;
  }
  list.innerHTML = entries.slice(0, 150).map(c => {
    if (c.__isChaosTicket) {
      return `<div class="history-item" style="border-left-color:#fff">
        <div>
          <div class="history-name t6">Chaos Ticket</div>
          <div class="history-meta">Rare Item &nbsp;·&nbsp; Singularity</div>
        </div>
        <div class="history-rarity t6">★★★★★★</div>
      </div>`;
    }
    const r = RARITIES[c.tier] || RARITIES[1];
    const mod = getMod(c.name);
    const mc = modColor(mod);
    const modStr = mod > 0
      ? ` &nbsp;·&nbsp; <span style="color:${mc === 'rainbow' ? '#fff' : mc}">Mod +${mod}</span>`
      : '';
    return `<div class="history-item" style="border-left-color:${r.color === 'rainbow' ? '#fff' : r.color}">
      <div>
        <div class="history-name" style="color:${r.color === 'rainbow' ? '#fff' : r.color}">${esc(c.name)}</div>
        <div class="history-meta">${esc(c.source)} &nbsp;·&nbsp; ${G_ICON[c.gender] || '⚧'} &nbsp;·&nbsp; <span class="t${c.tier}">${'★'.repeat(c.tier)}</span>${modStr}</div>
      </div>
      <div class="history-rarity t${c.tier}">${esc(r.label)}</div>
    </div>`;
  }).join('');
}

function confirmClearRecords() {
  if (!STATE.history.length && !STATE.pity && !STATE.totalPulls) {
    showNotif('No records to clear'); return;
  }
  if (!confirm('Clear all pull history, pity, and Mod progress? This cannot be undone.')) return;
  clearRecords();
  if (STATE.chaosTickets.length || STATE.powerBonds.length) {
    if (confirm('Also clear Chaos Tickets and Power Bonds? (Cancel to keep them.)')) {
      STATE.chaosTickets = [];
      STATE.powerBonds = [];
      saveState();
    }
  }
  renderHistory();
  updateStats();
  renderCollection();
  renderPowerBondsBar();
  showNotif('✦ Records cleared');
}

// ─── Pool ────────────────────────────────────────────────────
let _favFilterActive = false;
function toggleFavFilter() {
  _favFilterActive = !_favFilterActive;
  const btn = document.getElementById('fav-filter-btn');
  if (btn) { btn.textContent = _favFilterActive ? '★' : '☆'; btn.classList.toggle('active', _favFilterActive); }
  renderPool();
}
function setPoolSort(val) { STATE.poolSort = val; saveState(); renderPool(); }

function parseSearchQuery(raw) {
  const tokens = raw.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const ops = { tags: [], source: null, tier: null, not: [], plain: [] };
  for (const t of tokens) {
    if (t.startsWith('tag:'))       ops.tags.push(t.slice(4));
    else if (t.startsWith('source:')) ops.source = t.slice(7);
    else if (t.startsWith('tier:'))   ops.tier = t.slice(5);
    else if (t.startsWith('!'))       ops.not.push(t.slice(1));
    else ops.plain.push(t);
  }
  return ops;
}

function matchesSearch(c, ops) {
  const r = RARITIES[c.tier] || RARITIES[1];
  const name   = c.name.toLowerCase();
  const source = (c.source||'').toLowerCase();
  const tags   = (c.tags||[]).map(t => t.toLowerCase());
  const lore   = (c.lore||'').toLowerCase();
  if (ops.source && !source.includes(ops.source)) return false;
  if (ops.tier   && String(c.tier) !== ops.tier)  return false;
  for (const t of ops.tags) { if (!tags.some(ct => ct.includes(t))) return false; }
  for (const n of ops.not)  { if (tags.some(ct => ct.includes(n)) || name.includes(n)) return false; }
  if (ops.plain.length) {
    const combined = name+' '+source+' '+tags.join(' ')+' '+lore+' '+(r.label||'').toLowerCase();
    if (!ops.plain.every(p => combined.includes(p))) return false;
  }
  return true;
}

function sortPool(arr) {
  const sort = STATE.poolSort || 'default';
  const pullCounts = {};
  STATE.history.filter(h=>h.name).forEach(h => pullCounts[h.name.toLowerCase()] = (pullCounts[h.name.toLowerCase()]||0)+1);
  const copy = [...arr];
  switch (sort) {
    case 'alpha':      return copy.sort((a,b) => a.name.localeCompare(b.name));
    case 'alpha_desc': return copy.sort((a,b) => b.name.localeCompare(a.name));
    case 'tier_desc':  return copy.sort((a,b) => b.tier - a.tier || a.name.localeCompare(b.name));
    case 'tier_asc':   return copy.sort((a,b) => a.tier - b.tier || a.name.localeCompare(b.name));
    case 'source':     return copy.sort((a,b) => (a.source||'').localeCompare(b.source||'') || a.name.localeCompare(b.name));
    case 'mod':        return copy.sort((a,b) => (getMod(b.name)||0) - (getMod(a.name)||0) || a.name.localeCompare(b.name));
    case 'pulls':      return copy.sort((a,b) => (pullCounts[b.name.toLowerCase()]||0) - (pullCounts[a.name.toLowerCase()]||0));
    case 'favorites':  return copy.sort((a,b) => {
      const fa = isFavorite(a.name)?1:0, fb = isFavorite(b.name)?1:0;
      return fb - fa || b.tier - a.tier || a.name.localeCompare(b.name);
    });
    default: return copy;
  }
}

function renderPool() {
  const rawQ = (document.getElementById('pool-search').value || '');
  const gf   = document.getElementById('pool-gender-filter').value;
  const rf   = document.getElementById('pool-rarity-filter').value;
  const grid = document.getElementById('pool-grid');
  const ops  = parseSearchQuery(rawQ);
  const sortEl = document.getElementById('pool-sort');
  if (sortEl && sortEl.value !== STATE.poolSort) sortEl.value = STATE.poolSort || 'default';

  let filtered = FULL_POOL.filter(c => {
    if (gf && c.gender !== gf) return false;
    if (rf && String(c.tier) !== rf) return false;
    if (_favFilterActive && !isFavorite(c.name)) return false;
    if (rawQ.trim()) return matchesSearch(c, ops);
    return true;
  });
  filtered = sortPool(filtered);

  document.getElementById('badge-pool').textContent = FULL_POOL.length;
  if (!filtered.length) {
    grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1">No characters found</div>';
    return;
  }
  grid.innerHTML = filtered.map(c => {
    const r = RARITIES[c.tier] || RARITIES[1];
    const mod = getMod(c.name);
    const modStr = mod > 0 ? ` &nbsp;·&nbsp; <span title="${modLabel(mod)}">Mod +${mod}</span>` : '';
    const tierColor = r.color === 'rainbow' ? '#fff' : r.color;
    const fav = isFavorite(c.name);
    return `<div class="pool-card t${c.tier}-card-bg pool-card-clickable" style="border-color:${tierColor}" onclick="openCharDetail('${c.name.replace(/'/g,"\\'")}')">
      <button class="fav-star-btn${fav?' fav-active':''}" onclick="event.stopPropagation();toggleFavorite('${c.name.replace(/'/g,"\\'")}');renderPool();" title="${fav?'Remove favorite':'Add to favorites'}">${fav?'★':'☆'}</button>
      ${portraitBlock(c, 'portrait-pool')}
      <div class="pool-card-body">
        <div class="pool-item-name" style="color:${tierColor}">${esc(c.name)}</div>
        <div class="pool-item-meta">${esc(c.source)} &nbsp;·&nbsp; ${G_ICON[c.gender]||'⚧'} &nbsp;·&nbsp; <span class="t${c.tier}">${'★'.repeat(c.tier)}</span> &nbsp;·&nbsp; ${esc(r.label)}${modStr}</div>
        ${renderTagPills(c.tags)}
        ${c.lore ? `<div class="pool-lore-note" title="${esc(c.lore)}">${esc(c.lore)}</div>` : ''}
      </div>
    </div>`;
  }).join('');
}

// ─── Tag Filter ───────────────────────────────────────────────
function buildTagFilterUI() {
  const container = document.getElementById('tag-filter-bar');
  if (!container) return;
  const tagsWithCounts = getAllTagsWithCounts();
  container.innerHTML = tagsWithCounts.map(([tag, count]) =>
    `<button class="tag-chip${activeTagFilters.includes(tag) ? ' active' : ''}" data-tag="${tag}" onclick="toggleTagFilter('${tag.replace(/'/g,"\\'")}')">${tag} <span class="tag-chip-count">${count}</span></button>`
  ).join('');
}
function toggleTagFilterPanel() {
  const bar = document.getElementById('tag-filter-bar');
  const arrow = document.getElementById('tag-filter-arrow');
  const open = bar.style.display !== 'none';
  bar.style.display = open ? 'none' : 'flex';
  arrow.textContent = open ? '▾' : '▴';
}
function updateTagFilterLabel() {
  const label = document.getElementById('tag-filter-toggle-label');
  if (!label) return;
  label.textContent = activeTagFilters.length ? `Filter by Tag (${activeTagFilters.length} active)` : 'Filter by Tag';
}
function toggleTagFilter(tag) {
  const idx = activeTagFilters.indexOf(tag);
  if (idx >= 0) activeTagFilters.splice(idx, 1); else activeTagFilters.push(tag);
  document.querySelectorAll('.tag-chip').forEach(el => el.classList.toggle('active', activeTagFilters.includes(el.dataset.tag)));
  updateTagFilterLabel();
  updateStats();
}

// ─── Stats ───────────────────────────────────────────────────
function updateStats() {
  document.getElementById('stat-total').textContent = STATE.totalPulls;
  document.getElementById('stat-pool').textContent  = getFilteredPool({ tags: activeTagFilters }).length;
  document.getElementById('stat-pity').textContent  = STATE.pity + '/' + PITY_MAX;
  document.getElementById('pity-text').textContent  = STATE.pity + ' / ' + PITY_MAX;
  const pityPct = Math.min(100, (STATE.pity / PITY_MAX) * 100);
  document.getElementById('pity-fill').style.width = pityPct + '%';
  document.getElementById('badge-pool').textContent = FULL_POOL.length;
  const ticketEl = document.getElementById('stat-tickets');
  if (ticketEl) ticketEl.textContent = STATE.chaosTickets.length;
  const pityWrap = document.getElementById('pity-wrap-el');
  const scWrap   = document.getElementById('summon-circle-wrap');
  if (pityWrap) pityWrap.classList.toggle('pity-near', STATE.pity >= 75);
  if (scWrap)   scWrap.classList.toggle('pity-tension', STATE.pity >= 75);
  renderCollectionBar();
}
function renderCollectionBar() {
  const el = document.getElementById('collection-mini');
  if (!el) return;
  const s = getCollectionStats();
  el.textContent = `Collection: ${s.owned} / ${s.total} (${s.pct}%)`;
}

// ─── Tabs ────────────────────────────────────────────────────
function switchTab(tab) {
  const tabs = ['history', 'pool', 'collection', 'team', 'universe', 'about'];
  document.querySelectorAll('.tab').forEach((t, i) => t.classList.toggle('active', tabs[i] === tab));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  const panel = document.getElementById('tab-' + tab);
  if (panel) panel.classList.add('active');
  if (tab === 'pool') renderPool();
  if (tab === 'collection') { renderCollection(); renderPowerBondsBar(); restoreUniverseCollapseState(); }
  if (tab === 'universe')   renderUniverseBrowser();
  if (tab === 'team') renderTeamBuilder();
}

function showNotif(msg, dur = 2800) {
  const n = document.getElementById('notif');
  n.textContent = msg; n.classList.add('show');
  setTimeout(() => n.classList.remove('show'), dur);
}

// ─── Collection ───────────────────────────────────────────────
function renderCollection() {
  const el = document.getElementById('collection-content');
  if (!el) return;
  const s = getCollectionStats();
  let tierRows = '';
  for (let t = 6; t >= 1; t--) {
    const d = s.byTier[t]; const r = RARITIES[t];
    const pct = d.total ? Math.round((d.got / d.total) * 100) : 0;
    tierRows += `<div class="collection-tier-row">
      <div class="ct-label t${t}">${'★'.repeat(t)} ${r.label}</div>
      <div class="ct-bar-wrap"><div class="ct-bar t${t}-fill" style="width:${pct}%"></div></div>
      <div class="ct-count">${d.got} / ${d.total}</div>
    </div>`;
  }
  const ownedNames = new Set(
    STATE.history.filter(h => h.name).map(h => h.name.toLowerCase())
  );
  const pool = getFilteredPool();
  const collSearchQ = (document.getElementById('coll-search')?.value || '').toLowerCase().trim();
  const owned = pool
    .filter(c => ownedNames.has(c.name.toLowerCase()))
    .filter(c => !collSearchQ || c.name.toLowerCase().includes(collSearchQ) || (c.source||'').toLowerCase().includes(collSearchQ))
    .sort((a,b) => b.tier - a.tier || a.name.localeCompare(b.name));
  let ownedGrid = '<div class="empty-state">No familiars obtained yet</div>';
  if (owned.length) {
    ownedGrid = owned.map(c => {
      const r = RARITIES[c.tier] || RARITIES[1];
      const mod = getMod(c.name);
      const tierColor = r.color === 'rainbow' ? '#fff' : r.color;
      // Mod badge — bigger and bold
      const modBadge = mod > 0
        ? `<span class="owned-mod-badge mod-level-${Math.min(mod, 4)}" style="color:${modColor(mod) === 'rainbow' ? '#fff' : modColor(mod)}" title="${modLabel(mod)}"><strong>Mod +${mod}</strong></span>`
        : '';
      const favIcon = isFavorite(c.name) ? '<span class="owned-fav-star">★</span>' : '';
      return `<div class="owned-card t${c.tier}-card-bg owned-card-clickable" style="border-color:${tierColor}"
        onclick="openCharDetail('${c.name.replace(/'/g,"\'")}')">
        ${portraitBlock(c, 'portrait-pool')}
        ${favIcon}
        <div class="owned-card-body">
          <div class="owned-item-top"><span class="owned-item-name t${c.tier}">${esc(c.name)}</span>${modBadge}</div>
          <div class="owned-item-meta">${esc(c.source)} &nbsp;·&nbsp; ${G_ICON[c.gender] || '⚧'} &nbsp;·&nbsp; <span class="t${c.tier}">${'★'.repeat(c.tier)}</span></div>
          ${renderTagPills(c.tags)}
        </div>
      </div>`;
    }).join('');
  }
  // ── Extended stats ──
  const totalDupes = Object.values(STATE.mods).reduce((a, b) => a + b, 0);
  const highestMod = Object.entries(STATE.mods).sort((a,b) => b[1]-a[1])[0];
  const mostPulled = (() => {
    const counts = {};
    STATE.history.filter(h => h.name).forEach(h => counts[h.name] = (counts[h.name]||0)+1);
    const top = Object.entries(counts).sort((a,b)=>b[1]-a[1])[0];
    return top ? `${esc(top[0])} (${top[1]}×)` : '—';
  })();
  const rarestOwned = owned.length
    ? esc(owned.reduce((a,b) => b.tier > a.tier ? b : a).name)
    : '—';
  const avgTier = owned.length
    ? (owned.reduce((a,b)=>a+b.tier,0)/owned.length).toFixed(1)
    : '—';

  const statsHtml = `<div class="coll-stats-grid">
    <div class="coll-stat"><span>Most Pulled</span><strong>${mostPulled}</strong></div>
    <div class="coll-stat"><span>Rarest Owned</span><strong>${rarestOwned}</strong></div>
    <div class="coll-stat"><span>Total Dupes</span><strong>${totalDupes}</strong></div>
    <div class="coll-stat"><span>Avg Tier</span><strong>${avgTier} ★</strong></div>
    <div class="coll-stat"><span>Highest Mod</span><strong>${highestMod ? `${esc(highestMod[0])} +${highestMod[1]}` : '—'}</strong></div>
    <div class="coll-stat"><span>Completion</span><strong>${s.pct}%</strong></div>
  </div>`;


  // ── Per-source universe completion ──
  const sourceMap = {};
  FULL_POOL.forEach(c => {
    if (!sourceMap[c.source]) sourceMap[c.source] = { total: 0, owned: 0 };
    sourceMap[c.source].total++;
    if (ownedNames.has(c.name.toLowerCase())) sourceMap[c.source].owned++;
  });
  const sourcesArr = Object.entries(sourceMap)
    .filter(([,v]) => v.total > 0)
    .sort((a,b) => (b[1].owned/b[1].total) - (a[1].owned/a[1].total) || b[1].total - a[1].total);
  const sourceRows = sourcesArr.map(([src, d]) => {
    const pct = Math.round((d.owned / d.total) * 100);
    const complete = d.owned === d.total;
    return `<div class="source-row${complete ? ' source-complete' : ''}">
      <div class="source-name">${esc(src)}${complete ? ' <span class="source-badge">✦ Complete</span>' : ''}</div>
      <div class="source-bar-wrap"><div class="source-bar t${Math.ceil(pct/17)+1}-fill" style="width:${pct}%"></div></div>
      <div class="source-count">${d.owned}/${d.total}</div>
    </div>`;
  }).join('');

  // ── Milestone badges ──
  const milestones = [];
  if (STATE.totalPulls >= 1)    milestones.push({ icon:'⟡', label:'First Summon', sub:'The journey begins.' });
  if (STATE.totalPulls >= 100)  milestones.push({ icon:'✦', label:'100 Pulls', sub:'A seasoned summoner.' });
  if (STATE.totalPulls >= 500)  milestones.push({ icon:'✦', label:'500 Pulls', sub:'The multiverse bends to you.' });
  if (s.owned >= 10)            milestones.push({ icon:'⟡', label:'10 Familiars', sub:'A growing roster.' });
  if (s.owned >= 50)            milestones.push({ icon:'✦', label:'50 Familiars', sub:'Half a century of souls.' });
  if (s.pct >= 100)             milestones.push({ icon:'★', label:'Master Collector', sub:'All familiars obtained.' });
  // 6-star milestone
  const sixStarOwned = owned.filter(c => c.tier === 6).length;
  if (sixStarOwned >= 1)        milestones.push({ icon:'★', label:'First Godly', sub:'A reality-warper answers your call.' });
  if (sixStarOwned >= 5)        milestones.push({ icon:'★', label:'Cosmic Court', sub:'Five godly beings in your service.' });
  // Source completion milestones
  const completedSources = sourcesArr.filter(([,v]) => v.owned === v.total && v.total >= 3).length;
  if (completedSources >= 1)    milestones.push({ icon:'⟡', label:'World Complete', sub:'Every familiar from one universe summoned.' });
  if (completedSources >= 5)    milestones.push({ icon:'✦', label:'Multiverse Archivist', sub:'Five worlds fully documented.' });

  const milestonesHtml = milestones.length
    ? `<div class="milestones-grid">${milestones.map(m =>
        `<div class="milestone-badge"><span class="milestone-icon t6">${m.icon}</span><span class="milestone-label">${m.label}</span><span class="milestone-sub">${m.sub}</span></div>`
      ).join('')}</div>`
    : '';

  el.innerHTML = `
    <div class="collection-summary"><div class="collection-big-num">${s.owned} / ${s.total}</div><div class="collection-pct">${s.pct}% Collected</div></div>
    <div class="collection-tiers">${tierRows}</div>
    ${statsHtml}
    ${milestonesHtml}
    <div class="divider"></div>
    <div class="section-header collapsible-header" onclick="toggleUniverseCompletion()" id="universe-header"
      title="Click to expand/collapse universe completion">
      <span style="display:flex;align-items:center;gap:.4rem">
        <span class="collapse-arrow" id="universe-arrow" style="font-size:.75rem;color:var(--gold)">▾</span>
        Universe Completion
        <span style="font-size:.58rem;color:var(--text-dim);font-family:Inter,sans-serif;letter-spacing:0;text-transform:none;font-weight:400">(click to expand)</span>
      </span>
    </div>
    <div class="source-completion" id="universe-completion-panel" style="display:none">${sourceRows}</div>
    <div class="divider"></div>
    <div class="section-header" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:.5rem">
      <span>Obtained Familiars <span class="badge">${owned.length}</span></span>
      <input id="coll-search" class="pool-search" style="max-width:200px;margin:0"
        placeholder="Search collection..." oninput="renderCollection()" />
    </div>
    <div class="owned-grid">${ownedGrid}</div>`;
}

// ── Team Synergy Engine ─────────────────────────────────────────
const SYNERGY_DEFS = [
  { label: 'Dark Coven',       tags: ['Demon','Witch','Undead'],                             min: 3, desc: "Shadows converge — ideal for a villain-focused narrative." },
  { label: 'Mage Conclave',    tags: ['Mage','Sorcerer','Magic User','Alchemist'],           min: 3, desc: "Arcane minds united — strong for magic-world settings." },
  { label: 'Blade Fellowship', tags: ['Swordsman','Swordswoman','Knight'],                   min: 3, desc: "Steel and honour — classic adventure party." },
  { label: 'Divine Court',     tags: ['Goddess','God-tier','Reality Warper'],                min: 2, desc: "Reality bends to this team's will." },
  { label: 'Spirit Realm',     tags: ['Oni','Spirit','Kitsune','Fox Girl','Tengu'],          min: 2, desc: "Ancient supernatural beings from beyond the veil." },
  { label: 'Rogue Cell',       tags: ['Spy','Assassin','Ninja','Hacker'],                   min: 3, desc: "Operates from the shadows — perfect for intrigue stories." },
  { label: 'Hero Vanguard',    tags: ['Hero','Protagonist','Determined'],                    min: 3, desc: "The world's last line of defence." },
  { label: 'Villain Council',  tags: ['Villain','Manipulator','Sadistic'],                   min: 2, desc: "Chaos incarnate — an antagonist dream team." },
  { label: 'Undead Legion',    tags: ['Vampire','Undead','Lich','Skeleton'],                 min: 2, desc: "Death is only the beginning." },
  { label: 'Beast Pact',       tags: ['Beastfolk','Werewolf','Dragon','Demi-human'],         min: 2, desc: "Wild and untamed — bound by instinct." },
  { label: 'Cosmic Horror',    tags: ['Eldritch','Primordial','Ancient Being'],              min: 2, desc: "Beyond mortal comprehension." },
  { label: 'Tsundere Brigade', tags: ['Tsundere','Tsundere-turned-Devoted'],                min: 2, desc: "It's not like they care about the mission or anything." },
  { label: 'Idol Stage',       tags: ['Idol','Singer','Musician','Dancer'],                  min: 2, desc: "Fame and talent collide on stage." },
];

function detectSynergies(filled) {
  if (filled.length < 2) return [];
  const synergies = [];
  // Tag-based synergies
  for (const def of SYNERGY_DEFS) {
    const matchCount = filled.filter(c => (c.tags||[]).some(t => def.tags.includes(t))).length;
    if (matchCount >= def.min) synergies.push({ label: def.label, desc: def.desc, count: matchCount });
  }
  // Same-world bonus
  const sources = [...new Set(filled.map(c => c.source))];
  if (filled.length >= 3 && sources.length === 1)
    synergies.push({ label: 'Same World: ' + sources[0], desc: 'All from the same universe — strong narrative cohesion.', count: filled.length });
  return synergies;
}

// ─── Team Builder ─────────────────────────────────────────────
function getActiveTeam() { return STATE.teams[STATE.activeTeam] || STATE.teams[0]; }

function renderTeamBuilder() {
  const el = document.getElementById('team-content');
  if (!el) return;
  const ownedNames = [...new Set(STATE.history.map(h => h.name))];
  const ownedChars = FULL_POOL.filter(c => ownedNames.includes(c.name));
  if (!ownedChars.length) { el.innerHTML = '<div class="empty-state">Summon some familiars first to build a team</div>'; return; }

  const team = getActiveTeam();
  const teamTabsHtml = STATE.teams.map((t, i) =>
    `<button class="team-tab${i === STATE.activeTeam ? ' active' : ''}" onclick="switchActiveTeam(${i})">${esc(t.name)}</button>`
  ).join('');

  const slotsHtml = team.slots.map((slot, i) => {
    if (!slot) return `<div class="team-slot empty" onclick="openSlotPicker(${i})"><div class="team-slot-label">Slot ${i+1}</div><div class="team-slot-plus">+</div></div>`;
    const r = RARITIES[slot.tier];
    const tc = r.color === 'rainbow' ? '#fff' : r.color;
    return `<div class="team-slot filled t${slot.tier}-card-bg" style="border-color:${tc}" onclick="openSlotPicker(${i})">
      ${portraitBlock(slot, 'portrait-team')}
      <div class="team-slot-overlay">
        <div class="team-slot-label">Slot ${i+1}</div>
        <div class="team-slot-name t${slot.tier}">${esc(slot.name)}</div>
        <div class="team-slot-meta">${'★'.repeat(slot.tier)}</div>
      </div>
    </div>`;
  }).join('');

  const filled = team.slots.filter(Boolean);
  const avgTier = filled.length ? (filled.reduce((a,c)=>a+c.tier,0)/filled.length).toFixed(1) : '—';
  const femaleCt = filled.filter(c=>c.gender==='female').length;
  const maleCt   = filled.filter(c=>c.gender==='male').length;
  const synergies = detectSynergies(filled);
  const synergyHtml = synergies.length
    ? `<div class="synergy-panel"><div class="synergy-header">⟡ Active Synergies</div>
       ${synergies.map(s=>`<div class="synergy-item"><span class="synergy-label">${esc(s.label)}${s.count?' ×'+s.count:''}</span><span class="synergy-desc">${esc(s.desc)}</span></div>`).join('')}</div>`
    : filled.length >= 2 ? '<div class="synergy-panel synergy-none">No synergies yet — try mixing different archetypes.</div>' : '';

  el.innerHTML = `
    <div class="team-tabs-row">
      <div class="team-tabs">${teamTabsHtml}</div>
      <button class="team-rename-btn" onclick="renameActiveTeam()">✎ Rename</button>
    </div>
    <div class="team-grid">${slotsHtml}</div>
    <div class="team-stats">
      <div class="team-stat"><span>Avg Power</span><strong>${avgTier} ★</strong></div>
      <div class="team-stat"><span>Composition</span><strong>${femaleCt}♀ ${maleCt}♂</strong></div>
      <div class="team-stat"><span>Filled</span><strong>${filled.length} / 5</strong></div>
    </div>
    ${synergyHtml}
    <div id="slot-picker" class="slot-picker" style="display:none"></div>`;
}

function switchActiveTeam(idx) { STATE.activeTeam = idx; saveState(); renderTeamBuilder(); }

function renameActiveTeam() {
  const team = getActiveTeam();
  const n = prompt('Team name:', team.name);
  if (n && n.trim()) { team.name = n.trim().slice(0,32); saveState(); renderTeamBuilder(); }
}

function openSlotPicker(slotIdx) {
  const ownedNames = [...new Set(STATE.history.map(h => h.name))];
  const ownedChars = FULL_POOL.filter(c => ownedNames.includes(c.name))
    .sort((a,b) => b.tier - a.tier || a.name.localeCompare(b.name));
  const picker = document.getElementById('slot-picker');
  const current = getActiveTeam().slots[slotIdx]?.name || '';
  picker.innerHTML = `
    <div class="slot-picker-header">Slot ${slotIdx+1} — ${esc(getActiveTeam().name)}
      <span style="margin-left:auto;display:flex;gap:.4rem">
        ${current ? `<button class="slot-picker-close" style="color:#E24B4A" onclick="clearSlot(${slotIdx})">✕ Clear</button>` : ''}
        <button class="slot-picker-close" onclick="document.getElementById('slot-picker').style.display='none'">Close</button>
      </span>
    </div>
    <div class="slot-picker-grid">
      ${ownedChars.map(c=>{const r=RARITIES[c.tier];return `<div class="slot-picker-item" style="border-left-color:${r.color==='rainbow'?'#fff':r.color}" onclick="assignSlot(${slotIdx},'${c.name.replace(/'/g,"\\'")}')"><span class="t${c.tier}">${esc(c.name)}</span><span style="color:var(--text-dim);font-size:.58rem">${esc(c.source)} · ${'★'.repeat(c.tier)}</span></div>`;}).join('')}
    </div>`;
  picker.style.display = 'block';
}

function assignSlot(slotIdx, name) {
  getActiveTeam().slots[slotIdx] = FULL_POOL.find(c => c.name === name) || null;
  saveState();
  document.getElementById('slot-picker').style.display = 'none';
  renderTeamBuilder();
}
function clearSlot(slotIdx) {
  getActiveTeam().slots[slotIdx] = null;
  saveState();
  document.getElementById('slot-picker').style.display = 'none';
  renderTeamBuilder();
}

// ─── Image field helpers ─────────────────────────────────────
// ─── AI Search ───────────────────────────────────────────────
const AI_SYSTEM = `You are a fictional character expert. Given a character name, return a JSON array of ALL possible characters with that exact name (or very close to it) from anime, manga, games, novels, visual novels, and other fiction.

Return ONLY valid JSON — no markdown, no backticks, no extra text.

Format: [{"name":"Full Character Name","source":"Exact Series Name","gender":"female/male/other","tier":1,"tags":["Tag1","Tag2","Tag3"]}]

POWER TIER (1-6, based ONLY on actual in-universe strength — NOT fame or popularity):
1 = Non-powered: slice of life / rom-com with NO supernatural ability
2 = Some powers: low-tier supernatural, martial arts, or physically exceptional normals
3 = Good powers: solid supernatural or system-based power
4 = Strong: high-threat level, can destroy armies or regions
5 = Very strong: near-godly, country to world threat
6 = Godly/OP: reality-warping, multiverse-level, beyond comprehension

Return up to 6 matches sorted by likelihood. Include all notable versions/variants if the name matches multiple characters.`;


function timeAgo(ts) {
  if (!ts) return '';
  const seconds = Math.floor((Date.now() - ts) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}

// ─── Glossary ──────────────────────────────────────────────────



// ─── Glossary ──────────────────────────────────────────────────
function buildAboutTables() {
  const rarityTable = document.getElementById('rarity-table');
  if (!rarityTable) return;
  rarityTable.innerHTML = Object.entries(RARITIES).map(([key, r]) => `
    <div class="rarity-row t${key}-row">
      <div class="rarity-name t${key}">${'★'.repeat(parseInt(key))} ${r.label}</div>
      <div class="rarity-rate t${key}" style="min-width:40px">${r.rate}</div>
      <div class="rarity-desc">${tierDesc(key)}</div>
    </div>`).join('');
}
function tierDesc(key) {
  return {
    1: 'No supernatural ability whatsoever. Pure slice-of-life / rom-com characters.',
    2: 'Low-tier supernatural ability, or exceptional but mortal physical prowess.',
    3: 'Solid, reliable supernatural power within a normal supernatural world.',
    4: 'High-tier threat — can contend with armies or alter regions.',
    5: 'Near-godly. Country-to-world-level threat or significance.',
    6: 'Reality-warping, conceptual, multiversal. Beyond mortal comprehension.',
  }[key] || '';
}

// ─── Chaos Ticket won overlay ─────────────────────────────────
// Shown when a ticket drops in a pull batch, separate from the
// card grid so it doesn't interfere with normal card rendering.
function showTicketWonOverlay(count) {
  triggerScreenFlash();
  triggerAmbientCircleSync('#fff', true);

  const existing = document.getElementById('ticket-won-overlay');
  if (existing) existing.remove();

  const el = document.createElement('div');
  el.id = 'ticket-won-overlay';
  el.innerHTML = `
    <div class="ticket-won-inner">
      <div class="ticket-won-shine"></div>
      <div class="ticket-won-icon t6">✦</div>
      <div class="ticket-won-title t6">Chaos Ticket</div>
      <div class="ticket-won-sub">A rare singularity has entered your collection.<br>
        You now hold <strong>${STATE.chaosTickets.length}</strong> ticket${STATE.chaosTickets.length !== 1 ? 's' : ''}.
      </div>
      <button class="ticket-won-btn" onclick="
        document.getElementById('ticket-won-overlay').remove();
        openChaosTicketModal();
      ">✦ Activate Now</button>
      <button class="ticket-won-dismiss" onclick="document.getElementById('ticket-won-overlay').remove()">
        Save for later
      </button>
    </div>`;
  document.body.appendChild(el);

  // Auto-dismiss after 9s
  setTimeout(() => {
    const o = document.getElementById('ticket-won-overlay');
    if (o) { o.style.animation = 'ticketOverlayOut 0.4s ease forwards'; setTimeout(() => o.remove(), 400); }
  }, 9000);
}

// ─── Universe completion collapse toggle ──────────────────────
function toggleUniverseCompletion() {
  const panel = document.getElementById('universe-completion-panel');
  const arrow = document.getElementById('universe-arrow');
  if (!panel) return;
  const isOpen = panel.style.display !== 'none';
  panel.style.display = isOpen ? 'none' : 'block';
  if (arrow) arrow.textContent = isOpen ? '▾' : '▴';
  // Persist preference
  try { localStorage.setItem('cf_universe_expanded', isOpen ? '0' : '1'); } catch(e) {}
}

function restoreUniverseCollapseState() {
  try {
    const expanded = localStorage.getItem('cf_universe_expanded');
    if (expanded === '1') {
      const panel = document.getElementById('universe-completion-panel');
      const arrow = document.getElementById('universe-arrow');
      if (panel) panel.style.display = 'block';
      if (arrow) arrow.textContent = '▴';
    }
  } catch(e) {}
}

// ─── Backup / Export / Import ─────────────────────────────────
// ─── Bulk CSV Import ──────────────────────────────────────────
// ─── Chaos Ticket UI ──────────────────────────────────────────
function renderPowerBondsBar() {
  // ── Header chips bar ──
  const bar = document.getElementById('power-bonds-bar');
  if (bar) {
    if (!STATE.powerBonds.length) {
      bar.innerHTML = '';
    } else {
      bar.innerHTML = STATE.powerBonds.map(b => {
        const r = RARITIES[b.charTier] || RARITIES[1];
        const col = r.color === 'rainbow' ? '#fff' : r.color;
        return `<span class="power-bond-chip" style="border-color:${col}"
          title="Click to see Power Bonds in Collection" onclick="switchTab('collection')">
          ✦ ${(b.stacks||1)*10}% <span style="color:${col}">${esc(b.charName)}</span>
        </span>`;
      }).join('');
    }
  }

  // ── Collection tab bonds panel (rendered when Collection is open) ──
  const panel = document.getElementById('power-bonds-panel');
  if (!panel) return;

  if (!STATE.powerBonds.length && !STATE.chaosTickets.length) {
    panel.innerHTML = '';
    return;
  }

  const ticketHtml = STATE.chaosTickets.length
    ? `<div class="bonds-ticket-row">
        <span class="bonds-ticket-count t6">✦ ${STATE.chaosTickets.length} Chaos Ticket${STATE.chaosTickets.length !== 1 ? 's' : ''} held</span>
        <button class="bonds-activate-btn" onclick="openChaosTicketModal()">Activate →</button>
      </div>`
    : '';

  const bondsHtml = STATE.powerBonds.length
    ? STATE.powerBonds.map(b => {
        const r = RARITIES[b.charTier] || RARITIES[1];
        const col = r.color === 'rainbow' ? '#fff' : r.color;
        const char = FULL_POOL.find(c => c.name === b.charName);
        const date = new Date(b.bondedAt).toLocaleDateString();
        return `<div class="power-bond-entry" style="border-left-color:${col}">
          <div class="pbe-left">
            ${char ? portraitBlock(char, 'portrait-bond') : `<div class="portrait portrait-bond t${b.charTier}-portrait" style="border-color:${col}">${sigilHtml(b.charName, b.charSource, col)}</div>`}
          </div>
          <div class="pbe-body">
            <div class="pbe-title" style="color:${col}">${(b.stacks||1)*10}% of ${esc(b.charName)}'s Power</div>
            <div class="pbe-meta">${esc(b.charSource)} &nbsp;·&nbsp; ${'★'.repeat(b.charTier)}${b.stacks > 1 ? ` &nbsp;·&nbsp; <span style="color:var(--gold)">×${b.stacks} bonds</span>` : ''}</div>
            <div class="pbe-date">Last bonded ${date}</div>
          </div>
          <button class="pbe-remove" onclick="removePowerBond('${b.id}')" title="Remove bond">✕</button>
        </div>`;
      }).join('')
    : '';

  panel.innerHTML = `
    <div class="power-bonds-section">
      <div class="section-header" style="margin-bottom:.55rem">
        ✦ Power Bonds
        <span class="badge">${STATE.powerBonds.length}</span>
      </div>
      ${ticketHtml}
      ${bondsHtml || '<div class="empty-state" style="padding:.75rem">No active bonds — use a Chaos Ticket to form one.</div>'}
    </div>`;
}

function removePowerBond(id) {
  if (!confirm('Remove this Power Bond? This cannot be undone.')) return;
  STATE.powerBonds = STATE.powerBonds.filter(b => b.id !== id);
  saveState();
  renderPowerBondsBar();
  showNotif('Power Bond removed');
}

function openChaosTicketModal() {
  const tickets = STATE.chaosTickets;
  if (!tickets.length) { showNotif('No Chaos Tickets in your collection'); return; }

  const ownedNames = new Set(STATE.history.map(h => h.name.toLowerCase()));
  const ownedChars = FULL_POOL.filter(c => ownedNames.has(c.name.toLowerCase()))
    .sort((a,b) => b.tier - a.tier || a.name.localeCompare(b.name));

  if (!ownedChars.length) { showNotif('Summon some familiars first to bond with'); return; }

  let modal = document.getElementById('edit-modal-overlay');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'edit-modal-overlay';
    modal.className = 'edit-modal-overlay';
    document.body.appendChild(modal);
  }

  modal.innerHTML = `
    <div class="edit-modal chaos-ticket-modal">
      <div class="edit-modal-header">
        <span class="t6">✦ Chaos Ticket — Choose a Familiar</span>
        <button class="slot-picker-close" onclick="closeEditModal()">✕</button>
      </div>
      <p style="font-size:.68rem;color:var(--text-dim);margin-bottom:.85rem;line-height:1.6">
        You hold <strong style="color:var(--gold)">${tickets.length} Chaos Ticket${tickets.length>1?'s':''}</strong>. 
        Select a familiar to receive a permanent bond of <strong style="color:var(--gold)">10% of their power</strong>.
        The ticket is consumed on use.
      </p>
      <div class="ticket-char-grid">
        ${ownedChars.map(c => {
          const r = RARITIES[c.tier] || RARITIES[1];
          const col = r.color === 'rainbow' ? '#fff' : r.color;
          const bond = STATE.powerBonds.find(b => b.charName === c.name);
          const bondLabel = bond ? `<div class="ticket-char-bond t6">+10% → ${(bond.stacks||1)*10+10}%</div>` : '';
          return `<div class="ticket-char-item t${c.tier}-card-bg" style="border-color:${col}"
                    onclick="confirmTicketBond('${c.name.replace(/'/g,"\'")}')">
            ${portraitBlock(c, 'portrait-pool')}
            <div class="ticket-char-name" style="color:${col}">${esc(c.name)}</div>
            <div class="ticket-char-meta">${esc(c.source)} · ${'★'.repeat(c.tier)}</div>
            ${bondLabel}
          </div>`;
        }).join('')}
      </div>
    </div>`;
  modal.style.display = 'flex';
}

function confirmTicketBond(charName) {
  const char = FULL_POOL.find(c => c.name === charName);
  if (!char) return;
  if (!confirm(`Bond with ${char.name}? You will permanently gain 10% of their power. This consumes one Chaos Ticket.`)) return;

  const ticket = STATE.chaosTickets[0];
  activateChaosTicket(ticket.id, char);
  closeEditModal();

  // Screen flash + notification
  triggerScreenFlash();
  const existingBond = STATE.powerBonds.find(b => b.charName === char.name);
  const newPct = existingBond ? ((existingBond.stacks||1) * 10) : 10;
  showNotif(`✦ Power Bond${existingBond ? ' stacked' : ' formed'}: ${newPct}% of ${char.name}'s power`, 4000);
  renderPowerBondsBar();
  updateStats();
}

// ─── Space decoration (fills empty purple space with subtle cosmic detail) ───
function buildSpaceDecoration() {
  const strip = document.getElementById('space-deco-strip');
  if (!strip) return;
  // Taller strip (48px) with more visual weight — two arc lines + star crosshairs
  let svg = '<svg width="100%" height="48" viewBox="0 0 940 48" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">';
  // Primary arc
  svg += '<path d="M0 36 Q235 10 470 26 Q705 42 940 14" stroke="rgba(155,111,224,0.18)" stroke-width="1.2" fill="none"/>';
  // Secondary arc — offset phase
  svg += '<path d="M0 40 Q235 22 470 32 Q705 38 940 22" stroke="rgba(212,86,201,0.10)" stroke-width="0.8" fill="none"/>';
  // Gold accent dots at arc peaks
  svg += '<circle cx="470" cy="26" r="2" fill="rgba(224,182,92,0.45)"/>';
  svg += '<circle cx="235" cy="17" r="1.4" fill="rgba(155,111,224,0.55)"/>';
  svg += '<circle cx="705" cy="35" r="1.4" fill="rgba(155,111,224,0.55)"/>';
  // Small 4-point star crosshairs at a few positions
  const stars = [
    {x:45,y:18},{x:180,y:11},{x:310,y:32},{x:530,y:14},
    {x:640,y:28},{x:760,y:10},{x:870,y:34},{x:920,y:18}
  ];
  stars.forEach(s => {
    const op = (0.3 + Math.random()*0.35).toFixed(2);
    svg += `<line x1="${s.x}" y1="${s.y-4}" x2="${s.x}" y2="${s.y+4}" stroke="white" stroke-width="0.8" opacity="${op}"/>`;
    svg += `<line x1="${s.x-4}" y1="${s.y}" x2="${s.x+4}" y2="${s.y}" stroke="white" stroke-width="0.8" opacity="${op}"/>`;
    svg += `<circle cx="${s.x}" cy="${s.y}" r="0.9" fill="white" opacity="${parseFloat(op)+0.1}"/>`;
  });
  svg += '</svg>';
  strip.innerHTML = svg;
}

// ════════════════════════════════════════════════════════════════
// ATTRIBUTE DISPLAY HELPER
// ════════════════════════════════════════════════════════════════
function attrHtml(attrs) {
  return `<div class="char-attrs">
    ${ATTR_NAMES.map(name => {
      const key = name.toLowerCase();
      const grade = (attrs && attrs[key]) ? attrs[key] : null;
      const display = grade || '—';
      const col = grade ? (ATTR_COLORS[grade] || 'var(--text-dim)') : 'rgba(255,255,255,0.18)';
      return `<div class="char-attr-chip">
        <span class="attr-label">${name}</span>
        <span class="attr-grade" style="color:${col}">${display}</span>
      </div>`;
    }).join('')}
  </div>`;
}

// ── Attribute selector widget (for forms) ─────────────────────
// ════════════════════════════════════════════════════════════════
// CHARACTER DETAIL MODAL (click in Collection)
// ════════════════════════════════════════════════════════════════
function openCharDetail(name) {
  const c = FULL_POOL.find(ch => ch.name === name);
  if (!c) return;
  const r = RARITIES[c.tier] || RARITIES[1];
  const tierColor = r.color === 'rainbow' ? '#fff' : r.color;
  const mod = getMod(c.name);
  const fav = isFavorite(c.name);
  const note = getCharNote(c.name);
  const pullCount = STATE.history.filter(h => h.name === c.name).length;
  const bond = STATE.powerBonds.find(b => b.charName === c.name);

  let modal = document.getElementById('edit-modal-overlay');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'edit-modal-overlay';
    modal.className = 'edit-modal-overlay';
    document.body.appendChild(modal);
  }

  modal.innerHTML = `
    <div class="edit-modal char-detail-modal">
      <div class="edit-modal-header" style="color:${tierColor}">
        <span>${esc(c.name)}</span>
        <div style="display:flex;gap:.5rem;align-items:center">
          <button class="fav-star-btn${fav?' fav-active':''}" style="font-size:1rem"
            onclick="toggleFavorite('${c.name.replace(/'/g,"\\'")}'); openCharDetail('${c.name.replace(/'/g,"\\'")}')">
            ${fav?'★':'☆'}
          </button>
          <button class="slot-picker-close" onclick="closeEditModal()">✕</button>
        </div>
      </div>

      <div class="char-detail-body">
        <div class="char-detail-portrait">
          ${portraitBlock(c, 'portrait-detail')}
        </div>
        <div class="char-detail-info">
          <div class="char-detail-meta">
            <span class="t${c.tier}">${'★'.repeat(c.tier)}</span>
            &nbsp;${esc(r.label)}
            &nbsp;·&nbsp; ${esc(c.source)}
            &nbsp;·&nbsp; ${G_ICON[c.gender]||'⚧'} ${c.gender}
          </div>
          ${mod > 0 ? `<div class="char-detail-mod"><span class="owned-mod-badge mod-level-${Math.min(mod,4)}" style="color:${modColor(mod)==='rainbow'?'#fff':modColor(mod)}"><strong>Mod +${mod}</strong></span></div>` : ''}
          ${bond ? `<div class="char-detail-bond t6">✦ ${(bond.stacks||1)*10}% Power Bond active</div>` : ''}
          <div class="char-detail-pulls">Pulled ${pullCount}× &nbsp;·&nbsp; First obtained ${pullCount > 0 ? timeAgo(STATE.history.filter(h=>h.name===c.name).slice(-1)[0]?.ts) : '—'}</div>
          ${attrHtml(c.attrs)}
          ${c.tags && c.tags.length ? `<div style="margin-top:.5rem">${renderTagPills(c.tags)}</div>` : ''}
        </div>
      </div>

      ${c.lore ? `<div class="char-detail-lore"><strong style="color:var(--gold);font-size:.62rem;letter-spacing:.1em;text-transform:uppercase">Lore / Notes</strong><p>${esc(c.lore)}</p></div>` : ''}

      <div class="char-detail-private">
        <label style="font-size:.62rem;letter-spacing:.1em;text-transform:uppercase;color:var(--text-dim)">
          Private Notes <span style="color:var(--text-dim);font-weight:300">(local only, never shared)</span>
        </label>
        <textarea id="char-private-note" rows="4"
          style="background:var(--surface2);border:1px solid var(--gold-dim);border-radius:4px;color:var(--text);font-family:Inter,sans-serif;font-size:.75rem;padding:.45rem .7rem;width:100%;resize:vertical;outline:none;margin-top:.3rem"
          placeholder="Your personal notes about this character in your story, roleplay, or fanfic..."
          onfocus="this.style.borderColor='var(--gold)'" onblur="this.style.borderColor='var(--gold-dim)'"
          >${esc(note)}</textarea>
        <button class="submit-btn" style="margin-top:.4rem;padding:.4rem 1rem;font-size:.62rem"
          onclick="saveCharNote('${c.name.replace(/'/g,"\\'")}')">Save Note</button>
      </div>
    </div>`;
  modal.style.display = 'flex';
}

function saveCharNote(name) {
  const el = document.getElementById('char-private-note');
  if (!el) return;
  setCharNote(name, el.value.trim());
  showNotif('✦ Note saved');
}

// ════════════════════════════════════════════════════════════════
// UNIVERSE BROWSER TAB
// ════════════════════════════════════════════════════════════════
function renderUniverseBrowser() {
  const el = document.getElementById('universe-content');
  if (!el) return;

  const ownedNames = new Set(STATE.history.filter(h=>h.name).map(h=>h.name.toLowerCase()));
  const sourceMap = {};
  FULL_POOL.forEach(c => {
    if (!sourceMap[c.source]) sourceMap[c.source] = { chars: [], tiers: {} };
    sourceMap[c.source].chars.push(c);
    if (!sourceMap[c.source].tiers[c.tier]) sourceMap[c.source].tiers[c.tier] = 0;
    sourceMap[c.source].tiers[c.tier]++;
  });

  const sourcesArr = Object.entries(sourceMap)
    .sort((a,b) => b[1].chars.length - a[1].chars.length);

  el.innerHTML = `
    <div class="universe-search-row">
      <input class="pool-search" id="universe-search" placeholder="Search universes..." oninput="filterUniverses()" style="margin-bottom:.65rem" />
    </div>
    <div id="universe-list">
      ${sourcesArr.map(([src, data]) => {
        const total = data.chars.length;
        const owned = data.chars.filter(c => ownedNames.has(c.name.toLowerCase())).length;
        const pct   = Math.round((owned/total)*100);
        const complete = owned === total;
        const maxTier = Math.max(...data.chars.map(c=>c.tier));
        const r = RARITIES[maxTier] || RARITIES[1];
        const col = r.color === 'rainbow' ? '#fff' : r.color;
        return `<div class="universe-entry" data-src="${esc(src.toLowerCase())}">
          <div class="universe-header" onclick="toggleUniverseEntry(this)">
            <div class="universe-title" style="color:${col}">
              ${esc(src)}
              ${complete ? '<span class="source-badge">✦ Complete</span>' : ''}
            </div>
            <div class="universe-meta">${total} familiar${total!==1?'s':''} &nbsp;·&nbsp; ${owned}/${total} owned (${pct}%) &nbsp;·&nbsp; Max ${'★'.repeat(maxTier)}</div>
            <div class="universe-bar-wrap"><div class="universe-bar" style="width:${pct}%;background:${col}"></div></div>
            <span class="collapse-arrow" style="margin-left:auto">▾</span>
          </div>
          <div class="universe-chars" style="display:none">
            ${data.chars.sort((a,b)=>b.tier-a.tier||a.name.localeCompare(b.name)).map(c => {
              const isOwned = ownedNames.has(c.name.toLowerCase());
              const cr = RARITIES[c.tier]||RARITIES[1];
              const cc = cr.color==='rainbow'?'#fff':cr.color;
              return `<div class="universe-char-row${isOwned?' uni-owned':' uni-unowned'}"
                onclick="${isOwned?`openCharDetail('${c.name.replace(/'/g,"\\'")}')`:''}"
                style="cursor:${isOwned?'pointer':'default'}">
                <span class="t${c.tier}" style="min-width:60px">${'★'.repeat(c.tier)}</span>
                <span style="color:${isOwned?cc:'var(--text-dim)'}">${esc(c.name)}</span>
                ${isOwned?'<span class="uni-owned-badge">✓</span>':''}
              </div>`;
            }).join('')}
          </div>
        </div>`;
      }).join('')}
    </div>`;
}

function toggleUniverseEntry(header) {
  const chars = header.nextElementSibling;
  const arrow = header.querySelector('.collapse-arrow');
  const open = chars.style.display !== 'none';
  chars.style.display = open ? 'none' : 'block';
  if (arrow) arrow.textContent = open ? '▾' : '▴';
}

function filterUniverses() {
  const q = (document.getElementById('universe-search')?.value || '').toLowerCase();
  document.querySelectorAll('.universe-entry').forEach(el => {
    el.style.display = !q || el.dataset.src.includes(q) ? '' : 'none';
  });
}

// ════════════════════════════════════════════════════════════════
// RANDOM INSPIRATION BUTTONS
// ════════════════════════════════════════════════════════════════
function buildInspirationRow() {
  const row = document.getElementById('inspiration-row');
  if (!row) return;
  const btns = [
    { label: '⟡ Random', fn: 'inspireRandom()' },
    { label: '✦ Couple', fn: 'inspireCouple()' },
    { label: '⚔ Rivals',  fn: 'inspireRivals()' },
    { label: '✦ Prompt',  fn: 'inspireAIPrompt()' },
  ];
  row.innerHTML = `<div class="inspire-btn-row">
    ${btns.map(b => `<button class="inspire-btn" onclick="${b.fn}">${b.label}</button>`).join('')}
  </div>`;
}

function randomOwned() {
  const ownedNames = new Set(STATE.history.filter(h=>h.name).map(h=>h.name.toLowerCase()));
  const owned = FULL_POOL.filter(c => ownedNames.has(c.name.toLowerCase()));
  return owned.length ? owned[Math.floor(Math.random()*owned.length)] : null;
}
function randomFromPool() {
  return FULL_POOL.length ? FULL_POOL[Math.floor(Math.random()*FULL_POOL.length)] : null;
}

function inspireRandom() {
  const c = randomOwned() || randomFromPool();
  if (!c) { showNotif('Summon some familiars first'); return; }
  showNotif(`✦ Random: ${c.name} (${c.source}, ${'★'.repeat(c.tier)})`, 4000);
}

function inspireCouple() {
  const owned = FULL_POOL.filter(c => STATE.history.filter(h=>h.name).some(h=>h.name===c.name));
  if (owned.length < 2) { showNotif('Need at least 2 familiars first'); return; }
  const shuffled = [...owned].sort(() => Math.random()-0.5);
  const [a, b] = shuffled;
  showNotif(`✦ Couple: ${a.name} & ${b.name}`, 4000);
}

function inspireRivals() {
  const owned = FULL_POOL.filter(c => STATE.history.filter(h=>h.name).some(h=>h.name===c.name));
  if (owned.length < 2) { showNotif('Need at least 2 familiars first'); return; }
  const shuffled = [...owned].sort(() => Math.random()-0.5);
  const [a, b] = shuffled;
  showNotif(`⚔ Rivals: ${a.name} vs ${b.name}`, 4000);
}

// ── AI Writing Prompt ─────────────────────────────────────────
async function inspireAIPrompt() {
  const owned = FULL_POOL.filter(c => STATE.history.filter(h=>h.name).some(h=>h.name===c.name));
  if (owned.length < 2) { showNotif('Need at least 2 familiars first'); return; }
  const pick = [...owned].sort(()=>Math.random()-0.5).slice(0,3);
  const charList = pick.map(c=>`${c.name} (${c.source}, ${c.tags?.slice(0,3).join('/')})`).join(', ');

  showNotif('✦ Consulting the oracle...', 5000);
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6', max_tokens: 180,
        system: 'You are a creative writing prompt generator for fanfiction and roleplay. Given a list of fictional characters, generate ONE vivid, specific story premise in 2-3 sentences. Be creative. No preamble, just the prompt.',
        messages: [{ role: 'user', content: `Characters: ${charList}` }]
      })
    });
    const data = await res.json();
    const prompt = data.content?.[0]?.text || '';
    if (!prompt) throw new Error('empty');
    showInspirationModal(prompt, pick);
  } catch(e) {
    showNotif('✕ AI unavailable — try again later');
  }
}

function showInspirationModal(prompt, chars) {
  let modal = document.getElementById('edit-modal-overlay');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'edit-modal-overlay';
    modal.className = 'edit-modal-overlay';
    document.body.appendChild(modal);
  }
  modal.innerHTML = `
    <div class="edit-modal" style="max-width:480px">
      <div class="edit-modal-header">
        <span class="t6">✦ Writing Prompt</span>
        <button class="slot-picker-close" onclick="closeEditModal()">✕</button>
      </div>
      <div class="inspiration-chars">
        ${chars.map(c=>{const r=RARITIES[c.tier]||RARITIES[1];const col=r.color==='rainbow'?'#fff':r.color;return `<span class="insp-char-chip" style="border-color:${col};color:${col}">${esc(c.name)}</span>`;}).join('')}
      </div>
      <p class="inspiration-text">${esc(prompt)}</p>
      <div style="display:flex;gap:.5rem;margin-top:.85rem">
        <button class="submit-btn" onclick="inspireAIPrompt();closeEditModal()">✦ New Prompt</button>
        <button class="admin-logout-btn" onclick="closeEditModal()">Close</button>
      </div>
    </div>`;
  modal.style.display = 'flex';
}
