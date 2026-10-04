import asyncio
import hashlib
import json
import zipfile
from datetime import date
from pathlib import Path
from unittest.mock import patch

import pytest

from backend.data.app import spot_catalog
from backend.data.app.main import list_binance_trade_datasets


DAY = "2025-01-01"
TIMESTAMP_US = 1_735_689_600_010_866


def write_spot_csv(path: Path, rows: list[str] | None = None) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    lines = rows or [
        f"10,50000.10,0.20,100,100,{TIMESTAMP_US},True,True",
        f"11,50000.20,0.10,101,101,{TIMESTAMP_US + 2},False,True",
    ]
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return path


def make_source_root(root: Path) -> Path:
    (root / "archives").mkdir(parents=True)
    csv_path = write_spot_csv(root / "extracted" / f"BTCUSDT-aggTrades-{DAY}.csv")
    archive_path = root / "archives" / f"BTCUSDT-aggTrades-{DAY}.zip"
    with zipfile.ZipFile(archive_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.write(csv_path, f"BTCUSDT-aggTrades-{DAY}.csv")
    archive_hash = hashlib.sha256(archive_path.read_bytes()).hexdigest()
    (root / "archives" / (archive_path.name + ".CHECKSUM")).write_text(
        f"{archive_hash}  {archive_path.name}\n", encoding="ascii"
    )
    (root / "manifest.csv").write_text(
        "date,market,symbol,data_type,source_key,archive,archive_bytes,sha256,checksum_status,extracted_csv,extracted_bytes\n"
        f"{DAY},BINANCE_SPOT,BTCUSDT,aggTrades,data/spot/daily/aggTrades/BTCUSDT/BTCUSDT-aggTrades-{DAY}.zip,{archive_path},{archive_path.stat().st_size},{archive_hash},verified,{csv_path},{csv_path.stat().st_size}\n",
        encoding="utf-8",
    )
    (root / "verification.json").write_text(
        json.dumps({
            "market": "Binance Spot", "symbol": "BTCUSDT", "sha256_audit": "passed",
            "days": 1, "date_start": DAY, "date_end": DAY,
        }),
        encoding="utf-8",
    )
    return root


def test_validate_spot_csv_converts_microseconds_to_nanoseconds(tmp_path: Path) -> None:
    path = write_spot_csv(tmp_path / "spot.csv")

    row_count, start_ns, end_ns, ordering_regressions, first_regression_row = spot_catalog.validate_spot_csv(path, date.fromisoformat(DAY))

    assert row_count == 2
    assert start_ns == TIMESTAMP_US * 1_000
    assert end_ns == (TIMESTAMP_US + 2) * 1_000
    assert ordering_regressions == 0
    assert first_regression_row is None


def test_validate_spot_csv_rejects_header_and_records_order_regressions(tmp_path: Path) -> None:
    header = write_spot_csv(tmp_path / "header.csv", ["agg_trade_id,price,quantity,first_trade_id,last_trade_id,time,buyer,best"])
    duplicate_id = write_spot_csv(tmp_path / "duplicate.csv", [
        f"10,50000.10,0.20,100,100,{TIMESTAMP_US},True,True",
        f"10,50000.20,0.10,101,101,{TIMESTAMP_US + 2},False,True",
    ])

    with pytest.raises(spot_catalog.SpotCatalogError, match="headerless Spot schema"):
        spot_catalog.validate_spot_csv(header, date.fromisoformat(DAY))
    rows, start_ns, end_ns, regressions, first_regression_row = spot_catalog.validate_spot_csv(duplicate_id, date.fromisoformat(DAY))
    assert rows == 2
    assert regressions == 1
    assert first_regression_row == 2
    assert start_ns == TIMESTAMP_US * 1_000
    assert end_ns == (TIMESTAMP_US + 2) * 1_000


def test_registration_is_idempotent_and_does_not_copy_source_data(tmp_path: Path) -> None:
    source_root = make_source_root(tmp_path / "source")
    data_root = tmp_path / "ticklab-data"

    first = spot_catalog.register_spot_catalog(source_root, data_root, workers=1)
    second = spot_catalog.register_spot_catalog(source_root, data_root, workers=1)

    assert len(first) == len(second) == 1
    manifest = first[0]
    assert manifest["market"] == "BINANCE_SPOT"
    assert manifest["normalization_status"] == "RAW_PROVIDER_SCHEMA"
    assert manifest["source_order_status"] == "MONOTONIC"
    assert manifest["ordering_regressions"] == 0
    assert manifest["row_count"] == 2
    assert manifest["coverage_start_ns"] == TIMESTAMP_US * 1_000
    assert manifest["data_capabilities"] == ["TRADES"]
    assert manifest["book_depth_available"] is False
    assert manifest["raw_csv_path"] == str(source_root / "extracted" / f"BTCUSDT-aggTrades-{DAY}.csv")
    assert "normalized_path" not in manifest
    assert not (data_root / "registered" / manifest["dataset_id"] / "trades.csv").exists()


def test_dataset_api_lists_raw_spot_catalog_records(tmp_path: Path) -> None:
    source_root = make_source_root(tmp_path / "source")
    data_root = tmp_path / "ticklab-data"
    spot_catalog.register_spot_catalog(source_root, data_root, workers=1)

    with patch("backend.data.app.main.default_data_root", return_value=data_root):
        response = asyncio.run(list_binance_trade_datasets())

    assert len(response["datasets"]) == 1
    assert response["datasets"][0]["market"] == "BINANCE_SPOT"
