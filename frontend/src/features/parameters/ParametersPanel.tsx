import React from "react";

export interface ParameterSchema {
  key: string;
  label: string;
  type: "number" | "integer" | "string" | "dropdown" | "bool" | "range";
  min?: number | null;
  max?: number | null;
  step?: number | null;
  default: number | int | str | bool;
  description: string;
  group: string;
}

export interface ParametersPanelProps {
  parameters: ParameterSchema[];
  onParameterChange: (key: string, value: string | number | boolean) => void;
}

type ParameterValue =
  | { type: "number"; value: number }
  | { type: "integer"; value: number }
  | { type: "string"; value: string }
  | { type: "dropdown"; value: string }
  | { type: "bool"; value: boolean };

const getParameterOptions = (
  type: ParameterSchema["type"],
): string[] => {
  switch (type) {
    case "dropdown":
      return ["option1", "option2", "option3"];
    default:
      return [];
  }
};

const ParameterInput: React.FC<{
  schema: ParameterSchema;
  value: ParameterValue;
  onChange: (value: ParameterValue) => void;
}> = ({ schema, value, onChange }) => {
  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const target = e.target;
    const val = target.type === "checkbox"
      ? target.checked
      : target.type === "number"
        ? parseFloat(target.value)
        : target.value;

    onChange({
      type: schema.type,
      value: val,
    } as ParameterValue);
  };

  if (schema.type === "bool") {
    return (
      <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <input
          type="checkbox"
          checked={value.value === true}
          onChange={handleChange}
          style={{ transform: "scale(1.2)" }}
        />
        {schema.label}
      </label>
    );
  }

  if (schema.type === "dropdown") {
    const options = getParameterOptions(schema.type);
    return (
      <select onChange={handleChange} style={{ padding: "4px 8px" }}>
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    );
  }

  if (schema.type === "number" || schema.type === "integer") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <label>{schema.label}</label>
        <input
          type="number"
          value={String(value.value)}
          onChange={handleChange}
          min={String(schema.min ?? "")}
          max={String(schema.max ?? "")}
          step={String(schema.step ?? "0.1")}
          style={{
            padding: "4px 8px",
            fontSize: "12px",
            border: "1px solid #e2e8f0",
            borderRadius: "4px",
          }}
        />
      </div>
    );
  }

  if (schema.type === "string") {
    return (
      <input
        type="text"
        value={String(value.value)}
        onChange={handleChange}
        style={{
          padding: "4px 8px",
          fontSize: "12px",
          border: "1px solid #e2e8f0",
          borderRadius: "4px",
        }}
      />
    );
  }

  return null;
};

export const ParametersPanel: React.FC<ParametersPanelProps> = ({
  parameters,
  onParameterChange,
}) => {
  return (
    <div style={{ gap: 12, padding: 12, border: "1px solid #e2e8f0", borderRadius: 8 }}>
      {parameters.map((param) => {
        const defaultValue: ParameterValue = {
          type: param.type,
          value: typeof param.default === "number"
            ? param.default
            : param.default === true || param.default === false
              ? param.default
              : String(param.default),
        };

        return (
          <div
            key={param.key}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 4,
              borderBottom: "1px solid #f1f5f8",
              paddingBottom: 8,
            }}
          >
            <label style={{ fontWeight: 500, fontSize: 14 }}>
              {param.label}{param.description && (
                <span
                  style={{
                    marginLeft: 8,
                    fontSize: 11,
                    color: "#64748b",
                    fontStyle: "italic",
                  }}
                >
                  {param.description}
                </span>
              )}
            </label>
            <ParameterInput
              schema={param}
              value={defaultValue}
              onChange={(val) => onParameterChange(param.key, val.value)}
            />
          </div>
        );
      })}
    </div>
  );
};