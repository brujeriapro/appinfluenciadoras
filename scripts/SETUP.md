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
4. Paste it into the config file, replacing the `"VERIFY: search..."` text

Also:
- Fill in `total_rooms` for **Cerritos Mall** (Pereira) — not in the inventory file
- Replace `COMPETITOR_1_PEREIRA` with real Pereira competitor(s) including their URLs and room counts

## Step 2: Import Historical Data (run once)

This imports all manually collected history (2025–2026) into the system:

```bash
cd scripts/
source venv/bin/activate
python import_historical.py
```

Expected output: ~4,600+ rows imported across Guatapé, Medellín, and El Salvador.

## Step 3: Verify with a Test Report

Generate a report from the imported historical data before running the live scraper:

```bash
python run.py --report-only
```

Open the report from:
```
outputs/competitor-analysis/reports/competitor-analysis-YYYY-MM-DD.xlsx
```

## Step 4: Run the Daily Scraper

Once all URLs are filled in `config.json`:

```bash
# Full pipeline: scrape all markets + generate report
python run.py

# Scrape only one market
python run.py --market Guatapé
python run.py --market Medellín
python run.py --market "El Salvador"
python run.py --market Pereira

# Regenerate report without scraping (uses most recent data)
python run.py --report-only

# Generate report from a specific past date
python run.py --date 2026-02-15
```

## Viewing Reports

Reports are saved to:
```
outputs/competitor-analysis/reports/competitor-analysis-YYYY-MM-DD.xlsx
```

Open with Microsoft Excel, Google Sheets, or LibreOffice Calc.

**Sheet guide:**
- `Occ - Guatapé` / `Occ - Medellín` etc. — Occupancy % grid per market
  - Green = ≥80% | Yellow = 60–79% | Orange = 40–59% | Red = <40%
  - Hopco properties are highlighted in blue and shown in bold
  - "SOLD" = property is sold out for that date
- `Rates - Guatapé` / `Rates - Medellín` etc. — Min/max rates per property per date
- `Raw Data` — Full export of all records used for the report

## Schedule Daily Runs (macOS)

To run automatically every morning at 8am:

```bash
crontab -e
```

Add this line (update `/path/to/workspace` to your actual path):
```
0 8 * * * cd /path/to/workspace/scripts && source venv/bin/activate && python run.py >> ../outputs/competitor-analysis/data/run.log 2>&1
```

## Troubleshooting

| Problem | Solution |
|---|---|
| "Skipping [property] — booking_url not configured" | Fill in the URL in `config.json` |
| Timeout errors | Booking.com may be slow — increase `scrape_delay_seconds` in `config.json` |
| No rooms found / rates are None | URL may be wrong or page layout changed — verify URL manually in browser |
| "No data found for [date]" | Run `python import_historical.py` first, or run without `--report-only` |
| Report shows `—` for all dates | The date range in config may be ahead of available data — try `--report-only` |

## Adding a New Competitor

Edit `scripts/config.json` and add a new entry under the appropriate market:

```json
{
  "name": "New Hotel Name",
  "type": "competitor",
  "booking_url": "https://www.booking.com/hotel/co/new-hotel-slug.html",
  "total_rooms": 20
}
```

The name must match exactly how it will appear in the data.
