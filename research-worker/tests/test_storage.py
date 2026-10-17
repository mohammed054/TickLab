import gzip
import hashlib
import json
import random
import sys
from pathlib import Path

import pyarrow as pa
import pyarrow.parquet as pq
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from storage import catalog as cat  # noqa: E402
from storage import parquet as pqs  # noqa: E402
from storage.parquet import StorageError  # noqa: E402

T0 = 1_792_152_000_000  # 2026-10-16T12:00:00Z
DAY = 86_400_000
ADDR_A = "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU"  # mixed case base58, must be preserved
ADDR_B = "So11111111111111111111111111111111111111112"


def launch(i: int, **o):
    r = dict(launchId=f"L{i}", mint=ADDR_A, pool=f"P{i}", venue="pump.fun", quoteMint=ADDR_B,
             sourceCreatedAt=T0 + i, firstSeenAt=T0 + i + 5, availableAt=T0 + i + 9, sourceId="geckoterminal",
             coverageStatus="full", schemaVersion="launch.v1")
    r.update(o)
    return r


def trade(i: int, **o):
    r = dict(tradeId=f"T{i:06d}", launchId="L1", txId=f"sig{i}", eventAt=T0 + i, availableAt=T0 + i + 1500,
             side="buy" if i % 2 else "sell", baseAmount=1.5 + i, quoteAmount=0.25, priceUsd=0.000123, wallet=ADDR_A,
             sourceId="geckoterminal", qualityFlags=[], schemaVersion="trade.v1")
    r.update(o)
    return r


def snap(i: int, **o):
    r = {f.name: None for f in pqs.SCHEMAS["snapshot.v1"].fields}
    r.update(snapshotId=f"S{i}", launchId="L1", eventAt=T0 + i, availableAt=T0 + i + 10, sourceId="geckoterminal", schemaVersion="snapshot.v1")
    r.update(o)
    return r


def tree(root: Path):
    return sorted(str(p.relative_to(root)) for p in root.rglob("*") if p.is_file())


# ---------- round trip ----------

def test_round_trip_preserves_integers_nulls_addresses_and_times(tmp_path):
    big = 2**62 + 1  # not representable as float64
    rows = [
        launch(1, sourceCreatedAt=None),
        launch(2, sourceCreatedAt=big, firstSeenAt=T0 + 99, availableAt=T0 + 120),
    ]
    files = pqs.write_rows(tmp_path, "launch.v1", rows, "norm-1")
    assert len(files) == 1
    back = pqs.read_rows(tmp_path / files[0]["path"])
    assert back == sorted(rows, key=lambda r: (r["firstSeenAt"], r["launchId"]))
    assert back[0]["sourceCreatedAt"] is None            # null stays null, not 0
    assert back[1]["sourceCreatedAt"] == big and isinstance(back[1]["sourceCreatedAt"], int)
    assert back[0]["mint"] == ADDR_A                     # case preserved
    assert all(isinstance(r["firstSeenAt"], int) and isinstance(r["availableAt"], int) for r in back)


def test_trade_round_trip_nulls_flags_and_event_vs_available_time(tmp_path):
    rows = [
        trade(1, baseAmount=None, quoteAmount=None, priceUsd=None, wallet=None, qualityFlags=["inferred_side", "late"]),
        trade(2, availableAt=T0 + 2 + 60_000, qualityFlags=[]),
        trade(3, wallet="Ünïcode✓addr", priceUsd=0.0),    # 0.0 is a real value, distinct from null
    ]
    files = pqs.write_rows(tmp_path, "trade.v1", rows, "norm-1")
    back = {r["tradeId"]: r for r in pqs.read_rows(tmp_path / files[0]["path"])}
    assert back["T000001"]["baseAmount"] is None and back["T000001"]["wallet"] is None
    assert back["T000001"]["qualityFlags"] == ["inferred_side", "late"]
    assert back["T000002"]["qualityFlags"] == []
    assert back["T000002"]["availableAt"] - back["T000002"]["eventAt"] == 60_000
    assert back["T000003"]["priceUsd"] == 0.0 and back["T000003"]["wallet"] == "Ünïcode✓addr"


def test_snapshot_all_optional_columns_null(tmp_path):
    files = pqs.write_rows(tmp_path, "snapshot.v1", [snap(1), snap(2, priceUsd=1.25, buysM5=0, volumeUsdH1=None)], "n")
    back = pqs.read_rows(tmp_path / files[0]["path"])
    assert back[0]["priceUsd"] is None and back[0]["buysM5"] is None
    assert back[1]["buysM5"] == 0 and back[1]["volumeUsdH1"] is None


# ---------- format guarantees ----------

def test_zstd_compression_metadata_and_date_partition(tmp_path):
    rows = [trade(1), trade(2, eventAt=T0 + DAY, availableAt=T0 + DAY + 5)]  # crosses UTC midnight? T0=12:00 -> +1 day is next date
    files = pqs.write_rows(tmp_path, "trade.v1", rows, "norm-9")
    assert sorted(f["partitionKey"] for f in files) == ["kind=trade/date=2026-10-16", "kind=trade/date=2026-10-17"]
    for f in files:
        assert f["path"].startswith(f"normalized/{f['partitionKey']}/part-") and f["path"].endswith(".parquet")
        pf = pq.ParquetFile(tmp_path / f["path"])
        codecs = {pf.metadata.row_group(g).column(c).compression for g in range(pf.num_row_groups) for c in range(pf.metadata.num_columns)}
        assert codecs == {"ZSTD"}
        md = pf.schema_arrow.metadata
        assert md[b"ticklab.entity"] == b"trade" and md[b"ticklab.schema_version"] == b"trade.v1" and md[b"ticklab.normalizer_version"] == b"norm-9"
        assert f["sha256"] == hashlib.sha256((tmp_path / f["path"]).read_bytes()).hexdigest()
        assert f["byteSize"] == (tmp_path / f["path"]).stat().st_size


def test_descriptor_time_range_and_row_counts(tmp_path):
    files = pqs.write_rows(tmp_path, "trade.v1", [trade(5), trade(1), trade(3)], "n")
    assert files[0]["rowCount"] == 3 and files[0]["timeStart"] == T0 + 1 and files[0]["timeEnd"] == T0 + 5


def test_files_rotate_below_target_size_and_all_rows_survive_in_order(tmp_path):
    rnd = random.Random(7)
    rows = [trade(i, wallet="".join(rnd.choice("abcdefghijkmnopqrstuvwxyz123456789") for _ in range(44)),
                  baseAmount=rnd.random() * 1e6, priceUsd=rnd.random()) for i in range(6000)]
    target = 60_000
    files = pqs.write_rows(tmp_path, "trade.v1", rows, "n", target_bytes=target, row_group_rows=500)
    assert len(files) > 2
    assert all(f["byteSize"] <= target for f in files), [f["byteSize"] for f in files]
    back = [r for f in files for r in pqs.read_rows(tmp_path / f["path"])]
    assert [r["tradeId"] for r in back] == [r["tradeId"] for r in sorted(rows, key=lambda r: (r["eventAt"], r["tradeId"]))]
    assert sum(f["rowCount"] for f in files) == 6000


def test_default_target_is_128_mib():
    assert pqs.DEFAULT_TARGET_BYTES == 128 * 1024 * 1024


# ---------- determinism / immutability ----------

def test_identical_input_gives_identical_files_regardless_of_order(tmp_path):
    rows = [trade(i) for i in range(50)]
    a = pqs.write_rows(tmp_path / "a", "trade.v1", rows, "n")
    b = pqs.write_rows(tmp_path / "b", "trade.v1", list(reversed(rows)), "n")
    assert [(f["path"], f["sha256"]) for f in a] == [(f["path"], f["sha256"]) for f in b]


def test_rewrite_is_idempotent_and_changed_content_never_overwrites_prior_file(tmp_path):
    rows = [trade(i) for i in range(10)]
    first = pqs.write_rows(tmp_path, "trade.v1", rows, "n")[0]
    before = (tmp_path / first["path"]).read_bytes()
    again = pqs.write_rows(tmp_path, "trade.v1", rows, "n")[0]
    assert again["path"] == first["path"] and (tmp_path / first["path"]).read_bytes() == before
    changed = pqs.write_rows(tmp_path, "trade.v1", rows + [trade(99)], "n")[0]
    changed_nv = pqs.write_rows(tmp_path, "trade.v1", rows, "n2")[0]
    assert len({first["path"], changed["path"], changed_nv["path"]}) == 3
    assert (tmp_path / first["path"]).read_bytes() == before
    assert not [p for p in tree(tmp_path) if ".tmp-" in p]


# ---------- failure behaviour ----------

def test_unknown_schema_fails_visibly_and_leaves_prior_data_untouched(tmp_path):
    first = pqs.write_rows(tmp_path, "trade.v1", [trade(1)], "n")[0]
    snapshot = {p: (tmp_path / p).read_bytes() for p in tree(tmp_path)}
    with pytest.raises(StorageError) as e:
        pqs.write_rows(tmp_path, "trade.v9", [trade(1, schemaVersion="trade.v9")], "n")
    assert e.value.code == "UNKNOWN_SCHEMA"
    assert {p: (tmp_path / p).read_bytes() for p in tree(tmp_path)} == snapshot
    assert (tmp_path / first["path"]).exists()


@pytest.mark.parametrize("name,row,code", [
    ("unknown column", trade(1, extra=1), "VALIDATION"),
    ("missing column", {k: v for k, v in trade(1).items() if k != "txId"}, "VALIDATION"),
    ("null required", trade(1, availableAt=None), "VALIDATION"),
    ("float timestamp", trade(1, eventAt=1.5), "VALIDATION"),
    ("bool as int", trade(1, eventAt=True), "VALIDATION"),
    ("string timestamp", trade(1, eventAt="1760616000000"), "VALIDATION"),
    ("int64 overflow", trade(1, eventAt=2**63), "VALIDATION"),
    ("NaN amount", trade(1, baseAmount=float("nan")), "VALIDATION"),
    ("inf price", trade(1, priceUsd=float("inf")), "VALIDATION"),
    ("bad side", trade(1, side="hold"), "VALIDATION"),
    ("empty required string", trade(1, txId=""), "VALIDATION"),
    ("flags not list", trade(1, qualityFlags="late"), "VALIDATION"),
    ("wrong embedded version", trade(1, schemaVersion="trade.v0"), "VALIDATION"),
])
def test_invalid_rows_are_rejected_and_nothing_is_written(tmp_path, name, row, code):
    with pytest.raises(StorageError) as e:
        pqs.write_rows(tmp_path, "trade.v1", [trade(2), row], "n")
    assert e.value.code == code
    assert tree(tmp_path) == []


def test_duplicate_primary_key_rejected(tmp_path):
    with pytest.raises(StorageError) as e:
        pqs.write_rows(tmp_path, "trade.v1", [trade(1), trade(1)], "n")
    assert e.value.code == "DUPLICATE_KEY" and tree(tmp_path) == []


def test_empty_input_writes_nothing(tmp_path):
    assert pqs.write_rows(tmp_path, "trade.v1", [], "n") == [] and tree(tmp_path) == []


def test_reader_rejects_unregistered_schema_missing_metadata_and_changed_columns(tmp_path):
    good = pqs.write_rows(tmp_path, "trade.v1", [trade(1)], "n")[0]
    table = pq.read_table(tmp_path / good["path"])
    # unknown schema version in metadata
    p1 = tmp_path / "unknown.parquet"
    pq.write_table(table.replace_schema_metadata({b"ticklab.entity": b"trade", b"ticklab.schema_version": b"trade.v7"}), p1)
    with pytest.raises(StorageError) as e1:
        pqs.read_rows(p1)
    assert e1.value.code == "UNKNOWN_SCHEMA"
    # no metadata at all
    p2 = tmp_path / "plain.parquet"
    pq.write_table(table.replace_schema_metadata(None), p2)
    with pytest.raises(StorageError) as e2:
        pqs.read_rows(p2)
    assert e2.value.code == "UNKNOWN_SCHEMA"
    # registered version but extra column
    p3 = tmp_path / "extra.parquet"
    pq.write_table(table.append_column("surprise", pa.array([1], pa.int64())), p3)
    with pytest.raises(StorageError) as e3:
        pqs.read_rows(p3)
    assert e3.value.code == "SCHEMA_MISMATCH"
    # corrupt bytes
    p4 = tmp_path / "corrupt.parquet"
    p4.write_bytes(b"PAR1 not really")
    with pytest.raises(StorageError) as e4:
        pqs.read_rows(p4)
    assert e4.value.code == "CORRUPT_FILE"


# ---------- raw catalog -> normalized ----------

def make_raw(root: Path, name: str, bodies: list[dict], source="geckoterminal", schema="gt.raw.v1"):
    rel = f"raw/provider={source}/date=2026-10-16/hour=12/{name}"
    p = root.joinpath(*rel.split("/"))
    p.parent.mkdir(parents=True, exist_ok=True)
    out = b""
    for i, b in enumerate(bodies):
        body = json.dumps(b)
        env = dict(source=source, endpointId="trades", requestId=f"r{i}", requestAt=T0 + i, responseAt=T0 + i + 10, httpStatus=200,
                   bodySha256=hashlib.sha256(body.encode()).hexdigest(), schemaVersion=schema, body=body)
        out += gzip.compress((json.dumps(env) + "\n").encode())  # one member per line, like the TS writer
    p.write_bytes(out)
    return dict(path=rel, sha256=hashlib.sha256(out).hexdigest(), byteSize=len(out), rowCount=len(bodies),
                schemaVersion=schema, sourceId=source, partitionKey=f"provider={source}/date=2026-10-16/hour=12")


def fake_trade_normalizer(env, ref):
    for t in json.loads(env["body"])["trades"]:
        yield dict(tradeId=t["id"], launchId=t["launch"], txId=t["sig"], eventAt=t["ts"], availableAt=env["responseAt"],
                   side=t["side"], baseAmount=t.get("base"), quoteAmount=t.get("quote"), priceUsd=t.get("price"),
                   wallet=t.get("wallet"), sourceId=ref.source_id, qualityFlags=[])


@pytest.fixture(autouse=True)
def _normalizers():
    cat.NORMALIZERS.clear()
    cat.register_normalizer(cat.Normalizer("test_trades", "1.0", frozenset({"gt.raw.v1"}), "trade.v1", fake_trade_normalizer))
    yield
    cat.NORMALIZERS.clear()


def two_raw(tmp_path):
    a = make_raw(tmp_path, "part-0001.jsonl.gz", [
        {"trades": [dict(id="a1", launch="L1", sig="s1", ts=T0 + 1, side="buy", base=2.0, quote=0.5, price=0.25, wallet=ADDR_A),
                    dict(id="a2", launch="L1", sig="s2", ts=T0 + 2, side="sell")]},  # nulls: no amounts / price / wallet
    ])
    b = make_raw(tmp_path, "part-0002.jsonl.gz", [{"trades": [dict(id="b1", launch="L2", sig="s3", ts=T0 + 3, side="buy", base=1.0)]}])
    return [b, a]  # unsorted on purpose


def test_normalize_raw_end_to_end_preserves_event_and_available_time_and_nulls(tmp_path):
    res = cat.normalize_raw(tmp_path, two_raw(tmp_path), "test_trades")
    assert res["entity"] == "trade" and res["schemaVersion"] == "trade.v1" and res["normalizerVersion"] == "1.0" and res["rowCount"] == 3
    assert [i["path"] for i in res["inputs"]] == ["raw/provider=geckoterminal/date=2026-10-16/hour=12/part-0001.jsonl.gz", "raw/provider=geckoterminal/date=2026-10-16/hour=12/part-0002.jsonl.gz"]
    rows = [r for f in res["files"] for r in pqs.read_rows(tmp_path / f["path"])]
    by = {r["tradeId"]: r for r in rows}
    assert by["a2"]["baseAmount"] is None and by["a2"]["priceUsd"] is None and by["a2"]["wallet"] is None
    assert by["a1"]["wallet"] == ADDR_A and by["a1"]["eventAt"] == T0 + 1 and by["a1"]["availableAt"] == T0 + 10
    assert by["b1"]["availableAt"] == T0 + 10 and by["a1"]["schemaVersion"] == "trade.v1"


def test_normalize_is_deterministic_and_input_order_independent(tmp_path):
    refs = two_raw(tmp_path)
    r1 = cat.normalize_raw(tmp_path, refs, "test_trades")
    r2 = cat.normalize_raw(tmp_path, list(reversed(refs)), "test_trades")
    assert [(f["path"], f["sha256"]) for f in r1["files"]] == [(f["path"], f["sha256"]) for f in r2["files"]]


def test_tampered_raw_file_aborts_before_any_output(tmp_path):
    refs = two_raw(tmp_path)
    p = tmp_path.joinpath(*refs[0]["path"].split("/"))
    data = bytearray(p.read_bytes()); data[-10] ^= 0x01; p.write_bytes(bytes(data))
    with pytest.raises(StorageError) as e:
        cat.normalize_raw(tmp_path, refs, "test_trades")
    assert e.value.code == "RAW_HASH_MISMATCH"
    assert not (tmp_path / "normalized").exists()


def test_missing_raw_file_and_wrong_row_count(tmp_path):
    refs = two_raw(tmp_path)
    tmp_path.joinpath(*refs[0]["path"].split("/")).unlink()
    with pytest.raises(StorageError) as e:
        cat.normalize_raw(tmp_path, refs, "test_trades")
    assert e.value.code == "RAW_MISSING"
    refs2 = two_raw(tmp_path)
    refs2[0] = {**refs2[0], "rowCount": 5}
    with pytest.raises(StorageError) as e2:
        cat.normalize_raw(tmp_path, refs2, "test_trades")
    assert e2.value.code == "RAW_ROW_COUNT_MISMATCH" and not (tmp_path / "normalized").exists()


def test_envelope_body_hash_mismatch_detected_even_when_file_hash_matches(tmp_path):
    rel = "raw/provider=geckoterminal/date=2026-10-16/hour=12/part-0009.jsonl.gz"
    p = tmp_path.joinpath(*rel.split("/")); p.parent.mkdir(parents=True)
    env = dict(source="geckoterminal", endpointId="trades", requestId="r", requestAt=1, responseAt=2, httpStatus=200,
               bodySha256="0" * 64, schemaVersion="gt.raw.v1", body="{}")
    raw = gzip.compress((json.dumps(env) + "\n").encode()); p.write_bytes(raw)
    ref = dict(path=rel, sha256=hashlib.sha256(raw).hexdigest(), byteSize=len(raw), rowCount=1, schemaVersion="gt.raw.v1", sourceId="geckoterminal", partitionKey="provider=geckoterminal/date=2026-10-16/hour=12")
    with pytest.raises(StorageError) as e:
        cat.normalize_raw(tmp_path, [ref], "test_trades")
    assert e.value.code == "RAW_BODY_HASH_MISMATCH"


def test_unknown_normalizer_unsupported_raw_schema_and_bad_inputs(tmp_path):
    refs = two_raw(tmp_path)
    with pytest.raises(StorageError) as e1:
        cat.normalize_raw(tmp_path, refs, "nope")
    assert e1.value.code == "UNKNOWN_NORMALIZER"
    refs[0] = {**refs[0], "schemaVersion": "gt.raw.v2"}
    with pytest.raises(StorageError) as e2:
        cat.normalize_raw(tmp_path, refs, "test_trades")
    assert e2.value.code == "UNSUPPORTED_RAW_SCHEMA"
    for bad in ([], "x", [{"path": "raw/x"}], [{**two_raw(tmp_path)[0], "path": "../escape"}], [{**two_raw(tmp_path)[0], "path": "normalized/x.parquet"}]):
        with pytest.raises(StorageError) as e3:
            cat.normalize_raw(tmp_path, bad, "test_trades")
        assert e3.value.code == "VALIDATION"
    assert not (tmp_path / "normalized").exists()


def fake_trade_normalizer_emitting_invalid_rows_fails_without_output(tmp_path):
    def bad(env, ref):
        yield dict(tradeId="x", launchId="L", txId="t", eventAt=1.5, availableAt=2, side="buy", baseAmount=None, quoteAmount=None,
                   priceUsd=None, wallet=None, sourceId="s", qualityFlags=[])
    cat.register_normalizer(cat.Normalizer("bad", "1.0", frozenset({"gt.raw.v1"}), "trade.v1", bad))
    with pytest.raises(StorageError):
        cat.normalize_raw(tmp_path, two_raw(tmp_path), "bad")
    assert not (tmp_path / "normalized").exists()


def fake_trade_normalizer_version_cannot_be_silently_replaced_but_a_bump_can():
    other = cat.Normalizer("test_trades", "1.0", frozenset({"gt.raw.v1"}), "trade.v1", fake_trade_normalizer)
    with pytest.raises(StorageError):
        cat.register_normalizer(other)
    cat.register_normalizer(cat.Normalizer("test_trades", "1.1", frozenset({"gt.raw.v1"}), "trade.v1", fake_trade_normalizer))
    assert cat.NORMALIZERS["test_trades"].version == "1.1"
    with pytest.raises(StorageError):
        cat.register_normalizer(cat.Normalizer("x", "1", frozenset(), "trade.v404", fake_trade_normalizer))
