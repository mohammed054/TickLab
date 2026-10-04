"""Resumable import of Binance public USD-M BTCUSDT aggregate-trade archives.

Source layout and columns are documented by the official Binance public-data
repository. The original ZIP and its SHA-256 sidecar are retained; normalized rows
are written without inventing missing events or order-book state.
"""

from __future__ import annotations

import csv
import hashlib
import io
import json
import os
import re
import shutil
import tempfile
import urllib.error
import urllib.request
import zipfile
from decimal import Decimal
from dataclasses import asdict, dataclass
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Callable, Iterator


BASE_URL = "https://data.binance.vision/data/futures/um/monthly/aggTrades/BTCUSDT"
PIPELINE_VERSION = "binance-um-aggtrades-v1"
EXPECTED_HEADER = (
    "agg_trade_id",
    "price",
    "quantity",
    "first_trade_id",
    "last_trade_id",
    "transact_time",
    "is_buyer_maker",
)


class ImportErrorDetail(Exception):
    """Expected, user-actionable archive/import failure."""


@dataclass(frozen=True)
class TradeRecord:
    timestamp_ns: int
    symbol: str
    price: str
    quantity: str
    buyer_is_maker: bool
    first_trade_id: int
    last_trade_id: int
    event_id: str
    archive_part: str


@dataclass(frozen=True)
class ArchiveRecord:
    source: str
    market: str
    symbol: str
    data_type: str
    source_uri: str
    archive_filename: str
    archive_sha256: str
    retrieved_at_ns: int
    coverage_start_ns: int
    coverage_end_ns: int
    row_count: int
    pipeline_version: str
    dataset_id: str


def _archive_specs(start: date, end: date) -> Iterator[tuple[str, date, str, str]]:
    """Use monthly files for complete months and daily files on partial edges."""
    cursor = start
    while cursor <= end:
        next_month = date(cursor.year + (cursor.month == 12), 1 if cursor.month == 12 else cursor.month + 1, 1)
        month_end = next_month - date.resolution
        if cursor.day == 1 and month_end <= end:
            period = "monthly"
            label = cursor.strftime("%Y-%m")
            archive_date = cursor
            cursor = next_month
        else:
            period = "daily"
            label = cursor.strftime("%Y-%m-%d")
            archive_date = cursor
            cursor += date.resolution
        filename = f"BTCUSDT-aggTrades-{label}.zip"
        url = f"{BASE_URL.rsplit('/monthly/', 1)[0]}/{period}/aggTrades/BTCUSDT/{filename}"
        yield period, archive_date, url, filename


def _download(url: str, target: Path) -> None:
    """Download atomically; an existing non-empty file is retained for resume."""
    if target.exists() and target.stat().st_size:
        return
    target.parent.mkdir(parents=True, exist_ok=True)
    request = urllib.request.Request(url, headers={"User-Agent": "TickLab/0.1 data importer"})
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            with tempfile.NamedTemporaryFile(dir=target.parent, delete=False) as tmp:
                temp_path = Path(tmp.name)
                while chunk := response.read(1024 * 1024):
                    tmp.write(chunk)
        temp_path.replace(target)
    except urllib.error.HTTPError as exc:
        if "temp_path" in locals():
            temp_path.unlink(missing_ok=True)
        if exc.code == 404:
            raise ImportErrorDetail(f"Binance archive is not published: {url}") from exc
        raise ImportErrorDetail(f"Binance archive request failed ({exc.code}): {url}") from exc
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        if "temp_path" in locals():
            temp_path.unlink(missing_ok=True)
        raise ImportErrorDetail(f"Could not download {url}: {exc}") from exc


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        while chunk := source.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def _verify_checksum(url: str, archive: Path) -> str:
    checksum_path = archive.with_name(archive.name + ".CHECKSUM")
    _download(url + ".CHECKSUM", checksum_path)
    fields = checksum_path.read_text(encoding="ascii").strip().split()
    if not fields or not re.fullmatch(r"[0-9a-fA-F]{64}", fields[0]):
        raise ImportErrorDetail(f"Invalid SHA-256 checksum sidecar: {checksum_path.name}")
    actual = _sha256(archive)
    if actual.lower() != fields[0].lower():
        raise ImportErrorDetail(
            f"Checksum mismatch for {archive.name}: expected {fields[0]}, got {actual}"
        )
    return actual


def _parse_archive(archive: Path, filename: str) -> tuple[Path, int, int, int]:
    """Stream one CSV from the ZIP to a canonical CSV and report its coverage."""
    normalized = archive.with_suffix(".normalized.csv")
    temp_output = normalized.with_name(normalized.name + ".partial")
    row_count = 0
    first_ns: int | None = None
    last_ns: int | None = None
    last_key: tuple[int, int] | None = None
    last_aggregate_id: int | None = None
    try:
        with zipfile.ZipFile(archive) as bundle:
            csv_names = [name for name in bundle.namelist() if name.lower().endswith(".csv")]
            if len(csv_names) != 1:
                raise ImportErrorDetail(
                    f"Expected exactly one CSV in {archive.name}; found {len(csv_names)}"
                )
            with bundle.open(csv_names[0]) as raw, io.TextIOWrapper(raw, encoding="utf-8-sig", newline="") as text, temp_output.open("w", encoding="utf-8", newline="") as out:
                reader = csv.reader(text)
                writer = csv.writer(out)
                header = next(reader, None)
                normalized_header = tuple(column.strip().lower() for column in header) if header else ()
                if normalized_header not in (EXPECTED_HEADER, EXPECTED_HEADER + ("is_best_match",)):
                    raise ImportErrorDetail(f"Unexpected aggregate-trade schema in {archive.name}")
                writer.writerow(("timestamp_ns", "symbol", "price", "quantity", "buyer_is_maker", "first_trade_id", "last_trade_id", "event_id", "archive_part"))
                for source_row, row in enumerate(reader, start=2):
                    if len(row) != len(normalized_header):
                        raise ImportErrorDetail(f"Malformed row {source_row} in {archive.name}")
                    try:
                        aggregate_id = int(row[0])
                        price = row[1]
                        quantity = row[2]
                        first_id, last_id = int(row[3]), int(row[4])
                        timestamp_ms = int(row[5])
                        maker_flag = row[6].strip().lower()
                        buyer_is_maker = maker_flag == "true"
                        if maker_flag not in ("true", "false"):
                            raise ValueError("invalid buyer-is-maker flag")
                        if len(row) == 8 and row[7].strip().lower() not in ("true", "false"):
                            raise ValueError("invalid optional best-match flag")
                        if aggregate_id < 0 or first_id < 0 or last_id < first_id or timestamp_ms <= 0:
                            raise ValueError("invalid trade identifiers or timestamp")
                        if not re.fullmatch(r"(?:0|[1-9]\d*)(?:\.\d+)?", price) or not re.fullmatch(r"(?:0|[1-9]\d*)(?:\.\d+)?", quantity):
                            raise ValueError("invalid decimal price or quantity")
                        if not Decimal(price).is_finite() or not Decimal(quantity).is_finite() or Decimal(price) <= 0 or Decimal(quantity) <= 0:
                            raise ValueError("price and quantity must be positive")
                    except (ValueError, OverflowError) as exc:
                        raise ImportErrorDetail(f"Invalid trade row {source_row} in {archive.name}: {exc}") from exc
                    timestamp_ns = timestamp_ms * 1_000_000
                    key = (timestamp_ns, aggregate_id)
                    if last_key is not None and key < last_key:
                        raise ImportErrorDetail(f"Out-of-order trade at row {source_row} in {archive.name}")
                    if last_aggregate_id is not None and aggregate_id <= last_aggregate_id:
                        raise ImportErrorDetail(f"Duplicate or out-of-order aggregate trade ID {aggregate_id} in {archive.name}")
                    last_aggregate_id = aggregate_id
                    last_key = key
                    first_ns = timestamp_ns if first_ns is None else first_ns
                    last_ns = timestamp_ns
                    writer.writerow((timestamp_ns, "BTCUSDT", price, quantity, str(buyer_is_maker).lower(), first_id, last_id, f"binance-um-btcusdt-agg-{aggregate_id}", filename))
                    row_count += 1
        if not row_count or first_ns is None or last_ns is None:
            raise ImportErrorDetail(f"Archive contains no aggregate trades: {archive.name}")
        temp_output.replace(normalized)
        return normalized, row_count, first_ns, last_ns
    except (zipfile.BadZipFile, OSError, csv.Error) as exc:
        temp_output.unlink(missing_ok=True)
        raise ImportErrorDetail(f"Could not parse {archive.name}: {exc}") from exc
    except Exception:
        temp_output.unlink(missing_ok=True)
        raise


def import_aggtrade_archives(
    start: date,
    end: date,
    data_root: Path,
    progress: Callable[[int, int, str], None] | None = None,
) -> list[ArchiveRecord]:
    """Download, verify, normalize and content-address Binance archive parts.

    Requested dates are inclusive. Complete months use monthly archives; partial
    edge intervals use daily archives so reported coverage is not overstated.
    """
    if start > end:
        raise ImportErrorDetail("Start date must be on or before end date")
    raw_root = data_root / "raw" / "binance" / "usdm" / "BTCUSDT" / "aggTrades"
    records: list[ArchiveRecord] = []
    specs = list(_archive_specs(start, end))
    for index, (period, archive_date, url, filename) in enumerate(specs, start=1):
        if progress:
            progress(index - 1, len(specs), filename)
        archive = raw_root / f"{archive_date:%Y}" / f"{archive_date:%m}" / filename
        _download(url, archive)
        archive_hash = _verify_checksum(url, archive)
        identity = {
            "market": "BINANCE_USDM_PERPETUAL",
            "symbol": "BTCUSDT",
            "data_type": "AGG_TRADE",
            "archive_sha256": archive_hash,
            "pipeline_version": PIPELINE_VERSION,
        }
        dataset_id = hashlib.sha256(json.dumps(identity, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
        dataset_dir = data_root / "prepared" / dataset_id
        prepared = dataset_dir / "trades.csv"
        manifest_path = dataset_dir / "manifest.json"
        if manifest_path.exists() and prepared.exists():
            saved = json.loads(manifest_path.read_text(encoding="utf-8"))
            if saved.get("archive_sha256") != archive_hash or saved.get("dataset_id") != dataset_id:
                raise ImportErrorDetail(f"Existing dataset manifest does not match verified source archive {filename}")
            record = ArchiveRecord(**{field: saved[field] for field in ArchiveRecord.__dataclass_fields__})
            records.append(record)
            if progress:
                progress(index, len(specs), filename)
            continue

        normalized, row_count, coverage_start, coverage_end = _parse_archive(archive, filename)
        retrieved_at = datetime.now(timezone.utc)
        retrieved_ns = int(retrieved_at.timestamp()) * 1_000_000_000 + retrieved_at.microsecond * 1_000
        record = ArchiveRecord(
            source="BINANCE_DATA_VISION",
            market="BINANCE_USDM_PERPETUAL",
            symbol="BTCUSDT",
            data_type="AGG_TRADE",
            source_uri=url,
            archive_filename=filename,
            archive_sha256=archive_hash,
            retrieved_at_ns=retrieved_ns,
            coverage_start_ns=coverage_start,
            coverage_end_ns=coverage_end,
            row_count=row_count,
            pipeline_version=PIPELINE_VERSION,
            dataset_id=dataset_id,
        )
        dataset_dir.mkdir(parents=True, exist_ok=True)
        if not prepared.exists():
            temp_prepared = dataset_dir / "trades.csv.partial"
            with normalized.open("rb") as source, temp_prepared.open("wb") as destination:
                shutil.copyfileobj(source, destination, length=1024 * 1024)
            temp_prepared.replace(prepared)
        manifest = {**asdict(record), "data_capabilities": ["TRADES"], "book_depth_available": False, "historical_best_quotes_available": False, "data_fidelity": "TRADES_ONLY", "raw_archive_path": str(archive), "normalized_path": str(prepared)}
        temp_manifest = manifest_path.with_name(manifest_path.name + ".partial")
        temp_manifest.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
        temp_manifest.replace(manifest_path)
        records.append(record)
        if progress:
            progress(index, len(specs), filename)
    return records


def default_data_root() -> Path:
    configured = os.environ.get("TICKLAB_DATA_ROOT")
    if configured:
        return Path(configured).expanduser().resolve()
    return Path(__file__).resolve().parents[3] / "data"
