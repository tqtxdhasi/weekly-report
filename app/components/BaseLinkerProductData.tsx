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
  PRODUCTS: "baselinker_products",
  LOCATIONS: "baselinker_locations",
  RESERVED: "baselinker_reserved",
  LAST_SYNC: "baselinker_last_sync",
};

export default function BaseLinkerProductData() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [allProducts, setAllProducts] = useState<any[]>([]);
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

  const priceGroups = HARDCODED_PRICE_GROUPS.price_groups;
  const warehouses = HARDCODED_WAREHOUSES.warehouses;
  const orderStatuses = HARDCODED_ORDER_STATUSES.statuses;
  const MARKETPLACE_PRICE_GROUP_IDS = [9733, 9734, 9735];

  const visiblePriceGroups = useMemo(() => {
    if (!hideMarketplacePrices) return priceGroups;
    return priceGroups.filter(
      (pg) => !MARKETPLACE_PRICE_GROUP_IDS.includes(pg.price_group_id),
    );
  }, [priceGroups, hideMarketplacePrices]);

  // 1. Get inventory ID (cheap, always fetch on mount)
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

    // Load cached data from localStorage
    const cachedProducts = localStorage.getItem(CACHE_KEYS.PRODUCTS);
    const cachedLocations = localStorage.getItem(CACHE_KEYS.LOCATIONS);
    const cachedReserved = localStorage.getItem(CACHE_KEYS.RESERVED);
    const cachedLastSync = localStorage.getItem(CACHE_KEYS.LAST_SYNC);

    if (cachedProducts) setAllProducts(JSON.parse(cachedProducts));
    if (cachedLocations) setLocationMap(JSON.parse(cachedLocations));
    if (cachedReserved) setReservedQuantities(JSON.parse(cachedReserved));
    if (cachedLastSync) setLastSyncTime(cachedLastSync);
  }, []);

  // Helper: fetch details batch (locations)
  const fetchDetailsBatch = useCallback(
    async (productIds: number[]): Promise<Record<string, string>> => {
      if (!inventoryId || productIds.length === 0) return {};
      const requestBody = {
        method: "getInventoryProductsData",
        parameters: {
          inventory_id: inventoryId,
          products: productIds.map((id) => String(id)),
        },
      };
      try {
        const res = await fetch("/api/baselinker-proxy", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
        });
        const data = await res.json();
        if (data.status === "SUCCESS" && data.products) {
          const newLocations: Record<string, string> = {};
          for (const [pid, details] of Object.entries(data.products)) {
            const productDetails = details as any;
            let locationsObj = productDetails.locations;
            if (
              !locationsObj &&
              productDetails.stock &&
              typeof productDetails.stock === "object"
            ) {
              const stockEntries = Object.entries(productDetails.stock);
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
              newLocations[pid] = unique.join(", ") || "—";
            } else {
              newLocations[pid] = "—";
            }
          }
          return newLocations;
        }
      } catch (err) {
        console.error("Batch fetch failed:", err);
      }
      return {};
    },
    [inventoryId],
  );

  // Fetch all products (paginated)
  const fetchAllProducts = useCallback(async () => {
    if (!inventoryId) return [];
    let page = 1;
    let allProductsData: any[] = [];
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
        throw new Error(data.error_message || "Failed to fetch products.");
      }
      const productsPage = Object.entries(data.products).map(
        ([id, product]) => ({
          ...(product as any),
          product_id: parseInt(id, 10),
        }),
      );
      if (productsPage.length === 0) {
        hasMore = false;
      } else {
        allProductsData.push(...productsPage);
        page++;
        if (productsPage.length < PAGE_LIMIT) hasMore = false;
      }
    }
    return allProductsData;
  }, [inventoryId]);

  // Fetch locations for all products (batched)
  const fetchAllLocations = useCallback(
    async (products: any[]) => {
      if (products.length === 0) return {};
      setFetchingLocations(true);
      const productIds = products.map((p) => p.product_id);
      const BATCH_SIZE = 50;
      const batches: number[][] = [];
      for (let i = 0; i < productIds.length; i += BATCH_SIZE) {
        batches.push(productIds.slice(i, i + BATCH_SIZE));
      }
      const allLocationBatches = await Promise.all(
        batches.map((batch) => fetchDetailsBatch(batch)),
      );
      const combinedLocations = allLocationBatches.reduce(
        (acc, batchLocs) => ({ ...acc, ...batchLocs }),
        {},
      );
      setFetchingLocations(false);
      return combinedLocations;
    },
    [fetchDetailsBatch],
  );

  // Fetch reserved quantities from orders
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

  // Main sync function
  const syncData = useCallback(async () => {
    if (!inventoryId) {
      setError("Inventory ID not available yet.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const products = await fetchAllProducts();
      const locations = await fetchAllLocations(products);
      const reserved = await fetchReservedQuantities();

      setAllProducts(products);
      setLocationMap(locations);
      setReservedQuantities(reserved);

      // Save to localStorage
      localStorage.setItem(CACHE_KEYS.PRODUCTS, JSON.stringify(products));
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
    fetchAllProducts,
    fetchAllLocations,
    fetchReservedQuantities,
  ]);

  // Helper: get price
  const getProductPriceForGroup = (
    product: any,
    priceGroupId: number,
  ): string => {
    if (product.prices && typeof product.prices === "object") {
      const price = product.prices[priceGroupId.toString()];
      if (price !== undefined && price !== null) return price.toFixed(2);
    }
    return "—";
  };

  const getWarehouseQuantity = (product: any, warehouse: any): number => {
    const stock = product.stock || {};
    const rawKey = `${warehouse.warehouse_type}_${warehouse.warehouse_id}`;
    return stock[rawKey] ?? stock[warehouse.warehouse_id.toString()] ?? 0;
  };

  const getTotalWarehouseStock = (product: any): number => {
    return warehouses.reduce(
      (total, wh) => total + getWarehouseQuantity(product, wh),
      0,
    );
  };

  const getReservedQuantity = (productId: number): number => {
    return reservedQuantities[productId] || 0;
  };

  const getActualStock = (product: any): number => {
    const totalStock = getTotalWarehouseStock(product);
    const reserved = getReservedQuantity(product.product_id);
    return totalStock + reserved;
  };

  // Filter and sort by location
  const filteredProducts = useMemo(() => {
    let products = showReservedOnly
      ? allProducts.filter(
          (product) => getReservedQuantity(product.product_id) > 0,
        )
      : allProducts;

    if (hideZeroActualStock) {
      products = products.filter((product) => getActualStock(product) !== 0);
    }

    return [...products].sort((a, b) => {
      const locA = (locationMap[a.product_id] || "—").toLowerCase();
      const locB = (locationMap[b.product_id] || "—").toLowerCase();
      const locCompare = locA.localeCompare(locB);
      if (locCompare !== 0) return locCompare;
      const nameA = (a.name || "").toLowerCase();
      const nameB = (b.name || "").toLowerCase();
      return nameA.localeCompare(nameB);
    });
  }, [
    allProducts,
    showReservedOnly,
    hideZeroActualStock,
    reservedQuantities,
    locationMap,
  ]);

  // Export to CSV
  const exportToCSV = () => {
    if (filteredProducts.length === 0) {
      alert("No data to export.");
      return;
    }

    // Prepare headers
    const headers = [
      "Product ID",
      "Product Name",
      "EAN",
      "SKU",
      "Location(s)",
      ...visiblePriceGroups.map((pg) => `${pg.name} (${pg.currency})`),
      ...warehouses.map((wh) => wh.name),
      "Reserved (orders)",
      "Total Actual Stock",
    ];

    const rows = filteredProducts.map((product) => {
      const row = [
        product.product_id,
        product.name || "—",
        product.ean || "—",
        product.sku || "—",
        locationMap[product.product_id] || "—",
        ...visiblePriceGroups.map((pg) =>
          getProductPriceForGroup(product, pg.price_group_id),
        ),
        ...warehouses.map((wh) => getWarehouseQuantity(product, wh)),
        getReservedQuantity(product.product_id),
        getActualStock(product),
      ];
      return row;
    });

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

  return (
    <div>
      <div className="mb-4 flex justify-between items-center flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold">📦 BaseLinker Product Data</h1>
          <p className="text-sm text-gray-400 mt-1">
            Actual Stock = Warehouse Stock + Reserved (from open orders)
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
            disabled={filteredProducts.length === 0}
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
      </div>

      {(loading || fetchingLocations || fetchingOrders) && (
        <div className="p-3 bg-gray-900">
          {loading && "⏳ Loading products..."}
          {fetchingLocations && !loading && "📍 Fetching locations..."}
          {fetchingOrders &&
            !loading &&
            !fetchingLocations &&
            "📦 Fetching reserved quantities from orders..."}
        </div>
      )}
      {error && <div className="p-3 bg-red-100 text-red-800">❌ {error}</div>}

      {!loading && !error && filteredProducts.length === 0 && (
        <div className="p-3 bg-yellow-100 text-black">
          {allProducts.length === 0
            ? "No data. Click 'Sync Data' to load products."
            : showReservedOnly
              ? "No products with reserved quantities found."
              : hideZeroActualStock
                ? "No products with non‑zero actual stock found."
                : "No products found."}
        </div>
      )}

      {!loading && !error && filteredProducts.length > 0 && (
        <div
          className="overflow-auto border rounded"
          style={{ maxHeight: "80vh" }}
        >
          <table className="min-w-full bg-black text-sm">
            <thead className="bg-gray-800 sticky top-0">
              <tr>
                <th className="px-4 py-2 border">Product ID</th>
                <th className="px-4 py-2 border">Product Name</th>
                <th className="px-4 py-2 border">EAN</th>
                <th className="px-4 py-2 border">SKU</th>
                <th className="px-4 py-2 border">Location(s)</th>
                {visiblePriceGroups.map((pg) => (
                  <th key={pg.price_group_id} className="px-4 py-2 border">
                    {pg.name} ({pg.currency})
                  </th>
                ))}
                {warehouses.map((wh) => (
                  <th key={wh.warehouse_id} className="px-4 py-2 border">
                    {wh.name}
                  </th>
                ))}
                <th className="px-4 py-2 border bg-blue-900">
                  Reserved (orders)
                </th>
                <th className="px-4 py-2 border bg-green-900">
                  Total Actual Stock
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.map((product: any, idx: number) => {
                const reserved = getReservedQuantity(product.product_id);
                const actualStock = getActualStock(product);
                return (
                  <tr
                    key={product.product_id || idx}
                    className="border hover:bg-gray-800"
                  >
                    <td className="px-4 py-2 border text-center">
                      {product.product_id}
                    </td>
                    <td className="px-4 py-2 border">{product.name || "—"}</td>
                    <td className="px-4 py-2 border">{product.ean || "—"}</td>
                    <td className="px-4 py-2 border">{product.sku || "—"}</td>
                    <td className="px-4 py-2 border">
                      {locationMap[product.product_id] || "—"}
                    </td>
                    {visiblePriceGroups.map((pg) => (
                      <td
                        key={pg.price_group_id}
                        className="px-4 py-2 border text-right"
                      >
                        {getProductPriceForGroup(product, pg.price_group_id)}
                      </td>
                    ))}
                    {warehouses.map((wh) => (
                      <td
                        key={wh.warehouse_id}
                        className="px-4 py-2 border text-center"
                      >
                        {getWarehouseQuantity(product, wh)}
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
