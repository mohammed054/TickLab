import React from "react";
import { useCallback } from "react";

export interface StrategyEditorProps {
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
  strategyName?: string;
  onValidate?: () => Promise<{ success: boolean; errors: string[]; warnings: string[] }>;
}

export const StrategyEditor: React.FC<StrategyEditorProps> = ({
  value,
  onChange,
  readOnly = false,
  strategyName,
  onValidate,
}) => {
  const handleValidate = useCallback(async () => {
    if (!onValidate) return { success: true, errors: [], warnings: [] };
    return onValidate();
  }, [onValidate]);

  return (
    <div style={{ height: "100%", width: "100%" }}>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        readOnly={readOnly}
        style={{
          width: "100%",
          height: "100%",
          fontFamily: "Consolas, 'Courier New', monospace",
          fontSize: "13px",
          border: "none",
          padding: "8px",
          resize: "vertical",
          minHeight: "400px",
        }}
      />
    </div>
  );
};