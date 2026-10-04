"""Tests for real Binance USD-M aggregate-trade archive ingestion."""

from __future__ import annotations

import csv
import io
import json
import zipfile
from datetime import date
from pathlib import Path
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from backend.data.app import main as data_main
from backend.data.app.binance_import import (
    EXPECTED_HEADER,
    ImportErrorDetail,
    _parse_archive,
    _archive_specs,
    import_aggtrade_archives,
)


def _make_archive(path: Path, rows: list[list[str]], header: tuple[str, ...] = EXPECTED_HEADER) -> None:
    with io.StringIO(newline="") as buffer:
        writer = csv.writer(buffer)
        writer.writerow(header)
        writer.writerows(rows)
        payload = buffer.getvalue()
    with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("BTCUSDT-aggTrades-2024-01.csv", payload)


def _row(aggregate_id: int = 1, time_ms: int = 1_704_067_200_000) -> list[str]:
    return [str(aggregate_id), "42500.10000000", "0.02500000", str(aggregate_id), str(aggregate_id), str(time_ms), "true"]


def test_parse_archive_preserves_decimal_fields_and_converts_ms_to_ns(tmp_path: Path) -> None:
    source = tmp_path / "trades.zip"
    _make_archive(source, [_row(), _row(2, 1_704_067_200_001)])

    normalized, count, start_ns, end_ns = _parse_archive(source, source.name)

    with normalized.open(encoding="utf-8", newline="") as file:
        rows = list(csv.DictReader(file))
    assert count == 2
    assert start_ns == 1_704_067_200_000_000_000
    assert end_ns == 1_704_067_200_001_000_000
    assert rows[0]["price"] == "42500.10000000"
    assert rows[0]["quantity"] == "0.02500000"
    assert rows[0]["buyer_is_maker"] == "true"
    assert rows[0]["event_id"] == "binance-um-btcusdt-agg-1"


@pytest.mark.parametrize("rows", [
    [_row(), _row()],
    [["1", "NaN", "1", "1", "1", "1704067200000", "true"]],
    [["1", "1", "1", "1", "1", "1704067200000", "maybe"]],
    [["1", "1", "1", "1", "1", "1704067200000"]],
])
def test_parse_archive_rejects_duplicate_or_malformed_source_rows(tmp_path: Path, rows: list[list[str]]) -> None:
    source = tmp_path / "bad.zip"
    _make_archive(source, rows)
    with pytest.raises(ImportErrorDetail):
        _parse_archive(source, source.name)


def test_import_month_creates_verified_manifest_and_is_idempotent(tmp_path: Path) -> None:
    progress: list[tuple[int, int, str]] = []
    def fake_download(url: str, target: Path) -> None:
        target.parent.mkdir(parents=True, exist_ok=True)
        if target.name.endswith(".CHECKSUM"):
            target.write_text("", encoding="ascii")
            return
        _make_archive(target, [_row(), _row(2, 1_704_067_200_001)])

    with patch("backend.data.app.binance_import._download", side_effect=fake_download), patch(
        "backend.data.app.binance_import._verify_checksum", return_value="a" * 64
    ):
        first = import_aggtrade_archives(
            date(2024, 1, 1), date(2024, 1, 31), tmp_path,
            lambda completed, total, archive: progress.append((completed, total, archive)),
        )
        second = import_aggtrade_archives(date(2024, 1, 1), date(2024, 1, 31), tmp_path)

    assert first[0].dataset_id == second[0].dataset_id
    assert first[0].retrieved_at_ns == second[0].retrieved_at_ns
    assert progress == [
        (0, 1, "BTCUSDT-aggTrades-2024-01.zip"),
        (1, 1, "BTCUSDT-aggTrades-2024-01.zip"),
    ]
    manifest_path = tmp_path / "prepared" / first[0].dataset_id / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    assert manifest["data_capabilities"] == ["TRADES"]
    assert manifest["data_fidelity"] == "TRADES_ONLY"
    assert manifest["book_depth_available"] is False
    assert manifest["archive_sha256"] == "a" * 64
    assert Path(manifest["raw_archive_path"]).is_file()
    assert Path(manifest["normalized_path"]).is_file()


def test_partial_month_uses_daily_archive_without_overstating_requested_range() -> None:
    specs = list(_archive_specs(date(2024, 1, 2), date(2024, 1, 3)))
    assert [item[0] for item in specs] == ["daily", "daily"]
    assert [item[3] for item in specs] == [
        "BTCUSDT-aggTrades-2024-01-02.zip",
        "BTCUSDT-aggTrades-2024-01-03.zip",
    ]


def test_complete_month_uses_monthly_archive() -> None:
    specs = list(_archive_specs(date(2024, 1, 1), date(2024, 1, 31)))
    assert len(specs) == 1
    assert specs[0][0] == "monthly"
    assert specs[0][3] == "BTCUSDT-aggTrades-2024-01.zip"


def test_import_api_returns_persistent_job_reference(tmp_path: Path) -> None:
    client = TestClient(data_main.app)
    with patch("backend.data.app.main.default_data_root", return_value=tmp_path), patch(
        "backend.data.app.main._run_binance_trade_import"
    ):
        response = client.post("/binance/trades/import", json={
            "startDate": "2024-01-02", "endDate": "2024-01-02",
        })
        assert response.status_code == 202
        body = response.json()
        assert body["status"] == "queued"
        job_response = client.get(f"/binance/trades/jobs/{body['jobId']}")
        assert job_response.status_code == 200
        assert job_response.json()["symbol"] == "BTCUSDT"
