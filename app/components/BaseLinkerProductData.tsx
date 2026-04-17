// components/BaseLinkerProductData.tsx
"use client";

import {
  HARDCODED_PRICE_GROUPS,
  HARDCODED_WAREHOUSES,
  HARDCODED_ORDER_STATUSES,
} from "@/lib/hardcodedData";
import { useState, useEffect, useCallback, useMemo } from "react";

const PAGE_LIMIT = 200;
const CACHE_KEYS = {
  ROWS: "baselinker_rows",
  LOCATIONS: "baselinker_locations",
  RESERVED: "baselinker_reserved",
  LAST_SYNC: "baselinker_last_sync",
};

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

type ActualStockMode = "all" | "warehouse" | "office" | "loadingBay";

export default function BaseLinkerProductData() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [allRows, setAllRows] = useState<DisplayRow[]>([]);
  const [inventoryId, setInventoryId] = useState<number | null>(null);
  const [locationMap, setLocationMap] = useState<Record<string, string>>({});
  const [fetchingLocations, setFetchingLocations] = useState(false);
  const [fetchingOrders, setFetchingOrders] = useState(false);
  const [reservedQuantities, setReservedQuantities] = useState<
    Record<number, number>
  >({});
  const [showReservedOnly, setShowReservedOnly] = useState(false);
  const [hideZeroActualStock, setHideZeroActualStock] = useState(false);
  const [hideMarketplacePrices, setHideMarketplacePrices] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const [actualStockMode, setActualStockMode] =
    useState<ActualStockMode>("all");

  const priceGroups = HARDCODED_PRICE_GROUPS.price_groups;
  const allWarehouses = HARDCODED_WAREHOUSES.warehouses;
  const orderStatuses = HARDCODED_ORDER_STATUSES.statuses;
  const MARKETPLACE_PRICE_GROUP_IDS = [9733, 9734, 9735];
  const getSelectedWarehouse = (mode: ActualStockMode) => {
    switch (mode) {
      case "warehouse":
        return { type: "bl", id: 21879 }; // Warehouse
      case "office":
        return { type: "bl", id: 31472 }; // Office
      case "loadingBay":
        return { type: "bl", id: 27316 }; // Loading Bay
      default:
        return null;
    }
  };
  // Determine which warehouse columns to show based on mode
  const visibleWarehouses = useMemo(() => {
    if (actualStockMode === "all") {
      return allWarehouses;
    }
    // For specific mode, show only the selected warehouse's column
    const selected = getSelectedWarehouse(actualStockMode);
    if (!selected) return [];
    return allWarehouses.filter(
      (wh) =>
        wh.warehouse_type === selected.type && wh.warehouse_id === selected.id,
    );
  }, [actualStockMode, allWarehouses]);

  const visiblePriceGroups = useMemo(() => {
    if (!hideMarketplacePrices) return priceGroups;
    return priceGroups.filter(
      (pg) => !MARKETPLACE_PRICE_GROUP_IDS.includes(pg.price_group_id),
    );
  }, [priceGroups, hideMarketplacePrices]);

  // Load cached data on mount
  useEffect(() => {
    async function fetchInventoryId() {
      try {
        const res = await fetch("/api/baselinker-proxy", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ method: "getInventories", parameters: {} }),
        });
        const data = await res.json();
        if (data.status === "SUCCESS" && data.inventories?.length) {
          const defaultInv =
            data.inventories.find((inv: any) => inv.is_default) ||
            data.inventories[0];
          setInventoryId(Number(defaultInv.inventory_id));
        } else {
          setError("No inventories found.");
        }
      } catch (err: any) {
        setError("Failed to fetch inventory list: " + err.message);
      }
    }
    fetchInventoryId();

    const cachedRows = localStorage.getItem(CACHE_KEYS.ROWS);
    const cachedLocations = localStorage.getItem(CACHE_KEYS.LOCATIONS);
    const cachedReserved = localStorage.getItem(CACHE_KEYS.RESERVED);
    const cachedLastSync = localStorage.getItem(CACHE_KEYS.LAST_SYNC);

    if (cachedRows) setAllRows(JSON.parse(cachedRows));
    if (cachedLocations) setLocationMap(JSON.parse(cachedLocations));
    if (cachedReserved) setReservedQuantities(JSON.parse(cachedReserved));
    if (cachedLastSync) setLastSyncTime(cachedLastSync);
  }, []);

  // Flatten products + variants into DisplayRow[]
  const flattenProductsToRows = (products: any[]): DisplayRow[] => {
    const rows: DisplayRow[] = [];
    for (const product of products) {
      rows.push({
        rowId: `product_${product.product_id}`,
        product_id: product.product_id,
        parent_id: null,
        name: product.name || "—",
        ean: product.ean || "—",
        sku: product.sku || "—",
        prices: product.prices || {},
        stock: product.stock || {},
      });

      if (product.variants) {
        if (Array.isArray(product.variants)) {
          for (const variant of product.variants) {
            const variantId =
              variant.variant_id ?? variant.id ?? variant.product_id;
            if (!variantId) continue;
            rows.push({
              rowId: `variant_${product.product_id}_${variantId}`,
              product_id: variantId,
              parent_id: product.product_id,
              name: variant.name || product.name || "—",
              ean: variant.ean || product.ean || "—",
              sku: variant.sku || product.sku || "—",
              prices: variant.prices || {},
              stock: variant.stock || {},
            });
          }
        } else if (typeof product.variants === "object") {
          for (const [variantId, variant] of Object.entries(product.variants)) {
            const vId = parseInt(variantId, 10);
            rows.push({
              rowId: `variant_${product.product_id}_${vId}`,
              product_id: vId,
              parent_id: product.product_id,
              name: (variant as any).name || product.name || "—",
              ean: (variant as any).ean || product.ean || "—",
              sku: (variant as any).sku || product.sku || "—",
              prices: (variant as any).prices || {},
              stock: (variant as any).stock || {},
            });
          }
        }
      }
    }
    return rows;
  };

  const fetchAllProductIds = useCallback(async (): Promise<number[]> => {
    if (!inventoryId) return [];
    let page = 1;
    let allIds: number[] = [];
    let hasMore = true;
    while (hasMore) {
      const res = await fetch("/api/baselinker-proxy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          method: "getInventoryProductsList",
          parameters: { inventory_id: inventoryId, page, limit: PAGE_LIMIT },
        }),
      });
      const data = await res.json();
      if (data.status !== "SUCCESS" || !data.products) {
        throw new Error(data.error_message || "Failed to fetch product list.");
      }
      const ids = Object.keys(data.products).map((id) => parseInt(id, 10));
      if (ids.length === 0) {
        hasMore = false;
      } else {
        allIds.push(...ids);
        page++;
        if (ids.length < PAGE_LIMIT) hasMore = false;
      }
    }
    return allIds;
  }, [inventoryId]);

  const fetchFullProductDetails = useCallback(
    async (productIds: number[]): Promise<any[]> => {
      if (!inventoryId || productIds.length === 0) return [];
      const BATCH_SIZE = 50;
      const batches: number[][] = [];
      for (let i = 0; i < productIds.length; i += BATCH_SIZE) {
        batches.push(productIds.slice(i, i + BATCH_SIZE));
      }
      const allProductsData: any[] = [];
      for (const batch of batches) {
        const res = await fetch("/api/baselinker-proxy", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            method: "getInventoryProductsData",
            parameters: {
              inventory_id: inventoryId,
              products: batch.map((id) => String(id)),
            },
          }),
        });
        const data = await res.json();
        if (data.status === "SUCCESS" && data.products) {
          for (const [id, productData] of Object.entries(data.products)) {
            allProductsData.push({
              ...(productData as any),
              product_id: parseInt(id, 10),
            });
          }
        }
      }
      return allProductsData;
    },
    [inventoryId],
  );

  const extractLocationMap = (
    productsDetails: any[],
  ): Record<string, string> => {
    const map: Record<string, string> = {};
    const processItem = (item: any, id: number) => {
      let locationsObj = item.locations;
      if (!locationsObj && item.stock && typeof item.stock === "object") {
        const stockEntries = Object.entries(item.stock);
        const locs = stockEntries
          .map(([key, val]: [string, any]) => {
            if (val && typeof val === "object" && val.location)
              return val.location;
            return null;
          })
          .filter(Boolean);
        if (locs.length) locationsObj = locs;
      }
      if (locationsObj && typeof locationsObj === "object") {
        let locationValues: string[] = [];
        if (Array.isArray(locationsObj)) {
          locationValues = locationsObj.filter(
            (l): l is string => typeof l === "string",
          );
        } else {
          locationValues = Object.values(locationsObj).filter(
            (l): l is string => typeof l === "string",
          );
        }
        const unique = [...new Set(locationValues)];
        map[id] = unique.join(", ") || "—";
      } else {
        map[id] = "—";
      }
    };

    for (const product of productsDetails) {
      processItem(product, product.product_id);
      if (product.variants) {
        if (Array.isArray(product.variants)) {
          for (const variant of product.variants) {
            const variantId =
              variant.variant_id ?? variant.id ?? variant.product_id;
            if (variantId) processItem(variant, variantId);
          }
        } else if (typeof product.variants === "object") {
          for (const [variantId, variant] of Object.entries(product.variants)) {
            processItem(variant as any, parseInt(variantId, 10));
          }
        }
      }
    }
    return map;
  };

  const fetchReservedQuantities = useCallback(async () => {
    setFetchingOrders(true);
    const reserved: Record<number, number> = {};
    const fetchAllOrdersForStatus = async (statusId: number) => {
      let page = 1;
      let hasMore = true;
      while (hasMore) {
        const res = await fetch("/api/baselinker-proxy", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            method: "getOrders",
            parameters: {
              status_id: statusId,
              page,
              limit: 100,
              get_unconfirmed_orders: false,
            },
          }),
        });
        const data = await res.json();
        if (data.status !== "SUCCESS") {
          console.warn(`Failed to fetch orders for status ${statusId}`);
          break;
        }
        const orders = data.orders || [];
        for (const order of orders) {
          const products = order.products || [];
          for (const item of products) {
            const variantId = item.product_id;
            if (variantId) {
              const qty = Number(item.quantity) || 0;
              reserved[variantId] = (reserved[variantId] || 0) + qty;
            }
          }
        }
        hasMore = orders.length === 100;
        page++;
      }
    };
    await Promise.all(orderStatuses.map((s) => fetchAllOrdersForStatus(s.id)));
    setFetchingOrders(false);
    return reserved;
  }, [orderStatuses]);

  const syncData = useCallback(async () => {
    if (!inventoryId) {
      setError("Inventory ID not available yet.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const productIds = await fetchAllProductIds();
      if (productIds.length === 0) {
        setError("No products found.");
        return;
      }
      const productDetails = await fetchFullProductDetails(productIds);
      const locations = extractLocationMap(productDetails);
      const reserved = await fetchReservedQuantities();
      const rows = flattenProductsToRows(productDetails);

      setAllRows(rows);
      setLocationMap(locations);
      setReservedQuantities(reserved);

      localStorage.setItem(CACHE_KEYS.ROWS, JSON.stringify(rows));
      localStorage.setItem(CACHE_KEYS.LOCATIONS, JSON.stringify(locations));
      localStorage.setItem(CACHE_KEYS.RESERVED, JSON.stringify(reserved));
      const now = new Date().toLocaleString();
      setLastSyncTime(now);
      localStorage.setItem(CACHE_KEYS.LAST_SYNC, now);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [
    inventoryId,
    fetchAllProductIds,
    fetchFullProductDetails,
    fetchReservedQuantities,
  ]);

  const getProductPriceForGroup = (
    row: DisplayRow,
    priceGroupId: number,
  ): string => {
    const price = row.prices?.[priceGroupId.toString()];
    if (price !== undefined && price !== null) {
      const numPrice = typeof price === "string" ? parseFloat(price) : price;
      if (!isNaN(numPrice)) return numPrice.toFixed(2);
    }
    return "—";
  };

  const getWarehouseQuantity = (row: DisplayRow, warehouse: any): number => {
    const stock = row.stock || {};
    const rawKey = `${warehouse.warehouse_type}_${warehouse.warehouse_id}`;
    return stock[rawKey] ?? stock[warehouse.warehouse_id.toString()] ?? 0;
  };

  const getFilteredWarehouseStock = useCallback(
    (row: DisplayRow): number => {
      if (actualStockMode === "all") {
        return allWarehouses.reduce(
          (total, wh) => total + getWarehouseQuantity(row, wh),
          0,
        );
      }
      const wh = getSelectedWarehouse(actualStockMode);
      if (!wh) return 0;
      const matchedWh = allWarehouses.find(
        (w) => w.warehouse_type === wh.type && w.warehouse_id === wh.id,
      );
      if (!matchedWh) return 0;
      return getWarehouseQuantity(row, matchedWh);
    },
    [allWarehouses, actualStockMode],
  );

  const getReservedQuantity = (productId: number): number => {
    return reservedQuantities[productId] || 0;
  };

  const getActualStock = useCallback(
    (row: DisplayRow): number => {
      const stock = getFilteredWarehouseStock(row);
      const reserved = getReservedQuantity(row.product_id);
      return stock + reserved;
    },
    [getFilteredWarehouseStock],
  );

  const filteredRows = useMemo(() => {
    let rows = showReservedOnly
      ? allRows.filter((row) => getReservedQuantity(row.product_id) > 0)
      : allRows;

    if (hideZeroActualStock) {
      rows = rows.filter((row) => getActualStock(row) !== 0);
    }

    return [...rows].sort((a, b) => {
      const locA = (locationMap[a.product_id] || "—").toLowerCase();
      const locB = (locationMap[b.product_id] || "—").toLowerCase();
      const locCompare = locA.localeCompare(locB);
      if (locCompare !== 0) return locCompare;
      const nameA = (a.name || "").toLowerCase();
      const nameB = (b.name || "").toLowerCase();
      return nameA.localeCompare(nameB);
    });
  }, [
    allRows,
    showReservedOnly,
    hideZeroActualStock,
    reservedQuantities,
    locationMap,
    actualStockMode,
  ]);

  const exportToCSV = () => {
    if (filteredRows.length === 0) {
      alert("No data to export.");
      return;
    }
    const headers = [
      "Product ID",
      "Parent ID",
      "Product Name",
      "EAN",
      "SKU",
      "Location(s)",
      ...visiblePriceGroups.map((pg) => `${pg.name} (${pg.currency})`),
      ...visibleWarehouses.map((wh) => wh.name),
      "Reserved (orders)",
      "Total Actual Stock",
    ];
    const rows = filteredRows.map((row) => [
      row.product_id,
      row.parent_id ?? "",
      row.name,
      row.ean,
      row.sku,
      locationMap[row.product_id] || "—",
      ...visiblePriceGroups.map((pg) =>
        getProductPriceForGroup(row, pg.price_group_id),
      ),
      ...visibleWarehouses.map((wh) => getWarehouseQuantity(row, wh)),
      getReservedQuantity(row.product_id),
      getActualStock(row),
    ]);
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
    link.setAttribute("download", "baselinker_products.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const getActualStockHeaderLabel = () => {
    switch (actualStockMode) {
      case "warehouse":
        return "Total Actual Stock (Warehouse only)";
      case "office":
        return "Total Actual Stock (Office only)";
      case "loadingBay":
        return "Total Actual Stock (Loading Bay only)";
      default:
        return "Total Actual Stock (All Warehouses)";
    }
  };

  return (
    <div>
      <div className="mb-4 flex justify-between items-center flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold">
            📦 BaseLinker Product Data (with variants)
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            Actual Stock = Selected Warehouse Stock + Reserved (from open
            orders)
          </p>
          {lastSyncTime && (
            <p className="text-xs text-gray-500 mt-1">
              Last sync: {lastSyncTime}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={syncData}
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-4 py-2 rounded font-semibold"
          >
            {loading ? "Syncing..." : "🔄 Sync Data"}
          </button>
          <button
            onClick={exportToCSV}
            disabled={filteredRows.length === 0}
            className="bg-green-600 hover:bg-green-700 disabled:opacity-50 px-4 py-2 rounded font-semibold"
          >
            📥 Export CSV
          </button>
        </div>
      </div>

      <div className="mb-4 flex gap-4 flex-wrap">
        <label className="flex items-center gap-2 bg-gray-800 px-3 py-1 rounded">
          <input
            type="checkbox"
            checked={showReservedOnly}
            onChange={(e) => setShowReservedOnly(e.target.checked)}
            className="w-4 h-4"
          />
          <span>Show only reserved products</span>
        </label>
        <label className="flex items-center gap-2 bg-gray-800 px-3 py-1 rounded">
          <input
            type="checkbox"
            checked={hideZeroActualStock}
            onChange={(e) => setHideZeroActualStock(e.target.checked)}
            className="w-4 h-4"
          />
          <span>Hide zero actual stock</span>
        </label>
        <label className="flex items-center gap-2 bg-gray-800 px-3 py-1 rounded">
          <input
            type="checkbox"
            checked={hideMarketplacePrices}
            onChange={(e) => setHideMarketplacePrices(e.target.checked)}
            className="w-4 h-4"
          />
          <span>Hide Amazon / Shopify / OnBuy prices</span>
        </label>

        {/* Radio buttons for actual stock mode */}
        <div className="bg-gray-800 px-3 py-1 rounded flex gap-3 items-center">
          <span className="text-sm font-semibold">Show columns for:</span>
          <label className="flex items-center gap-1">
            <input
              type="radio"
              name="actualStockMode"
              checked={actualStockMode === "all"}
              onChange={() => setActualStockMode("all")}
            />
            <span>All warehouses</span>
          </label>
          <label className="flex items-center gap-1">
            <input
              type="radio"
              name="actualStockMode"
              checked={actualStockMode === "warehouse"}
              onChange={() => setActualStockMode("warehouse")}
            />
            <span>Warehouse only</span>
          </label>
          <label className="flex items-center gap-1">
            <input
              type="radio"
              name="actualStockMode"
              checked={actualStockMode === "office"}
              onChange={() => setActualStockMode("office")}
            />
            <span>Office only</span>
          </label>
          <label className="flex items-center gap-1">
            <input
              type="radio"
              name="actualStockMode"
              checked={actualStockMode === "loadingBay"}
              onChange={() => setActualStockMode("loadingBay")}
            />
            <span>Loading Bay only</span>
          </label>
        </div>
      </div>

      {(loading || fetchingLocations || fetchingOrders) && (
        <div className="p-3 bg-gray-900">
          {loading && "⏳ Loading products & variants..."}
          {fetchingLocations && !loading && "📍 Fetching locations..."}
          {fetchingOrders &&
            !loading &&
            !fetchingLocations &&
            "📦 Fetching reserved quantities..."}
        </div>
      )}
      {error && <div className="p-3 bg-red-100 text-red-800">❌ {error}</div>}

      {!loading && !error && filteredRows.length === 0 && (
        <div className="p-3 bg-yellow-100 text-black">
          {allRows.length === 0
            ? "No data. Click 'Sync Data' to load products and variants."
            : showReservedOnly
              ? "No products with reserved quantities found."
              : hideZeroActualStock
                ? "No products with non‑zero actual stock found."
                : "No products found."}
        </div>
      )}

      {!loading && !error && filteredRows.length > 0 && (
        <div
          className="overflow-auto border rounded"
          style={{ maxHeight: "80vh" }}
        >
          <table className="min-w-full bg-black text-sm">
            <thead className="bg-gray-800 sticky top-0">
              <tr>
                <th className="px-4 py-2 border">Product ID</th>
                <th className="px-4 py-2 border">Parent ID</th>
                <th className="px-4 py-2 border">Product Name</th>
                <th className="px-4 py-2 border">EAN</th>
                <th className="px-4 py-2 border">SKU</th>
                <th className="px-4 py-2 border">Location(s)</th>
                {visiblePriceGroups.map((pg) => (
                  <th key={pg.price_group_id} className="px-4 py-2 border">
                    {pg.name} ({pg.currency})
                  </th>
                ))}
                {visibleWarehouses.map((wh) => (
                  <th key={wh.warehouse_id} className="px-4 py-2 border">
                    {wh.name}
                  </th>
                ))}
                <th className="px-4 py-2 border bg-blue-900">
                  Reserved (orders)
                </th>
                <th className="px-4 py-2 border bg-green-900">
                  {getActualStockHeaderLabel()}
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => {
                const reserved = getReservedQuantity(row.product_id);
                const actualStock = getActualStock(row);
                return (
                  <tr key={row.rowId} className="border hover:bg-gray-800">
                    <td className="px-4 py-2 border text-center">
                      {row.product_id}
                    </td>
                    <td className="px-4 py-2 border text-center">
                      {row.parent_id ?? "—"}
                    </td>
                    <td className="px-4 py-2 border">{row.name}</td>
                    <td className="px-4 py-2 border">{row.ean}</td>
                    <td className="px-4 py-2 border">{row.sku}</td>
                    <td className="px-4 py-2 border">
                      {locationMap[row.product_id] || "—"}
                    </td>
                    {visiblePriceGroups.map((pg) => (
                      <td
                        key={pg.price_group_id}
                        className="px-4 py-2 border text-right"
                      >
                        {getProductPriceForGroup(row, pg.price_group_id)}
                      </td>
                    ))}
                    {visibleWarehouses.map((wh) => (
                      <td
                        key={wh.warehouse_id}
                        className="px-4 py-2 border text-center"
                      >
                        {getWarehouseQuantity(row, wh)}
                      </td>
                    ))}
                    <td className="px-4 py-2 border text-center font-bold text-yellow-300">
                      {reserved}
                    </td>
                    <td
                      className={`px-4 py-2 border text-center font-bold ${
                        actualStock < 0 ? "text-red-400" : "text-green-400"
                      }`}
                    >
                      {actualStock}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
