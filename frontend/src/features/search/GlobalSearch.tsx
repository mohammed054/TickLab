import React, { useState } from "react";
import { useSyncBus } from "../../shared/sync-bus";

export const GlobalSearch = () => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const { publish } = useSyncBus();

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const term = query.trim();
    if (!term) return;

    // Perform search across strategies, experiments, datasets, trades, orders, timestamps, notes, and logs
    const response = await fetch(`/api/search?query=${encodeURIComponent(term)}`);
    const data = await response.json();
    setResults(data.results);

    // Navigate results via Sync Bus
    if (data.results.length > 0) {
      const result = data.results[0];
      if (result.type === "trade") {
        publish("setSelectedTradeId", { tradeId: result.id });
      } else if (result.type === "dataset") {
        publish("openDataCenter", { datasetId: result.id });
      }
      // Additional result types navigate similarly...
    }
  };

  return (
    <form onSubmit={handleSearch} className="global-search">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search strategies, experiments, datasets, trades, orders, timestamps, notes, and logs"
        className="search-input"
      />
      <button type="submit" className="search-button">
        Search
      </button>
    </form>
  );
};