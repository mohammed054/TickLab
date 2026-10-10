# TickLab Radar — user guide

**What it is.** A live feed of new Solana DEX launches with a risk score (0-100) and plain-language flags. A high score means more
red flags, not a prediction. Nothing here is financial advice and no outcome is implied.

**Windows.** Feed (left) lists launches; Detail (second window) shows the selected token: overview, chart, trades, holders, evidence, AI helper, journal.
**Risk bands.** LOW 0-24, MEDIUM 25-49, HIGH 50-74, EXTREME 75-100. "Data %" shows how many rules could be checked; unknown is not safe.
**Journal.** Create a decision (paper or real) with size, stop rule, target rule and a thesis (20+ characters). Paper fills are simulated with price impact and fees.
Real fills are entered by hand or linked from a read-only wallet import (paste a public address only; secrets are rejected).
**Risk limits.** Max position 5% of equity, 3 open positions, pause at 25% drawdown or 3 losing trades in a day. Loosening a limit takes effect after 24 h.
**Rules Lab.** Replays the alert rule on stored history with baselines and confidence intervals. The verdict is either "EDGE NOT PROVEN" or "EDGE SIGNAL (needs forward paper test)".
**Keys.** Optional RPC key and OpenRouter key are stored encrypted by Windows (Settings). They are never shown or logged.
**Data.** Stored locally in the app data folder (Settings > Open data folder). Daily backups keep the last 7.
