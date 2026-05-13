# Weekly Stock Report Generator (Next.js Dashboard)

A simple web tool for **JASMIN** (our warehouse colleague) to check stock levels, see what’s reserved, and compare her manual counts with the system.  
Works with **BaseLinker** and gives you a clean, filterable table – plus exports designed for the weekly physical stock check.

## 👥 Who is this for?

- **JASMIN** – uses the dashboard every week to prepare for her physical stock count, export a CSV, fill in actual quantities, and compare with the system.
- **Developers** – maintain or extend the tool, update hardcoded data, or deploy it.

## ✨ What you can do

| Action               | How it helps                                                                                                                                   |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **Sync Data**        | Loads all products, variants, stock levels, and reserved quantities from BaseLinker.                                                           |
| **Filter table**     | Hide zero‑stock items, show only reserved products, or hide marketplace prices.                                                                |
| **JASMIN Export**    | Creates a CSV with only **Warehouse + Office** stock (the two locations she checks). Includes empty columns for her manual count and comments. |
| **Standard Export**  | Exports the current filtered table as CSV.                                                                                                     |
| **Stock Comparison** | Upload a CSV from JASMIN’s manual count → see missing SKUs and quantity mismatches.                                                            |
| **Orders by Status** | Expand any order status to see recent orders and which products are reserved.                                                                  |

## 🚀 Quick start for JASMIN (non‑tech)

1. Open the website (your colleague will give you the link).
2. Click **🔄 Sync Data** – wait a few seconds.
3. Use filters if you want (e.g., “Hide zero actual stock”).
4. Click **JASMIN Export CSV** – save the file.
5. Go to the warehouse, find the products, and fill in:
   - `Jasmin count` (the real quantity you count)
   - `Match` (yes/no or checkmark)
   - Comments if something is wrong.
6. Save the CSV and upload it in the **Stock Comparison Tool** at the bottom of the page.
7. The tool will show you:
   - Products that are only in your manual list (maybe forgotten in the system)
   - Products only in BaseLinker (missing from your count)
   - Quantities that don’t match (with the difference)

## 🔧 Setup for developers

### Requirements

- Node.js 18+ and npm
- A BaseLinker account with an API token

### Installation

```bash
git clone https://github.com/your-org/weekly-stock-report.git
cd weekly-stock-report
npm install
```

### Environment variables

Create a `.env.local` file:

```env
BASELINKER_TOKEN=your_base_linker_api_token
```

### Run locally

```bash
npm run dev
```

Open `http://localhost:3000`

### Deploy to production

Deploy to **Vercel**, **Netlify**, or any Node.js hosting.  
Add the `BASELINKER_TOKEN` as an environment secret in your hosting dashboard.

## 📁 Key files for developers

| File                                   | What it does                                                                                          |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `app/page.tsx`                         | Main page, renders `BaseLinkerProductData`                                                            |
| `components/BaseLinkerProductData.tsx` | The main table, sync logic, filters, exports                                                          |
| `components/StockComparisonTool.tsx`   | CSV upload and mismatch report                                                                        |
| `components/OrdersByStatus.tsx`        | Expandable order status lists                                                                         |
| `app/api/baselinker-proxy/route.ts`    | Proxy to BaseLinker + hardcoded responses                                                             |
| `lib/hardcodedData.ts`                 | Inventories, warehouses, price groups, order statuses – change these if your BaseLinker setup differs |

## 🗂️ Hardcoded data (edit if needed)

- **Inventories** – default inventory ID 8865 (“Total Inventory”)
- **Price groups** – eBay (8140), Amazon (9733), Shopify (9734), OnBuy (9735), TikTok (13007)
- **Warehouses** – Warehouse (21879), Office (31472), Loading Bay (27316), RT Bytes (19407), Outside (42297)
- **Order statuses** – list of status IDs used to calculate reserved quantities

If you add or remove warehouses/statuses, update `hardcodedData.ts` and redeploy.

## 🧪 How the JASMIN export works

- Uses **only Warehouse (21879) + Office (31472)** stock.
- Filters out products where `(Warehouse+Office) + reserved = 0`.
- Adds placeholder columns: `Jasmin count`, `Match`, `Loading Bay`, `RT Bytes (FBA)`, `Outside`, two Jasmin comments, two AJ comments.
- Sorting: by `Location(s)` → `Product Name`.

## 📄 License

Internal use only – do not share API tokens or hardcoded IDs publicly.
