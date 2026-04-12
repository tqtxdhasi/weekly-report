// app/page.tsx (Home)
"use client";

import BaseLinkerProductData from "./components/BaseLinkerProductData";
import OrdersByStatus from "./components/OrdersByStatus";

export default function Home() {
  return (
    <main className="text-white bg-black p-4">
      <BaseLinkerProductData />
      <OrdersByStatus />
    </main>
  );
}
