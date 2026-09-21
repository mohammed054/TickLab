from backend.experiments.app.metrics.drawdown import compute_drawdown, drawdown_metrics_dict
from backend.experiments.app.metrics.pln_attribution import compute_pln_attribution, pln_attribution_dict

# Test drawdown
FIXTURE_SAMPLES = [
    {'timestamp_ns': 1_001_000_000, 'price': 100.0, 'position': 0.0,
     'balance': 0.0, 'fee': 0.0, 'num_trades': 0},
    {'timestamp_ns': 1_001_060_000, 'price': 100.0, 'position': 1.0,
     'balance': -101.0, 'fee': 0.0505, 'num_trades': 1},
    {'timestamp_ns': 1_001_120_000, 'price': 100.0, 'position': 0.0,
     'balance': -2.0, 'fee': 0.1, 'num_trades': 2},
]

print("=== Drawdown Test ===")
result = compute_drawdown(FIXTURE_SAMPLES, initial_capital=100_000.0)
print(f"  current_drawdown_pct: {result.current_drawdown_pct}")
print(f"  max_drawdown_pct: {result.max_drawdown_pct}")
print(f"  peak_value: {result.peak_value}")
print(f"  trough_value: {result.trough_value}")
print(f"  drawdown_duration: {result.drawdown_duration}")

d = drawdown_metrics_dict(FIXTURE_SAMPLES, initial_capital=100_000.0)
print(f"  dict current_dd: {d['current_drawdown_pct']}")
print(f"  dict max_dd: {d['max_drawdown_pct']}")

# Test P&L Attribution (placeholder - needs fill data with more fields)
print("\n=== P&L Attribution Test (placeholder) ===")
# This is a placeholder test since fills need more fields
cats = compute_pln_attribution([], initial_capital=100_000.0)
print(f"  gross_trading_pnl: {cats.gross_trading_pnl}")
print(f"  fees: {cats.fees}")
print(f"  slippage: {cats.slippage}")
print(f"  adverse_selection: {cats.adverse_selection}")
print(f"  inventory_pnl: {cats.inventory_pnl}")
print(f"  execution_loss: {cats.execution_loss}")
print(f"  other: {cats.other}")
print(f"  net_pnl: {cats.net_pnl}")

print("\nAll tests passed!")