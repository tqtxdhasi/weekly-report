import { NextRequest, NextResponse } from "next/server";
import {
  HARDCODED_INVENTORIES,
  HARDCODED_PRICE_GROUPS,
  HARDCODED_WAREHOUSES,
} from "@/lib/hardcodedData";

const BASE_URL = "https://api.baselinker.com/connector.php";

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  let requestBody;

  try {
    requestBody = await req.json();
    const { method, parameters } = requestBody;

    // Log incoming request
    console.log(`[Proxy] ➡️ Received request: method=${method}`);
    console.log(
      `[Proxy] 📦 Parameters:`,
      JSON.stringify(parameters || {}).slice(0, 500),
    );

    const token = process.env.BASELINKER_TOKEN;
    console.log(`[Proxy] 🔑 Token present: ${!!token}`);

    // Hardcoded responses for inventory configuration endpoints
    if (method === "getInventories") {
      console.log("[Proxy] 📄 Returning hardcoded getInventories");
      return NextResponse.json(HARDCODED_INVENTORIES);
    }
    if (method === "getInventoryPriceGroups") {
      console.log("[Proxy] 📄 Returning hardcoded getInventoryPriceGroups");
      return NextResponse.json(HARDCODED_PRICE_GROUPS);
    }
    if (method === "getInventoryWarehouses") {
      console.log("[Proxy] 📄 Returning hardcoded getInventoryWarehouses");
      return NextResponse.json(HARDCODED_WAREHOUSES);
    }

    if (!token) {
      console.error("[Proxy] ❌ Missing BASELINKER_TOKEN");
      return NextResponse.json(
        { error: "Missing BASELINKER_TOKEN" },
        { status: 500 },
      );
    }

    // Prepare form data for real BaseLinker API call
    const formData = new URLSearchParams();
    formData.append("method", method);
    formData.append("parameters", JSON.stringify(parameters || {}));
    console.log(`[Proxy] 🌐 Forwarding to BaseLinker: ${BASE_URL}`);
    console.log(`[Proxy] 📤 Request size: ${formData.toString().length} bytes`);

    const response = await fetch(BASE_URL, {
      method: "POST",
      headers: {
        "X-BLToken": token,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formData,
    });

    const duration = Date.now() - startTime;
    console.log(
      `[Proxy] ⏱️ BaseLinker responded in ${duration}ms, status: ${response.status}`,
    );

    const data = await response.json();
    const success = data.status === "SUCCESS";
    console.log(`[Proxy] ✅ API call ${success ? "SUCCESS" : "FAILED"}`);
    if (!success) {
      console.warn(
        `[Proxy] ⚠️ BaseLinker error message: ${data.error_message || "unknown"}`,
      );
    }
    // Log summary of returned data (avoid huge logs)
    if (data.products) {
      const productCount = Object.keys(data.products).length;
      console.log(`[Proxy] 📦 Received ${productCount} products`);
    }
    if (data.inventories) {
      console.log(`[Proxy] 🏢 Received ${data.inventories.length} inventories`);
    }

    return NextResponse.json(data);
  } catch (error: any) {
    const duration = Date.now() - startTime;
    console.error(`[Proxy] 💥 Error after ${duration}ms:`, error.message);
    if (requestBody) {
      console.error(
        `[Proxy] Request body that caused error:`,
        JSON.stringify(requestBody).slice(0, 300),
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
