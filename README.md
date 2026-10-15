# Chaos Familiar — Public Version

A browser-based character collection and gacha simulator built as a hobby project for creative writing, worldbuilding, and roleplay.

The public version runs locally in the browser, stores progress in `localStorage`, and does not require an account or backend.

## Project status

This repository is the **public/hobby version** of Chaos Familiar. It is useful as an example of client-side state management, weighted random selection, collection systems, filtering, and UI behavior, but it is not intended to be a rights-clean commercial showcase.

The project uses names and concepts associated with third-party fictional works. No ownership of those third-party properties is claimed. Optional custom images should only be used when you have the rights or permission to use them.

## Features

- Weighted gacha pulls
- Soft pity at 75 and hard pity at 90
- Duplicate/mod progression
- Chaos Tickets and Power Bonds
- Collection tracking and completion statistics
- Three team slots with synergy detection
- Favorites and private notes
- Universe/source browsing
- Search and tag filtering
- Generated placeholder sigils when no custom image is supplied
- Local browser persistence with `localStorage`

## Running locally

### Windows

Double-click:

```text
start.bat
```

Python is required because the project needs to be served through a local HTTP server.

### Manual

From the repository directory:

```bash
python -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

Do not open `index.html` directly with a `file://` URL because the character data is loaded separately.

## Adding your own characters

Edit `data/characters.json` and add entries using the existing schema, for example:

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

The `image` field is optional. When adding an image, use only material you are allowed to use.

### Tier guide

- **1** — No powers / ordinary human
- **2** — Low-tier supernatural or exceptional physical ability
- **3** — Solid supernatural ability
- **4** — High-tier, army/region-level threat
- **5** — Near-godly, country/world-level
- **6** — Reality-warping or multiverse-level

## Technical scope

The public build is a client-side HTML/CSS/JavaScript application. Its main engineering areas include:

- weighted random-selection and pity logic;
- persistent browser state;
- collection and duplicate progression;
- filtering/search;
- team state;
- notes/favorites;
- data-driven character definitions.

A separate hosted/private version has additional backend/admin functionality. That code is not part of this repository.

## Inspiration and attribution

Chaos Familiar was heavily inspired by [ChaosGacha](https://github.com/BronzDeck/ChaosGacha) by BronzDeck. This project should not be presented as if that inspiration or third-party fictional properties originated here.

## License

Repository-owned material is published under the license included in [LICENSE](LICENSE). That license does not grant rights to third-party characters, franchises, names, artwork, or other external intellectual property.
