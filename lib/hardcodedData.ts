// Based on your real API responses
export const HARDCODED_INVENTORIES = {
  status: "SUCCESS",
  inventories: [
    {
      inventory_id: 8865,
      name: "Total Inventory",
      description: "",
      languages: ["en"],
      default_language: "en",
      price_groups: [8140, 9733, 9734, 9735, 13007],
      default_price_group: 8140,
      warehouses: [
        "bl_21879",
        "bl_27316",
        "bl_31472",
        "fulfillment_19407",
        "bl_42297",
      ],
      default_warehouse: "bl_21879",
      reservations: false,
      is_default: true,
    },
  ],
};

export const HARDCODED_PRICE_GROUPS = {
  status: "SUCCESS",
  price_groups: [
    {
      price_group_id: 8140,
      name: "eBay",
      description: "",
      currency: "GBP",
      is_default: true,
    },
    {
      price_group_id: 9733,
      name: "Amazon",
      description: "",
      currency: "GBP",
      is_default: false,
    },
    {
      price_group_id: 9734,
      name: "Shopify",
      description: "",
      currency: "GBP",
      is_default: false,
    },
    {
      price_group_id: 9735,
      name: "OnBuy",
      description: "",
      currency: "GBP",
      is_default: false,
    },
    {
      price_group_id: 13007,
      name: "TikTok",
      description: "TikTok",
      currency: "GBP",
      is_default: false,
    },
  ],
};

export const HARDCODED_WAREHOUSES = {
  status: "SUCCESS",
  warehouses: [
    {
      warehouse_type: "bl",
      warehouse_id: 21879,
      name: "Warehouse",
      description: "",
      stock_edition: true,
      is_default: true,
    },
    {
      warehouse_type: "bl",
      warehouse_id: 31472,
      name: "Office",
      description: "",
      stock_edition: true,
      is_default: false,
    },
    {
      warehouse_type: "bl",
      warehouse_id: 27316,
      name: "Loading Bay",
      description: "",
      stock_edition: true,
      is_default: false,
    },
    {
      warehouse_type: "fulfillment",
      warehouse_id: 19407,
      name: "RT Bytes (FBA)",
      description: "",
      stock_edition: false,
      is_default: false,
    },
    {
      warehouse_type: "bl",
      warehouse_id: 42297,
      name: "Outside",
      description: "Products stored outside of Vanguard",
      stock_edition: true,
      is_default: false,
    },
  ],
};

// lib/hardcodedOrderStatuses.ts
export const HARDCODED_ORDER_STATUSES = {
  statuses: [
    {
      id: 53167,
      name: "New orders",
    },
    {
      id: 65436,
      name: "Tracked 24 (P)",
    },
    {
      id: 65437,
      name: "Special Delivery",
    },
    {
      id: 65438,
      name: "Tracked 48 (LL)",
    },
    {
      id: 101263,
      name: "Tracked 48 (P)",
    },
    {
      id: 103864,
      name: "Collection",
    },
    {
      id: 113543,
      name: "Multi-Order",
    },
    {
      id: 120444,
      name: "Dont Dispatch Yet",
    },
    { id: 129383, name: "eBay Live" },
    {
      id: 137207,
      name: "Customs",
    },
    {
      id: 138010,
      name: "Tracked 24 (LL)",
    },
  ],
};
