# research-worker/src/storage/parquet.py
#
# Normalized Parquet writer/reader (docs/07-phases-and-tasks.md T2.3,
# docs/09-research-system.md sec 9.3 storage layout and sec 9.5 canonical entities).
#
# Layout (relative to the research root):
#   normalized/kind=<entity>/date=YYYY-MM-DD/part-<sha256[:16]>.parquet
#
# Guarantees:
#   * Zstandard-compressed Parquet, one row-group batch at a time, rotated so each
#     file stays under the target size (default 128 MiB).
#   * Timestamps are stored as int64 epoch milliseconds (never converted to float or
#     to timezone-aware types). Missing values stay null; null is never coerced to 0,
#     NaN, or an empty string. Addresses are stored verbatim (case preserved).
#   * Output is deterministic: rows are sorted by (partition time, primary key) and no
#     wall-clock value is embedded, so identical input gives byte-identical files.
#   * File names are content-addressed, so a write can never overwrite different
#     existing data. Temp files are renamed into place only after hashing.
#   * Unknown (entity, schema version) pairs, unknown/missing columns, wrong types,
#     non-finite floats, null in a required column and duplicate keys all raise
#     StorageError BEFORE anything is written. The reader refuses files whose embedded
#     entity/schema version or column layout is not exactly a registered schema.
#
# The worker never touches radar.db (Electron main is the only SQLite writer); it
# returns file descriptors that main registers in the catalog (T2.1).
from __future__ import annotations

import hashlib
import math
import os
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

import pyarrow as pa
import pyarrow.compute as pc
import pyarrow.parquet as pq

DEFAULT_TARGET_BYTES = 128 * 1024 * 1024  # docs/09 sec 9.3
DEFAULT_ROW_GROUP_ROWS = 50_000
ZSTD_LEVEL = 3
META_ENTITY = b"ticklab.entity"
META_SCHEMA = b"ticklab.schema_version"
META_NORMALIZER = b"ticklab.normalizer_version"

_I64_MIN, _I64_MAX = -(2**63), 2**63 - 1


class StorageError(Exception):
    """Typed storage failure surfaced to Electron main as { code, message }."""

    def __init__(self, code: str, message: str):
        self.code = code
        self.message = message
        super().__init__(message)


# kind -> arrow type
_ARROW = {"str": pa.string(), "i64": pa.int64(), "f64": pa.float64(), "list_str": pa.list_(pa.string())}


@dataclass(frozen=True)
class Field:
    name: str
    kind: str  # str | i64 | f64 | list_str
    nullable: bool = False


@dataclass(frozen=True)
class SchemaDef:
    entity: str
    schema_version: str
    fields: tuple[Field, ...]
    pk: str
    partition_col: str          # int64 epoch-ms column that determines date=YYYY-MM-DD
    enums: tuple[tuple[str, tuple[str, ...]], ...] = ()

    @property
    def arrow(self) -> pa.Schema:
        return pa.schema([pa.field(f.name, _ARROW[f.kind], nullable=f.nullable) for f in self.fields])


def _window_fields() -> list[Field]:
    # Windows from docs/09 sec 9.4 family 3: 1m, 5m, 1h, 6h, 24h. All nullable: unknown != 0.
    out: list[Field] = []
    for w in ("M1", "M5", "H1", "H6", "H24"):
        out += [
            Field(f"volumeUsd{w}", "f64", True), Field(f"buys{w}", "i64", True), Field(f"sells{w}", "i64", True),
            Field(f"buyers{w}", "i64", True), Field(f"sellers{w}", "i64", True), Field(f"changePct{w}", "f64", True),
        ]
    return out


# Field names/optionality follow the docs/09 sec 9.5 entity table ('?' = nullable). Column
# types and the snapshot window/reserve columns are Executor assumptions flagged for Planner
# review in STATE.md; they are versioned (.v1) so they can be revised without touching old files.
SCHEMAS: dict[str, SchemaDef] = {
    s.schema_version: s
    for s in (
        SchemaDef(
            "launch", "launch.v1",
            (
                Field("launchId", "str"), Field("mint", "str"), Field("pool", "str"), Field("venue", "str"),
                Field("quoteMint", "str"), Field("sourceCreatedAt", "i64", True), Field("firstSeenAt", "i64"),
                Field("availableAt", "i64"), Field("sourceId", "str"), Field("coverageStatus", "str"),
                Field("schemaVersion", "str"),
            ),
            pk="launchId", partition_col="firstSeenAt",
        ),
        SchemaDef(
            "trade", "trade.v1",
            (
                Field("tradeId", "str"), Field("launchId", "str"), Field("txId", "str"), Field("eventAt", "i64"),
                Field("availableAt", "i64"), Field("side", "str"), Field("baseAmount", "f64", True),
                Field("quoteAmount", "f64", True), Field("priceUsd", "f64", True), Field("wallet", "str", True),
                Field("sourceId", "str"), Field("qualityFlags", "list_str"), Field("schemaVersion", "str"),
            ),
            pk="tradeId", partition_col="eventAt", enums=(("side", ("buy", "sell")),),
        ),
        SchemaDef(
            "snapshot", "snapshot.v1",
            (
                Field("snapshotId", "str"), Field("launchId", "str"), Field("eventAt", "i64"), Field("availableAt", "i64"),
                Field("priceUsd", "f64", True), Field("liquidityUsd", "f64", True), Field("reservesBase", "f64", True),
                Field("reservesQuote", "f64", True), Field("fdvUsd", "f64", True), Field("marketCapUsd", "f64", True),
                *_window_fields(), Field("sourceId", "str"), Field("schemaVersion", "str"),
            ),
            pk="snapshotId", partition_col="eventAt",
        ),
    )
}


def get_schema(schema_version: str, entity: str | None = None) -> SchemaDef:
    s = SCHEMAS.get(schema_version)
    if s is None or (entity is not None and s.entity != entity):
        raise StorageError("UNKNOWN_SCHEMA", f"unknown schema version {schema_version!r}" + (f" for entity {entity!r}" if entity else ""))
    return s


def _check_cell(f: Field, v: Any, row_no: int) -> None:
    where = f"row {row_no} column {f.name}"
    if v is None:
        if not f.nullable:
            raise StorageError("VALIDATION", f"{where}: null in a required column")
        return
    if f.kind == "str":
        if not isinstance(v, str) or v == "":
            raise StorageError("VALIDATION", f"{where}: expected a non-empty string")
    elif f.kind == "i64":
        if isinstance(v, bool) or not isinstance(v, int) or not (_I64_MIN <= v <= _I64_MAX):
            raise StorageError("VALIDATION", f"{where}: expected an int64 integer, got {type(v).__name__}")
    elif f.kind == "f64":
        if isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v):
            raise StorageError("VALIDATION", f"{where}: expected a finite number (null means unknown; NaN/inf are rejected)")
    elif f.kind == "list_str":
        if not isinstance(v, list) or not all(isinstance(x, str) for x in v):
            raise StorageError("VALIDATION", f"{where}: expected a list of strings")


def validate_rows(schema: SchemaDef, rows: list[dict[str, Any]]) -> None:
    names = {f.name for f in schema.fields}
    enums = dict(schema.enums)
    seen: set[str] = set()
    for i, r in enumerate(rows):
        if not isinstance(r, dict):
            raise StorageError("VALIDATION", f"row {i}: not an object")
        extra = set(r) - names
        if extra:
            raise StorageError("VALIDATION", f"row {i}: unknown column(s) {sorted(extra)} for {schema.schema_version}")
        missing = names - set(r)
        if missing:
            raise StorageError("VALIDATION", f"row {i}: missing column(s) {sorted(missing)} for {schema.schema_version}")
        for f in schema.fields:
            _check_cell(f, r[f.name], i)
        for col, allowed in enums.items():
            if r[col] not in allowed:
                raise StorageError("VALIDATION", f"row {i} column {col}: {r[col]!r} not in {allowed}")
        if r["schemaVersion"] != schema.schema_version:
            raise StorageError("VALIDATION", f"row {i}: schemaVersion {r['schemaVersion']!r} != {schema.schema_version!r}")
        k = r[schema.pk]
        if k in seen:
            raise StorageError("DUPLICATE_KEY", f"row {i}: duplicate {schema.pk} {k!r}")
        seen.add(k)


def _date_of(ms: int) -> str:
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc).strftime("%Y-%m-%d")


def _sha256_file(p: Path) -> str:
    h = hashlib.sha256()
    with open(p, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def _table(schema: SchemaDef, rows: list[dict[str, Any]]) -> pa.Table:
    arrays = [pa.array([r[f.name] for r in rows], type=_ARROW[f.kind]) for f in schema.fields]
    return pa.Table.from_arrays(arrays, schema=schema.arrow)


def write_rows(
    root: str | os.PathLike[str],
    schema_version: str,
    rows: Iterable[dict[str, Any]],
    normalizer_version: str,
    target_bytes: int = DEFAULT_TARGET_BYTES,
    row_group_rows: int = DEFAULT_ROW_GROUP_ROWS,
) -> list[dict[str, Any]]:
    """Validates rows, then writes date-partitioned Zstandard Parquet files.

    Returns one descriptor per file: path (relative, '/'-separated), entity, partitionKey,
    schemaVersion, rowCount, byteSize, sha256, timeStart, timeEnd. Raises StorageError
    before touching disk on any validation problem.
    """
    schema = get_schema(schema_version)
    if not normalizer_version:
        raise StorageError("VALIDATION", "normalizer_version is required")
    if target_bytes <= 0 or row_group_rows <= 0:
        raise StorageError("VALIDATION", "target_bytes and row_group_rows must be positive")
    data = list(rows)
    validate_rows(schema, data)
    if not data:
        return []

    by_date: dict[str, list[dict[str, Any]]] = {}
    for r in data:
        by_date.setdefault(_date_of(r[schema.partition_col]), []).append(r)

    meta = {META_ENTITY: schema.entity.encode(), META_SCHEMA: schema.schema_version.encode(), META_NORMALIZER: normalizer_version.encode()}
    out: list[dict[str, Any]] = []
    root_p = Path(root)
    for date in sorted(by_date):
        part_rows = sorted(by_date[date], key=lambda r: (r[schema.partition_col], r[schema.pk]))
        table = _table(schema, part_rows)
        out += _write_partition(root_p, schema, table, date, meta, target_bytes, row_group_rows)
    return out


def _write_partition(root: Path, schema: SchemaDef, table: pa.Table, date: str, meta: dict[bytes, bytes], target_bytes: int, rg_rows: int) -> list[dict[str, Any]]:
    part_key = f"kind={schema.entity}/date={date}"
    dir_p = root / "normalized" / "kind={}".format(schema.entity) / f"date={date}"
    dir_p.mkdir(parents=True, exist_ok=True)
    arrow_schema = schema.arrow.with_metadata(meta)
    files: list[dict[str, Any]] = []
    tmp_paths: list[Path] = []

    state: dict[str, Any] = {}

    def open_file() -> None:
        tmp = dir_p / f".tmp-{uuid.uuid4().hex}"
        tmp_paths.append(tmp)
        fh = open(tmp, "wb")
        state.update(tmp=tmp, fh=fh, writer=pq.ParquetWriter(fh, arrow_schema, compression="zstd", compression_level=ZSTD_LEVEL), rows=0, groups=0, last_delta=0, t_min=None, t_max=None)

    def close_file() -> None:
        state["writer"].close()
        state["fh"].close()
        tmp: Path = state["tmp"]
        digest = _sha256_file(tmp)
        final = dir_p / f"part-{digest[:16]}.parquet"
        size = tmp.stat().st_size
        if final.exists():
            if _sha256_file(final) != digest:  # content-addressed names make this impossible barring corruption
                raise StorageError("OVERWRITE_REFUSED", f"{final.name} exists with different content")
            tmp.unlink()  # identical content already present: our own temp file
        else:
            os.replace(tmp, final)
        tmp_paths.remove(tmp)
        files.append({
            "path": f"normalized/{part_key}/{final.name}", "entity": schema.entity, "partitionKey": part_key,
            "schemaVersion": schema.schema_version, "rowCount": state["rows"], "byteSize": size, "sha256": digest,
            "timeStart": int(state["t_min"]), "timeEnd": int(state["t_max"]),
        })
        state.clear()

    try:
        for off in range(0, table.num_rows, rg_rows):
            chunk = table.slice(off, rg_rows)
            if state:
                # rotate BEFORE writing a group that would push the file over the target
                state["fh"].flush()
                # footer grows with groups x columns (~100 B per column chunk measured); reserve 2x
                footer = 200 * len(schema.fields) * (state["groups"] + 1) + 1024
                if state["groups"] > 0 and state["fh"].tell() + state["last_delta"] + footer > target_bytes:
                    close_file()
            if not state:
                open_file()
            before = state["fh"].tell()
            state["writer"].write_table(chunk, row_group_size=rg_rows)
            state["fh"].flush()
            state["last_delta"] = state["fh"].tell() - before
            state["groups"] += 1
            state["rows"] += chunk.num_rows
            mm = pc.min_max(chunk[schema.partition_col]).as_py()
            state["t_min"] = mm["min"] if state["t_min"] is None else min(state["t_min"], mm["min"])
            state["t_max"] = mm["max"] if state["t_max"] is None else max(state["t_max"], mm["max"])
        if state:
            close_file()
    except BaseException:
        if state:
            try:
                state["writer"].close()
                state["fh"].close()
            except Exception:
                pass
        for t in tmp_paths:  # only our own temp files; finalized content-addressed files are never touched
            try:
                t.unlink()
            except OSError:
                pass
        raise
    return files


def _same_layout(actual: pa.Schema, expected: pa.Schema) -> bool:
    if actual.names != expected.names:
        return False
    for a, e in zip(actual, expected):
        if a.nullable != e.nullable:
            return False
        if pa.types.is_list(e.type):
            if not pa.types.is_list(a.type) or a.type.value_type != e.type.value_type:
                return False
        elif a.type != e.type:
            return False
    return True


def read_table(path: str | os.PathLike[str]) -> tuple[pa.Table, dict[str, str]]:
    """Reads one normalized file, refusing anything that is not exactly a registered schema."""
    try:
        pf = pq.ParquetFile(path)
    except Exception as exc:  # pyarrow raises several types for corrupt files
        raise StorageError("CORRUPT_FILE", f"cannot open {Path(path).name}: {exc}") from exc
    md = pf.schema_arrow.metadata or {}
    entity, version = md.get(META_ENTITY), md.get(META_SCHEMA)
    if entity is None or version is None:
        raise StorageError("UNKNOWN_SCHEMA", f"{Path(path).name} has no ticklab entity/schema_version metadata")
    schema = get_schema(version.decode(), entity.decode())
    if not _same_layout(pf.schema_arrow.remove_metadata(), schema.arrow):
        raise StorageError("SCHEMA_MISMATCH", f"{Path(path).name} columns do not match {schema.schema_version}")
    info = {"entity": schema.entity, "schemaVersion": schema.schema_version, "normalizerVersion": (md.get(META_NORMALIZER) or b"").decode()}
    return pf.read(), info


def read_rows(path: str | os.PathLike[str]) -> list[dict[str, Any]]:
    table, _ = read_table(path)
    return table.to_pylist()
