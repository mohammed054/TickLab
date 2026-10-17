# research-worker/src/storage/catalog.py
#
# Raw catalog access + normalization driver (docs/07-phases-and-tasks.md T2.3,
# docs/09-research-system.md sec 9.3 and 9.5).
#
# Electron main owns radar.db and hands the worker a list of catalogued raw files
# (path, sha256, size, rows, schema version). This module:
#   1. re-verifies each raw file against that catalog entry (size + sha256), and every
#      envelope's bodySha256, before trusting any byte of it;
#   2. streams the envelopes through a registered, versioned Normalizer;
#   3. writes normalized Parquet via storage.parquet and returns file descriptors
#      for main to register as a new dataset version (T2.1).
# Raw files are opened read-only and never modified. Provider-specific normalizers are
# NOT defined here: provider fields are unverified until T3.1, so they register
# themselves through register_normalizer() when their task lands.
from __future__ import annotations

import gzip
import hashlib
import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Iterable, Iterator

from storage.parquet import DEFAULT_TARGET_BYTES, StorageError, get_schema, write_rows


@dataclass(frozen=True)
class RawFileRef:
    path: str            # relative to the research root, '/'-separated
    sha256: str
    byte_size: int
    row_count: int
    schema_version: str
    source_id: str
    partition_key: str


_REF_FIELDS = {
    "path": str, "sha256": str, "byteSize": int, "rowCount": int,
    "schemaVersion": str, "sourceId": str, "partitionKey": str,
}


def validate_catalog_path(rel: str) -> None:
    if not isinstance(rel, str) or not rel or "\\" in rel or "\0" in rel or rel.startswith("/") or (len(rel) > 1 and rel[1] == ":"):
        raise StorageError("VALIDATION", f"invalid catalog path {rel!r}")
    if any(seg in ("", ".", "..") for seg in rel.split("/")):
        raise StorageError("VALIDATION", f"invalid catalog path {rel!r}")


def parse_refs(items: object) -> list[RawFileRef]:
    if not isinstance(items, list) or not items:
        raise StorageError("VALIDATION", "inputs must be a non-empty list of raw file references")
    refs: list[RawFileRef] = []
    for i, it in enumerate(items):
        if not isinstance(it, dict):
            raise StorageError("VALIDATION", f"inputs[{i}] is not an object")
        for k, t in _REF_FIELDS.items():
            v = it.get(k)
            if not isinstance(v, t) or isinstance(v, bool):
                raise StorageError("VALIDATION", f"inputs[{i}].{k} must be {t.__name__}")
        validate_catalog_path(it["path"])
        if not it["path"].startswith("raw/"):
            raise StorageError("VALIDATION", f"inputs[{i}].path is not under raw/")
        refs.append(RawFileRef(it["path"], it["sha256"], it["byteSize"], it["rowCount"], it["schemaVersion"], it["sourceId"], it["partitionKey"]))
    if len({r.path for r in refs}) != len(refs):
        raise StorageError("VALIDATION", "duplicate raw file in inputs")
    return sorted(refs, key=lambda r: r.path)


def _abs(root: str | os.PathLike[str], rel: str) -> Path:
    validate_catalog_path(rel)
    return Path(root).joinpath(*rel.split("/"))


def verify_raw_file(root: str | os.PathLike[str], ref: RawFileRef) -> None:
    p = _abs(root, ref.path)
    if not p.is_file():
        raise StorageError("RAW_MISSING", f"{ref.path} is not on disk")
    if p.stat().st_size != ref.byte_size:
        raise StorageError("RAW_HASH_MISMATCH", f"{ref.path}: size {p.stat().st_size} != catalog {ref.byte_size}")
    h = hashlib.sha256()
    with open(p, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    if h.hexdigest() != ref.sha256:
        raise StorageError("RAW_HASH_MISMATCH", f"{ref.path}: sha256 differs from the catalog")


def iter_envelopes(root: str | os.PathLike[str], ref: RawFileRef) -> Iterator[dict[str, Any]]:
    """Yields verified envelopes of one raw file (file hash first, then each body hash, then row count)."""
    verify_raw_file(root, ref)
    n = 0
    try:
        with gzip.open(_abs(root, ref.path), "rb") as fh:  # handles concatenated gzip members
            for raw in fh:
                line = raw.decode("utf-8").rstrip("\n")
                if not line:
                    continue
                env = json.loads(line)
                body = env.get("body")
                if not isinstance(body, str) or hashlib.sha256(body.encode("utf-8")).hexdigest() != env.get("bodySha256"):
                    raise StorageError("RAW_BODY_HASH_MISMATCH", f"{ref.path} line {n + 1}: bodySha256 does not match body")
                n += 1
                yield env
    except (OSError, EOFError, ValueError) as exc:
        raise StorageError("RAW_CORRUPT", f"{ref.path}: {exc}") from exc
    if n != ref.row_count:
        raise StorageError("RAW_ROW_COUNT_MISMATCH", f"{ref.path}: {n} envelopes != catalog {ref.row_count}")


# fn(envelope, ref) -> rows for the normalizer's schema (without 'schemaVersion'; it is added here).
NormalizeFn = Callable[[dict[str, Any], RawFileRef], Iterable[dict[str, Any]]]


@dataclass(frozen=True)
class Normalizer:
    name: str
    version: str
    raw_schema_versions: frozenset[str]
    schema_version: str          # normalized schema produced (a key of storage.parquet.SCHEMAS)
    fn: NormalizeFn


NORMALIZERS: dict[str, Normalizer] = {}


def register_normalizer(n: Normalizer) -> None:
    get_schema(n.schema_version)  # fail at registration if the output schema is unknown
    cur = NORMALIZERS.get(n.name)
    if cur is not None and (cur.version == n.version) and cur is not n:
        raise StorageError("VALIDATION", f"normalizer {n.name}@{n.version} already registered; bump the version to change behaviour")
    NORMALIZERS[n.name] = n


def normalize_raw(
    root: str | os.PathLike[str],
    inputs: object,
    normalizer_name: str,
    target_bytes: int = DEFAULT_TARGET_BYTES,
) -> dict[str, Any]:
    """Raw catalogued files -> new normalized Parquet files. Existing data is never rewritten."""
    n = NORMALIZERS.get(normalizer_name)
    if n is None:
        raise StorageError("UNKNOWN_NORMALIZER", f"no normalizer named {normalizer_name!r}")
    refs = parse_refs(inputs)
    for r in refs:
        if r.schema_version not in n.raw_schema_versions:
            raise StorageError("UNSUPPORTED_RAW_SCHEMA", f"{r.path} has raw schema {r.schema_version!r}; {n.name}@{n.version} accepts {sorted(n.raw_schema_versions)}")
    rows: list[dict[str, Any]] = []
    for r in refs:
        for env in iter_envelopes(root, r):  # verifies before any output is produced
            for row in n.fn(env, r):
                rows.append({**row, "schemaVersion": n.schema_version})
    files = write_rows(root, n.schema_version, rows, n.version, target_bytes=target_bytes)
    return {
        "entity": get_schema(n.schema_version).entity,
        "normalizerName": n.name,
        "normalizerVersion": n.version,
        "schemaVersion": n.schema_version,
        "rowCount": len(rows),
        "inputs": [{"path": r.path, "sha256": r.sha256} for r in refs],
        "files": files,
    }
