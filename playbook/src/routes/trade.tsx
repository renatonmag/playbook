import { Component } from "solid-js";
import { TradePage } from "~/components/TradePage";

const TradeRoute: Component = () => {
  return (
    <div class="min-h-screen bg-gray-50">
      <div class="container mx-auto px-4 py-8">
        <header class="mb-8">
          <h1 class="text-3xl font-bold text-gray-900">Trade Page</h1>
          <p class="text-gray-600 mt-2">
            Manage your trading lanes and strategies
          </p>
        </header>

        <TradePage />
      </div>
    </div>
  );
};

export default TradeRoute;
