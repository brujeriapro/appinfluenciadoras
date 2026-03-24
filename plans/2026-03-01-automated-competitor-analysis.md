# Plan: Automated Competitor Analysis System

**Created:** 2026-03-01
**Status:** Implemented
**Request:** Build an automated system that scrapes competitor occupancy and rates from OTAs (Booking.com, Expedia) and direct sites, then generates a daily Excel report comparing Hopco's properties vs the competitive set.

---

## Overview

### What This Plan Accomplishes

This plan creates a Python-based scraping and reporting system that daily collects rate and availability data for Hopco's properties and their competitive sets across all markets, infers competitor occupancy by comparing available vs. total inventory, and produces a formatted multi-sheet Excel workbook stored in `outputs/competitor-analysis/`. A new `/competitor-analysis` workspace command gives one-click access to run the full pipeline.

### Why This Matters

Hopco's core strategic objective is maintaining higher occupancy than the competitive set at the highest sustainable rate. Today this analysis is done manually by checking Booking.com each day — a time-consuming process prone to inconsistency. Automating it delivers a daily, standardized snapshot that revenue managers and the sales team can act on immediately, directly supporting the 2026–2027 priorities of automating repetitive revenue tasks and providing consistent, decision-ready reports.

---

## Current State

### Relevant Existing Structure

```
scripts/          — empty, no existing scripts or conventions
outputs/          — empty, no existing outputs
context/business-info.md   — defines Hopco properties and markets
context/current-data.md    — describes KPIs: ADR, Occupancy %, RevPAR, TRevPOR
context/strategy.md        — 2026 priorities include automation and reporting
.claude/commands/           — 3 existing commands (prime, create-plan, implement)
```

Hopco properties (from `context/business-info.md`):
- **Guatapé market**: Boato Hotel, Porto Marina Hotel, Bubblesky Glamping, Bliss Glamping
- **Medellín/El Poblado market**: Setenta y Nueve Hotel
- **Pereira market**: Cerritos Mall
- **El Salvador market**: Ecosuites El Zonte

### Historical Data Already Collected (to be imported)

The team has been running this analysis manually. The following Excel files exist in `context/` and will be imported into the data store as part of this implementation:

| File | Market | Date Range | Records |
|---|---|---|---|
| `Analisis competencia - Guatape (1).xlsx` | Guatapé | Jan 2025 – Mar 2026 | 3,560 rows |
| `Analisis competencia - Medellín.xlsx` | Medellín | Feb 2026 – Mar 2026 | 171 rows |
| `Analisis competencia - El Salvador.xlsx` | El Salvador | Dec 2025 – Mar 2026 | 925 rows |
| `Analisis competencia - Inventario.xlsx` | All markets | — | Property/room count reference |

Pereira has no historical file — it will start fresh from the first scraper run.

### Gaps or Problems Being Addressed

- No automated way to collect competitor occupancy or rate data
- Manual daily checks are inconsistent and time-consuming
- Historical data exists in Excel but is fragmented across files with no unified view
- No structured report format for the sales and revenue team to use for decisions

---

## Proposed Changes

### Summary of Changes

- Create a Python scraping module using Playwright to pull availability and rates from Booking.com
- Create a CSV-based data store to accumulate daily snapshots
- Create an Excel report generator producing a multi-sheet workbook with color-coded occupancy and rate tables
- Create a main orchestrator script (`run.py`) that runs the full pipeline end-to-end
- Create a `config.json` file defining all properties (ours + comp set), their Booking.com URLs, and total room counts
- Create a `requirements.txt` for Python dependencies
- Create a `/competitor-analysis` slash command in `.claude/commands/`
- Update `CLAUDE.md` to document the new system and command

### New Files to Create

| File Path | Purpose |
|---|---|
| `scripts/config.json` | Defines all properties (Hopco + competitors) for 4 markets, with room counts from inventory |
| `scripts/requirements.txt` | Python dependencies: playwright, openpyxl, pandas, python-dateutil |
| `scripts/scraper.py` | Playwright-based module that scrapes Booking.com for a given property and date range, returns structured data |
| `scripts/data_store.py` | Module that reads/writes the accumulated CSV data store |
| `scripts/import_historical.py` | One-time script that imports the 3 existing Excel files into the CSV data store |
| `scripts/report_generator.py` | Module that reads the CSV data store and generates a formatted Excel report |
| `scripts/run.py` | Orchestrator: loads config, runs scraper for all properties, saves to data store, generates report |
| `outputs/competitor-analysis/data/.gitkeep` | Placeholder to create the data directory |
| `outputs/competitor-analysis/reports/.gitkeep` | Placeholder to create the reports directory |
| `.claude/commands/competitor-analysis.md` | Slash command: `/competitor-analysis` — runs or interprets the competitor analysis |

### Files to Modify

| File Path | Changes |
|---|---|
| `CLAUDE.md` | Add new "Competitor Analysis System" section under Commands, document scripts and outputs structure |

### Files to Delete (if any)

None.

---

## Design Decisions

### Key Decisions Made

1. **Playwright over requests+BeautifulSoup**: Booking.com pages are JavaScript-rendered and protected by Cloudflare. Playwright runs a real browser (headless Chromium), making it far more reliable for extracting dynamic content and avoiding immediate bot detection. It also handles cookie consent dialogs and lazy-loaded content automatically.

2. **Occupancy inference via available-vs-total rooms methodology**: Since Booking.com does not publish actual occupancy, we infer it by comparing known total room count (configured once in `config.json`) against available rooms scraped for each date. Formula: `Occupancy % = (Total Rooms − Available Rooms) / Total Rooms × 100`. When a property is fully sold out for a date, occupancy = 100%. This is the same methodology Hopco currently uses manually.

3. **CSV as the intermediate data store**: Simple, portable, human-readable, and can be opened in Excel at any time without tooling. Each daily run appends rows — never overwrites. This builds a historical archive over time.

4. **Excel output with openpyxl**: openpyxl is the most capable Python Excel library for formatting (cell colors, borders, number formats). It does not require Microsoft Office. The output is a proper `.xlsx` file that any team member can open.

5. **Multi-sheet workbook per market**: Splitting output by market (Guatapé, Poblado, Pereira, El Salvador) keeps each sheet focused. Revenue managers for each market see only their data, without scrolling through other markets.

6. **Configuration-driven property list**: All property details (name, Booking.com URL, total rooms, market, type=ours/comp) live in `config.json`. Adding or removing a property requires only editing that file — no code changes.

7. **Check next 15 days by default**: This gives actionable short-term visibility. The lookout window is configurable in `config.json`. Checking too far ahead (90+ days) increases scraping time and cancellation rates for available rooms are higher.

8. **Separate data collection from report generation**: `scraper.py` and `report_generator.py` are independent. This means you can regenerate the report from historical data without re-scraping, and you can scrape without regenerating if needed.

### Alternatives Considered

- **Using Booking.com's unofficial API or third-party data providers**: These exist but involve cost, signup, or legal ambiguity. Scraping publicly visible information from websites for internal business intelligence is standard practice. This approach keeps it self-contained and free.

- **Using Selenium instead of Playwright**: Playwright is more modern, faster, and has better async support. It also installs its own browser binaries cleanly via `playwright install`.

- **SQLite instead of CSV**: More powerful for queries, but adds complexity without benefit at this scale. CSV is sufficient and doesn't require a database engine.

- **Google Sheets instead of Excel**: Would require OAuth and Google API setup, adding friction. Excel is more universal in a hospitality context.

### Open Questions (resolved)

1. **Competitor property list** ✅ — Resolved. All properties and room counts sourced from `Analisis competencia - Inventario.xlsx` and historical files. Booking.com URLs require manual verification before the first scraper run (flagged in `config.json`).

2. **Hopco's own occupancy source** ✅ — Resolved. Hopco properties will be scraped from Booking.com the same way as competitors. Cloudbeds API integration is a future enhancement.

3. **Markets to track** ✅ — Confirmed: Guatapé, Medellín, Pereira, El Salvador only.

4. **Python environment** ✅ — Confirmed available.

5. **Remaining before first scraper run (user action required):**
   - Fill in all `booking_url` values in `config.json` by searching each property on Booking.com
   - Add Cerritos Mall total room count (not in inventory file)
   - Add at least 1 Pereira competitor with URL and room count

---

## Step-by-Step Tasks

### Step 1: Create the output directory structure

Create the directory placeholders so `outputs/competitor-analysis/` exists with its subdirectories.

**Actions:**

- Create `outputs/competitor-analysis/data/.gitkeep` (empty file to anchor the data directory)
- Create `outputs/competitor-analysis/reports/.gitkeep` (empty file to anchor the reports directory)

**Files affected:**

- `outputs/competitor-analysis/data/.gitkeep`
- `outputs/competitor-analysis/reports/.gitkeep`

---

### Step 2: Create requirements.txt

Create the Python dependency file at `scripts/requirements.txt`.

**Actions:**

- Write the following content to `scripts/requirements.txt`:

```
playwright==1.41.0
openpyxl==3.1.2
pandas==2.2.0
python-dateutil==2.8.2
```

**Files affected:**

- `scripts/requirements.txt`

---

### Step 3: Create config.json

Create `scripts/config.json` with the full property configuration. This file defines every property the scraper will check.

**Actions:**

- Write `scripts/config.json` with real property data from the inventory and historical files. **All `booking_url` values must be verified before the first scraper run** — search each property on Booking.com and copy the exact URL. Property names and room counts are confirmed from the inventory file.

```json
{
  "settings": {
    "days_ahead": 30,
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
          "booking_url": "VERIFY: search 'Porto Marina Hotel Guatape' on booking.com",
          "total_rooms": 16
        },
        {
          "name": "Boato",
          "type": "ours",
          "booking_url": "VERIFY: search 'Boato Hotel Guatape' on booking.com",
          "total_rooms": 15
        },
        {
          "name": "Bubble",
          "type": "ours",
          "booking_url": "VERIFY: search 'Bubblesky Glamping Guatape' on booking.com",
          "total_rooms": 8
        },
        {
          "name": "Bliiss Glamping ",
          "type": "ours",
          "booking_url": "VERIFY: search 'Bliss Glamping Guatape' on booking.com",
          "total_rooms": 5
        },
        {
          "name": "La Pausa",
          "type": "competitor",
          "booking_url": "VERIFY: search 'La Pausa Guatape' on booking.com",
          "total_rooms": 16
        },
        {
          "name": "Tau House",
          "type": "competitor",
          "booking_url": "VERIFY: search 'Tau House Guatape' on booking.com",
          "total_rooms": 16
        },
        {
          "name": "Bosko",
          "type": "competitor",
          "booking_url": "VERIFY: search 'Bosko Hotel Guatape' on booking.com",
          "total_rooms": 10
        },
        {
          "name": "Levit",
          "type": "competitor",
          "booking_url": "VERIFY: search 'Levit Hotel Guatape' on booking.com",
          "total_rooms": 7
        },
        {
          "name": "Mylos",
          "type": "competitor",
          "booking_url": "VERIFY: search 'Mylos Hotel Guatape' on booking.com",
          "total_rooms": 16
        },
        {
          "name": "Viajero Guatapé ",
          "type": "competitor",
          "booking_url": "VERIFY: search 'Viajero Hostel Guatape' on booking.com",
          "total_rooms": 75
        }
      ]
    },
    {
      "name": "Medellín",
      "properties": [
        {
          "name": "Hotel 79 Poblado",
          "type": "ours",
          "booking_url": "VERIFY: search 'Hotel 79 Poblado Medellin' on booking.com",
          "total_rooms": 21
        },
        {
          "name": "Nomadic",
          "type": "competitor",
          "booking_url": "VERIFY: search 'Nomadic Hotel Medellin' on booking.com",
          "total_rooms": 15
        },
        {
          "name": "Hotel selis",
          "type": "competitor",
          "booking_url": "VERIFY: search 'Hotel Selis Medellin' on booking.com",
          "total_rooms": 25
        },
        {
          "name": "Muuk Hotel Boutique Campestre",
          "type": "competitor",
          "booking_url": "VERIFY: search 'Muuk Hotel Boutique Campestre Medellin' on booking.com",
          "total_rooms": 15
        },
        {
          "name": "Nakúa Stay & Work Hotel",
          "type": "competitor",
          "booking_url": "VERIFY: search 'Nakua Stay Work Hotel Medellin' on booking.com",
          "total_rooms": 25
        },
        {
          "name": "Origen Hotel Boutique",
          "type": "competitor",
          "booking_url": "VERIFY: search 'Origen Hotel Boutique Medellin' on booking.com",
          "total_rooms": 15
        },
        {
          "name": "Stanza Hotel Medellin",
          "type": "competitor",
          "booking_url": "VERIFY: search 'Stanza Hotel Medellin' on booking.com",
          "total_rooms": 15
        },
        {
          "name": "Wake Living",
          "type": "competitor",
          "booking_url": "VERIFY: search 'Wake Living Hotel Medellin' on booking.com",
          "total_rooms": 28
        },
        {
          "name": "1616 Hotel",
          "type": "competitor",
          "booking_url": "VERIFY: search '1616 Hotel Medellin' on booking.com",
          "total_rooms": 23
        }
      ]
    },
    {
      "name": "Pereira",
      "properties": [
        {
          "name": "Cerritos Mall",
          "type": "ours",
          "booking_url": "VERIFY: search 'Cerritos Mall Pereira' on booking.com",
          "total_rooms": 0,
          "notes": "UPDATE total_rooms — not in inventory file, confirm room count"
        },
        {
          "name": "COMPETITOR_1_PEREIRA",
          "type": "competitor",
          "booking_url": "VERIFY: add Pereira competitors from booking.com search",
          "total_rooms": 0,
          "notes": "ADD real competitor — no historical file exists for Pereira yet"
        }
      ]
    },
    {
      "name": "El Salvador",
      "properties": [
        {
          "name": "Ecos suites el zonte",
          "type": "ours",
          "booking_url": "VERIFY: search 'Ecosuites El Zonte El Salvador' on booking.com",
          "total_rooms": 28
        },
        {
          "name": "Hotel puro surf ",
          "type": "competitor",
          "booking_url": "VERIFY: search 'Hotel Puro Surf El Zonte El Salvador' on booking.com",
          "total_rooms": 13
        },
        {
          "name": "Hotel Michanti",
          "type": "competitor",
          "booking_url": "VERIFY: search 'Hotel Michanti El Salvador' on booking.com",
          "total_rooms": 11
        },
        {
          "name": "The  beach break hotel",
          "type": "competitor",
          "booking_url": "VERIFY: search 'The Beach Break Hotel El Zonte' on booking.com",
          "total_rooms": 12
        },
        {
          "name": "El xalli hotel",
          "type": "competitor",
          "booking_url": "VERIFY: search 'El Xalli Hotel El Salvador' on booking.com",
          "total_rooms": 11
        },
        {
          "name": "Esencia  nativa ",
          "type": "competitor",
          "booking_url": "VERIFY: search 'Esencia Nativa El Salvador' on booking.com",
          "total_rooms": 11
        },
        {
          "name": "Palo verde hotel ",
          "type": "competitor",
          "booking_url": "VERIFY: search 'Palo Verde Hotel El Salvador' on booking.com",
          "total_rooms": 12
        }
      ]
    }
  ]
}
```

**IMPORTANT — before running the scraper:** Replace every `"VERIFY: search..."` value with the actual Booking.com URL for that property. Navigate to each property on booking.com and copy the URL from your browser (it will look like `https://www.booking.com/hotel/co/property-name.html`). Property names must also match exactly how they appear in the historical data, since the import script uses them as keys.

**Files affected:**

- `scripts/config.json`

---

### Step 4: Create the scraper module (scraper.py)

Create `scripts/scraper.py` — the core Playwright-based scraping engine. This module takes a property configuration and a list of target dates, visits the Booking.com property page once per date, and extracts available rooms and rates.

**Actions:**

- Write the full content of `scripts/scraper.py` as follows:

```python
"""
scraper.py — Booking.com availability and rate scraper
Uses Playwright (headless Chromium) to extract:
  - Available rooms for a given property on a given date
  - Lowest and highest advertised rates
  - Sold-out status

Usage:
    from scraper import scrape_property
    results = scrape_property(property_config, date_list)
"""

import re
import time
import logging
from datetime import date, timedelta
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeout

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)


def build_url(base_url: str, checkin: date) -> str:
    """Build the Booking.com search URL for a property on a specific date."""
    checkout = checkin + timedelta(days=1)
    checkin_str = checkin.strftime("%Y-%m-%d")
    checkout_str = checkout.strftime("%Y-%m-%d")
    # Strip any existing query params from base_url
    clean_url = base_url.split("?")[0]
    return f"{clean_url}?checkin={checkin_str}&checkout={checkout_str}&group_adults=2&no_rooms=1"


def parse_rooms_from_page(page) -> dict:
    """
    Extract room availability and rates from a loaded Booking.com property page.
    Returns dict with keys: available_rooms, min_rate, max_rate, sold_out, currency
    """
    result = {
        "available_rooms": 0,
        "min_rate": None,
        "max_rate": None,
        "sold_out": False,
        "currency": "COP",
        "raw_notes": ""
    }

    try:
        # Check for sold-out indicator
        sold_out_texts = [
            "no availability",
            "no rooms available",
            "sold out",
            "no hay disponibilidad",
            "sin disponibilidad"
        ]
        page_text = page.inner_text("body").lower()
        for phrase in sold_out_texts:
            if phrase in page_text:
                result["sold_out"] = True
                result["available_rooms"] = 0
                return result

        # Find room/unit cards — Booking.com renders these as table rows or divs
        # Try multiple selectors for resilience across Booking.com layout versions
        room_selectors = [
            "tr.js-rt-block",           # classic table layout
            "[data-testid='accommodation-type-card']",  # new card layout
            ".hprt-table tr.js-rt-block",
        ]

        rooms_found = []
        for selector in room_selectors:
            elements = page.query_selector_all(selector)
            if elements:
                rooms_found = elements
                break

        if not rooms_found:
            # Fallback: count price elements as a proxy for available room types
            price_elements = page.query_selector_all("[data-testid='price-and-discounted-price'], .prco-valign-middle-helper")
            if price_elements:
                result["available_rooms"] = len(price_elements)
            result["raw_notes"] = "fallback_price_count"
            # Extract rates from price elements
            prices = _extract_prices_from_page(page)
            if prices:
                result["min_rate"] = min(prices)
                result["max_rate"] = max(prices)
            return result

        # Count available room types and extract rates
        room_count = 0
        all_prices = []

        for room_el in rooms_found:
            room_text = room_el.inner_text()

            # Check if room type is fully sold out (has "0" in select box or unavailable)
            unavailable_patterns = ["0 available", "0 left", "not available", "no disponible"]
            if any(p in room_text.lower() for p in unavailable_patterns):
                continue

            room_count += 1

            # Extract prices from this room element
            price_matches = re.findall(r"[\$COP€USD\s]*([\d][.\d,]+)", room_text.replace(".", "").replace(",", ""))
            for match in price_matches:
                try:
                    val = float(match)
                    if 10000 < val < 10000000:  # sanity range for hotel rates in COP
                        all_prices.append(val)
                    elif 10 < val < 10000:  # USD/EUR range
                        all_prices.append(val)
                except ValueError:
                    pass

        result["available_rooms"] = room_count

        # Also scan full page for price data if room-level extraction was sparse
        if not all_prices:
            all_prices = _extract_prices_from_page(page)

        if all_prices:
            result["min_rate"] = min(all_prices)
            result["max_rate"] = max(all_prices)

    except Exception as e:
        logger.warning(f"Error parsing room data: {e}")
        result["raw_notes"] = f"parse_error: {str(e)[:100]}"

    return result


def _extract_prices_from_page(page) -> list:
    """Extract all numeric price values from the page."""
    prices = []
    price_selectors = [
        "[data-testid='price-and-discounted-price']",
        ".prco-valign-middle-helper",
        ".bui-price-display__value",
        ".hprt-price-price",
    ]
    for sel in price_selectors:
        els = page.query_selector_all(sel)
        for el in els:
            text = el.inner_text().strip()
            cleaned = re.sub(r"[^\d]", "", text)
            if cleaned:
                try:
                    val = float(cleaned)
                    if 1000 < val < 50000000:
                        prices.append(val)
                except ValueError:
                    pass
        if prices:
            break
    return prices


def scrape_property(property_config: dict, target_dates: list, delay: float = 3.0) -> list:
    """
    Scrape a single Booking.com property across a list of dates.

    Args:
        property_config: Dict with keys: name, booking_url, total_rooms, type, market
        target_dates: List of datetime.date objects to check
        delay: Seconds to wait between page loads

    Returns:
        List of dicts, one per date, with scraped data
    """
    results = []
    base_url = property_config.get("booking_url", "")
    total_rooms = property_config.get("total_rooms", 0)
    prop_name = property_config.get("name", "Unknown")
    prop_type = property_config.get("type", "competitor")
    market = property_config.get("market", "Unknown")

    if not base_url or "REPLACE-WITH-REAL-URL" in base_url:
        logger.warning(f"Skipping {prop_name} — booking_url not configured.")
        return results

    logger.info(f"Scraping {prop_name} ({len(target_dates)} dates)...")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            ),
            viewport={"width": 1280, "height": 800},
            locale="en-US",
        )
        page = context.new_page()

        # Accept cookies on first load
        try:
            first_url = build_url(base_url, target_dates[0])
            page.goto(first_url, wait_until="domcontentloaded", timeout=30000)
            time.sleep(2)
            # Dismiss cookie banner if present
            cookie_selectors = [
                "#onetrust-accept-btn-handler",
                "[data-gdpr-consent='accept']",
                "button[id*='accept']",
            ]
            for sel in cookie_selectors:
                btn = page.query_selector(sel)
                if btn:
                    btn.click()
                    time.sleep(1)
                    break
        except PlaywrightTimeout:
            logger.warning(f"Timeout on first load for {prop_name}")

        for target_date in target_dates:
            url = build_url(base_url, target_date)
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
                page.goto(url, wait_until="domcontentloaded", timeout=30000)
                time.sleep(delay)

                parsed = parse_rooms_from_page(page)

                row["available_rooms"] = parsed["available_rooms"]
                row["sold_out"] = parsed["sold_out"]
                row["min_rate"] = parsed["min_rate"]
                row["max_rate"] = parsed["max_rate"]
                row["notes"] = parsed.get("raw_notes", "")

                if parsed["sold_out"]:
                    row["available_rooms"] = 0
                    row["occupancy_pct"] = 100.0
                    row["booked_rooms"] = total_rooms
                elif total_rooms > 0:
                    avail = parsed["available_rooms"]
                    booked = max(0, total_rooms - avail)
                    row["booked_rooms"] = booked
                    row["occupancy_pct"] = round((booked / total_rooms) * 100, 1)
                else:
                    row["booked_rooms"] = None
                    row["occupancy_pct"] = None
                    row["notes"] += " | total_rooms=0 in config"

                logger.info(
                    f"  {date_str}: avail={row['available_rooms']}, "
                    f"occ={row['occupancy_pct']}%, "
                    f"rates={row['min_rate']}-{row['max_rate']}"
                )

            except PlaywrightTimeout:
                row["status"] = "timeout"
                row["notes"] = "Page load timeout"
                logger.warning(f"  {date_str}: TIMEOUT")
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

- `scripts/scraper.py`

---

### Step 5: Create the data store module (data_store.py)

Create `scripts/data_store.py` — manages reading from and appending to the CSV data store.

**Actions:**

- Write the full content of `scripts/data_store.py`:

```python
"""
data_store.py — CSV-based data persistence for competitor analysis results.
Appends daily scrape results and reads historical data for reporting.
"""

import csv
import os
from datetime import date

COLUMNS = [
    "scrape_date",
    "target_date",
    "market",
    "property_name",
    "property_type",
    "total_rooms",
    "available_rooms",
    "booked_rooms",
    "occupancy_pct",
    "min_rate",
    "max_rate",
    "sold_out",
    "status",
    "notes",
]


def ensure_data_file(data_file_path: str):
    """Create the CSV file with headers if it doesn't exist."""
    os.makedirs(os.path.dirname(data_file_path), exist_ok=True)
    if not os.path.exists(data_file_path):
        with open(data_file_path, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=COLUMNS)
            writer.writeheader()


def append_rows(data_file_path: str, rows: list):
    """Append a list of result dicts to the CSV data store."""
    ensure_data_file(data_file_path)
    with open(data_file_path, "a", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=COLUMNS, extrasaction="ignore")
        writer.writerows(rows)


def read_all(data_file_path: str) -> list:
    """Read all rows from the CSV data store. Returns list of dicts."""
    if not os.path.exists(data_file_path):
        return []
    with open(data_file_path, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        return list(reader)


def read_latest_scrape(data_file_path: str, scrape_date: str = None) -> list:
    """
    Read only the rows from the most recent scrape date.
    If scrape_date is None, uses today's date.
    """
    target = scrape_date or date.today().isoformat()
    all_rows = read_all(data_file_path)
    return [r for r in all_rows if r.get("scrape_date") == target]


def get_scrape_dates(data_file_path: str) -> list:
    """Return sorted list of all unique scrape dates in the data store."""
    all_rows = read_all(data_file_path)
    dates = sorted(set(r.get("scrape_date", "") for r in all_rows if r.get("scrape_date")))
    return dates
```

**Files affected:**

- `scripts/data_store.py`

---

### Step 6: Create the report generator module (report_generator.py)

Create `scripts/report_generator.py` — reads the CSV data store and generates a formatted multi-sheet Excel workbook.

**Actions:**

- Write the full content of `scripts/report_generator.py`:

```python
"""
report_generator.py — Generates a formatted Excel workbook from the competitor analysis data store.

Sheets produced:
  1. "Dashboard - {Market}" (one per market) — occupancy % grid: properties as rows, next 30 dates as columns
  2. "Rates - {Market}" — min/max rate grid per market
  3. "Raw Data" — full unfiltered data dump for advanced users

Color coding (occupancy):
  >= 80%  → green fill
  60-79%  → yellow fill
  40-59%  → orange fill
  < 40%   → red fill
  No data → light grey
"""

import os
from datetime import date, timedelta
from openpyxl import Workbook
from openpyxl.styles import (
    PatternFill, Font, Alignment, Border, Side, numbers
)
from openpyxl.utils import get_column_letter

# Color fills
GREEN_FILL  = PatternFill("solid", fgColor="C6EFCE")
YELLOW_FILL = PatternFill("solid", fgColor="FFEB9C")
ORANGE_FILL = PatternFill("solid", fgColor="FFCC99")
RED_FILL    = PatternFill("solid", fgColor="FFC7CE")
GREY_FILL   = PatternFill("solid", fgColor="F2F2F2")
BLUE_FILL   = PatternFill("solid", fgColor="BDD7EE")   # header
DARK_BLUE   = PatternFill("solid", fgColor="2F75B6")   # section header

HEADER_FONT = Font(bold=True, color="FFFFFF")
SUBHEADER_FONT = Font(bold=True)
THIN_BORDER = Border(
    left=Side(style="thin"), right=Side(style="thin"),
    top=Side(style="thin"), bottom=Side(style="thin")
)


def occ_fill(occ_value):
    """Return fill color based on occupancy percentage."""
    if occ_value is None:
        return GREY_FILL
    val = float(occ_value)
    if val >= 80:
        return GREEN_FILL
    elif val >= 60:
        return YELLOW_FILL
    elif val >= 40:
        return ORANGE_FILL
    else:
        return RED_FILL


def style_header_cell(cell, text, bg_fill=None):
    cell.value = text
    cell.font = HEADER_FONT if bg_fill else SUBHEADER_FONT
    cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
    if bg_fill:
        cell.fill = bg_fill
    cell.border = THIN_BORDER


def build_market_occupancy_sheet(wb, market_name, market_rows, date_range):
    """Build a sheet for one market showing occupancy grid."""
    ws = wb.create_sheet(title=f"Occ - {market_name[:20]}")
    ws.freeze_panes = "B3"

    # Title row
    ws.merge_cells(f"A1:{get_column_letter(len(date_range) + 2)}1")
    title_cell = ws["A1"]
    title_cell.value = f"OCCUPANCY — {market_name.upper()} | Generated: {date.today().isoformat()}"
    title_cell.font = Font(bold=True, color="FFFFFF", size=12)
    title_cell.fill = DARK_BLUE
    title_cell.alignment = Alignment(horizontal="center", vertical="center")
    ws.row_dimensions[1].height = 20

    # Header row: Property | Type | date1 | date2 | ...
    ws.cell(row=2, column=1).value = "Property"
    ws.cell(row=2, column=1).font = SUBHEADER_FONT
    ws.cell(row=2, column=1).fill = BLUE_FILL
    ws.cell(row=2, column=1).border = THIN_BORDER
    ws.cell(row=2, column=1).alignment = Alignment(horizontal="left", vertical="center")

    ws.cell(row=2, column=2).value = "Type"
    ws.cell(row=2, column=2).font = SUBHEADER_FONT
    ws.cell(row=2, column=2).fill = BLUE_FILL
    ws.cell(row=2, column=2).border = THIN_BORDER
    ws.cell(row=2, column=2).alignment = Alignment(horizontal="center", vertical="center")

    for col_idx, d in enumerate(date_range, start=3):
        cell = ws.cell(row=2, column=col_idx)
        cell.value = d.strftime("%d/%m")
        cell.font = SUBHEADER_FONT
        cell.fill = BLUE_FILL
        cell.border = THIN_BORDER
        cell.alignment = Alignment(horizontal="center", vertical="center", text_rotation=45)

    ws.row_dimensions[2].height = 50

    # Build lookup: (property_name, target_date) -> occupancy_pct
    lookup = {}
    for row in market_rows:
        key = (row.get("property_name"), row.get("target_date"))
        lookup[key] = row

    # Get unique properties, ours first then competitors
    properties = []
    seen = set()
    for ptype in ["ours", "competitor"]:
        for row in market_rows:
            name = row.get("property_name")
            if row.get("property_type") == ptype and name not in seen:
                properties.append((name, ptype))
                seen.add(name)

    # Data rows
    for row_idx, (prop_name, prop_type) in enumerate(properties, start=3):
        ws.cell(row=row_idx, column=1).value = prop_name
        ws.cell(row=row_idx, column=1).border = THIN_BORDER
        ws.cell(row=row_idx, column=1).alignment = Alignment(horizontal="left", vertical="center")
        if prop_type == "ours":
            ws.cell(row=row_idx, column=1).font = Font(bold=True)

        type_label = "HOPCO" if prop_type == "ours" else "COMP"
        ws.cell(row=row_idx, column=2).value = type_label
        ws.cell(row=row_idx, column=2).border = THIN_BORDER
        ws.cell(row=row_idx, column=2).alignment = Alignment(horizontal="center", vertical="center")
        ws.cell(row=row_idx, column=2).font = Font(bold=(prop_type == "ours"))

        for col_idx, d in enumerate(date_range, start=3):
            date_str = d.strftime("%Y-%m-%d")
            data_row = lookup.get((prop_name, date_str))
            cell = ws.cell(row=row_idx, column=col_idx)
            cell.border = THIN_BORDER
            cell.alignment = Alignment(horizontal="center", vertical="center")

            if data_row:
                occ_raw = data_row.get("occupancy_pct")
                sold_out = data_row.get("sold_out", "").lower() == "true"
                if sold_out:
                    cell.value = "SOLD"
                    cell.fill = GREEN_FILL
                    cell.font = Font(bold=True, color="006100")
                elif occ_raw not in (None, "", "None"):
                    occ_val = float(occ_raw)
                    cell.value = f"{occ_val:.0f}%"
                    cell.fill = occ_fill(occ_val)
                else:
                    cell.value = "—"
                    cell.fill = GREY_FILL
            else:
                cell.value = "—"
                cell.fill = GREY_FILL

    # Column widths
    ws.column_dimensions["A"].width = 28
    ws.column_dimensions["B"].width = 8
    for col_idx in range(3, len(date_range) + 3):
        ws.column_dimensions[get_column_letter(col_idx)].width = 6

    return ws


def build_market_rates_sheet(wb, market_name, market_rows, date_range):
    """Build a rate sheet for one market showing min/max rates."""
    ws = wb.create_sheet(title=f"Rates - {market_name[:18]}")
    ws.freeze_panes = "B3"

    ws.merge_cells(f"A1:{get_column_letter(len(date_range) * 2 + 2)}1")
    title_cell = ws["A1"]
    title_cell.value = f"RATES (Min / Max) — {market_name.upper()} | {date.today().isoformat()}"
    title_cell.font = Font(bold=True, color="FFFFFF", size=12)
    title_cell.fill = DARK_BLUE
    title_cell.alignment = Alignment(horizontal="center", vertical="center")
    ws.row_dimensions[1].height = 20

    ws.cell(row=2, column=1).value = "Property"
    ws.cell(row=2, column=1).font = SUBHEADER_FONT
    ws.cell(row=2, column=1).fill = BLUE_FILL
    ws.cell(row=2, column=1).border = THIN_BORDER

    col = 2
    for d in date_range:
        ws.cell(row=2, column=col).value = f"{d.strftime('%d/%m')} MIN"
        ws.cell(row=2, column=col).fill = BLUE_FILL
        ws.cell(row=2, column=col).font = SUBHEADER_FONT
        ws.cell(row=2, column=col).border = THIN_BORDER
        ws.cell(row=2, column=col).alignment = Alignment(horizontal="center", text_rotation=45)
        ws.cell(row=2, column=col + 1).value = f"{d.strftime('%d/%m')} MAX"
        ws.cell(row=2, column=col + 1).fill = BLUE_FILL
        ws.cell(row=2, column=col + 1).font = SUBHEADER_FONT
        ws.cell(row=2, column=col + 1).border = THIN_BORDER
        ws.cell(row=2, column=col + 1).alignment = Alignment(horizontal="center", text_rotation=45)
        col += 2
    ws.row_dimensions[2].height = 60

    lookup = {}
    for row in market_rows:
        key = (row.get("property_name"), row.get("target_date"))
        lookup[key] = row

    properties = []
    seen = set()
    for ptype in ["ours", "competitor"]:
        for row in market_rows:
            name = row.get("property_name")
            if row.get("property_type") == ptype and name not in seen:
                properties.append((name, ptype))
                seen.add(name)

    for row_idx, (prop_name, prop_type) in enumerate(properties, start=3):
        ws.cell(row=row_idx, column=1).value = prop_name
        ws.cell(row=row_idx, column=1).border = THIN_BORDER
        ws.cell(row=row_idx, column=1).alignment = Alignment(horizontal="left")
        if prop_type == "ours":
            ws.cell(row=row_idx, column=1).font = Font(bold=True)

        col = 2
        for d in date_range:
            date_str = d.strftime("%Y-%m-%d")
            data_row = lookup.get((prop_name, date_str))
            min_cell = ws.cell(row=row_idx, column=col)
            max_cell = ws.cell(row=row_idx, column=col + 1)
            for cell in (min_cell, max_cell):
                cell.border = THIN_BORDER
                cell.alignment = Alignment(horizontal="right")

            if data_row:
                min_r = data_row.get("min_rate")
                max_r = data_row.get("max_rate")
                if min_r not in (None, "", "None"):
                    min_cell.value = float(min_r)
                    min_cell.number_format = "#,##0"
                else:
                    min_cell.value = "—"
                if max_r not in (None, "", "None"):
                    max_cell.value = float(max_r)
                    max_cell.number_format = "#,##0"
                else:
                    max_cell.value = "—"
            else:
                min_cell.value = "—"
                max_cell.value = "—"
            col += 2

    ws.column_dimensions["A"].width = 28
    for i in range(2, col):
        ws.column_dimensions[get_column_letter(i)].width = 9

    return ws


def build_raw_data_sheet(wb, all_rows):
    """Build raw data sheet with all scraped records."""
    ws = wb.create_sheet(title="Raw Data")
    headers = [
        "Scrape Date", "Target Date", "Market", "Property", "Type",
        "Total Rooms", "Available Rooms", "Booked Rooms",
        "Occupancy %", "Min Rate", "Max Rate", "Sold Out", "Status", "Notes"
    ]
    for col_idx, h in enumerate(headers, start=1):
        cell = ws.cell(row=1, column=col_idx)
        cell.value = h
        cell.font = SUBHEADER_FONT
        cell.fill = BLUE_FILL
        cell.border = THIN_BORDER

    keys = [
        "scrape_date", "target_date", "market", "property_name", "property_type",
        "total_rooms", "available_rooms", "booked_rooms",
        "occupancy_pct", "min_rate", "max_rate", "sold_out", "status", "notes"
    ]
    for row_idx, row in enumerate(all_rows, start=2):
        for col_idx, key in enumerate(keys, start=1):
            val = row.get(key, "")
            ws.cell(row=row_idx, column=col_idx).value = val

    for i, _ in enumerate(headers, start=1):
        ws.column_dimensions[get_column_letter(i)].width = 15

    return ws


def generate_report(data_rows: list, output_path: str, days_ahead: int = 30):
    """
    Generate the Excel workbook from a list of data rows.

    Args:
        data_rows: List of dicts from data_store.read_latest_scrape()
        output_path: Full path where .xlsx should be saved
        days_ahead: Number of future dates to display
    """
    today = date.today()
    date_range = [today + timedelta(days=i) for i in range(days_ahead)]

    # Group rows by market
    markets = {}
    for row in data_rows:
        market = row.get("market", "Unknown")
        markets.setdefault(market, []).append(row)

    wb = Workbook()
    # Remove default sheet
    default_sheet = wb.active
    wb.remove(default_sheet)

    for market_name, market_rows in sorted(markets.items()):
        build_market_occupancy_sheet(wb, market_name, market_rows, date_range)
        build_market_rates_sheet(wb, market_name, market_rows, date_range)

    build_raw_data_sheet(wb, data_rows)

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    wb.save(output_path)
    print(f"Report saved: {output_path}")
```

**Files affected:**

- `scripts/report_generator.py`

---

### Step 7: Create the orchestrator (run.py)

Create `scripts/run.py` — the main entry point that ties all modules together. Running `python run.py` executes the full pipeline.

**Actions:**

- Write the full content of `scripts/run.py`:

```python
"""
run.py — Competitor Analysis Pipeline Orchestrator

Usage:
    cd scripts/
    python run.py                    # scrape all properties, save data, generate report
    python run.py --report-only      # skip scraping, regenerate report from existing data
    python run.py --market Guatapé   # scrape only one market

Dependencies must be installed:
    pip install -r requirements.txt
    playwright install chromium
"""

import argparse
import json
import os
import sys
from datetime import date, timedelta

# Resolve paths relative to this script's location
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CONFIG_PATH = os.path.join(SCRIPT_DIR, "config.json")

# Import local modules
sys.path.insert(0, SCRIPT_DIR)
from scraper import scrape_property
from data_store import append_rows, read_latest_scrape, ensure_data_file
from report_generator import generate_report


def load_config(config_path: str) -> dict:
    with open(config_path, "r", encoding="utf-8") as f:
        return json.load(f)


def get_date_range(days_ahead: int) -> list:
    today = date.today()
    return [today + timedelta(days=i) for i in range(days_ahead)]


def run_scrape(config: dict, market_filter: str = None) -> list:
    """Run the scraper for all (or filtered) properties. Returns all new rows."""
    settings = config.get("settings", {})
    days_ahead = settings.get("days_ahead", 30)
    delay = settings.get("scrape_delay_seconds", 3)
    date_range = get_date_range(days_ahead)

    all_new_rows = []

    for market in config.get("markets", []):
        market_name = market.get("name", "Unknown")
        if market_filter and market_name.lower() != market_filter.lower():
            continue

        print(f"\n=== Market: {market_name} ===")
        for prop in market.get("properties", []):
            prop["market"] = market_name  # inject market name into config
            rows = scrape_property(prop, date_range, delay=delay)
            all_new_rows.extend(rows)

    return all_new_rows


def main():
    parser = argparse.ArgumentParser(description="Competitor Analysis Pipeline")
    parser.add_argument("--report-only", action="store_true", help="Skip scraping, regenerate report from existing data")
    parser.add_argument("--market", type=str, default=None, help="Only scrape a specific market by name")
    args = parser.parse_args()

    config = load_config(CONFIG_PATH)
    settings = config.get("settings", {})
    data_file = os.path.join(SCRIPT_DIR, settings.get("data_file", "../outputs/competitor-analysis/data/raw_data.csv"))
    reports_dir = os.path.join(SCRIPT_DIR, settings.get("reports_dir", "../outputs/competitor-analysis/reports"))
    days_ahead = settings.get("days_ahead", 30)

    ensure_data_file(data_file)

    if not args.report_only:
        print("Starting scrape...")
        new_rows = run_scrape(config, market_filter=args.market)
        if new_rows:
            append_rows(data_file, new_rows)
            print(f"\nSaved {len(new_rows)} rows to data store.")
        else:
            print("No data collected. Check config.json for valid URLs.")
    else:
        print("Skipping scrape (--report-only mode).")

    # Generate report from today's data
    today_str = date.today().isoformat()
    today_rows = read_latest_scrape(data_file, today_str)

    if not today_rows:
        print(f"No data found for today ({today_str}). Cannot generate report.")
        sys.exit(1)

    report_filename = f"competitor-analysis-{today_str}.xlsx"
    report_path = os.path.join(reports_dir, report_filename)
    generate_report(today_rows, report_path, days_ahead=days_ahead)

    print(f"\nDone. Report: {report_path}")


if __name__ == "__main__":
    main()
```

**Files affected:**

- `scripts/run.py`

---

### Step 8: Create the historical data import script (import_historical.py)

Create `scripts/import_historical.py` — a one-time script that reads the 3 existing Excel competition files and imports them into the CSV data store, preserving all historical records from Jan 2025 onward.

**Actions:**

- Write the full content of `scripts/import_historical.py`:

```python
"""
import_historical.py — One-time import of existing manual Excel competition files into the CSV data store.

Imports:
  - Analisis competencia - Guatape (1).xlsx   → market: Guatapé
  - Analisis competencia - Medellín.xlsx       → market: Medellín
  - Analisis competencia - El Salvador.xlsx    → market: El Salvador

Usage (run once from the scripts/ folder):
    python import_historical.py

The script is idempotent: running it twice will not create duplicate records because
it checks for existing (scrape_date + property_name + target_date) combinations first.
"""

import os
import sys
import json
from datetime import date

import openpyxl

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SCRIPT_DIR)

from data_store import append_rows, read_all, ensure_data_file

CONFIG_PATH = os.path.join(SCRIPT_DIR, "config.json")

# Historical Excel files: (path relative to workspace root, market name, sheet name, date_col_idx, hotel_col_idx, avail_col_idx, min_rate_col_idx, max_rate_col_idx)
HISTORICAL_FILES = [
    {
        "path": "../context/Analisis competencia - Guatape (1).xlsx",
        "market": "Guatapé",
        "sheet": "Guatape",
        "col_date": 1,
        "col_hotel": 2,
        "col_avail": 3,
        "col_min_rate": 4,
        "col_max_rate": 5,
    },
    {
        "path": "../context/Analisis competencia - Medellín.xlsx",
        "market": "Medellín",
        "sheet": "Hoja1",
        "col_date": 1,
        "col_hotel": 2,
        "col_avail": 3,
        "col_min_rate": 4,
        "col_max_rate": 5,
    },
    {
        "path": "../context/Analisis competencia - El Salvador.xlsx",
        "market": "El Salvador",
        "sheet": "Historico El Salvador",
        "col_date": 1,
        "col_hotel": 2,
        "col_avail": 3,
        "col_min_rate": 4,
        "col_max_rate": 5,
    },
]


def load_inventory(config: dict) -> dict:
    """Build a lookup: property_name (lowercase stripped) -> {total_rooms, type}"""
    inventory = {}
    for market in config.get("markets", []):
        for prop in market.get("properties", []):
            key = prop["name"].strip().lower()
            inventory[key] = {
                "total_rooms": prop.get("total_rooms", 0),
                "type": prop.get("type", "competitor"),
                "market": market["name"],
                "canonical_name": prop["name"],
            }
    return inventory


def build_existing_keys(data_file: str) -> set:
    """Build a set of (scrape_date, property_name, target_date) to avoid duplicates."""
    existing = read_all(data_file)
    return {
        (r.get("scrape_date"), r.get("property_name", "").strip().lower(), r.get("target_date"))
        for r in existing
    }


def import_file(file_config: dict, inventory: dict, data_file: str, existing_keys: set) -> int:
    """Import one historical Excel file. Returns number of rows imported."""
    abs_path = os.path.normpath(os.path.join(SCRIPT_DIR, file_config["path"]))
    market = file_config["market"]
    sheet_name = file_config["sheet"]

    c_date = file_config["col_date"]
    c_hotel = file_config["col_hotel"]
    c_avail = file_config["col_avail"]
    c_min = file_config["col_min_rate"]
    c_max = file_config["col_max_rate"]

    print(f"\nImporting {os.path.basename(abs_path)} ({market})...")

    wb = openpyxl.load_workbook(abs_path, data_only=True)
    ws = wb[sheet_name]

    new_rows = []
    skipped = 0
    errors = 0

    for row in ws.iter_rows(min_row=3, values_only=True):
        fecha = row[c_date]
        hotel = row[c_hotel]

        # Skip blank or header rows
        if not fecha or not hotel:
            continue
        if not hasattr(fecha, "strftime"):
            continue  # not a date

        hotel_str = str(hotel).strip()
        hotel_key = hotel_str.lower()
        date_str = fecha.strftime("%Y-%m-%d")

        # Deduplicate check
        dedup_key = (date_str, hotel_key, date_str)
        if dedup_key in existing_keys:
            skipped += 1
            continue

        # Look up inventory
        inv = inventory.get(hotel_key)
        total_rooms = inv["total_rooms"] if inv else 0
        prop_type = inv["type"] if inv else "competitor"
        # Use the canonical name from config if available, else use as-is from Excel
        canonical_name = inv["canonical_name"] if inv else hotel_str

        # Available rooms
        avail_raw = row[c_avail]
        try:
            avail = int(avail_raw) if avail_raw is not None else None
        except (ValueError, TypeError):
            avail = None
            errors += 1

        # Rates
        try:
            min_rate = float(row[c_min]) if row[c_min] not in (None, 0, "") else None
        except (ValueError, TypeError):
            min_rate = None

        try:
            max_rate = float(row[c_max]) if row[c_max] not in (None, 0, "") else None
        except (ValueError, TypeError):
            max_rate = None

        # Occupancy
        sold_out = False
        booked = None
        occ_pct = None
        if avail is not None and total_rooms > 0:
            booked = max(0, total_rooms - avail)
            occ_pct = round((booked / total_rooms) * 100, 1)
            if avail == 0:
                sold_out = True

        new_rows.append({
            "scrape_date": date_str,
            "target_date": date_str,
            "market": market,
            "property_name": canonical_name,
            "property_type": prop_type,
            "total_rooms": total_rooms,
            "available_rooms": avail,
            "booked_rooms": booked,
            "occupancy_pct": occ_pct,
            "min_rate": min_rate,
            "max_rate": max_rate,
            "sold_out": sold_out,
            "status": "imported",
            "notes": "historical_import",
        })
        existing_keys.add(dedup_key)

    if new_rows:
        append_rows(data_file, new_rows)

    print(f"  Imported: {len(new_rows)} rows | Skipped (duplicates): {skipped} | Errors: {errors}")
    return len(new_rows)


def main():
    with open(CONFIG_PATH, "r", encoding="utf-8") as f:
        config = json.load(f)

    settings = config.get("settings", {})
    data_file = os.path.normpath(
        os.path.join(SCRIPT_DIR, settings.get("data_file", "../outputs/competitor-analysis/data/raw_data.csv"))
    )

    ensure_data_file(data_file)
    inventory = load_inventory(config)
    existing_keys = build_existing_keys(data_file)

    total_imported = 0
    for file_config in HISTORICAL_FILES:
        total_imported += import_file(file_config, inventory, data_file, existing_keys)

    print(f"\nDone. Total rows imported: {total_imported}")
    print(f"Data store: {data_file}")


if __name__ == "__main__":
    main()
```

**Files affected:**

- `scripts/import_historical.py`

---

### Step 9: Create setup instructions file

Create `scripts/SETUP.md` with step-by-step setup instructions so any team member can get the system running.

**Actions:**

- Write `scripts/SETUP.md`:

```markdown
# Competitor Analysis — Setup Instructions

## Prerequisites

- Python 3.10 or higher installed
- Terminal / command line access

## First-Time Setup

```bash
# 1. Navigate to the scripts folder
cd /path/to/workspace/scripts

# 2. Create a virtual environment (recommended)
python3 -m venv venv
source venv/bin/activate   # macOS/Linux
# venv\Scripts\activate    # Windows

# 3. Install dependencies
pip install -r requirements.txt

# 4. Install Playwright's browser (one-time)
playwright install chromium
```

## Step 1: Fill in Booking.com URLs

Open `scripts/config.json`. For every property with `"VERIFY: search..."` in the `booking_url` field:
1. Go to booking.com and search for that property
2. Navigate to its listing page
3. Copy the URL from your browser (e.g. `https://www.booking.com/hotel/co/boato-guatape.html`)
4. Paste it into the config file

Also fill in `total_rooms` for Cerritos Mall (Pereira) and add Pereira competitors.

## Step 2: Import Historical Data (run once)

This imports all 14+ months of manually collected data into the system:
```bash
cd scripts/
source venv/bin/activate
python import_historical.py
```

Expected output: ~4,600+ rows imported across Guatapé, Medellín, and El Salvador.

## Step 3: Generate a Report from Historical Data

Verify the system works before the first live scrape:
```bash
python run.py --report-only
```

This generates an Excel report from the imported historical data. Open it from:
`outputs/competitor-analysis/reports/competitor-analysis-YYYY-MM-DD.xlsx`

## Step 4: Run the Daily Scraper

Once URLs are configured:
```bash
# Full run: scrape all markets + generate report
python run.py

# Scrape only one market
python run.py --market Guatapé

# Regenerate report without scraping
python run.py --report-only
```

## View Reports

Reports are saved to:
```
outputs/competitor-analysis/reports/competitor-analysis-YYYY-MM-DD.xlsx
```
Open with Microsoft Excel, Google Sheets, or LibreOffice Calc.

## Schedule Daily Runs (macOS)

To run automatically every morning at 8am, add to crontab:
```
crontab -e
```
Add this line (update the path):
```
0 8 * * * cd /path/to/workspace/scripts && source venv/bin/activate && python run.py >> ../outputs/competitor-analysis/data/run.log 2>&1
```

## Troubleshooting

- **Timeout errors**: Booking.com may be slow — increase `scrape_delay_seconds` in `config.json`
- **No rooms found**: The property URL may be wrong, or the page layout changed — verify the URL manually in a browser
- **Rate extraction returns None**: Rates may be in a different currency or format — check the `raw_notes` column in Raw Data sheet
```

**Files affected:**

- `scripts/SETUP.md`

---

### Step 9: Create the `/competitor-analysis` slash command

Create `.claude/commands/competitor-analysis.md` — a workspace command for running or interpreting the analysis.

**Actions:**

- Write `.claude/commands/competitor-analysis.md`:

```markdown
# Competitor Analysis

Run, interpret, or manage the automated competitor analysis system.

## Variables

action: $ARGUMENTS (optional — e.g., "run", "interpret", "status", "add competitor [name]")

---

## Instructions

Based on the action requested:

### If action is "run" or empty:
1. Confirm the Python environment is set up (check for `scripts/venv/` or ask user)
2. Run: `cd scripts && source venv/bin/activate && python run.py`
3. Report: number of properties scraped, rows collected, report file path
4. Open or summarize the most recent report in `outputs/competitor-analysis/reports/`

### If action is "interpret" or "read":
1. Find the most recent Excel report in `outputs/competitor-analysis/reports/`
2. Read the `Raw Data` sheet or the CSV at `outputs/competitor-analysis/data/raw_data.csv`
3. Summarize findings:
   - Which of Hopco's properties have the highest/lowest occupancy today
   - How Hopco's occupancy compares to competitors in each market
   - Rate spread: are competitors pricing above or below Hopco
   - Which dates are showing high demand (most properties near sold out)
   - Revenue management recommendations based on the data

### If action is "status":
1. Check if `outputs/competitor-analysis/data/raw_data.csv` exists
2. Report: last scrape date, number of properties tracked, number of historical data points
3. List any properties with PLACEHOLDER/unconfigured URLs in `scripts/config.json`

### If action starts with "add competitor":
1. Ask user for: property name, market, Booking.com URL, total room count
2. Edit `scripts/config.json` to add the new competitor under the correct market
3. Confirm the addition

### If action is "setup":
1. Display the contents of `scripts/SETUP.md`
2. Guide the user through first-time setup steps

---

## Output

Always end with:
- Current status of the system (configured / needs config / ready to run)
- Last run date if data exists
- Next recommended action
```

**Files affected:**

- `.claude/commands/competitor-analysis.md`

---

### Step 10: Update CLAUDE.md

Add the new Competitor Analysis System to the workspace documentation.

**Actions:**

- In `CLAUDE.md`, find the `## Commands` section and add `/competitor-analysis` to the command list
- Add a new `## Competitor Analysis System` section after Commands
- Update the Workspace Structure table to reflect `scripts/` and `outputs/competitor-analysis/`

Specifically, edit the Commands section to add:

```markdown
### /competitor-analysis [action]

**Purpose:** Run, interpret, or manage the automated competitor analysis pipeline.

Actions: `run` | `interpret` | `status` | `add competitor [name]` | `setup`

Example: `/competitor-analysis interpret`
```

And add a new section:

```markdown
---

## Competitor Analysis System

Automated Python-based system that scrapes Booking.com to track competitor and Hopco property occupancy and rates daily.

### Key Files

| File | Purpose |
|---|---|
| `scripts/config.json` | Property list: all Hopco and competitor properties, URLs, room counts |
| `scripts/run.py` | Main pipeline: run with `python run.py` from `scripts/` |
| `scripts/scraper.py` | Playwright scraper module |
| `scripts/report_generator.py` | Excel workbook generator |
| `scripts/SETUP.md` | First-time setup instructions |
| `outputs/competitor-analysis/data/raw_data.csv` | Historical data store |
| `outputs/competitor-analysis/reports/` | Daily Excel reports |

### Quick Start

```bash
cd scripts/
source venv/bin/activate
python run.py
```

### Before First Run

Update `scripts/config.json`:
1. Verify Booking.com URLs for Hopco properties
2. Replace COMPETITOR_X placeholder entries with real competitors
3. Set correct `total_rooms` for each property

### Methodology

Occupancy is inferred from publicly available data:
- Available rooms per date are scraped from Booking.com
- Occupancy % = (Total Rooms − Available Rooms) / Total Rooms × 100
- "Sold Out" dates are marked as 100% occupied
- Rates (min/max advertised) are captured per date

### Markets Tracked

- Guatapé: Boato, Porto Marina, Bubblesky, Bliss + competitors
- El Poblado: Setenta y Nueve + competitors
- Pereira: Cerritos Mall + competitors
- El Salvador: Ecosuites El Zonte + competitors
```

**Files affected:**

- `CLAUDE.md`

---

## Connections & Dependencies

### Files That Reference This Area

- `CLAUDE.md` — will be updated to document the system
- `context/current-data.md` — describes the KPIs (ADR, occupancy %) that this system now tracks automatically
- `context/strategy.md` — "automating repetitive revenue management tasks" is now addressed by this system

### Updates Needed for Consistency

- `context/current-data.md` — after the system is running, update this file to reference the automated data source
- `context/strategy.md` — mark priority #1 (automation) as "In Progress" or "Implemented"

### Impact on Existing Workflows

- Adds a new daily workflow: run `python run.py` each morning (or schedule it via cron)
- The `/competitor-analysis` command provides a natural interface for interpreting results through Claude
- No existing workflows are modified or broken

---

## Validation Checklist

- [ ] All files created in correct paths as listed in "New Files to Create"
- [ ] `scripts/config.json` is valid JSON and contains all 4 markets (Guatapé, Medellín, Pereira, El Salvador) with correct property names and room counts
- [ ] `scripts/import_historical.py` runs without errors and reports ~4,600+ rows imported
- [ ] `outputs/competitor-analysis/data/raw_data.csv` exists and contains historical records after import
- [ ] `outputs/competitor-analysis/reports/` directory exists
- [ ] Running `python run.py --report-only` after historical import generates a valid `.xlsx` report
- [ ] The generated Excel file has correctly named sheets: `Occ - Guatapé`, `Rates - Guatapé`, `Occ - Medellín`, `Rates - Medellín`, `Occ - El Salvador`, `Rates - El Salvador`, `Occ - Pereira`, `Rates - Pereira`, `Raw Data`
- [ ] Occupancy cells are color-coded: green ≥80%, yellow 60–79%, orange 40–59%, red <40%
- [ ] Hopco properties appear bold in each sheet; competitors appear in normal weight
- [ ] `.claude/commands/competitor-analysis.md` follows the same format as existing commands
- [ ] `CLAUDE.md` updated with new command and Competitor Analysis System documentation
- [ ] `scripts/SETUP.md` includes historical import step and URL verification instructions

---

## Success Criteria

The implementation is complete when:

1. Running `python scripts/run.py` from the workspace root scrapes all configured properties, appends results to the CSV data store, and saves a dated `.xlsx` report to `outputs/competitor-analysis/reports/`
2. The Excel report contains at minimum: one occupancy sheet per market with color-coded cells, one rate sheet per market, and a raw data sheet
3. Running `/competitor-analysis interpret` through Claude produces a readable summary of which properties are performing above/below competitors
4. `CLAUDE.md` accurately reflects the new system so future sessions have full context

---

## Notes

- **Anti-bot risk**: Booking.com may periodically block automated requests. The scraper includes delays and a realistic browser fingerprint to minimize this. If blocks occur, increase `scrape_delay_seconds` in `config.json` or run during off-peak hours.
- **URL verification required**: All Booking.com URLs in `config.json` must be manually verified before the first run. Search for each property on Booking.com, navigate to its page, and copy the URL.
- **Room counts**: Total room count for each property is essential for occupancy calculation. Find it on each property's Booking.com listing or in your PMS.
- **Future enhancement — Cloudbeds API**: Hopco's own occupancy from Cloudbeds would be more accurate than scraping Booking.com. Once the system is running, a follow-up plan can add Cloudbeds API integration for "ours" type properties.
- **Future enhancement — Expedia**: The scraper is designed for Booking.com. Adding Expedia support would require a second scraper module, since page structures differ.
- **Legal note**: This system scrapes publicly visible information from Booking.com for internal business intelligence, consistent with standard revenue management practices in the hotel industry. Review Booking.com's terms of service if you have any concerns.
---

## Implementation Notes

**Implemented:** 2026-03-01

### Summary

- Created output directory structure (`outputs/competitor-analysis/data/` and `reports/`)
- Created `scripts/requirements.txt` with Python dependencies
- Created `scripts/config.json` with all 4 markets and 28 properties (room counts from inventory file)
- Created `scripts/scraper.py` — Playwright-based Booking.com scraper
- Created `scripts/data_store.py` — CSV read/write module
- Created `scripts/report_generator.py` — formatted multi-sheet Excel workbook generator
- Created `scripts/import_historical.py` — one-time historical Excel importer
- Created `scripts/run.py` — pipeline orchestrator with `--report-only` and `--market` flags
- Created `scripts/SETUP.md` — first-time setup instructions
- Created `.claude/commands/competitor-analysis.md` — workspace slash command
- Updated `CLAUDE.md` with new command, Competitor Analysis System section, and updated workspace structure
- Ran `python import_historical.py` — imported 4,331 rows from 3 historical Excel files
- Ran `python run.py --report-only` — generated first Excel report (`competitor-analysis-2026-03-01.xlsx`) with 7 sheets

### Deviations from Plan

1. **Lazy scraper import in run.py**: The plan showed `from scraper import scrape_property` at the top of `run.py`. Changed to a lazy import inside the scrape function so `--report-only` mode works without playwright installed.
2. **El Salvador import: 600 rows (not 925)**: The Excel file had duplicate data in two sets of columns (the file had the same data repeated in columns 1-6 and 8-12). The import script's deduplication correctly excluded the 325 duplicate rows.
3. **data_store.py enhanced**: Added `read_for_report()` function that falls back to the most recent available scrape date if today's data doesn't exist yet — not in original plan but necessary for a clean user experience.

### Issues Encountered

- `playwright` not installed in system Python caused initial `run.py --report-only` failure. Fixed with lazy import so report generation works independently of playwright installation.
