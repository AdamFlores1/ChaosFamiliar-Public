// data.js — PUBLIC version. Static, no server, no admin.
// All state is stored in localStorage. Characters load from data/characters.json.
// To add characters: edit data/characters.json directly.

const RARITIES = {
  1: { label: 'Non-powered', stars: 1, color: '#ABABB8', cls: 't1', weight: 38.7, rate: '38.7%' },
  2: { label: 'Some Powers', stars: 2, color: '#4FC178', cls: 't2', weight: 27.4, rate: '27.4%' },
  3: { label: 'Good Powers', stars: 3, color: '#3DA9F5', cls: 't3', weight: 18.3, rate: '18.3%' },
  4: { label: 'Strong',      stars: 4, color: '#B654E0', cls: 't4', weight: 10.2, rate: '10.2%' },
  5: { label: 'Very Strong', stars: 5, color: '#E8C054', cls: 't5', weight: 5.1,  rate: '5.1%'  },
  6: { label: 'Godly / OP',  stars: 6, color: 'rainbow', cls: 't6', weight: 0.3,  rate: '0.3%'  },
};
const G_ICON = { female: '♀', male: '♂', other: '⚧' };
const PITY_MAX = 90;
const MOD_MAX = 99;
const STORAGE_KEY = 'chaosfamiliar_public_v1';

function modLabel(mod) {
  if (mod <= 0) return 'Mod +0 (Starting Power)';
  if (mod === 1) return 'Mod +1 (Early Growth)';
  if (mod === 2) return 'Mod +2 (Mid-Story Power)';
  if (mod === 3) return 'Mod +3 (Full Potential)';
  if (mod === 4) return 'Mod +4 (Beyond Canon)';
  return `Mod +${mod} (Ascended)`;
}
function modColor(mod) {
  if (mod <= 0) return '#888';
  if (mod === 1) return '#4FC178';
  if (mod === 2) return '#3DA9F5';
  if (mod === 3) return '#B654E0';
  return 'rainbow';
}

let STATE = {
  history: [], gender: 'both', pity: 0, totalPulls: 0, mods: {},
  teams: [
    { name: 'Team Alpha', slots: [null,null,null,null,null] },
    { name: 'Team Beta',  slots: [null,null,null,null,null] },
    { name: 'Team Gamma', slots: [null,null,null,null,null] },
  ],
  activeTeam: 0,
  chaosTickets: [],
  powerBonds: [],
  favorites: [],
  charNotes: {},
  poolSort: 'default',
};
let FULL_POOL = [];

async function initData() {
  // Load persisted state
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const p = JSON.parse(saved);
      STATE.history    = p.history    || [];
      STATE.gender     = p.gender     || 'both';
      STATE.pity       = p.pity       || 0;
      STATE.totalPulls = p.totalPulls || 0;
      STATE.mods       = p.mods       || {};
      STATE.activeTeam = p.activeTeam || 0;
      if (p.teams && Array.isArray(p.teams)) {
        STATE.teams = p.teams;
      } else if (p.teamSlots) {
        STATE.teams[0].slots = p.teamSlots;
      }
      STATE.chaosTickets = p.chaosTickets || [];
      STATE.powerBonds   = p.powerBonds   || [];
      STATE.favorites    = p.favorites    || [];
      STATE.charNotes    = p.charNotes    || {};
      STATE.poolSort     = p.poolSort     || 'default';
      STATE.history = STATE.history.filter(h => h && h.name && typeof h.name === 'string');
    }
  } catch(e) {}

  // Load character pool
  try {
    const resp = await fetch('data/characters.json');
    FULL_POOL = await resp.json();
  } catch(e) {
    console.warn('Could not load characters.json:', e);
    FULL_POOL = [];
    if (location.protocol === 'file:') showFetchWarning();
  }

  rehydrateTeamSlots();
}

function showFetchWarning() {
  const banner = document.createElement('div');
  banner.style.cssText = 'position:fixed;top:0;left:0;right:0;background:#6B3030;color:#fff;text-align:center;padding:.6rem 1rem;font-family:Inter,sans-serif;font-size:.78rem;z-index:9999;';
  banner.innerHTML = `⚠ Character pool empty — opened as a local file. Run <code style="background:rgba(0,0,0,.3);padding:.1rem .35rem;border-radius:3px">python3 -m http.server 8000</code> in this folder and open <code style="background:rgba(0,0,0,.3);padding:.1rem .35rem;border-radius:3px">http://localhost:8000</code> instead, or double-click start.bat.`;
  document.body.prepend(banner);
}

function saveState() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(STATE)); } catch(e) {}
}

function getFilteredPool(extraFilters = {}) {
  let pool = STATE.gender === 'both' ? FULL_POOL : FULL_POOL.filter(c => c.gender === STATE.gender);
  if (extraFilters.tags && extraFilters.tags.length) {
    pool = pool.filter(c => (c.tags || []).some(t => extraFilters.tags.includes(t)));
  }
  return pool;
}

function getMod(name) { return STATE.mods[name.toLowerCase()] || 0; }
function incrementMod(name) {
  const key = name.toLowerCase();
  const current = STATE.mods[key] || 0;
  if (current < MOD_MAX) STATE.mods[key] = current + 1;
  return STATE.mods[key];
}

function isFavorite(name) { return STATE.favorites.includes(name.toLowerCase()); }
function toggleFavorite(name) {
  const lower = name.toLowerCase();
  const idx = STATE.favorites.indexOf(lower);
  if (idx >= 0) STATE.favorites.splice(idx, 1);
  else STATE.favorites.push(lower);
  saveState();
}

function getCharNote(name) { return STATE.charNotes[name.toLowerCase()] || ''; }
function setCharNote(name, text) {
  STATE.charNotes[name.toLowerCase()] = text;
  saveState();
}

function rehydrateTeamSlots() {
  const poolByName = {};
  FULL_POOL.forEach(c => { poolByName[c.name.toLowerCase()] = c; });
  STATE.teams.forEach(team => {
    team.slots = team.slots.map(slot => {
      if (!slot) return null;
      return poolByName[slot.name.toLowerCase()] || null;
    });
  });
}

function clearRecords() {
  STATE.history = []; STATE.pity = 0; STATE.totalPulls = 0; STATE.mods = {};
  saveState();
}

function getCollectionStats() {
  const pool = getFilteredPool();
  const ownedNames = new Set(
    STATE.history.filter(h => h.name).map(h => h.name.toLowerCase())
  );
  const owned = pool.filter(c => ownedNames.has(c.name.toLowerCase()));
  const byTier = {};
  for (let t = 1; t <= 6; t++) {
    const total = pool.filter(c => c.tier === t).length;
    const got = owned.filter(c => c.tier === t).length;
    byTier[t] = { got, total };
  }
  return { total: pool.length, owned: owned.length, pct: pool.length ? Math.round((owned.length/pool.length)*100) : 0, byTier };
}

function getAllTagsWithCounts() {
  const counts = {};
  FULL_POOL.forEach(c => (c.tags || []).forEach(t => {
    counts[t] = (counts[t] || 0) + 1;
  }));
  const inPool = Object.entries(counts).filter(([,v]) => v > 0);
  return inPool.sort((a,b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

// ── Attribute display ──
const ATTR_COLORS = { EX: '#fff', A: '#E8C054', B: '#3DA9F5', C: '#4FC178', D: '#ABABB8' };
const ATTR_NAMES  = ['Body', 'Mind', 'Soul', 'Special'];

// ── Chaos Ticket helpers ──
const CHAOS_TICKET_WEIGHT = 2.0;
function addChaosTicket() {
  const id = 'ct_' + Date.now() + '_' + Math.random().toString(36).slice(2,6);
  STATE.chaosTickets.push({ id, activatedAt: null });
  saveState();
}
function activateChaosTicket(ticketId, char) {
  STATE.chaosTickets = STATE.chaosTickets.filter(t => t.id !== ticketId);
  const existing = STATE.powerBonds.find(b => b.charName === char.name);
  if (existing) {
    existing.stacks = (existing.stacks || 1) + 1;
    existing.bondedAt = Date.now();
  } else {
    STATE.powerBonds.push({
      id: 'pb_' + Date.now(),
      charName: char.name,
      charTier: char.tier,
      charSource: char.source,
      bondedAt: Date.now(),
      stacks: 1,
    });
  }
  saveState();
}
