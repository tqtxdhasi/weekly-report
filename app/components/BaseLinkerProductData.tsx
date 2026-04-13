// components/BaseLinkerProductData.tsx
"use client";

import {
  HARDCODED_PRICE_GROUPS,
  HARDCODED_WAREHOUSES,
  HARDCODED_ORDER_STATUSES,
} from "@/lib/hardcodedData";
import { useState, useEffect, useCallback, useMemo } from "react";

const PAGE_LIMIT = 200;

export default function BaseLinkerProductData() {
  const [loading, setLoading] = useState(true);
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
  // NEW: hide Amazon, Shopify, OnBuy price columns
  const [hideMarketplacePrices, setHideMarketplacePrices] = useState(false);

  const priceGroups = HARDCODED_PRICE_GROUPS.price_groups;
  const warehouses = HARDCODED_WAREHOUSES.warehouses;
  const orderStatuses = HARDCODED_ORDER_STATUSES.statuses;

  // Price groups to hide when toggle is active
  const MARKETPLACE_PRICE_GROUP_IDS = [9733, 9734, 9735]; // Amazon, Shopify, OnBuy

  const visiblePriceGroups = useMemo(() => {
    if (!hideMarketplacePrices) return priceGroups;
    return priceGroups.filter(
      (pg) => !MARKETPLACE_PRICE_GROUP_IDS.includes(pg.price_group_id),
    );
  }, [priceGroups, hideMarketplacePrices]);

  // 1. Get inventory ID
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
  }, []);

  // 2. Fetch locations for a batch of product IDs
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

  // 3. Fetch all products (all pages)
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

  // 4. Fetch locations for all products (batched)
  const fetchAllLocations = useCallback(
    async (products: any[]) => {
      if (products.length === 0) return;
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
      setLocationMap(combinedLocations);
      setFetchingLocations(false);
    },
    [fetchDetailsBatch],
  );

  // 5. Fetch reserved quantities from orders (using variant product_id)
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
    setReservedQuantities(reserved);
    setFetchingOrders(false);
  }, [orderStatuses]);

  // 6. Initial load: fetch all products, then locations, then reserved quantities
  useEffect(() => {
    if (!inventoryId) return;
    async function loadEverything() {
      setLoading(true);
      setError(null);
      try {
        const products = await fetchAllProducts();
        setAllProducts(products);
        await fetchAllLocations(products);
        await fetchReservedQuantities();
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    loadEverything();
  }, [
    inventoryId,
    fetchAllProducts,
    fetchAllLocations,
    fetchReservedQuantities,
  ]);

  // Helper functions
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

  const getWarehouseQuantity = (
    product: any,
    warehouse: (typeof warehouses)[0],
  ): number => {
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

  // Filter products: first by reserved-only, then by hideZeroActualStock
  const filteredProducts = useMemo(() => {
    let products = showReservedOnly
      ? allProducts.filter(
          (product) => getReservedQuantity(product.product_id) > 0,
        )
      : allProducts;

    if (hideZeroActualStock) {
      products = products.filter((product) => getActualStock(product) !== 0);
    }

    // Sort alphabetically by product name (case-insensitive)
    return [...products].sort((a, b) => {
      const nameA = (a.name || "").toLowerCase();
      const nameB = (b.name || "").toLowerCase();
      return nameA.localeCompare(nameB);
    });
  }, [allProducts, showReservedOnly, hideZeroActualStock, reservedQuantities]);

  return (
    <div>
      <div className="mb-4 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">📦 BaseLinker Product Data</h1>
          <p className="text-sm text-gray-400 mt-1">
            Actual Stock = Warehouse Stock + Reserved (from open orders)
          </p>
        </div>
        <div className="flex gap-4 flex-wrap">
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
          {/* NEW TOGGLE: hide Amazon/Shopify/OnBuy price columns */}
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
      </div>

      {loading && <div className="p-3 bg-gray-900">⏳ Loading products...</div>}
      {fetchingLocations && !loading && (
        <div className="p-3 bg-yellow-100 text-black">
          📍 Fetching locations...
        </div>
      )}
      {fetchingOrders && !loading && !fetchingLocations && (
        <div className="p-3 bg-yellow-100 text-black">
          📦 Fetching reserved quantities from orders...
        </div>
      )}
      {error && <div className="p-3 bg-red-100 text-red-800">❌ {error}</div>}

      {!loading && !error && filteredProducts.length === 0 && (
        <div className="p-3 bg-yellow-100 text-black">
          {showReservedOnly
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
