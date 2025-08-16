import { Component } from "solid-js";
import { TradePage } from "~/components/TradePage";
import { addLane } from "../stores/tradeStore";
import { Button } from "~/components/ui/button";

const TradeRoute: Component = () => {
  return (
    <div class="min-h-[calc(100vh-50px)] bg-gray-50">
      <div class="w-screen px-4 py-8">
        <header class="mb-8">
          <h1 class="text-3xl font-bold text-gray-900">Trade Page</h1>
          <p class="text-gray-600 mt-2">
            Manage your trading lanes and strategies
          </p>
          <Button class="ml-auto" onClick={addLane}>
            +
          </Button>
        </header>
        <TradePage />
      </div>
    </div>
  );
};

export default TradeRoute;
