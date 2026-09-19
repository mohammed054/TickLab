"""Block 2.7 acceptance: known-good vs deliberately-corrupted fixtures.

Roadmap acceptance (docs/16 Block 2.7): a known-good historical dataset and a
deliberately-corrupted fixture dataset both pass through the pipeline, producing
correct green and red outcomes respectively; the corrupted one is confirmed to
block BACKTEST via the API (docs/05 §5.2, docs/08 §8.10).
"""

import json
import os

from fastapi.testclient import TestClient

from backend.data.app import app

FIXTURES = os.path.join(os.path.dirname(__file__), "..", "fixtures")
GOOD_CSV = os.path.join(FIXTURES, "good.csv")
CORRUPTED_CSV = os.path.join(FIXTURES, "corrupted.csv")

client = TestClient(app)


def _post_csv(path, filename, url="/validate"):
    with open(path, "rb") as f:
        return client.post(url, files={"file": (filename, f.read(), "text/csv")})


def _post_json(payload, url):
    return client.post(
        url,
        files={"file": ("payload.json", json.dumps(payload), "application/json")},
    )


def test_health_and_root():
    assert client.get("/health").json() == {"status": "healthy"}
    assert client.get("/").json() == {"message": "TickLab Data Pipeline API"}


def test_validate_good_is_green():
    response = _post_csv(GOOD_CSV, "good.csv")
    assert response.status_code == 200
    report = response.json()
    assert report["totalEvents"] == 20
    assert report["trades"] == 7
    assert report["orderBookUpdates"] == 9
    assert report["snapshots"] == 4
    assert report["missingIntervals"]["status"] == "green"
    assert report["duplicateEvents"]["status"] == "green"
    assert report["sequenceGaps"]["status"] == "green"


def test_validate_corrupted_is_red():
    response = _post_csv(CORRUPTED_CSV, "corrupted.csv")
    assert response.status_code == 200
    report = response.json()
    assert report["totalEvents"] == 10
    assert report["duplicateEvents"]["count"] == 2
    assert report["missingIntervals"]["status"] == "red"


def test_backtest_gate_blocks_corrupted():
    good = _post_csv(GOOD_CSV, "good.csv").json()
    bad = _post_csv(CORRUPTED_CSV, "corrupted.csv").json()

    ok = client.post("/validate-for-backtest", json={"report": good, "overrides": []}).json()
    assert ok["blocksBacktest"] is False
    assert ok["failingChecks"] == []

    blocked = client.post("/validate-for-backtest", json={"report": bad, "overrides": []}).json()
    assert blocked["blocksBacktest"] is True
    assert "missingIntervals" in blocked["failingChecks"]

    overridden = client.post(
        "/validate-for-backtest",
        json={
            "report": bad,
            "overrides": [
                {"check": name, "justification": "test override"}
                for name in blocked["failingChecks"]
            ],
        },
    ).json()
    assert overridden["blocksBacktest"] is False
    assert set(overridden["overriddenChecks"]) == set(blocked["failingChecks"])


def test_full_pipeline_good():
    norm = _post_csv(GOOD_CSV, "good.csv", url="/normalize")
    assert norm.status_code == 200
    norm_body = norm.json()
    assert norm_body["total_normalized"] == 20
    events = norm_body["normalized_events"]
    assert events[0]["timestampNs"] == 1737400000000000000
    assert events[0]["symbol"] == "BTCUSDT"

    recon = _post_json({"normalized_events": events}, "/order-book-reconstruction")
    assert recon.status_code == 200
    assert recon.json()["total_reconstructed"] == 20

    aligned = _post_json({"normalized_events": events}, "/trade-alignment")
    assert aligned.status_code == 200
    aligned_body = aligned.json()
    assert aligned_body["total_trades"] == 7
    assert aligned_body["trades_with_book_coverage"] == 7

    ts_check = _post_json({"normalized_events": events}, "/timestamp-validation")
    assert ts_check.status_code == 200
    assert ts_check.json()["violations"] == 0

    fmt = _post_json(
        {"events": events, "source": "good.csv"}, "/hftbacktest-format"
    )
    assert fmt.status_code == 200
    fmt_body = fmt.json()
    assert len(fmt_body["dataset_id"]) == 32
    assert fmt_body["total_events"] == 20
    assert fmt_body["files"]["binary"]["bytes"] > 0


def test_timestamp_validation_catches_corruption():
    norm = _post_csv(CORRUPTED_CSV, "corrupted.csv", url="/normalize")
    assert norm.status_code == 200
    events = norm.json()["normalized_events"]

    ts_check = _post_json({"normalized_events": events}, "/timestamp-validation")
    assert ts_check.status_code == 200
    body = ts_check.json()
    assert body["violations"] > 0
    assert body["quality_hint"]["timestampMonotonicity"]["status"] == "red"
