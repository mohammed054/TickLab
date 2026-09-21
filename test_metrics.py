from backend.experiments.app.metrics.headline import compute_headline

FIXTURE_SAMPLES = [
    {'timestamp_ns': 1_001_000_000, 'price': 100.0, 'position': 0.0,
     'balance': 0.0, 'fee': 0.0, 'num_trades': 0},
    {'timestamp_ns': 1_001_060_000, 'price': 100.0, 'position': 1.0,
     'balance': -101.0, 'fee': 0.0505, 'num_trades': 1},
    {'timestamp_ns': 1_001_120_000, 'price': 100.0, 'position': 0.0,
     'balance': -2.0, 'fee': 0.1, 'num_trades': 2},
]
INITIAL_CAPITAL = 100_000.0
ORDERS_SUBMITTED = 2

headline = compute_headline(
    FIXTURE_SAMPLES,
    initial_capital=INITIAL_CAPITAL,
    orders_submitted=ORDERS_SUBMITTED,
)
print('Headline metrics computed successfully:')
print('  net_pnl:', headline["net_pnl"])
print('  return_pct:', headline["return_pct"])
print('  max_drawdown_pct:', headline["max_drawdown_pct"])
print('  sharpe:', headline["sharpe"])
print('  sortino:', headline["sortino"])
print('  trades:', headline["trades"])
print('  fill_rate_pct:', headline["fill_rate_pct"])
print('  fees:', headline["fees"])
print('  slippage:', headline["slippage"])