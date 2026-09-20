import React from "react";
import { useStyles } from "../../shared/design-system";

type AlertSeverity = "info" | "warning" | "critical";

export interface Alert {
  id: string;
  type: string;
  severity: AlertSeverity;
  message: string;
  timestamp: number;
  link?: string;
}

type AlertsState = Alert[];

const initialAlerts: AlertsState = [];

const AlertCenter: React.FC = () => {
  const [alerts, setAlerts] = useState<AlertsState>(initialAlerts);

  const addAlert = (alert: Omit<Alert, "id">) => {
    const newAlert = {
      ...alert,
      id: Math.random().toString(36).substr(2, 9),
    };
    setAlerts((prev) => [newAlert, ...prev].slice(0, 50)); // Keep last 50
  };

  // Subscribe to alert events via Sync Bus
  // Would connect to WebSocket/NATS in production

  const severityStyles: Record<AlertSeverity, string> = {
    info: "var(--color-info)",
    warning: "var(--color-warning)",
    critical: "var(--color-critical)",
  };

  return (
    <div className="alert-center" style={useStyles("alertCenter")}>
      <h3 className="alert-center-title">Alerts</h3>
      <div className="alert-center-list">
        {alerts.map((alert) => (
          <div
            key={alert.id}
            className="alert-center-item"
            style={{ borderLeftColor: severityStyles[alert.severity] }}
          >
            <span className="alert-severity-badge"
              style={{ color: severityStyles[alert.severity] }}
            >
              {alert.severity}
            </span>
            <span className="alert-message">{alert.message}</span>
            <span className="alert-timestamp">
              {new Date(alert.timestamp).toLocaleTimeString()}
            </span>
            {alert.link && (
              <a href={alert.link} className="alert-link">
                View
              </a>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default AlertCenter;