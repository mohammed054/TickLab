import React, { useState, useEffect } from "react";
import { useSyncBus } from "../../shared/sync-bus";

const COMMANDS = [
  { label: "Run backtest", execute: () => {}, shortcut: "Ctrl+B" },
  { label: "Open BTC order book", execute: () => {}, shortcut: null },
  { label: "Open strategy", execute: () => {}, shortcut: null },
  { label: "Replay timestamp", execute: () => {}, shortcut: null },
  { label: "Compare experiments", execute: () => {}, shortcut: null },
  { label: "Show latest results", execute: () => {}, shortcut: null },
  { label: "Start paper trading", execute: () => {}, shortcut: null },
  { label: "Show adverse-selection analysis", execute: () => {}, shortcut: null },
  { label: "Open dataset", execute: () => {}, shortcut: null },
  { label: "Switch workspace preset", execute: () => {}, shortcut: null },
];

export const CommandPalette = () => {
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<{ label: string; execute: () }[]>([]);
  const { publish } = useSyncBus();

  useEffect(() => {
    // Register Ctrl+K global shortcut
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "k" && e.ctrlKey) {
        e.preventDefault();
        setQuery("");
        setMatches([]);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleSearch = () => {
    const term = query.toLowerCase();
    const results = COMMANDS.filter((cmd) =>
      cmd.label.toLowerCase().includes(term)
    );
    setMatches(results);
  };

  const executeMatch = (match: { label: string; execute: () }) => {
    match.execute();
    setQuery("");
    setMatches([]);
  };

  return (
    <div className="command-palette" onClick={handleSearch}>
      <input
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          handleSearch();
        }}
        placeholder="Ctrl+K to open command palette…"
        className="command-palette-input"
      />
      {matches.length > 0 && (
        <div className="command-palette-results">
          {matches.map((match, i) => (
            <div
              key={i}
              className="command-palette-result"
              onClick={() => executeMatch(match)}
            >
              {match.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};