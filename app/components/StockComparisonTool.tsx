"use client";

import { useState } from "react";
import Papa from "papaparse";

interface DisplayRow {
  rowId: string;
  product_id: number;
  parent_id: number | null;
  name: string;
  ean: string;
  sku: string;
  prices: Record<string, number>;
  stock: Record<string, number>;
}

interface StockComparisonToolProps {
  allRows: DisplayRow[];
  reservedQuantities: Record<number, number>;
  // helper to get quantity for a specific warehouse (by type and id)
  getWarehouseQuantity: (
    row: DisplayRow,
    warehouseType: string,
    warehouseId: number,
  ) => number;
  // we'll hardcode the warehouse IDs used in Jasmin export (21879 = Warehouse, 31472 = Office)
}

export default function StockComparisonTool({
  allRows,
  reservedQuantities,
  getWarehouseQuantity,
}: StockComparisonToolProps) {
  const [jasminMap, setJasminMap] = useState<Map<string, number | null>>(
    new Map(),
  );
  const [comparisonResult, setComparisonResult] = useState<{
    onlyInJasmin: string[];
    onlyInAutomation: string[];
    mismatches: Array<{
      sku: string;
      jasmin_qty: number | string;
      automation_qty: number | string;
      difference: number | string;
    }>;
  } | null>(null);
  const [loading, setLoading] = useState(false);

  // Build automation stock map from existing BaseLinker data
  const buildAutomationMap = (): Map<string, number> => {
    const map = new Map<string, number>();
    // Jasmin export uses warehouse IDs 21879 (Warehouse) + 31472 (Office) only
    const warehouseIds = [21879, 31472];

    for (const row of allRows) {
      const sku = row.sku?.trim();
      if (!sku) continue; // skip rows without SKU

      // sum stock from both warehouses
      let stockSum = 0;
      for (const whId of warehouseIds) {
        stockSum += getWarehouseQuantity(row, "bl", whId);
      }
      const reserved = reservedQuantities[row.product_id] || 0;
      const actualStock = stockSum + reserved;
      map.set(sku, actualStock);
    }
    return map;
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setLoading(true);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const jasminData = new Map<string, number | null>();
        const rows = results.data as any[];
        for (const row of rows) {
          const sku = row["product_sku"]?.trim();
          if (!sku) continue;
          let qty: number | null = null;
          const rawQty = row["quantity base warehouse"];
          if (rawQty !== undefined && rawQty !== "") {
            const parsed = parseFloat(rawQty);
            if (!isNaN(parsed)) qty = parsed;
          }
          jasminData.set(sku, qty);
        }
        setJasminMap(jasminData);
        performComparison(jasminData);
      },
      error: (error) => {
        console.error("CSV parse error:", error);
        alert("Failed to parse CSV file.");
        setLoading(false);
      },
    });
  };

  const performComparison = (jasminData: Map<string, number | null>) => {
    const automationData = buildAutomationMap();

    const jasminSkus = new Set(jasminData.keys());
    const automationSkus = new Set(automationData.keys());

    const onlyInJasmin = [...jasminSkus].filter(
      (sku) => !automationSkus.has(sku),
    );
    const onlyInAutomation = [...automationSkus].filter(
      (sku) => !jasminSkus.has(sku),
    );
    const commonSkus = [...jasminSkus].filter((sku) => automationSkus.has(sku));

    const mismatches: Array<{
      sku: string;
      jasmin_qty: number | string;
      automation_qty: number | string;
      difference: number | string;
    }> = [];

    for (const sku of commonSkus) {
      const jasminQty = jasminData.get(sku);
      const autoQty = automationData.get(sku);

      if (jasminQty === undefined && autoQty === undefined) continue;
      if (jasminQty === undefined || jasminQty === null) {
        mismatches.push({
          sku,
          jasmin_qty: "(missing)",
          automation_qty: autoQty !== undefined ? autoQty : "(missing)",
          difference: "N/A",
        });
        continue;
      }
      if (autoQty === undefined) {
        mismatches.push({
          sku,
          jasmin_qty: jasminQty,
          automation_qty: "(missing)",
          difference: "N/A",
        });
        continue;
      }
      if (jasminQty !== autoQty) {
        mismatches.push({
          sku,
          jasmin_qty: jasminQty,
          automation_qty: autoQty,
          difference: autoQty - jasminQty,
        });
      }
    }

    setComparisonResult({
      onlyInJasmin,
      onlyInAutomation,
      mismatches,
    });
    setLoading(false);
  };

  const downloadCSV = (
    filename: string,
    headers: string[],
    rows: string[][],
  ) => {
    const csvContent = [headers, ...rows]
      .map((row) =>
        row
          .map((cell) =>
            typeof cell === "string" &&
            (cell.includes(",") || cell.includes('"'))
              ? `"${cell.replace(/"/g, '""')}"`
              : cell,
          )
          .join(","),
      )
      .join("\n");
    const blob = new Blob(["\uFEFF" + csvContent], {
      type: "text/csv;charset=utf-8;",
    });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const exportOnlyInJasmin = () => {
    if (!comparisonResult) return;
    downloadCSV(
      "skus_only_in_jasmin_table.csv",
      ["sku"],
      comparisonResult.onlyInJasmin.map((sku) => [sku]),
    );
  };

  const exportOnlyInAutomation = () => {
    if (!comparisonResult) return;
    downloadCSV(
      "skus_only_in_automation_table.csv",
      ["sku"],
      comparisonResult.onlyInAutomation.map((sku) => [sku]),
    );
  };

  const exportMismatches = () => {
    if (!comparisonResult) return;
    const headers = [
      "sku",
      "jasmin_quantity",
      "automation_quantity",
      "difference",
    ];
    const rows = comparisonResult.mismatches.map((m) => [
      m.sku,
      String(m.jasmin_qty),
      String(m.automation_qty),
      String(m.difference),
    ]);
    downloadCSV("quantity_mismatches.csv", headers, rows);
  };

  return (
    <div className="border-t border-gray-700 mt-6 pt-4">
      <h3 className="text-lg font-bold mb-2">
        📊 Stock Comparison (BaseLinker vs Jasmin CSV)
      </h3>
      <div className="mb-3">
        <label className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded inline-block cursor-pointer">
          Upload Jasmin CSV (product_sku, quantity base warehouse)
          <input
            type="file"
            accept=".csv"
            onChange={handleFileUpload}
            className="hidden"
          />
        </label>
        {loading && <span className="ml-3">⏳ Processing...</span>}
      </div>

      {comparisonResult && (
        <div className="space-y-3">
          <div className="bg-gray-800 p-3 rounded">
            <p>
              🔹 SKUs only in Jasmin: {comparisonResult.onlyInJasmin.length}
            </p>
            <p>
              🔸 SKUs only in BaseLinker:{" "}
              {comparisonResult.onlyInAutomation.length}
            </p>
            <p>⚠️ Quantity mismatches: {comparisonResult.mismatches.length}</p>
          </div>

          <div className="flex gap-3">
            <button
              onClick={exportOnlyInJasmin}
              disabled={comparisonResult.onlyInJasmin.length === 0}
              className="bg-yellow-600 px-3 py-1 rounded disabled:opacity-50"
            >
              📄 Download SKUs only in Jasmin
            </button>
            <button
              onClick={exportOnlyInAutomation}
              disabled={comparisonResult.onlyInAutomation.length === 0}
              className="bg-yellow-600 px-3 py-1 rounded disabled:opacity-50"
            >
              📄 Download SKUs only in BaseLinker
            </button>
            <button
              onClick={exportMismatches}
              disabled={comparisonResult.mismatches.length === 0}
              className="bg-red-600 px-3 py-1 rounded disabled:opacity-50"
            >
              📄 Download Quantity Mismatches
            </button>
          </div>

          {comparisonResult.mismatches.length > 0 && (
            <div className="max-h-60 overflow-auto text-sm">
              <table className="min-w-full text-left">
                <thead className="bg-gray-700 sticky top-0">
                  <tr>
                    <th className="px-2 py-1">SKU</th>
                    <th className="px-2 py-1">Jasmin Qty</th>
                    <th className="px-2 py-1">BaseLinker Qty</th>
                    <th className="px-2 py-1">Diff</th>
                  </tr>
                </thead>
                <tbody>
                  {comparisonResult.mismatches.map((m, idx) => (
                    <tr key={idx} className="border-b border-gray-700">
                      <td className="px-2 py-1">{m.sku}</td>
                      <td className="px-2 py-1">{m.jasmin_qty}</td>
                      <td className="px-2 py-1">{m.automation_qty}</td>
                      <td className="px-2 py-1">{m.difference}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
