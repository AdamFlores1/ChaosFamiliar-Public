# Chaos Familiar — Public Version

A gacha-style anime character summoning simulator for creative writing, worldbuilding, and roleplay. Pull familiars from a curated pool, build teams, track collections, and use the inspiration tools for your fanfic or RP sessions.

All progress is saved locally in your browser (localStorage). Nothing is sent anywhere.

## Running it

**Easiest:** Double-click `start.bat` (requires Python — free from [python.org](https://www.python.org/downloads/)).

**Manual:** Open a terminal in this folder and run:

```
python3 -m http.server 8000
```

Then open `http://localhost:8000` in your browser.

> ⚠ Do **not** open `index.html` directly as a file — the character pool won't load. You need the local server.

## Adding your own characters

This build has no in-app add form. Open `data/characters.json` in any text editor and add entries like this:

```json
{
  "name": "Character Name",
  "source": "Series Name",
  "gender": "female",
  "tier": 3,
  "tags": ["Swordswoman", "Ninja"],
  "image": "https://example.com/image.png"
}
```

**Tier guide (in-universe power only — never fame or popularity):**

- `1` — No powers (slice of life, normal humans)
- `2` — Low-tier supernatural or physically exceptional
- `3` — Solid supernatural ability
- `4` — High-tier, army/region-level threat
- `5` — Near-godly, country/world-level
- `6` — Reality-warping, multiverse-level

`image` is optional. If omitted, a placeholder is shown.

## Features

- **Gacha pulls** with weighted tiers, soft pity at 75, hard pity at 90
- **Mod system** — duplicates level up the familiar instead of being wasted
- **Chaos Tickets** — rare drops that form permanent Power Bonds
- **Collection tracker** with universe completion, milestones, and stats
- **Three team slots** with synergy detection
- **Favorites**, private notes, and character detail view
- **Universe Browser** — see every familiar by series
- **Writing inspiration** — random pulls, couple/rival pairings, AI-generated prompts
- **Tag filtering** and advanced pool search

## Want more?

The full hosted version has an admin panel, in-app character suggestions, a curated pool of 200+ characters, and more features. Check it out at **[your site URL here]**.

## License

[CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/) — Free for personal use. Credit required. Commercial use prohibited.
