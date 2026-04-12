// components/OrdersByStatus.tsx
"use client";

import { HARDCODED_ORDER_STATUSES } from "@/lib/hardcodedData";
import { useState, useCallback } from "react";

export default function OrdersByStatus() {
  const [ordersByStatus, setOrdersByStatus] = useState<
    Record<
      number,
      {
        orders: any[];
        page: number;
        hasMore: boolean;
        loading: boolean;
        expanded: boolean;
      }
    >
  >({});

  const fetchOrdersForStatus = useCallback(
    async (
      statusId: number,
      page: number = 1,
    ): Promise<{ orders: any[]; hasMore: boolean }> => {
      try {
        const res = await fetch("/api/baselinker-proxy", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            method: "getOrders",
            parameters: {
              status_id: statusId,
              page,
              limit: 20,
              get_unconfirmed_orders: false,
            },
          }),
        });
        const data = await res.json();
        if (data.status !== "SUCCESS") {
          console.warn(`Failed to fetch orders for status ${statusId}`, data);
          return { orders: [], hasMore: false };
        }
        const orders = data.orders || [];
        const hasMore = orders.length === 20;
        return { orders, hasMore };
      } catch (err) {
        console.error(err);
        return { orders: [], hasMore: false };
      }
    },
    [],
  );

  const loadOrdersForStatus = useCallback(
    async (statusId: number) => {
      setOrdersByStatus((prev) => ({
        ...prev,
        [statusId]: {
          ...prev[statusId],
          loading: true,
          expanded: true,
        },
      }));

      const { orders, hasMore } = await fetchOrdersForStatus(statusId, 1);

      setOrdersByStatus((prev) => ({
        ...prev,
        [statusId]: {
          orders,
          page: 1,
          hasMore,
          loading: false,
          expanded: true,
        },
      }));
    },
    [fetchOrdersForStatus],
  );

  const loadMoreOrders = useCallback(
    async (statusId: number) => {
      const statusData = ordersByStatus[statusId];
      if (!statusData || statusData.loading || !statusData.hasMore) return;

      setOrdersByStatus((prev) => ({
        ...prev,
        [statusId]: { ...prev[statusId], loading: true },
      }));

      const nextPage = statusData.page + 1;
      const { orders, hasMore } = await fetchOrdersForStatus(
        statusId,
        nextPage,
      );

      setOrdersByStatus((prev) => ({
        ...prev,
        [statusId]: {
          orders: [...prev[statusId].orders, ...orders],
          page: nextPage,
          hasMore,
          loading: false,
          expanded: true,
        },
      }));
    },
    [ordersByStatus, fetchOrdersForStatus],
  );

  const toggleStatusExpanded = useCallback(
    (statusId: number) => {
      const existing = ordersByStatus[statusId];
      if (!existing) {
        loadOrdersForStatus(statusId);
      } else {
        setOrdersByStatus((prev) => ({
          ...prev,
          [statusId]: { ...prev[statusId], expanded: !prev[statusId].expanded },
        }));
      }
    },
    [ordersByStatus, loadOrdersForStatus],
  );

  return (
    <div className="mt-8">
      <h2 className="text-xl font-bold mb-4">📋 Orders by Status</h2>
      <div className="space-y-4">
        {HARDCODED_ORDER_STATUSES.statuses.map((status) => {
          const statusId = status.id;
          const statusData = ordersByStatus[statusId];
          const isExpanded = statusData?.expanded || false;
          const isLoading = statusData?.loading || false;
          const orders = statusData?.orders || [];

          return (
            <div key={statusId} className="border border-gray-700 rounded">
              <button
                onClick={() => toggleStatusExpanded(statusId)}
                className="w-full text-left px-4 py-2 bg-gray-800 hover:bg-gray-700 font-semibold flex justify-between items-center"
              >
                <span>
                  {status.name} ({statusId})
                </span>
                <span>{isExpanded ? "▼" : "▶"}</span>
              </button>

              {isExpanded && (
                <div className="p-4">
                  {isLoading && orders.length === 0 && (
                    <div className="text-gray-400">⏳ Loading orders...</div>
                  )}

                  {orders.length === 0 && !isLoading && (
                    <div className="text-gray-400">No orders found.</div>
                  )}

                  {orders.length > 0 && (
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-sm">
                        <thead className="bg-gray-700">
                          <tr>
                            <th className="px-3 py-2 border">Order ID</th>
                            <th className="px-3 py-2 border">
                              Date (confirmed)
                            </th>
                            <th className="px-3 py-2 border">Products</th>
                          </tr>
                        </thead>
                        <tbody>
                          {orders.map((order) => (
                            <tr
                              key={order.order_id}
                              className="border-b border-gray-700"
                            >
                              <td className="px-3 py-2 align-top">
                                {order.order_id}
                              </td>
                              <td className="px-3 py-2 whitespace-nowrap">
                                {order.date_confirmed
                                  ? new Date(
                                      order.date_confirmed * 1000,
                                    ).toLocaleString()
                                  : "—"}
                              </td>
                              <td className="px-3 py-2">
                                <ul className="list-disc list-inside space-y-1">
                                  {order.products?.map(
                                    (item: any, idx: number) => (
                                      <li key={idx}>
                                        Product ID:{" "}
                                        {item.storage_id ?? item.product_id}{" "}
                                        &nbsp; (variant: {item.product_id})
                                        &nbsp; Qty: {item.quantity}
                                        {item.name && (
                                          <span> — {item.name}</span>
                                        )}
                                      </li>
                                    ),
                                  )}
                                </ul>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>

                      {statusData?.hasMore && (
                        <div className="mt-3 text-center">
                          <button
                            onClick={() => loadMoreOrders(statusId)}
                            disabled={statusData.loading}
                            className="px-3 py-1 bg-blue-600 rounded disabled:opacity-50"
                          >
                            {statusData.loading
                              ? "Loading..."
                              : "Load more orders"}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
