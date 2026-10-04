"""Register verified local Binance Spot aggregate trades as raw catalog entries."""

from __future__ import annotations

import csv
import hashlib
import json
import re
import time
from concurrent.futures import ProcessPoolExecutor, as_completed
from datetime import date, datetime, timezone
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Callable


PIPELINE_VERSION = "binance-spot-aggtrades-raw-v1"
SOURCE_PREFIX = "data/spot/daily/aggTrades/BTCUSDT/"


class SpotCatalogError(Exception):
    """Invalid source files or metadata that must not be cataloged."""


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        while chunk := stream.read(4 * 1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def _boolean(value: str, field: str, row_number: int) -> bool:
    normalized = value.strip().lower()
    if normalized == "true":
        return True
    if normalized == "false":
        return False
    raise SpotCatalogError(f"Invalid {field} at source row {row_number}: expected true or false")


def validate_spot_csv(path: Path, expected_day: date) -> tuple[int, int, int, int, int | None]:
    """Validate raw Spot rows and return count, time range, regression count and first row."""
    row_count = 0
    minimum_timestamp_ns: int | None = None
    maximum_timestamp_ns: int | None = None
    last_aggregate_id: int | None = None
    last_timestamp_us: int | None = None
    ordering_regressions = 0
    first_ordering_regression_row: int | None = None
    try:
        with path.open("r", encoding="utf-8-sig", newline="") as stream:
            reader = csv.reader(stream)
            for row_number, row in enumerate(reader, start=1):
                if len(row) != 8:
                    raise SpotCatalogError(
                        f"Expected 8 headerless Spot fields at source row {row_number}; found {len(row)}"
                    )
                try:
                    aggregate_id = int(row[0])
                    price = Decimal(row[1])
                    quantity = Decimal(row[2])
                    first_trade_id = int(row[3])
                    last_trade_id = int(row[4])
                    timestamp_us = int(row[5])
                except (ValueError, InvalidOperation) as exc:
                    if row_number == 1 and row[0].strip().lower() in {"agg_trade_id", "aggtradeid"}:
                        raise SpotCatalogError("Header row detected; expected the 8-field headerless Spot schema") from exc
                    raise SpotCatalogError(f"Invalid numeric field at source row {row_number}: {exc}") from exc
                if aggregate_id < 0 or first_trade_id < 0 or last_trade_id < first_trade_id:
                    raise SpotCatalogError(f"Invalid trade identifier at source row {row_number}")
                if not price.is_finite() or not quantity.is_finite() or price <= 0 or quantity <= 0:
                    raise SpotCatalogError(f"Price and quantity must be finite and positive at source row {row_number}")
                if timestamp_us <= 0:
                    raise SpotCatalogError(f"Timestamp must be positive at source row {row_number}")
                _boolean(row[6], "is_buyer_maker", row_number)
                _boolean(row[7], "is_best_match", row_number)
                if (
                    last_aggregate_id is not None and aggregate_id <= last_aggregate_id
                ) or (last_timestamp_us is not None and timestamp_us < last_timestamp_us):
                    ordering_regressions += 1
                    if first_ordering_regression_row is None:
                        first_ordering_regression_row = row_number
                try:
                    event_day = datetime.fromtimestamp(timestamp_us // 1_000_000, timezone.utc).date()
                except (OverflowError, OSError, ValueError) as exc:
                    raise SpotCatalogError(f"Invalid UTC timestamp at source row {row_number}") from exc
                if event_day != expected_day:
                    raise SpotCatalogError(
                        f"Timestamp date {event_day.isoformat()} does not match archive date {expected_day.isoformat()} at source row {row_number}"
                    )
                timestamp_ns = timestamp_us * 1_000
                minimum_timestamp_ns = timestamp_ns if minimum_timestamp_ns is None else min(minimum_timestamp_ns, timestamp_ns)
                maximum_timestamp_ns = timestamp_ns if maximum_timestamp_ns is None else max(maximum_timestamp_ns, timestamp_ns)
                last_aggregate_id = aggregate_id
                last_timestamp_us = timestamp_us
                row_count += 1
    except OSError as exc:
        raise SpotCatalogError(f"Could not read extracted Spot CSV {path.name}: {exc}") from exc
    if row_count == 0 or minimum_timestamp_ns is None or maximum_timestamp_ns is None:
        raise SpotCatalogError(f"Extracted Spot CSV is empty: {path.name}")
    return row_count, minimum_timestamp_ns, maximum_timestamp_ns, ordering_regressions, first_ordering_regression_row


def _register_one(source_root: str, data_root: str, item: dict[str, str]) -> dict[str, object]:
    source_path = Path(source_root)
    target_root = Path(data_root)
    try:
        archive_day = date.fromisoformat(item["date"])
        if item["market"] != "BINANCE_SPOT" or item["symbol"] != "BTCUSDT" or item["data_type"] != "aggTrades":
            raise SpotCatalogError(f"Unexpected source identity for {archive_day}")
        expected_key = f"{SOURCE_PREFIX}BTCUSDT-aggTrades-{archive_day.isoformat()}.zip"
        if item["source_key"] != expected_key or item["checksum_status"] != "verified":
            raise SpotCatalogError(f"Source key or prior verification status is invalid for {archive_day}")
        archive_name = f"BTCUSDT-aggTrades-{archive_day.isoformat()}.zip"
        csv_name = f"BTCUSDT-aggTrades-{archive_day.isoformat()}.csv"
        archive_path = source_path / "archives" / archive_name
        checksum_path = source_path / "archives" / (archive_name + ".CHECKSUM")
        csv_path = source_path / "extracted" / csv_name
        if not archive_path.is_file() or not checksum_path.is_file() or not csv_path.is_file():
            raise SpotCatalogError(f"Missing ZIP, checksum sidecar, or extracted CSV for {archive_day}")
        checksum_match = re.search(r"(?i)\b([a-f0-9]{64})\b", checksum_path.read_text(encoding="ascii"))
        if not checksum_match:
            raise SpotCatalogError(f"Invalid SHA-256 sidecar for {archive_name}")
        sidecar_hash = checksum_match.group(1).lower()
        expected_hash = item["sha256"].lower()
        if sidecar_hash != expected_hash or archive_path.stat().st_size != int(item["archive_bytes"]):
            raise SpotCatalogError(f"Sidecar or archive metadata mismatch for {archive_name}")
        if csv_path.stat().st_size != int(item["extracted_bytes"]):
            raise SpotCatalogError(f"Extracted CSV size does not match the source manifest for {csv_name}")

        identity = {
            "market": "BINANCE_SPOT",
            "symbol": "BTCUSDT",
            "data_type": "AGG_TRADE",
            "archive_sha256": expected_hash,
            "pipeline_version": PIPELINE_VERSION,
        }
        dataset_id = hashlib.sha256(
            json.dumps(identity, sort_keys=True, separators=(",", ":")).encode("utf-8")
        ).hexdigest()
        output_dir = target_root / "registered" / dataset_id
        manifest_path = output_dir / "manifest.json"
        if manifest_path.is_file():
            existing = json.loads(manifest_path.read_text(encoding="utf-8"))
            if (
                existing.get("dataset_id") == dataset_id
                and existing.get("archive_sha256") == expected_hash
                and existing.get("retrieved_at_ns") == archive_path.stat().st_mtime_ns
                and Path(existing.get("raw_csv_path", "")).is_file()
                and Path(existing["raw_csv_path"]).stat().st_size == int(item["extracted_bytes"])
            ):
                if "ordering_regressions" not in existing:
                    # Prior catalog manifests were emitted only after strict ordering passed.
                    existing["ordering_regressions"] = 0
                    existing["source_order_status"] = "MONOTONIC"
                    existing["first_ordering_regression_row"] = None
                    temporary = manifest_path.with_name(manifest_path.name + ".partial")
                    temporary.write_text(json.dumps(existing, indent=2), encoding="utf-8")
                    temporary.replace(manifest_path)
                return existing

        archive_hash = _sha256(archive_path)
        if archive_hash != sidecar_hash:
            raise SpotCatalogError(f"SHA-256 mismatch for {archive_name}")
        row_count, coverage_start_ns, coverage_end_ns, ordering_regressions, first_regression_row = validate_spot_csv(csv_path, archive_day)
        record: dict[str, object] = {
            "source": "BINANCE_DATA_VISION",
            "market": "BINANCE_SPOT",
            "symbol": "BTCUSDT",
            "data_type": "AGG_TRADE",
            "source_uri": "https://data.binance.vision/" + item["source_key"],
            "archive_filename": archive_name,
            "archive_sha256": archive_hash,
            "retrieved_at_ns": archive_path.stat().st_mtime_ns,
            "cataloged_at_ns": time.time_ns(),
            "coverage_start_ns": coverage_start_ns,
            "coverage_end_ns": coverage_end_ns,
            "row_count": row_count,
            "pipeline_version": PIPELINE_VERSION,
            "dataset_id": dataset_id,
            "data_capabilities": ["TRADES"],
            "book_depth_available": False,
            "historical_best_quotes_available": False,
            "data_fidelity": "TRADES_ONLY",
            "normalization_status": "RAW_PROVIDER_SCHEMA",
            "source_order_status": "NON_MONOTONIC" if ordering_regressions else "MONOTONIC",
            "ordering_regressions": ordering_regressions,
            "first_ordering_regression_row": first_regression_row,
            "raw_archive_path": str(archive_path),
            "raw_csv_path": str(csv_path),
        }
        output_dir.mkdir(parents=True, exist_ok=True)
        temporary = manifest_path.with_name(manifest_path.name + ".partial")
        temporary.write_text(json.dumps(record, indent=2), encoding="utf-8")
        temporary.replace(manifest_path)
        return record
    except SpotCatalogError:
        raise
    except (KeyError, OSError, ValueError, json.JSONDecodeError) as exc:
        raise SpotCatalogError(f"Could not register {item.get('date', 'unknown date')}: {exc}") from exc


def register_spot_catalog(
    source_root: Path,
    data_root: Path,
    progress: Callable[[int, int, str], None] | None = None,
    workers: int = 4,
) -> list[dict[str, object]]:
    """Verify local provider archives and register raw Spot manifests without copying data."""
    source_root = source_root.resolve()
    data_root = data_root.resolve()
    manifest_csv = source_root / "manifest.csv"
    verification_file = source_root / "verification.json"
    if not manifest_csv.is_file() or not verification_file.is_file():
        raise SpotCatalogError("Source root must contain manifest.csv and verification.json")
    try:
        verification = json.loads(verification_file.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise SpotCatalogError(f"Could not read source verification report: {exc}") from exc
    if verification.get("market") != "Binance Spot" or verification.get("symbol") != "BTCUSDT" or verification.get("sha256_audit") != "passed":
        raise SpotCatalogError("Source verification report is not a passed Binance BTCUSDT Spot audit")

    try:
        with manifest_csv.open("r", encoding="utf-8-sig", newline="") as stream:
            source_rows = list(csv.DictReader(stream))
    except OSError as exc:
        raise SpotCatalogError(f"Could not read source manifest: {exc}") from exc
    if not source_rows:
        raise SpotCatalogError("Source manifest contains no archive rows")

    expected_dates: list[date] = []
    for item in source_rows:
        try:
            expected_dates.append(date.fromisoformat(item["date"]))
        except (KeyError, ValueError, TypeError) as exc:
            raise SpotCatalogError("Source manifest has an invalid date") from exc
    if expected_dates != sorted(set(expected_dates)):
        raise SpotCatalogError("Source manifest dates must be unique and in ascending order")
    for previous, current in zip(expected_dates, expected_dates[1:]):
        if (current - previous).days != 1:
            raise SpotCatalogError(f"Source manifest has a missing day between {previous} and {current}")
    if (
        verification.get("days") != len(source_rows)
        or verification.get("date_start") != expected_dates[0].isoformat()
        or verification.get("date_end") != expected_dates[-1].isoformat()
    ):
        raise SpotCatalogError("Verification report coverage does not match manifest.csv")
    if not 1 <= workers <= 8:
        raise SpotCatalogError("Worker count must be between 1 and 8")

    registered: list[dict[str, object]] = []
    total = len(source_rows)
    if workers == 1:
        for index, item in enumerate(source_rows, start=1):
            record = _register_one(str(source_root), str(data_root), item)
            registered.append(record)
            if progress:
                progress(index, total, str(record["archive_filename"]))
        return registered

    with ProcessPoolExecutor(max_workers=workers) as pool:
        futures = {pool.submit(_register_one, str(source_root), str(data_root), item): item for item in source_rows}
        for index, future in enumerate(as_completed(futures), start=1):
            item = futures[future]
            try:
                record = future.result()
            except SpotCatalogError as exc:
                raise SpotCatalogError(str(exc)) from exc
            registered.append(record)
            if progress:
                progress(index, total, str(record["archive_filename"]))
    registered.sort(key=lambda record: str(record["archive_filename"]))
    return registered
