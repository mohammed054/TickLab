#!/usr/bin/env python3
"""Register verified Binance BTCUSDT Spot aggregate-trade archives in TickLab."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPOSITORY_ROOT))

from backend.data.app.binance_import import default_data_root
from backend.data.app.spot_catalog import SpotCatalogError, register_spot_catalog


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-root", required=True, type=Path, help="Folder containing the downloaded Binance Spot archives and extracted CSVs")
    parser.add_argument("--data-root", type=Path, default=default_data_root(), help="TickLab data root (defaults to the repository's data folder)")
    parser.add_argument("--workers", type=int, default=4, help="Concurrent validation workers (1-8; default: 4)")
    args = parser.parse_args()

    def report_progress(completed: int, total: int, filename: str) -> None:
        if completed and (completed % 10 == 0 or completed == total):
            print(f"Validated {completed}/{total}: {filename}", flush=True)

    try:
        records = register_spot_catalog(args.source_root, args.data_root, report_progress, args.workers)
    except SpotCatalogError as exc:
        print(f"Spot catalog import failed: {exc}", file=sys.stderr)
        return 1
    total_trades = sum(int(record["row_count"]) for record in records)
    print(f"Registered {len(records)} raw Binance Spot daily datasets.")
    print(f"Aggregate trade rows validated: {total_trades:,}")
    print(f"TickLab data root: {args.data_root.resolve()}")
    print("Source archives and CSVs were referenced in place; no duplicate data files were created.")
    print("These records are raw/trades-only and cannot run in the depth-dependent backtest engine.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
