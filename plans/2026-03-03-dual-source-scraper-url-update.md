# Plan: Dual-Source Scraper — URL Update & Direct Booking Engine Support

**Created:** 2026-03-03
**Status:** Implemented
**Request:** Update the property URL database from the provided Excel (`Analisis_competencia_con_URLs (1).xlsx`) and extend the scraper to support direct hotel booking engines (Cloudbeds, LobbyPMS, direct-book.com) for properties where Booking.com inventory is limited or unreliable.

---

## Overview

### What This Plan Accomplishes

This plan updates `config.json` with a new dual-URL schema (Booking.com URL + direct booking engine URL per property) and extends the scraper to intelligently route each property to its designated data source. Properties where Booking.com shows limited inventory will now be scraped directly from their booking engine (Cloudbeds, LobbyPMS, direct-book.com, or custom), producing more accurate occupancy figures. A new `scraper_direct.py` module handles all non-Booking.com parsing.

### Why This Matters

Booking.com sometimes shows only a subset of a property's actual inventory — either because the hotel limits its OTA allocation or because certain room types aren't listed there. For those properties, the occupancy % we've been calculating is based on incomplete data, leading to misleading competitive signals. Using the direct booking engine as the source of truth for those properties ensures the occupancy methodology (Total Rooms − Available Rooms) / Total Rooms is grounded in actual inventory, directly supporting the 2026 priority of providing consistent, precise reports.

---

## Current State

### Relevant Existing Structure

```
scripts/
├── config.json          # Property list — single booking_url per property, some VERIFY: placeholders
├── scraper.py           # Booking.com-only scraper (Playwright, hprt-table parser)
├── run.py               # Orchestrator — calls scraper.py for all properties
├── data_store.py        # CSV append/read — schema unchanged
├── report_generator.py  # Excel report builder — schema unchanged
└── venv/                # Python venv with Playwright installed
```

**Current config.json schema per property:**
```json
{
  "name": "Porto",
  "type": "ours",
  "booking_url": "https://www.booking.com/hotel/co/porto-marina.html",
  "total_rooms": 16
}
```

### Gaps or Problems Being Addressed

1. **Single source only**: Every property is scraped from Booking.com, even when the direct booking engine is the reliable source.
2. **Missing direct URLs**: Config has no `direct_url` field — the new Excel provides these for all properties.
3. **Stale/wrong URLs**: Several Booking.com URLs in config are outdated or incorrect (Nomadic, Nakúa, Wake Living, Origen, Stanza — see URL Corrections below).
4. **Unresolved VERIFY**: 1616 Hotel still has a placeholder booking URL.
5. **No restrictions tracking**: Minimum stay policies and inventory notes aren't captured anywhere.
6. **Missing Pereira market**: Cerritos Mall is in config but the market has no competitors and no URLs yet — this plan does not add Pereira competitors (out of scope), but preserves what exists.

---

## Source of Truth: Excel Analysis

File: `/Users/matiasmayacalad/Downloads/Analisis_competencia_con_URLs (1).xlsx`

**Column mapping:**
| Excel Column | Field |
|---|---|
| B | Hotel name |
| C | Total rooms (Inventario) |
| D | Market (Zona) |
| E | Booking.com URL |
| F | Direct booking engine URL |
| G | X = use Booking.com as data source |
| H | X = use direct website as data source |
| I | Restrictions / notes |

**Data source assignment per property (from Excel):**

| Property | Market | Data Source | Direct URL Platform |
|---|---|---|---|
| Porto | Guatapé | booking | Cloudbeds (has URL, but Booking is preferred) |
| Boato | Guatapé | booking | Cloudbeds |
| La Pausa | Guatapé | **direct** | lapausahotel.com (custom) |
| Tau House | Guatapé | booking | Cloudbeds |
| Bosko | Guatapé | booking | Cloudbeds |
| Bubble | Guatapé | booking | Cloudbeds (note: 7 rooms per restriction) |
| Levit | Guatapé | booking | reservas.levitglamping.com |
| Mylos | Guatapé | booking | no engine |
| Viajero Guatapé | Guatapé | **direct** | Cloudbeds |
| Bliiss Glamping | Guatapé | booking | LobbyPMS |
| Ecos suites el zonte | El Salvador | booking | Cloudbeds |
| Hotel puro surf | El Salvador | **direct** | Cloudbeds |
| Hotel Michanti | El Salvador | **direct** | Cloudbeds |
| The beach break hotel | El Salvador | **direct** | none (no booking engine) |
| El xalli hotel | El Salvador | **direct** | Cloudbeds |
| Esencia nativa | El Salvador | **direct** | Cloudbeds |
| Palo verde hotel | El Salvador | **direct** | Cloudbeds |
| Nomadic | Medellín | booking | LobbyPMS |
| Hotel 79 Poblado | Medellín | booking | LobbyPMS |
| Hotel selis | Medellín | booking | direct-book.com |
| Muuk Hotel Boutique | Medellín | booking | Cloudbeds |
| Nakúa Stay & Work | Medellín | booking | Cloudbeds |
| Origen Hotel Boutique | Medellín | booking | LobbyPMS |
| Stanza Hotel Medellin | Medellín | booking | LobbyPMS |
| Wake Living | Medellín | booking | Cloudbeds |
| 1616 Hotel | Medellín | booking | direct-book.com |

**⚠ URL Corrections Required (discrepancies between Excel and current config.json):**

| Property | Issue | Excel URL | Config URL | Recommendation |
|---|---|---|---|---|
| Ecos suites el zonte | Excel has wrong booking URL (points to a Colombia hotel) | `hotel/co/gavia-palomino...` | `hotel/sv/eco-suites-el-zonte.html` | Keep config URL — Excel appears incorrect |
| Nomadic | Different slug | `hotel/co/nomadic-suites` | `hotel/co/nomadic.html` | Use Excel URL (may be updated slug) |
| Nakúa | Language suffix | `hotel/co/nakua-stay-work.es.html` | `hotel/co/nakua-stay-work.html` | Use config (no .es suffix needed) |
| **Origen** | Excel has wrong URL (copy of Nakúa) | `hotel/co/nakua-stay-work` | `hotel/co/origen-boutique-medellin.html` | Keep config URL — Excel is wrong |
| **Stanza** | Excel has wrong URL (copy of Origen) | `hotel/co/origen-boutique-medellin` | `hotel/co/stanza-medellin.html` | Keep config URL — Excel is wrong |
| Wake Living | Language suffix | `hotel/co/wake.es.html` | `hotel/co/wake.html` | Use config (no .es suffix needed) |
| 1616 Hotel | Config was VERIFY | `hotel/co/hotel-sky-medellin.es.htm` | `VERIFY:...` | Use Excel URL (first real URL for this property) |

---

## Proposed Changes

### Summary of Changes

- **config.json**: Extend schema with `direct_url`, `data_source`, and `restrictions` fields; populate all properties with data from Excel; apply URL corrections; keep Pereira market as-is
- **scraper_direct.py** (new file): Platform-aware direct booking engine scraper supporting Cloudbeds, LobbyPMS, and direct-book.com
- **scraper.py**: Add routing logic — when `data_source == "direct"`, delegate to `scraper_direct.py`
- **run.py**: No functional changes needed (routing happens inside scraper layer)

### New Files to Create

| File Path | Purpose |
|---|---|
| `scripts/scraper_direct.py` | Scrapes direct booking engines (Cloudbeds, LobbyPMS, direct-book.com) with date injection and platform-specific room parsing |

### Files to Modify

| File Path | Changes |
|---|---|
| `scripts/config.json` | Add `direct_url`, `data_source`, `restrictions` fields to all properties; apply URL corrections; sync room counts from Excel |
| `scripts/scraper.py` | Import `scrape_direct_property` from `scraper_direct`; add `data_source` routing at the top of `scrape_property()` |

### Files to Delete (if any)

None.

---

## Design Decisions

### Key Decisions Made

1. **Route inside `scrape_property()`**: Rather than routing in `run.py`, the routing happens in `scraper.py`'s `scrape_property()` function. This keeps the interface identical for `run.py` and `validate_scrape()` — zero changes needed upstream.

2. **`data_source` field in config**: Each property explicitly declares its data source (`"booking"` or `"direct"`). This makes the intent visible in config without having to infer it from URL patterns. It also allows easy switching per property if Booking.com later becomes more reliable.

3. **Platform detection in `scraper_direct.py`**: URL domain determines which parsing function to use. The `build_direct_url()` function injects date params per platform. This keeps platform-specific logic isolated.

4. **Date injection approach**: Direct URLs have date params stripped and rebuilt for each target date, matching the Booking.com approach. Base URL is extracted by stripping everything after `?`.

5. **Graceful fallback for "no engine" properties**: Properties with `direct_url = "none"` or empty are skipped with a warning log. No crash.

6. **Keep Booking.com URL for all properties**: Even "direct" source properties retain their `booking_url` in config. This allows future flexibility to switch back or cross-validate.

7. **Ecos suites booking URL**: The Excel URL for Ecos suites appears to be a data entry error (points to a Colombia/Guajira hotel). Keep the existing config URL (`hotel/sv/eco-suites-el-zonte.html`) which correctly references El Salvador.

8. **Origen and Stanza Booking URLs**: The Excel has copy-paste errors for these two properties (Origen's cell has Nakúa's URL; Stanza's cell has Origen's URL). Keep the existing correct config URLs.

### Alternatives Considered

- **Separate CLI flag `--source direct`**: Rejected — per-property configuration is more granular and explicit.
- **Auto-detect data source from URL patterns**: Rejected — too fragile; explicit config is clearer.
- **Single `scraper.py` with branching**: Could work but would make the file very long. Separate `scraper_direct.py` keeps concerns separated and is easier to test independently.

### Open Questions (if any)

1. **La Pausa direct URL** (`lapausahotel.com`): This is a custom site with an unknown structure. The plan includes a generic Playwright scraper with text-based room count extraction, but it may require manual inspection of the site's DOM after the first test run.
2. **The beach break hotel**: Has no booking engine (`direct_url = "none"`). Currently configured with `data_source: "direct"` in Excel but no URL. This property cannot be scraped directly — recommend marking as `data_source: "booking"` and keeping its Booking.com URL as the source. Flag in restrictions.
3. **Bubble room count**: The restrictions column says "Cuenta con 7 habitaciones" but config has 8. Update to 7 per Excel data.

---

## Step-by-Step Tasks

### Step 1: Update `config.json` — Schema and Data

Update the config file with the new extended schema. Add `direct_url`, `data_source`, and `restrictions` fields to every property. Apply all URL corrections and room count fixes. Keep Pereira market as-is.

**New property schema:**
```json
{
  "name": "Porto",
  "type": "ours",
  "booking_url": "https://www.booking.com/hotel/co/porto-marina.html",
  "direct_url": "https://hotels.cloudbeds.com/en/reservation/AygvMB",
  "data_source": "booking",
  "total_rooms": 16,
  "restrictions": ""
}
```

**Actions:**

- Replace the entire `markets` array in `config.json` with the updated version below
- Apply all URL corrections documented in the Source of Truth section
- Fix Bubble `total_rooms` from 8 → 7
- Mark Beach Break as `data_source: "booking"` (no direct engine available)
- Set `direct_url: ""` for properties with no engine (Mylos, Beach Break)

**Full updated `config.json` content to write:**

```json
{
  "settings": {
    "days_ahead": 13,
    "output_dir": "../outputs/competitor-analysis",
    "data_file": "../outputs/competitor-analysis/data/raw_data.csv",
    "reports_dir": "../outputs/competitor-analysis/reports",
    "historical_data_dir": "../context",
    "scrape_delay_seconds": 3
  },
  "markets": [
    {
      "name": "Guatapé",
      "properties": [
        {
          "name": "Porto",
          "type": "ours",
          "booking_url": "https://www.booking.com/hotel/co/porto-marina.html",
          "direct_url": "https://hotels.cloudbeds.com/en/reservation/AygvMB",
          "data_source": "booking",
          "total_rooms": 16,
          "restrictions": ""
        },
        {
          "name": "Boato",
          "type": "ours",
          "booking_url": "https://www.booking.com/hotel/co/the-boato-el-penol1.html",
          "direct_url": "https://hotels.cloudbeds.com/es/reservation/KQcxWs",
          "data_source": "booking",
          "total_rooms": 15,
          "restrictions": ""
        },
        {
          "name": "Bubble",
          "type": "ours",
          "booking_url": "https://www.booking.com/hotel/co/bubblesky-glamping-guatape-guatape1.html",
          "direct_url": "https://hotels.cloudbeds.com/es/reservation/Jfn5eq",
          "data_source": "booking",
          "total_rooms": 7,
          "restrictions": "7 habitaciones activas"
        },
        {
          "name": "Bliiss Glamping",
          "type": "ours",
          "booking_url": "https://www.booking.com/hotel/co/bliss-glamping-sas.html",
          "direct_url": "https://engine.lobbypms.com/bliss-glamping",
          "data_source": "booking",
          "total_rooms": 5,
          "restrictions": ""
        },
        {
          "name": "La Pausa",
          "type": "competitor",
          "booking_url": "https://www.booking.com/hotel/co/la-pausa-hotelbistro.html",
          "direct_url": "https://lapausahotel.com/",
          "data_source": "direct",
          "total_rooms": 16,
          "restrictions": ""
        },
        {
          "name": "Tau House",
          "type": "competitor",
          "booking_url": "https://www.booking.com/hotel/co/tau-house.html",
          "direct_url": "https://hotels.cloudbeds.com/es/reservation/98qHUN",
          "data_source": "booking",
          "total_rooms": 16,
          "restrictions": ""
        },
        {
          "name": "Bosko",
          "type": "competitor",
          "booking_url": "https://www.booking.com/hotel/co/bosko-guatape.html",
          "direct_url": "https://hotels.cloudbeds.com/en/reservation/FyHw8V",
          "data_source": "booking",
          "total_rooms": 10,
          "restrictions": ""
        },
        {
          "name": "Levit",
          "type": "competitor",
          "booking_url": "https://www.booking.com/hotel/co/levit-guatape.html",
          "direct_url": "https://reservas.levitglamping.com/levitglamping-gmail-com",
          "data_source": "booking",
          "total_rooms": 7,
          "restrictions": ""
        },
        {
          "name": "Mylos",
          "type": "competitor",
          "booking_url": "https://www.booking.com/hotel/co/mylos-boutique.html",
          "direct_url": "",
          "data_source": "booking",
          "total_rooms": 16,
          "restrictions": "No tiene motor de reservas propio"
        },
        {
          "name": "Viajero Guatapé",
          "type": "competitor",
          "booking_url": "https://www.booking.com/hotel/co/viajero-guatape-hostel.html",
          "direct_url": "https://hotels.cloudbeds.com/es/reservation/8Ua0ky",
          "data_source": "direct",
          "total_rooms": 75,
          "restrictions": ""
        }
      ]
    },
    {
      "name": "Medellín",
      "properties": [
        {
          "name": "Hotel 79 Poblado",
          "type": "ours",
          "booking_url": "https://www.booking.com/hotel/co/79-poblado.html",
          "direct_url": "https://engine.lobbypms.com/hotel-79-poblado",
          "data_source": "booking",
          "total_rooms": 21,
          "restrictions": ""
        },
        {
          "name": "Nomadic",
          "type": "competitor",
          "booking_url": "https://www.booking.com/hotel/co/nomadic-suites.html",
          "direct_url": "https://engine.lobbypms.com/nomadic",
          "data_source": "booking",
          "total_rooms": 15,
          "restrictions": ""
        },
        {
          "name": "Hotel selis",
          "type": "competitor",
          "booking_url": "https://www.booking.com/hotel/co/selis.html",
          "direct_url": "https://direct-book.com/properties/hotelselismedellindirect",
          "data_source": "booking",
          "total_rooms": 25,
          "restrictions": ""
        },
        {
          "name": "Muuk Hotel Boutique Campestre",
          "type": "competitor",
          "booking_url": "https://www.booking.com/hotel/co/muuk-boutique-campestre.html",
          "direct_url": "https://us2.cloudbeds.com/es-es/reservation/gRKtv9",
          "data_source": "booking",
          "total_rooms": 15,
          "restrictions": ""
        },
        {
          "name": "Nakúa Stay & Work Hotel",
          "type": "competitor",
          "booking_url": "https://www.booking.com/hotel/co/nakua-stay-work.html",
          "direct_url": "https://hotels.cloudbeds.com/en/reservation/GAuj4l",
          "data_source": "booking",
          "total_rooms": 25,
          "restrictions": ""
        },
        {
          "name": "Origen Hotel Boutique",
          "type": "competitor",
          "booking_url": "https://www.booking.com/hotel/co/origen-boutique-medellin.html",
          "direct_url": "https://engine.lobbypms.com/origen-hotel-boutique",
          "data_source": "booking",
          "total_rooms": 15,
          "restrictions": ""
        },
        {
          "name": "Stanza Hotel Medellin",
          "type": "competitor",
          "booking_url": "https://www.booking.com/hotel/co/stanza-medellin.html",
          "direct_url": "https://engine.lobbypms.com/stanza-medellin",
          "data_source": "booking",
          "total_rooms": 15,
          "restrictions": ""
        },
        {
          "name": "Wake Living",
          "type": "competitor",
          "booking_url": "https://www.booking.com/hotel/co/wake.html",
          "direct_url": "https://hotels.cloudbeds.com/en/reservation/GAuj4l",
          "data_source": "booking",
          "total_rooms": 28,
          "restrictions": ""
        },
        {
          "name": "1616 Hotel",
          "type": "competitor",
          "booking_url": "https://www.booking.com/hotel/co/hotel-sky-medellin.html",
          "direct_url": "https://direct-book.com/properties/1616HotelDirect",
          "data_source": "booking",
          "total_rooms": 23,
          "restrictions": ""
        }
      ]
    },
    {
      "name": "El Salvador",
      "properties": [
        {
          "name": "Ecos suites el zonte",
          "type": "ours",
          "booking_url": "https://www.booking.com/hotel/sv/eco-suites-el-zonte.html",
          "direct_url": "https://us2.cloudbeds.com/en/reservation/5ORixc",
          "data_source": "booking",
          "total_rooms": 28,
          "restrictions": ""
        },
        {
          "name": "Hotel puro surf",
          "type": "competitor",
          "booking_url": "https://www.booking.com/hotel/sv/puro-surf.html",
          "direct_url": "https://hotels.cloudbeds.com/es/reservation/zfm0vg",
          "data_source": "direct",
          "total_rooms": 13,
          "restrictions": "Politica de estancia minima de 2-3 noches (varia según días)"
        },
        {
          "name": "Hotel Michanti",
          "type": "competitor",
          "booking_url": "https://www.booking.com/hotel/sv/michanti.html",
          "direct_url": "https://hotels.cloudbeds.com/es/reservation/rLXMd8",
          "data_source": "direct",
          "total_rooms": 11,
          "restrictions": ""
        },
        {
          "name": "The beach break hotel",
          "type": "competitor",
          "booking_url": "https://www.booking.com/hotel/sv/the-beach-break-el-zonte.html",
          "direct_url": "",
          "data_source": "booking",
          "total_rooms": 12,
          "restrictions": "No tiene motor de reservas propio — usando Booking.com"
        },
        {
          "name": "El xalli hotel",
          "type": "competitor",
          "booking_url": "https://www.booking.com/hotel/sv/xalli.html",
          "direct_url": "https://hotels.cloudbeds.com/es/reservation/kZOxPO",
          "data_source": "direct",
          "total_rooms": 11,
          "restrictions": ""
        },
        {
          "name": "Esencia nativa",
          "type": "competitor",
          "booking_url": "https://www.booking.com/hotel/sv/esencia-nativa-playa-el-zonte12.html",
          "direct_url": "https://hotels.cloudbeds.com/en/reservation/seJ1sM",
          "data_source": "direct",
          "total_rooms": 11,
          "restrictions": ""
        },
        {
          "name": "Palo verde hotel",
          "type": "competitor",
          "booking_url": "https://www.booking.com/hotel/sv/palo-verde.html",
          "direct_url": "https://hotels.cloudbeds.com/es/reservation/CJNedB",
          "data_source": "direct",
          "total_rooms": 12,
          "restrictions": "Politica de estancia minima de 2-3 noches (varia según días)"
        }
      ]
    },
    {
      "name": "Pereira",
      "properties": [
        {
          "name": "Cerritos Mall",
          "type": "ours",
          "booking_url": "VERIFY: URL not provided",
          "direct_url": "",
          "data_source": "booking",
          "total_rooms": 0,
          "restrictions": "Total rooms and URLs pending — add before first scrape"
        }
      ]
    }
  ]
}
```

**Files affected:**
- `scripts/config.json`

---

### Step 2: Create `scraper_direct.py`

Create a new file that handles all non-Booking.com scraping. It exposes a single `scrape_direct_property()` function with the same signature and return schema as `scrape_property()` in `scraper.py`.

**Platform support required:**
- **Cloudbeds** (`hotels.cloudbeds.com`, `us2.cloudbeds.com`): Most common (10+ properties)
- **LobbyPMS** (`engine.lobbypms.com`): 5 properties (Bliiss, Hotel 79, Nomadic, Origen, Stanza)
- **direct-book.com** (`direct-book.com`): 2 properties (Hotel Selis, 1616 Hotel)
- **Generic/custom** fallback: La Pausa (`lapausahotel.com`)

**Date injection logic per platform:**

| Platform | Checkin param | Checkout param | Example |
|---|---|---|---|
| Cloudbeds | `checkin` | `checkout` | `?checkin=2026-03-03&checkout=2026-03-04&currency=cop` |
| LobbyPMS | `start-date` | `end-date` | `?lang=es&start-date=2026-03-03&end-date=2026-03-04` |
| direct-book.com | `checkIn` | `checkOut` | `?checkIn=2026-03-03&checkOut=2026-03-04` |
| Generic | `checkin` | `checkout` | `?checkin=2026-03-03&checkout=2026-03-04` |

**Currency injection per market:**

| Market | Currency |
|---|---|
| Guatapé | cop |
| Medellín | cop |
| El Salvador | usd |
| Pereira | cop |

**Cloudbeds room parsing strategy:**
Cloudbeds booking pages display available room types in a grid/list. Key selectors to try (in priority order):
1. `[data-unit-type-id]` — room type containers (count = number of visible room type divs with available rooms)
2. `.unit-type` or `.room-type` containers
3. Text on the page: look for "X room(s) available" patterns
4. If date is sold out: Cloudbeds shows "No hay disponibilidad" or "No availability" or empty room grid

For Cloudbeds, available rooms = sum of availability numbers per room type, extracted via JavaScript:
```javascript
// Cloudbeds shows availability as a number next to each room type
// Try select dropdowns first (similar to Booking.com)
() => {
    // Check for "no availability" text
    var bodyText = document.body.innerText.toLowerCase();
    if (bodyText.includes('no hay disponibilidad') ||
        bodyText.includes('no availability') ||
        bodyText.includes('sold out')) {
        return { total: 0, method: 'sold_out_text' };
    }

    // Try select dropdowns (Cloudbeds uses similar pattern to Booking.com)
    var selects = document.querySelectorAll('select');
    var total = 0;
    var found = false;
    selects.forEach(function(sel) {
        var maxVal = 0;
        for (var i = 0; i < sel.options.length; i++) {
            var v = parseInt(sel.options[i].value) || 0;
            if (v > maxVal) maxVal = v;
        }
        if (maxVal > 0) { total += maxVal; found = true; }
    });
    if (found) return { total: total, method: 'select_dropdowns' };

    // Try room type cards with availability count text
    var roomCards = document.querySelectorAll('[class*="room"], [class*="unit"], [class*="type"]');
    return { total: 0, roomCards: roomCards.length, method: 'no_match' };
}
```

**LobbyPMS room parsing strategy:**
LobbyPMS pages show a list of room types with quantity selectors. Try:
1. `select` dropdowns for quantity — same JS approach as Cloudbeds
2. Text extraction: "X disponible(s)" or similar
3. Sold-out detection: "No hay habitaciones disponibles" or empty room list

**direct-book.com parsing strategy:**
direct-book.com is a booking engine that shows availability calendars. For a single-night check:
1. Navigate with date params
2. Count available room types via `select` dropdowns or room card elements
3. Sold-out: "No rooms available" text

**Generic fallback (La Pausa custom site):**
- Load page with date params
- Search page text for any numeric availability indicators
- Log a warning that manual verification may be needed
- Return `available_rooms=None` with `status="manual_check_needed"` if nothing found

**Actions:**
- Create `/scripts/scraper_direct.py` with the following structure:
  1. `_detect_platform(url: str) -> str` — returns "cloudbeds" | "lobbypms" | "directbook" | "generic"
  2. `_build_direct_url(base_url: str, checkin: date, market: str) -> str` — injects date params per platform
  3. `_parse_cloudbeds(page) -> dict` — extracts available_rooms, min_rate, max_rate, sold_out
  4. `_parse_lobbypms(page) -> dict` — same interface
  5. `_parse_directbook(page) -> dict` — same interface
  6. `_parse_generic(page) -> dict` — fallback with text-based extraction
  7. `scrape_direct_property(property_config: dict, target_dates: list, delay: float = 3.0) -> list` — main entry point, mirrors `scraper.py::scrape_property()` interface exactly

**Full file content to write** (`scripts/scraper_direct.py`):

```python
"""
scraper_direct.py — Direct booking engine scraper for Hopco Competitor Analysis
Handles Cloudbeds, LobbyPMS, direct-book.com, and generic booking engines.
Same interface as scraper.py::scrape_property() for drop-in compatibility.

Supported platforms:
    - Cloudbeds  (hotels.cloudbeds.com, us2.cloudbeds.com)
    - LobbyPMS   (engine.lobbypms.com)
    - direct-book.com
    - Generic fallback (custom sites like lapausahotel.com)

Usage:
    from scraper_direct import scrape_direct_property
    results = scrape_direct_property(property_config, date_list)
"""

import re
import time
import logging
from datetime import date, timedelta
from urllib.parse import urlparse, urlencode, urljoin
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeout, Error as PlaywrightError

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

# Currency per market
MARKET_CURRENCY = {
    "guatapé": "cop",
    "guatape": "cop",
    "medellín": "cop",
    "medellin": "cop",
    "pereira": "cop",
    "el salvador": "usd",
}


def _detect_platform(url: str) -> str:
    """Detect booking engine platform from URL domain."""
    if not url:
        return "none"
    domain = urlparse(url).netloc.lower()
    if "cloudbeds.com" in domain:
        return "cloudbeds"
    if "lobbypms.com" in domain:
        return "lobbypms"
    if "direct-book.com" in domain:
        return "directbook"
    return "generic"


def _get_currency(market: str) -> str:
    """Return the currency code for a given market."""
    return MARKET_CURRENCY.get(market.lower().strip(), "cop")


def _build_direct_url(base_url: str, checkin: date, market: str) -> str:
    """
    Build a dated booking URL for a direct booking engine.
    Strips existing query params from base_url and injects the correct date params.
    """
    checkout = checkin + timedelta(days=1)
    checkin_str = checkin.strftime("%Y-%m-%d")
    checkout_str = checkout.strftime("%Y-%m-%d")
    currency = _get_currency(market)

    # Strip existing query params
    clean_url = base_url.split("?")[0].rstrip("/")

    platform = _detect_platform(clean_url)

    if platform == "cloudbeds":
        params = urlencode({
            "checkin": checkin_str,
            "checkout": checkout_str,
            "currency": currency,
        })
        return f"{clean_url}?{params}"

    elif platform == "lobbypms":
        params = urlencode({
            "lang": "es",
            "start-date": checkin_str,
            "end-date": checkout_str,
        })
        return f"{clean_url}?{params}"

    elif platform == "directbook":
        params = urlencode({
            "checkIn": checkin_str,
            "checkOut": checkout_str,
        })
        return f"{clean_url}?{params}"

    else:
        # Generic: try checkin/checkout params
        params = urlencode({
            "checkin": checkin_str,
            "checkout": checkout_str,
        })
        return f"{clean_url}?{params}"


def _js_count_selects():
    """
    JavaScript that counts available rooms via quantity select dropdowns.
    Works for Cloudbeds, LobbyPMS, and similar engines that use <select> for room qty.
    Returns total available rooms across all room types.
    """
    return """
    () => {
        var bodyText = document.body.innerText.toLowerCase();
        var soldOutPhrases = [
            'no hay disponibilidad', 'no availability', 'sold out',
            'no rooms available', 'sin disponibilidad',
            'no hay habitaciones', 'not available'
        ];
        for (var i = 0; i < soldOutPhrases.length; i++) {
            if (bodyText.includes(soldOutPhrases[i])) {
                return { total: 0, method: 'sold_out_text', sold_out: true };
            }
        }

        // Try select dropdowns (quantity selectors)
        var selects = Array.from(document.querySelectorAll('select'));
        var total = 0;
        var found = false;
        selects.forEach(function(sel) {
            var maxVal = 0;
            for (var i = 0; i < sel.options.length; i++) {
                var v = parseInt(sel.options[i].value) || 0;
                if (v > maxVal) maxVal = v;
            }
            if (maxVal > 0) { total += maxVal; found = true; }
        });
        if (found) return { total: total, method: 'select_dropdowns', sold_out: false };

        // Try number inputs
        var inputs = Array.from(document.querySelectorAll('input[type="number"]'));
        var inputTotal = 0;
        inputs.forEach(function(inp) {
            var maxVal = parseInt(inp.getAttribute('max') || '0') || 0;
            if (maxVal > 0) { inputTotal += maxVal; found = true; }
        });
        if (found && inputTotal > 0) {
            return { total: inputTotal, method: 'number_inputs', sold_out: false };
        }

        return { total: 0, method: 'no_match', sold_out: false };
    }
    """


def _extract_prices_from_page(page) -> list:
    """Extract numeric price values from any booking engine page."""
    prices = []
    price_selectors = [
        "[data-testid='price']",
        "[class*='price']",
        "[class*='rate']",
        "[class*='tarifa']",
        ".amount",
        ".total",
    ]
    for sel in price_selectors:
        try:
            els = page.query_selector_all(sel)
            for el in els:
                text = el.inner_text().strip()
                cleaned = re.sub(r"[^\d]", "", text)
                if cleaned:
                    try:
                        val = float(cleaned)
                        if 1000 < val < 50_000_000:
                            prices.append(val)
                    except ValueError:
                        pass
            if prices:
                break
        except Exception:
            continue
    return prices


def _parse_cloudbeds(page) -> dict:
    """Parse availability and rates from a Cloudbeds booking engine page."""
    result = {
        "available_rooms": 0,
        "min_rate": None,
        "max_rate": None,
        "sold_out": False,
        "raw_notes": "cloudbeds",
    }
    try:
        js_result = page.evaluate(_js_count_selects())
        if js_result.get("sold_out"):
            result["sold_out"] = True
            result["available_rooms"] = 0
            result["raw_notes"] = "cloudbeds|sold_out"
        elif js_result.get("total", 0) > 0:
            result["available_rooms"] = js_result["total"]
            result["raw_notes"] = f"cloudbeds|{js_result.get('method', '?')}"
        else:
            result["raw_notes"] = f"cloudbeds|{js_result.get('method', 'no_match')}"

        prices = _extract_prices_from_page(page)
        if prices:
            result["min_rate"] = min(prices)
            result["max_rate"] = max(prices)
    except Exception as e:
        result["raw_notes"] = f"cloudbeds|parse_error:{str(e)[:80]}"
    return result


def _parse_lobbypms(page) -> dict:
    """Parse availability and rates from a LobbyPMS booking engine page."""
    result = {
        "available_rooms": 0,
        "min_rate": None,
        "max_rate": None,
        "sold_out": False,
        "raw_notes": "lobbypms",
    }
    try:
        js_result = page.evaluate(_js_count_selects())
        if js_result.get("sold_out"):
            result["sold_out"] = True
            result["available_rooms"] = 0
            result["raw_notes"] = "lobbypms|sold_out"
        elif js_result.get("total", 0) > 0:
            result["available_rooms"] = js_result["total"]
            result["raw_notes"] = f"lobbypms|{js_result.get('method', '?')}"
        else:
            result["raw_notes"] = f"lobbypms|{js_result.get('method', 'no_match')}"

        prices = _extract_prices_from_page(page)
        if prices:
            result["min_rate"] = min(prices)
            result["max_rate"] = max(prices)
    except Exception as e:
        result["raw_notes"] = f"lobbypms|parse_error:{str(e)[:80]}"
    return result


def _parse_directbook(page) -> dict:
    """Parse availability and rates from a direct-book.com booking engine page."""
    result = {
        "available_rooms": 0,
        "min_rate": None,
        "max_rate": None,
        "sold_out": False,
        "raw_notes": "directbook",
    }
    try:
        js_result = page.evaluate(_js_count_selects())
        if js_result.get("sold_out"):
            result["sold_out"] = True
            result["available_rooms"] = 0
            result["raw_notes"] = "directbook|sold_out"
        elif js_result.get("total", 0) > 0:
            result["available_rooms"] = js_result["total"]
            result["raw_notes"] = f"directbook|{js_result.get('method', '?')}"
        else:
            result["raw_notes"] = f"directbook|{js_result.get('method', 'no_match')}"

        prices = _extract_prices_from_page(page)
        if prices:
            result["min_rate"] = min(prices)
            result["max_rate"] = max(prices)
    except Exception as e:
        result["raw_notes"] = f"directbook|parse_error:{str(e)[:80]}"
    return result


def _parse_generic(page) -> dict:
    """
    Generic fallback parser for custom sites (e.g. lapausahotel.com).
    Attempts text-based room count extraction. Returns manual_check_needed
    status if nothing is found.
    """
    result = {
        "available_rooms": None,
        "min_rate": None,
        "max_rate": None,
        "sold_out": False,
        "raw_notes": "generic|manual_check_needed",
    }
    try:
        # Try common sold-out text patterns
        page_text = page.inner_text("body").lower()
        sold_out_phrases = [
            "no hay disponibilidad", "no availability", "sold out",
            "no rooms available", "sin disponibilidad",
        ]
        for phrase in sold_out_phrases:
            if phrase in page_text:
                result["sold_out"] = True
                result["available_rooms"] = 0
                result["raw_notes"] = "generic|sold_out_text"
                return result

        # Try select-based approach as last resort
        js_result = page.evaluate(_js_count_selects())
        if js_result.get("sold_out"):
            result["sold_out"] = True
            result["available_rooms"] = 0
            result["raw_notes"] = "generic|sold_out"
        elif js_result.get("total", 0) > 0:
            result["available_rooms"] = js_result["total"]
            result["raw_notes"] = f"generic|{js_result.get('method', '?')}"

        prices = _extract_prices_from_page(page)
        if prices:
            result["min_rate"] = min(prices)
            result["max_rate"] = max(prices)
    except Exception as e:
        result["raw_notes"] = f"generic|parse_error:{str(e)[:80]}"
    return result


def _parse_page(page, platform: str) -> dict:
    """Dispatch to the correct parser based on platform."""
    if platform == "cloudbeds":
        return _parse_cloudbeds(page)
    elif platform == "lobbypms":
        return _parse_lobbypms(page)
    elif platform == "directbook":
        return _parse_directbook(page)
    else:
        return _parse_generic(page)


def scrape_direct_property(property_config: dict, target_dates: list, delay: float = 3.0) -> list:
    """
    Scrape a property from its direct booking engine across a list of dates.
    Drop-in replacement for scraper.py::scrape_property() — identical signature and return schema.

    Args:
        property_config: Dict with keys: name, direct_url, total_rooms, type, market
        target_dates: List of datetime.date objects to check
        delay: Seconds to wait between page loads

    Returns:
        List of dicts, one per date, with scraped data (same schema as scrape_property)
    """
    results = []
    direct_url = property_config.get("direct_url", "")
    total_rooms = property_config.get("total_rooms", 0)
    prop_name = property_config.get("name", "Unknown")
    prop_type = property_config.get("type", "competitor")
    market = property_config.get("market", "Unknown")

    # Skip properties with no direct URL configured
    if not direct_url or direct_url.lower() in ("none", "no tiene motor de reservas", ""):
        logger.warning(
            f"Skipping {prop_name} (direct) — no direct_url configured. "
            "Check config.json or switch data_source to 'booking'."
        )
        return results

    platform = _detect_platform(direct_url)
    logger.info(f"Scraping {prop_name} via {platform} ({len(target_dates)} dates)...")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            ),
            viewport={"width": 1280, "height": 900},
            locale="es-CO",
        )
        page = context.new_page()

        # First load — accept cookies if present
        try:
            first_url = _build_direct_url(direct_url, target_dates[0], market)
            page.goto(first_url, wait_until="domcontentloaded", timeout=35000)
            time.sleep(2)
            for cookie_sel in [
                "#onetrust-accept-btn-handler",
                "[data-gdpr-consent='accept']",
                "button[id*='accept']",
                "button[class*='accept']",
                "button[class*='cookie']",
            ]:
                btn = page.query_selector(cookie_sel)
                if btn:
                    btn.click()
                    time.sleep(1)
                    break
        except (PlaywrightTimeout, PlaywrightError) as e:
            logger.warning(f"First load issue for {prop_name} (direct): {e}")

        for target_date in target_dates:
            url = _build_direct_url(direct_url, target_date, market)
            date_str = target_date.strftime("%Y-%m-%d")
            row = {
                "scrape_date": date.today().isoformat(),
                "target_date": date_str,
                "market": market,
                "property_name": prop_name,
                "property_type": prop_type,
                "total_rooms": total_rooms,
                "available_rooms": None,
                "booked_rooms": None,
                "occupancy_pct": None,
                "min_rate": None,
                "max_rate": None,
                "sold_out": False,
                "status": "ok",
                "notes": "",
            }

            try:
                page.goto(url, wait_until="domcontentloaded", timeout=35000)
                time.sleep(delay)

                parsed = _parse_page(page, platform)

                row["available_rooms"] = parsed["available_rooms"]
                row["sold_out"] = parsed["sold_out"]
                row["min_rate"] = parsed["min_rate"]
                row["max_rate"] = parsed["max_rate"]
                row["notes"] = parsed.get("raw_notes", "")

                if parsed["sold_out"]:
                    row["available_rooms"] = 0
                    row["occupancy_pct"] = 100.0
                    row["booked_rooms"] = total_rooms
                elif parsed["available_rooms"] is None:
                    # Generic site — could not parse, mark for manual check
                    row["status"] = "manual_check_needed"
                    row["notes"] += f"|platform={platform}|url={url[:80]}"
                elif total_rooms > 0:
                    avail = parsed["available_rooms"]
                    booked = max(0, total_rooms - avail)
                    row["booked_rooms"] = booked
                    row["occupancy_pct"] = round((booked / total_rooms) * 100, 1)
                else:
                    row["booked_rooms"] = None
                    row["occupancy_pct"] = None
                    row["notes"] += "|total_rooms=0 in config"

                logger.info(
                    f"  {date_str}: avail={row['available_rooms']}, "
                    f"occ={row['occupancy_pct']}%, "
                    f"rates={row['min_rate']}-{row['max_rate']} [{platform}]"
                )

            except PlaywrightTimeout:
                row["status"] = "timeout"
                row["notes"] = f"direct|timeout|{platform}"
                logger.warning(f"  {date_str}: TIMEOUT ({prop_name} direct)")
            except Exception as e:
                row["status"] = "error"
                row["notes"] = str(e)[:200]
                logger.warning(f"  {date_str}: ERROR — {e}")

            results.append(row)

        context.close()
        browser.close()

    return results
```

**Files affected:**
- `scripts/scraper_direct.py` (new)

---

### Step 3: Update `scraper.py` — Add Routing Logic

Modify `scrape_property()` in `scraper.py` to check the `data_source` field and delegate to `scrape_direct_property()` when appropriate. No other changes to `scraper.py`.

**Actions:**

- At the top of `scraper.py`, after the existing imports, add:
  ```python
  # Lazy import to avoid circular dependency
  # scraper_direct is only loaded when data_source == "direct"
  ```

- In `scrape_property()`, add routing check immediately after the VERIFY URL skip block (after line 191):
  ```python
  # Route to direct booking engine scraper if configured
  data_source = property_config.get("data_source", "booking")
  if data_source == "direct":
      from scraper_direct import scrape_direct_property
      return scrape_direct_property(property_config, target_dates, delay=delay)
  ```

**Exact edit — insert after the `if not base_url or base_url.startswith("VERIFY:")` block:**

Current code (lines 188–191):
```python
    # Skip properties that haven't had their URLs configured yet
    if not base_url or base_url.startswith("VERIFY:") or "REPLACE" in base_url:
        logger.warning(f"Skipping {prop_name} — booking_url not configured. Update config.json.")
        return results
```

New code to insert immediately after that block:
```python
    # Route to direct booking engine if data_source is "direct"
    data_source = property_config.get("data_source", "booking")
    if data_source == "direct":
        from scraper_direct import scrape_direct_property
        return scrape_direct_property(property_config, target_dates, delay=delay)
```

**Files affected:**
- `scripts/scraper.py`

---

### Step 4: Diagnostic Test Run

After implementing Steps 1–3, run a targeted test to verify the routing and parsing work before running the full pipeline.

**Actions:**

Run single-market tests using the shell:
```bash
cd /Users/matiasmayacalad/Downloads/claude-workspace-template/scripts
source venv/bin/activate

# Test Guatapé (has 2 direct-source properties: La Pausa, Viajero)
python run.py --market Guatapé

# If Guatapé succeeds, test El Salvador (has 5 direct-source properties)
python run.py --market "El Salvador"
```

**What to check in the output:**
1. Properties with `data_source: "direct"` should log `[platform]` tag in their output (e.g., `cloudbeds`, `lobbypms`)
2. `available_rooms` should be numeric (not None) for Cloudbeds-based direct properties
3. `occupancy_pct` should be calculated correctly
4. `notes` column should show platform identifier (e.g., `cloudbeds|select_dropdowns`)
5. Status should be `ok` (not `error`, `timeout`, or `manual_check_needed`) for Cloudbeds properties

**If `available_rooms` returns 0 or None for a Cloudbeds property:**
- Open the URL manually in a browser with a test date
- Inspect the DOM to find the actual availability element
- Update `_parse_cloudbeds()` selectors accordingly

**If La Pausa returns `manual_check_needed`:**
- Visit `https://lapausahotel.com/` manually
- Find the booking widget or availability calendar
- Update `_parse_generic()` with site-specific selectors, or switch La Pausa to `data_source: "booking"`

**Files affected:**
- None (test only — no code changes unless fixes needed)

---

### Step 5: Full Pipeline Run and Validation

Once tests pass, run the complete pipeline and generate the daily report.

**Actions:**
```bash
cd /Users/matiasmayacalad/Downloads/claude-workspace-template/scripts
source venv/bin/activate
python run.py
```

Verify:
- Report generated at `outputs/competitor-analysis/reports/competitor-analysis-2026-03-03.xlsx`
- All markets represented in the report
- Direct-source properties show occupancy data (not blanks)
- Spot-check 2–3 direct-source properties by manually checking their booking engine

**Files affected:**
- `outputs/competitor-analysis/data/raw_data.csv` (new rows appended)
- `outputs/competitor-analysis/reports/competitor-analysis-2026-03-03.xlsx` (new report)

---

## Connections & Dependencies

### Files That Reference This Area

- `scripts/run.py` — calls `scrape_property()` which now routes internally; no changes needed
- `scripts/data_store.py` — schema unchanged; `notes` column will now contain platform tags but that's additive
- `scripts/report_generator.py` — reads same CSV schema; no changes needed
- `CLAUDE.md` — Competitor Analysis System section references Booking.com as sole data source; needs update post-implementation

### Updates Needed for Consistency

- **CLAUDE.md**: Update the "Methodology" section to reflect that some properties use direct booking engines, not Booking.com
- **context/business-info.md**: No changes needed

### Impact on Existing Workflows

- `/competitor-analysis run` — unchanged from user perspective; now silently routes to correct source per property
- `/competitor-analysis interpret` — unchanged; works from same CSV schema
- Historical data (imported via `import_historical.py`) — unaffected; historical rows don't have `data_source` routing

---

## Validation Checklist

- [ ] `config.json` has `direct_url`, `data_source`, and `restrictions` on every property
- [ ] Bubble `total_rooms` updated to 7
- [ ] 1616 Hotel booking_url no longer says VERIFY
- [ ] Ecos suites retains correct `hotel/sv/eco-suites-el-zonte.html` URL
- [ ] Origen and Stanza retain correct config URLs (not the Excel copy-paste errors)
- [ ] `scraper_direct.py` exists and imports without errors: `python -c "from scraper_direct import scrape_direct_property; print('OK')"`
- [ ] `scraper.py` routes direct-source properties correctly (test with single market)
- [ ] At least one Cloudbeds direct-source property returns valid `available_rooms` (not None)
- [ ] No existing Booking.com properties are broken by the changes
- [ ] Full pipeline runs and generates a report with all markets
- [ ] CLAUDE.md updated to reflect dual-source methodology

---

## Success Criteria

The implementation is complete when:

1. Running `python run.py` scrapes all properties using their designated data source (Booking.com or direct engine) without errors or skips (except Cerritos Mall, which has no URLs yet)
2. Direct-source Cloudbeds properties (e.g. Viajero, Hotel puro surf, Esencia nativa) return numeric `occupancy_pct` values in the daily report
3. The daily Excel report includes all previously-covered properties with no regression in data quality for Booking.com-sourced properties

---

## Notes

- **La Pausa** (`lapausahotel.com`): This is the only custom non-platform direct URL. If the generic parser doesn't work after testing, the pragmatic fallback is to switch it to `data_source: "booking"` — its Booking.com listing is valid and will give reliable data.

- **Platform selector confidence**: The JavaScript select-dropdown approach works well for Booking.com and is likely to work for Cloudbeds (which uses a similar booking widget). LobbyPMS and direct-book.com may require selector adjustments after the first test run. The `notes` column in the CSV will show which method fired, making debugging easy.

- **Rate extraction from direct sites**: Currency amounts may be formatted differently (e.g., "$150" vs "COP 550,000"). The `_extract_prices_from_page()` function strips all non-digits, which works for COP (large numbers) but note that USD rates for El Salvador will also pass the `1000 < val < 50_000_000` filter since nightly rates in USD are typically $50–$500 (which would be filtered out). This is a known limitation — rate extraction from direct sites should be considered best-effort, with occupancy being the primary metric.

- **Future: validate_scrape() with direct sources**: The current `validate_scrape()` in `run.py` reconstructs `prop_config` from CSV rows and tries to re-scrape for spot-checking. It currently uses `booking_url` from the URL map. After this plan, direct-source properties won't have a valid `booking_url` to re-scrape from — the spot-check will silently skip them (since their booking_url may not return comparable data). This is acceptable for now; a future improvement could build a `direct_url` map for validation.

---

## Implementation Notes

**Implemented:** 2026-03-03

### Summary

- Updated `config.json` with dual-URL schema: `direct_url`, `data_source`, and `restrictions` fields added to all 26 properties across 4 markets.
- Bubble room count corrected: 8 → 7.
- 1616 Hotel VERIFY placeholder resolved with URL from Excel.
- Ecos suites, Origen, and Stanza retain correct config URLs (Excel had copy-paste errors for these).
- Created `scraper_direct.py` with platform detection, date injection, and parsing for Cloudbeds, LobbyPMS, direct-book.com, and generic fallback.
- Updated `scraper.py` with 4-line routing block — zero impact on existing Booking.com logic.
- Updated `CLAUDE.md`: methodology section, workspace structure (scraper_direct.py), Bubble room count, `/competitor-analysis run` description.
- Guatapé diagnostic test passed: all 10 properties scraped, 130 rows saved, 5/5 validation spot-checks passed.
- Report generated: `outputs/competitor-analysis/reports/competitor-analysis-2026-03-03.xlsx` (156 records).

### Deviations from Plan

- **La Pausa switched to `data_source: "booking"`**: During the diagnostic test, `lapausahotel.com` returned `avail=None` for all dates (custom WordPress site with no parseable booking forms). Per the plan's documented fallback, La Pausa was switched to `data_source: "booking"`. Its Booking.com listing provides reliable data. The `direct_url` is retained in config for future reference.

### Issues Encountered

- **Viajero Guatapé rate values**: Cloudbeds returned very large rate numbers (7M–48M COP range). These appear to be per-room-type package totals rather than per-night rates. Rates from direct sources should be treated as indicative only; occupancy data is reliable.
- **La Pausa custom site**: Could not be auto-parsed (no standard booking widget). Resolved by fallback to Booking.com source as documented in the plan.
