# Competitor Analysis

Run, interpret, or manage the automated competitor analysis system for Hopco's 4 markets (Guatapé, Medellín, Pereira, El Salvador).

## Variables

action: $ARGUMENTS (optional — e.g., "run", "interpret", "status", "add competitor [name]", "setup")

---

## Instructions

Based on the action requested:

### If action is "run" or empty:
1. Check that `scripts/venv/` exists. If not, display the setup instructions from `scripts/SETUP.md`.
2. Run the pipeline:
   ```
   cd scripts && source venv/bin/activate && python run.py
   ```
3. Report: markets scraped, properties checked, rows saved, report file path.
4. Summarize any properties that were skipped due to missing URLs.

### If action is "interpret" or "read" or "analyze":
1. Find the most recent CSV data at `outputs/competitor-analysis/data/raw_data.csv`.
2. Read the file and filter to the most recent scrape date.
3. For each market, provide:
   - **Occupancy summary**: Hopco properties vs. competitor average for today and the next 7 days
   - **Rate positioning**: Are Hopco rates above or below competitor average? By how much?
   - **High-demand dates**: Which future dates show most properties near sold out?
   - **Alerts**: Any Hopco property with occupancy significantly below the market average
4. Close with 2–3 concrete revenue management recommendations.

### If action is "status":
1. Check if `outputs/competitor-analysis/data/raw_data.csv` exists.
2. Report:
   - Last scrape date in the data store
   - Number of properties being tracked (by market)
   - Total historical records
   - Properties with unconfigured URLs in `scripts/config.json` (VERIFY: entries)
3. Confirm whether the system is ready to run or needs setup.

### If action starts with "add competitor":
1. Ask user for: property name, market (Guatapé/Medellín/Pereira/El Salvador), Booking.com URL, total room count.
2. Edit `scripts/config.json` to add the new competitor under the correct market.
3. Confirm the addition and remind user to verify the URL.

### If action is "setup":
1. Display the full contents of `scripts/SETUP.md`.
2. Walk through each step with the user.

### If action is "import" or "import history":
1. Run: `cd scripts && source venv/bin/activate && python import_historical.py`
2. Report the number of rows imported per market.

---

## Output

Always end with:
- System status: configured / needs URL verification / ready to run
- Last run date (if data exists)
- Suggested next action
