# dividend-calculator
Calculates the dividends earned and rate of return

## Running the NestJS API

Prerequisites: Node.js 18+ and npm.

### Environment variables (.env)

Create a `.env` file in the project root:

```env
FINNHUB_API_KEY=your_key_here
# Optional
PORT=3000
```

Install dependencies:

```bash
npm install
```

Start the server (watch mode):

```bash
npm run start:dev
```

Start the server (prod mode):

```bash
npm run build && npm run start:prod
```

The server listens on port `3000` by default. You can override with `PORT` env var.

### Health Check

GET `http://localhost:3000/health` → `{ "status": "ok" }`

### Dividends API (Finnhub)

Set your API key:

```bash
export FINNHUB_API_KEY=your_key_here
```

Endpoint:

```text
GET /dividends/:ticker?from=YYYY-MM-DD&to=YYYY-MM-DD
```

Example:

```bash
curl "http://localhost:3000/dividends/VYM?from=2020-01-01&to=2025-12-31"
```

Notes:
- Requires `FINNHUB_API_KEY`.
- Simple in-memory cache (10 minutes) to reduce API calls.

### Dividends API (StockAnalysis.com Scraper)

Scrapes dividend history from [stockanalysis.com](https://stockanalysis.com).

Endpoint:

```text
GET /dividends/:ticker/stockanalysis
```

Example:

```bash
curl "http://localhost:3000/dividends/COYY/stockanalysis"
```

Response format:

```json
[
  {
    "exDividendDate": "Oct 31, 2025",
    "cashAmount": "$0.40815",
    "recordDate": "Oct 31, 2025",
    "payDate": "Nov 4, 2025"
  },
  ...
]
```

Notes:
- No API key required.
- Simple in-memory cache (1 hour) to reduce scraping.
- Works for ETFs listed on stockanalysis.com.
- **Automatically saves dividend history to CSV file** in `src/data/{ticker}_dividends.csv` (e.g., `src/data/spy_dividends.csv`).
- **Smart CSV updates**: If a CSV file already exists, only new dividend entries (after the latest ex-dividend date) are appended.
- All dividend entries are kept in **descending order** by ex-dividend date (newest first).

### Batch Processing API

Processes all tickers from CSV files and saves dividend history for each. Three endpoints are available:

#### 1. YieldMax Other ETFs

Endpoint:

```text
GET /dividends/batch/yieldmax-other
```

Processes tickers from `yieldMax_Weekly_Dividend_ETFs-Other.csv` and saves to `src/data/yieldmax/other/`

Example:

```bash
curl "http://localhost:3000/dividends/batch/yieldmax-other"
```

#### 2. YieldMax Single Stock Option Income ETFs

Endpoint:

```text
GET /dividends/batch/yieldmax-single-stock
```

Processes tickers from `yieldMax_Weekly_Dividend_ETFs-Single_Stock_Option_Income.csv` and saves to `src/data/yieldmax/single_stock_option/`

Example:

```bash
curl "http://localhost:3000/dividends/batch/yieldmax-single-stock"
```

#### 3. YieldMax Short Single Stock Option Income ETFs

Endpoint:

```text
GET /dividends/batch/yieldmax-short-single-stock
```

Processes tickers from `yieldMax_Weekly_Dividend_ETFs-Short_Single_Stock_Option_Income.csv` and saves to `src/data/yieldmax/short_single_stock_option/`

Example:

```bash
curl "http://localhost:3000/dividends/batch/yieldmax-short-single-stock"
```

**Response format (all endpoints):**

```json
[
  { "ticker": "YMAG", "success": true },
  { "ticker": "YMAX", "success": true },
  { "ticker": "SLTY", "success": false, "error": "Error message..." },
  ...
]
```

**Notes (all endpoints):**
- Reads ticker list from the corresponding CSV file (first column, skipping header).
- For each ticker, calls the stockanalysis scraping method.
- Saves all dividend history CSV files to the specified output directory.
- Returns success/failure status for each ticker processed.
- Continues processing even if individual tickers fail.
