import React from "react";

export interface StrategyStatus {
  key: keyof typeof StrategyStatusValues;
  label: string;
}

export const StrategyStatusValues: Record<
  | "DRAFT"
  | "TESTING"
  | "BACKTESTED"
  | "VALIDATED"
  | "PAPER"
  | "LIVE"
  | "PAUSED"
  | "STOPPED"
  | "ARCHIVED",
  { label: string }
> = {
  DRAFT: { label: "Draft" },
  TESTING: { label: "Testing" },
  BACKTESTED: { label: "Backtested" },
  VALIDATED: { label: "Validated" },
  PAPER: { label: "Paper" },
  LIVE: { label: "Live" },
  PAUSED: { label: "Paused" },
  STOPPED: { label: "Stopped" },
  ARCHIVED: { label: "Archived" },
};

export const StrategyStatusLabels: Record<
  | "DRAFT"
  | "TESTING"
  | "BACKTESTED"
  | "VALIDATED"
  | "PAPER"
  | "LIVE"
  | "PAUSED"
  | "STOPPED"
  | "ARCHIVED",
  string
> = {
  DRAFT: "DRAFT",
  TESTING: "TESTING",
  BACKTESTED: "BACKTESTED",
  VALIDATED: "VALIDATED",
  PAPER: "PAPER",
  LIVE: "LIVE",
  PAUSED: "PAUSED",
  STOPPED: "STOPPED",
  ARCHIVED: "ARCHIVED",
};

interface StrategyPanelProps {
  strategyName: string;
  version: string;
  status: keyof typeof StrategyStatusValues;
  environment: "RESEARCH" | "PAPER" | "LIVE";
}

export const StrategyPanel: React.FC<StrategyPanelProps> = ({
  strategyName,
  version,
  status,
  environment,
}) => {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span>{strategyName}</span>
        <span>v{version}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
        <span>
          <span
            style={{
              display: "inline-block",
              width: 8,
              height: 8,
              borderRadius: 50,
              background:
                status === "VALIDATED"
                  ? "#22c55e"
                : status === "PAPER"
                  ? "#f59e0b"
                : status === "LIVE"
                  ? "#ef4444"
                : status === "BACKTESTED"
                  ? "#6b7280"
                : status === "TESTING"
                  ? "#3b82f6"
                : status === "DRAFT"
                  ? "#6b7280"
                : status === "PAUSED"
                  ? "#8b5cf6"
                : status === "STOPPED"
                  ? "#6b7280"
                : status === "ARCHIVED"
                  ? "#9ca3af"
                  : "#gray",
            }}
          />
          {StrategyStatusLabels[status]}
        </span>
        <span>Environment: {environment}</span>
      </div>
    </div>
  );
};