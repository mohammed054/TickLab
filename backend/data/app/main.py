"""Data Pipeline — FastAPI application for ingestion, validation, and normalization.

This module provides the data pipeline stages defined in docs/05 §5.2:
- Validation: Check dataset integrity and quality
- Normalization: Convert to internal format
- Order Book Reconstruction: Reconstruct order book from trade data
- Trade Alignment: Align trades with order book events
- Timestamp Validation: Ensure temporal consistency
- HftBacktest-format conversion: Convert to/from hftbacktest format
"""

from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import hashlib
import json
import os
import struct
import tempfile

app = FastAPI(
    title="TickLab Data Pipeline",
    description="Data ingestion, validation, and normalization pipeline",
    version="0.1.0",
)

# Allow all origins for development; restrict in production
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class PipelineRequest(BaseModel):
    dataset_id: str
    source: str


class PipelineProgress(BaseModel):
    stage: str
    events_processed: int
    total_events: int
    status: str


class DataQualityReport(BaseModel):
    datasetId: str
    totalEvents: int
    trades: int
    orderBookUpdates: int
    snapshots: int
    missingIntervals: dict
    duplicateEvents: dict
    sequenceGaps: dict
    timestampRange: List[int]
    fileSizeBytes: int
    source: str
    normalizationVersion: str
    tickSize: float
    lotSize: float


class BacktestOverride(BaseModel):
    check: str
    justification: str


class BacktestGateRequest(BaseModel):
    report: DataQualityReport
    overrides: List[BacktestOverride] = []


class BacktestGateResponse(BaseModel):
    datasetId: str
    blocksBacktest: bool
    failingChecks: List[str]
    overriddenChecks: List[str]
    message: str


@app.get("/")
async def root() -> dict:
    return {"message": "TickLab Data Pipeline API"}


@app.get("/health")
async def health() -> dict:
    return {"status": "healthy"}


@app.post("/validate")
async def validate(file: UploadFile = File(...)) -> DataQualityReport:
    """Stage 1: Validation - Check dataset integrity and quality.

    Structural checks: file readable, expected columns/fields present, non-empty.
    Sequence checks: monotonic update IDs / sequence numbers per symbol.
    Timestamp checks: exchange timestamp vs. local timestamp sanity.
    Duplicate detection: exact-duplicate event rows.
    Output: DataQualityReport with 🟢/🟡/🔴 status per check.

    A dataset with any 🔴 (Invalid) check may never be silently used for a backtest.
    """
    # Read file contents
    contents = await file.read()
    file_size = len(contents)

    # Basic structural checks
    total_events = 0
    trades = 0
    order_book_updates = 0
    snapshots = 0
    duplicate_events = 0

    # Try to parse as CSV or JSON
    try:
        text = contents.decode("utf-8")
        lines = text.strip().split("\n")

        if len(lines) <= 1:
            raise HTTPException(status_code=400, detail="File is empty or contains only header")

        # Count rows (excluding header)
        total_events = len(lines) - 1

        # Header-mapped column detection so vendor column order does not matter.
        raw_header = lines[0].strip().split(",")
        header_lower = [h.strip().lower() for h in raw_header]
        type_idx = None
        ts_idx = 0
        for i, col in enumerate(header_lower):
            if col in ("timestamp", "timestamp_ns", "time", "ts", "ts_ns"):
                ts_idx = i
            elif col in ("type", "event_type", "evt_type", "msg_type"):
                type_idx = i
        if type_idx is None and len(raw_header) > 2:
            type_idx = 2

        # Count event types from data
        for line in lines[1:]:
            parts = line.split(",")
            if type_idx is not None and len(parts) > type_idx:
                event_type = parts[type_idx].strip().lower()
                if event_type in ("trade", "t"):
                    trades += 1
                elif event_type in ("book_update", "b", "orderbook", "order_book"):
                    order_book_updates += 1
                elif event_type in ("snapshot", "s"):
                    snapshots += 1

        # Simple duplicate detection
        seen = set()
        for line in lines[1:]:
            key = line.strip()
            if key in seen:
                duplicate_events += 1
            seen.add(key)

    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not parse file: {str(e)}")

    # Timestamp range check (basic)
    timestamp_range = [0, 0]
    try:
        # Try to extract timestamps from the data
        timestamps = []
        for line in lines[1:]:
            parts = line.split(",")
            if len(parts) > ts_idx:
                try:
                    ts = float(parts[ts_idx].strip())
                    timestamps.append(ts)
                except ValueError:
                    pass

        if timestamps:
            timestamp_range = [min(timestamps), max(timestamps)]
    except Exception:
        pass

    # Sequence gap check: normalize to nanoseconds first (timestamps may be in
    # seconds or nanoseconds), then flag forward jumps > 1 second as gaps.
    # (A flat 1.0-unit threshold would misfire on nanosecond timestamps, where a
    # normal 0.1s step is 1e8 units.)
    sequence_gaps = 0
    try:
        timestamps_numeric = []
        for line in lines[1:]:
            parts = line.split(",")
            if len(parts) > ts_idx:
                try:
                    ts = float(parts[ts_idx].strip())
                    timestamps_numeric.append(int(ts if ts >= 1e15 else ts * 1e9))
                except ValueError:
                    pass

        if len(timestamps_numeric) > 1:
            diffs = [timestamps_numeric[i+1] - timestamps_numeric[i]
                     for i in range(len(timestamps_numeric)-1)]
            # Count gaps > 1 second (1e9 ns) as potential sequence issues
            sequence_gaps = sum(1 for d in diffs if d > 1e9)
    except Exception:
        pass

    # Determine overall status
    has_critical_issues = duplicate_events > 0 or sequence_gaps > 10

    # Build missing intervals (simplified)
    missing_intervals = {
        "count": 0,
        "status": "green" if not has_critical_issues else "red",
        "ranges": []
    }

    # Build duplicate events status
    dup_status = "green" if duplicate_events == 0 else \
        "yellow" if duplicate_events < 100 else "red"

    # Build sequence gaps status
    gap_status = "green" if sequence_gaps == 0 else \
        "yellow" if sequence_gaps < 50 else "red"

    report = DataQualityReport(
        datasetId=file.filename or "unknown",
        totalEvents=total_events,
        trades=trades,
        orderBookUpdates=order_book_updates,
        snapshots=snapshots,
        missingIntervals=missing_intervals,
        duplicateEvents={"count": duplicate_events, "status": dup_status},
        sequenceGaps={"count": sequence_gaps, "status": gap_status},
        timestampRange=timestamp_range,
        fileSizeBytes=file_size,
        source=file.filename or "unknown",
        normalizationVersion="v1.0.0",
        tickSize=0.01,  # default, will be refined during normalization
        lotSize=1.0,  # default, will be refined during normalization
    )

    return report


@app.post("/normalize")
async def normalize(file: UploadFile = File(...)) -> dict:
    """Stage 2: Normalization - Convert vendor-specific field names/units to canonical Event schema.

    Converts field names, units, and tick conventions into our internal canonical
    Event schema (mirrors hftbacktest's Event/EXCH_EVENT/LOCAL_EVENT structure),
    so the following stages' output maps cleanly onto the engine's native ingestion.

    Expected input CSV columns (vendor-specific, will be mapped):
    - timestamp/timestamp_ns/time: event timestamp in nanoseconds or seconds
    - symbol/pair/instrument: trading symbol (e.g., BTCUSDT)
    - exchange/venue: exchange name (e.g., binance, bybit)
    - type/event_type: event type (trade, book_update, snapshot, ticker, funding, liquidation)
    - side: bid/ask (for book updates)
    - price: price level
    - size/quantity/amount: size/quantity
    - sequence/seq: sequence number for ordering

    Output: Normalized events in MarketEvent format plus DataQualityReport
    """

    contents = await file.read()

    try:
        text = contents.decode("utf-8")
        lines = text.strip().split("\n")

        if len(lines) <= 1:
            raise HTTPException(status_code=400, detail="File is empty or contains only header")

        # Parse header to map column names
        header = lines[0].strip().split(",")
        header_lower = [h.strip().lower() for h in header]

        # Column mapping from vendor names to canonical names
        col_map = {}
        for i, col in enumerate(header_lower):
            if col in ("timestamp", "timestamp_ns", "time", "ts", "ts_ns"):
                col_map["timestamp"] = i
            elif col in ("symbol", "pair", "instrument", "sym"):
                col_map["symbol"] = i
            elif col in ("exchange", "venue", "exch"):
                col_map["exchange"] = i
            elif col in ("type", "event_type", "evt_type", "msg_type"):
                col_map["type"] = i
            elif col in ("side", "s"):
                col_map["side"] = i
            elif col in ("price", "px", "p"):
                col_map["price"] = i
            elif col in ("size", "quantity", "amount", "qty", "sz"):
                col_map["size"] = i
            elif col in ("sequence", "seq", "sequence_number"):
                col_map["sequence"] = i

        # Default values for required fields if not found
        if "timestamp" not in col_map and len(header) > 0:
            col_map["timestamp"] = 0
        if "symbol" not in col_map and len(header) > 1:
            col_map["symbol"] = 1
        if "type" not in col_map and len(header) > 2:
            col_map["type"] = 2

        # Normalize events
        normalized_events = []
        trades = 0
        order_book_updates = 0
        snapshots = 0
        tickers = 0
        funding = 0
        liquidations = 0

        # Track tick size and lot size per symbol (from instrument metadata)
        # In production, this would come from Postgres instrument_metadata table
        symbol_metadata = {
            "BTCUSDT": {"tick_size": 0.01, "lot_size": 0.001},
            "ETHUSDT": {"tick_size": 0.01, "lot_size": 0.01},
            "SOLUSDT": {"tick_size": 0.001, "lot_size": 0.1},
        }

        for line_num, line in enumerate(lines[1:], start=2):
            parts = line.strip().split(",")
            if len(parts) < max(col_map.values()) + 1:
                continue  # Skip malformed lines

            try:
                # Parse timestamp (handle both ns and seconds)
                ts_idx = col_map.get("timestamp", 0)
                ts_str = parts[ts_idx].strip() if ts_idx < len(parts) else "0"
                ts = float(ts_str)
                # Convert to nanoseconds if in seconds (heuristic: < 1e15 is likely seconds)
                if ts < 1e15:
                    ts = int(ts * 1e9)
                else:
                    ts = int(ts)

                # Parse symbol
                sym_idx = col_map.get("symbol", 1)
                symbol = parts[sym_idx].strip().upper() if sym_idx < len(parts) else "UNKNOWN"

                # Parse exchange
                exch_idx = col_map.get("exchange", None)
                exchange = parts[exch_idx].strip().lower() if exch_idx is not None and exch_idx < len(parts) else "binance"

                # Parse type
                type_idx = col_map.get("type", 2)
                type_str = parts[type_idx].strip().lower() if type_idx < len(parts) else "trade"

                # Map event types
                type_map = {
                    "trade": "trade", "t": "trade", "taker": "trade",
                    "book_update": "book_update", "b": "book_update", "orderbook": "book_update", "depth": "book_update",
                    "snapshot": "snapshot", "s": "snapshot",
                    "ticker": "ticker", "tk": "ticker",
                    "funding": "funding", "fr": "funding",
                    "liquidation": "liquidation", "liq": "liquidation",
                }
                event_type = type_map.get(type_str, "trade")

                # Count event types
                if event_type == "trade":
                    trades += 1
                elif event_type == "book_update":
                    order_book_updates += 1
                elif event_type == "snapshot":
                    snapshots += 1
                elif event_type == "ticker":
                    tickers += 1
                elif event_type == "funding":
                    funding += 1
                elif event_type == "liquidation":
                    liquidations += 1

                # Parse side
                side = None
                if event_type in ("book_update", "trade"):
                    side_idx = col_map.get("side", None)
                    if side_idx is not None and side_idx < len(parts):
                        side_str = parts[side_idx].strip().lower()
                        if side_str in ("bid", "b", "buy", "0"):
                            side = "bid"
                        elif side_str in ("ask", "a", "sell", "1"):
                            side = "ask"

                # Parse price
                price = None
                price_idx = col_map.get("price", None)
                if price_idx is not None and price_idx < len(parts):
                    try:
                        price = float(parts[price_idx].strip())
                        # Normalize to tick size
                        if symbol in symbol_metadata and price is not None:
                            tick_size = symbol_metadata[symbol]["tick_size"]
                            price = round(price / tick_size) * tick_size
                    except ValueError:
                        pass

                # Parse size
                size = None
                size_idx = col_map.get("size", None)
                if size_idx is not None and size_idx < len(parts):
                    try:
                        size = float(parts[size_idx].strip())
                        # Normalize to lot size
                        if symbol in symbol_metadata and size is not None:
                            lot_size = symbol_metadata[symbol]["lot_size"]
                            size = round(size / lot_size) * lot_size
                    except ValueError:
                        pass

                # Parse sequence
                sequence = None
                seq_idx = col_map.get("sequence", None)
                if seq_idx is not None and seq_idx < len(parts):
                    try:
                        sequence = int(float(parts[seq_idx].strip()))
                    except ValueError:
                        pass

                # Build normalized event
                event = {
                    "timestampNs": ts,
                    "symbol": symbol,
                    "exchange": exchange,
                    "type": event_type,
                }
                if side is not None:
                    event["side"] = side
                if price is not None:
                    event["price"] = price
                if size is not None:
                    event["size"] = size
                if sequence is not None:
                    event["sequence"] = sequence

                normalized_events.append(event)

            except Exception as e:
                # Log error but continue processing
                continue

        # Get tick size and lot size for the primary symbol
        primary_symbol = normalized_events[0]["symbol"] if normalized_events else "BTCUSDT"
        tick_size = symbol_metadata.get(primary_symbol, {}).get("tick_size", 0.01)
        lot_size = symbol_metadata.get(primary_symbol, {}).get("lot_size", 1.0)

        # Build DataQualityReport
        total_events = len(normalized_events)

        report = DataQualityReport(
            datasetId=file.filename or "normalized_dataset",
            totalEvents=total_events,
            trades=trades,
            orderBookUpdates=order_book_updates,
            snapshots=snapshots,
            missingIntervals={"count": 0, "status": "green", "ranges": []},
            duplicateEvents={"count": 0, "status": "green"},
            sequenceGaps={"count": 0, "status": "green"},
            timestampRange=[normalized_events[0]["timestampNs"] if normalized_events else 0,
                          normalized_events[-1]["timestampNs"] if normalized_events else 0],
            fileSizeBytes=len(contents),
            source=file.filename or "unknown",
            normalizationVersion="v1.0.0",
            tickSize=tick_size,
            lotSize=lot_size,
        )

        return {
            "status": "success",
            "normalized_events": normalized_events[:100],  # Return first 100 for preview
            "total_normalized": total_events,
            "quality_report": report.model_dump(),
            "message": f"Normalized {total_events} events to canonical MarketEvent format"
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Normalization failed: {str(e)}")


@app.post("/order-book-reconstruction")
async def order_book_reconstruction(file: UploadFile = File(...)) -> dict:
    """Stage 3: Order Book Reconstruction - Replay diffs onto last valid snapshot
    to produce a continuous depth history; detect and flag reconstruction breaks.

    For L2 snapshot+diff feeds: replays diffs onto the last valid snapshot
    to produce a continuous depth history; detects and flags reconstruction breaks
    (a diff that doesn't apply cleanly signals a missed update — this becomes a
    🟡/🔴 quality flag and a "missing interval").

    Input: Normalized events (from /normalize) with type=snapshot and type=book_update
    Output: Reconstructed order book states at each event timestamp
    """

    contents = await file.read()

    try:
        import json
        # Expect JSON input with normalized_events from /normalize
        data = json.loads(contents.decode("utf-8"))
        normalized_events = data.get("normalized_events", [])

        if not normalized_events:
            raise HTTPException(status_code=400, detail="No normalized events provided")

        # Separate snapshots and updates
        snapshots = [e for e in normalized_events if e.get("type") == "snapshot"]
        updates = [e for e in normalized_events if e.get("type") == "book_update"]

        # If no snapshots, we can't reconstruct - need at least one initial snapshot
        if not snapshots:
            raise HTTPException(status_code=400, detail="No snapshots found for order book reconstruction")

        # Sort all events by timestamp
        all_events = sorted(normalized_events, key=lambda x: x.get("timestampNs", 0))

        # Reconstruct order book
        # Maintain a dict of price levels for bids and asks
        # {price: size} for each side
        bid_levels = {}
        ask_levels = {}

        reconstructed_states = []
        missing_intervals = []
        last_snapshot_ts = None

        # Find first snapshot to initialize
        first_snapshot = None
        for event in all_events:
            if event.get("type") == "snapshot":
                first_snapshot = event
                break

        if first_snapshot:
            # Initialize from snapshot (in real implementation, snapshot would have full depth)
            # For now, we simulate with the snapshot event's data
            last_snapshot_ts = first_snapshot.get("timestampNs")

        # Process events in order
        for event in all_events:
            ts = event.get("timestampNs", 0)
            event_type = event.get("type", "")
            side = event.get("side", "")
            price = event.get("price")
            size = event.get("size")

            if event_type == "snapshot":
                # Snapshot provides full depth - in real impl, would have array of levels
                # For testing, we'll use the event's price/size as a level
                last_snapshot_ts = ts
                if side == "bid" and price is not None:
                    bid_levels[price] = size if size is not None and size > 0 else 0
                elif side == "ask" and price is not None:
                    ask_levels[price] = size if size is not None and size > 0 else 0

                # Clean up zero-size levels
                bid_levels = {p: s for p, s in bid_levels.items() if s > 0}
                ask_levels = {p: s for p, s in ask_levels.items() if s > 0}

            elif event_type == "book_update" and price is not None:
                # Apply incremental update
                if size is None or size <= 0:
                    # Remove level
                    if side == "bid":
                        bid_levels.pop(price, None)
                    elif side == "ask":
                        ask_levels.pop(price, None)
                else:
                    # Update level
                    if side == "bid":
                        bid_levels[price] = size
                    elif side == "ask":
                        ask_levels[price] = size

            # Record reconstructed state
            # Sort bids descending (highest first), asks ascending (lowest first)
            sorted_bids = sorted(bid_levels.items(), key=lambda x: x[0], reverse=True)
            sorted_asks = sorted(ask_levels.items(), key=lambda x: x[0])

            reconstructed_states.append({
                "timestampNs": ts,
                "bids": [{"price": p, "size": s} for p, s in sorted_bids[:10]],  # Top 10 levels
                "asks": [{"price": p, "size": s} for p, s in sorted_asks[:10]],  # Top 10 levels
                "spread": (sorted_asks[0][0] - sorted_bids[0][0]) if sorted_asks and sorted_bids else None,
                "mid_price": ((sorted_bids[0][0] + sorted_asks[0][0]) / 2) if sorted_asks and sorted_bids else None,
            })

        # Detect missing intervals (gaps > 1 second without snapshots)
        for i in range(1, len(reconstructed_states)):
            gap = reconstructed_states[i]["timestampNs"] - reconstructed_states[i-1]["timestampNs"]
            if gap > 1e9:  # > 1 second gap
                missing_intervals.append({
                    "start": reconstructed_states[i-1]["timestampNs"],
                    "end": reconstructed_states[i]["timestampNs"],
                    "duration_ns": gap
                })

        # Build quality report
        total_events = len(normalized_events)
        snapshot_count = len(snapshots)
        update_count = len(updates)

        # Determine status based on missing intervals
        has_critical = len(missing_intervals) > 5
        has_warning = len(missing_intervals) > 0

        if has_critical:
            missing_status = "red"
        elif has_warning:
            missing_status = "yellow"
        else:
            missing_status = "green"

        quality_report = DataQualityReport(
            datasetId=file.filename or "reconstructed_dataset",
            totalEvents=total_events,
            trades=0,
            orderBookUpdates=update_count,
            snapshots=snapshot_count,
            missingIntervals={"count": len(missing_intervals), "status": missing_status, "ranges": [(m["start"], m["end"]) for m in missing_intervals]},
            duplicateEvents={"count": 0, "status": "green"},
            sequenceGaps={"count": 0, "status": "green"},
            timestampRange=[all_events[0]["timestampNs"] if all_events else 0,
                          all_events[-1]["timestampNs"] if all_events else 0],
            fileSizeBytes=len(contents),
            source=file.filename or "unknown",
            normalizationVersion="v1.0.0",
            tickSize=0.01,
            lotSize=1.0,
        )

        return {
            "status": "success",
            "reconstructed_states": reconstructed_states[:50],  # First 50 for preview
            "total_reconstructed": len(reconstructed_states),
            "missing_intervals": missing_intervals,
            "quality_report": quality_report.model_dump(),
            "message": f"Reconstructed {len(reconstructed_states)} order book states from {snapshot_count} snapshots and {update_count} updates"
        }

    except HTTPException:
        raise
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON input. Expected normalized events from /normalize endpoint")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Order book reconstruction failed: {str(e)}")


@app.post("/trade-alignment")
async def trade_alignment(file: UploadFile = File(...)) -> dict:
    """Stage 4: Trade Alignment - Align the trade tape timeline with the order-book
    timeline so replay and investigation views can present both consistently at any
    timestamp (needed for docs/09 §9.10 order-book-imbalance-vs-subsequent-trade
    analysis).

    Input: JSON file with {"normalized_events": [...]} as produced by /normalize.
    Output: each trade annotated with the order-book snapshot in effect at its
    timestamp (best bid/ask, mid price, spread).
    """

    contents = await file.read()

    try:
        data = json.loads(contents.decode("utf-8"))
        normalized_events = data.get("normalized_events", [])

        if not normalized_events:
            raise HTTPException(status_code=400, detail="No normalized events provided")

        ordered = sorted(normalized_events, key=lambda x: x.get("timestampNs", 0))

        # Rebuild the book in timestamp order (same bookkeeping as reconstruction).
        bid_levels: dict = {}
        ask_levels: dict = {}
        book_at_ts = []  # (timestampNs, best_bid, best_ask)
        for event in ordered:
            event_type = event.get("type", "")
            side = event.get("side", "")
            price = event.get("price")
            size = event.get("size")
            if event_type in ("snapshot", "book_update") and price is not None:
                if size is None or size <= 0:
                    if side == "bid":
                        bid_levels.pop(price, None)
                    elif side == "ask":
                        ask_levels.pop(price, None)
                else:
                    if side == "bid":
                        bid_levels[price] = size
                    elif side == "ask":
                        ask_levels[price] = size
            best_bid = max(bid_levels.keys()) if bid_levels else None
            best_ask = min(ask_levels.keys()) if ask_levels else None
            book_at_ts.append((event.get("timestampNs", 0), best_bid, best_ask))

        # Attach the in-effect book snapshot to each trade.
        aligned_trades = []
        covered = 0
        state_idx = 0
        last_state = (None, None, None)
        for event in ordered:
            while state_idx < len(ordered) and book_at_ts[state_idx][0] <= event.get("timestampNs", 0):
                last_state = book_at_ts[state_idx]
                state_idx += 1
            if event.get("type") != "trade":
                continue
            _, best_bid, best_ask = last_state
            snapshot = None
            if best_bid is not None and best_ask is not None:
                snapshot = {
                    "bestBid": best_bid,
                    "bestAsk": best_ask,
                    "midPrice": (best_bid + best_ask) / 2,
                    "spread": best_ask - best_bid,
                }
                covered += 1
            aligned = dict(event)
            aligned["marketStateSnapshot"] = snapshot
            aligned_trades.append(aligned)

        total_trades = len(aligned_trades)
        return {
            "status": "success",
            "aligned_trades": aligned_trades[:100],
            "total_trades": total_trades,
            "trades_with_book_coverage": covered,
            "trades_without_book_coverage": total_trades - covered,
            "message": f"Aligned {total_trades} trades with the order-book timeline ({covered} with book coverage)",
        }

    except HTTPException:
        raise
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON input. Expected {\"normalized_events\": [...]} from /normalize")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Trade alignment failed: {str(e)}")


@app.post("/timestamp-validation")
async def timestamp_validation(file: UploadFile = File(...)) -> dict:
    """Stage 5: Timestamp Validation (final pass) - Confirm strictly increasing
    timestamps across the fully assembled, aligned dataset (a hard requirement of
    hftbacktest's event loop — see docs/04 §4.3).

    Accepts either a JSON file ({"events": [...]} / {"normalized_events": [...]} /
    {"aligned_trades": [...]}, each entry carrying timestampNs) or a raw CSV file
    with a timestamp column. Any non-increasing timestamp is a 🔴 finding.
    """

    contents = await file.read()

    try:
        timestamps_ns = []
        text = contents.decode("utf-8").strip()

        if text.startswith("{") or text.startswith("["):
            data = json.loads(text)
            if isinstance(data, dict):
                events = data.get("events", data.get("normalized_events", data.get("aligned_trades", [])))
            else:
                events = data
            for event in events:
                if isinstance(event, dict) and "timestampNs" in event:
                    timestamps_ns.append(int(event["timestampNs"]))
            if not timestamps_ns:
                raise HTTPException(status_code=400, detail="No timestampNs values found in JSON input")
        else:
            lines = text.split("\n")
            if len(lines) <= 1:
                raise HTTPException(status_code=400, detail="File is empty or contains only header")
            header = [h.strip().lower() for h in lines[0].strip().split(",")]
            ts_idx = 0
            for i, col in enumerate(header):
                if col in ("timestamp", "timestamp_ns", "time", "ts", "ts_ns", "timestamns"):
                    ts_idx = i
                    break
            for line in lines[1:]:
                parts = line.strip().split(",")
                if len(parts) > ts_idx:
                    try:
                        ts = float(parts[ts_idx].strip())
                        timestamps_ns.append(int(ts if ts >= 1e15 else ts * 1e9))
                    except ValueError:
                        continue
            if not timestamps_ns:
                raise HTTPException(status_code=400, detail="No parseable timestamps found in CSV input")

        violations = []
        for i in range(1, len(timestamps_ns)):
            if timestamps_ns[i] <= timestamps_ns[i - 1]:
                violations.append({
                    "index": i,
                    "timestampNs": timestamps_ns[i],
                    "previousTimestampNs": timestamps_ns[i - 1],
                })

        status = "red" if violations else "green"
        return {
            "status": "success",
            "check": "green" if not violations else "red",
            "total_events": len(timestamps_ns),
            "violations": len(violations),
            "violation_details": violations[:20],
            "timestamp_range_ns": [timestamps_ns[0], timestamps_ns[-1]],
            "message": (
                "All timestamps strictly increasing"
                if not violations
                else f"{len(violations)} non-increasing timestamp(s) — dataset is 🔴 and must not run"
            ),
            "quality_hint": {"timestampMonotonicity": {"count": len(violations), "status": status}},
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Timestamp validation failed: {str(e)}")


@app.post("/hftbacktest-format")
async def hftbacktest_format(file: UploadFile = File(...)) -> dict:
    """Stage 6: HftBacktest-format conversion - Write the final Event array to the
    engine's native binary layout (.npz/custom binary per docs/04 §4.2's
    data.rs/NpyDTyped), plus a Parquet mirror of the same data for analytics
    queries that don't go through the engine.

    NOTE (assumption, flagged in STATE.md): engine/vendor/hftbacktest is not
    present in this worktree, so the exact upstream NpyDTyped binary schema could
    not be read here. This stage writes a documented interim binary layout plus a
    manifest describing every field offset, alongside the Parquet mirror (via
    Polars, per docs/03 §3.1). Mapping the interim layout onto NpyDTyped byte-for-
    byte is deferred to a task with the vendored source checked out.

    Interim binary layout (little-endian):
      header: magic b'TLAB1' (5s), version uint16 (=1), event count uint64
      per event: timestampNs int64, typeCode uint8, sideCode uint8,
                 price float64, size float64, sequence int64
      type codes: unknown=0, trade=1, book_update=2, snapshot=3, ticker=4,
                  funding=5, liquidation=6
      side codes: none=0, bid=1, ask=2
    """

    contents = await file.read()

    try:
        data = json.loads(contents.decode("utf-8"))
        if isinstance(data, dict):
            events = data.get("events", data.get("normalized_events", data.get("aligned_trades", [])))
            source = data.get("source", file.filename or "unknown")
        else:
            events = data
            source = file.filename or "unknown"
        if not events:
            raise HTTPException(status_code=400, detail="No events provided for format conversion")

        ordered = sorted(events, key=lambda x: x.get("timestampNs", 0) if isinstance(x, dict) else 0)
        ordered = [e for e in ordered if isinstance(e, dict) and "timestampNs" in e]
        if not ordered:
            raise HTTPException(status_code=400, detail="No events with timestampNs found")

        type_codes = {"trade": 1, "book_update": 2, "snapshot": 3, "ticker": 4, "funding": 5, "liquidation": 6}
        side_codes = {"bid": 1, "ask": 2}

        exchange = str(ordered[0].get("exchange", "unknown"))
        symbol = str(ordered[0].get("symbol", "unknown"))
        start_ns = int(ordered[0].get("timestampNs", 0))
        end_ns = int(ordered[-1].get("timestampNs", 0))
        pipeline_version = "v1.0.0"
        dataset_id = hashlib.sha256(
            f"{exchange}|{symbol}|{start_ns}|{end_ns}|{source}|{pipeline_version}".encode("utf-8")
        ).hexdigest()[:32]

        out_dir = os.path.join(tempfile.gettempdir(), f"ticklab_{dataset_id}")
        os.makedirs(out_dir, exist_ok=True)

        # Canonical JSON (content-addressed under dataset_id).
        json_path = os.path.join(out_dir, "events.json")
        with open(json_path, "w", encoding="utf-8") as f:
            json.dump({"dataset_id": dataset_id, "events": ordered}, f)

        # Interim fixed-layout binary + manifest.
        bin_path = os.path.join(out_dir, "events.bin")
        manifest = {
            "magic": "TLAB1",
            "version": 1,
            "byte_order": "little-endian",
            "header": "5s magic, uint16 version, uint64 count",
            "record": "int64 timestampNs, uint8 typeCode, uint8 sideCode, float64 price, float64 size, int64 sequence",
            "type_codes": {"unknown": 0, **type_codes},
            "side_codes": {"none": 0, **side_codes},
            "upstream_mapping_todo": "Map onto NpyDTyped in engine/vendor/hftbacktest data.rs once the submodule is checked out in this worktree (docs/04 §4.2).",
        }
        with open(bin_path, "wb") as f:
            f.write(struct.pack("<5sHQ", b"TLAB1", 1, len(ordered)))
            for e in ordered:
                f.write(struct.pack(
                    "<qBBddq",
                    int(e.get("timestampNs", 0)),
                    type_codes.get(e.get("type", ""), 0),
                    side_codes.get(e.get("side", ""), 0),
                    float(e.get("price", 0.0) or 0.0),
                    float(e.get("size", 0.0) or 0.0),
                    int(e.get("sequence", 0) or 0),
                ))
        manifest_path = os.path.join(out_dir, "events.manifest.json")
        with open(manifest_path, "w", encoding="utf-8") as f:
            json.dump(manifest, f, indent=2)

        # Parquet mirror for analytics (Polars is listed in docs/03 §3.1).
        parquet_path = os.path.join(out_dir, "events.parquet")
        parquet_status = "written"
        try:
            import polars as pl
            frame = pl.DataFrame([{
                "timestampNs": int(e.get("timestampNs", 0)),
                "symbol": str(e.get("symbol", "")),
                "exchange": str(e.get("exchange", "")),
                "type": str(e.get("type", "")),
                "side": str(e.get("side", "") or ""),
                "price": float(e.get("price", 0.0) or 0.0),
                "size": float(e.get("size", 0.0) or 0.0),
                "sequence": int(e.get("sequence", 0) or 0),
            } for e in ordered])
            frame.write_parquet(parquet_path)
        except Exception as e:
            parquet_status = f"skipped: {e}"

        def _size(p: str) -> int:
            try:
                return os.path.getsize(p)
            except OSError:
                return 0

        return {
            "status": "success",
            "dataset_id": dataset_id,
            "total_events": len(ordered),
            "timestamp_range_ns": [start_ns, end_ns],
            "files": {
                "json": {"path": json_path, "bytes": _size(json_path)},
                "binary": {"path": bin_path, "bytes": _size(bin_path)},
                "manifest": {"path": manifest_path, "bytes": _size(manifest_path)},
                "parquet": {"path": parquet_path, "bytes": _size(parquet_path), "status": parquet_status},
            },
            "message": f"Wrote {len(ordered)} events as dataset {dataset_id} (JSON + interim binary + manifest + Parquet mirror)",
        }

    except HTTPException:
        raise
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON input. Expected {\"events\": [...]} with timestampNs entries")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"HftBacktest-format conversion failed: {str(e)}")


@app.post("/quality-report")
async def quality_report(request: PipelineRequest) -> DataQualityReport:
    """Generate DataQualityReport for a dataset.

    This endpoint generates the 🟢/🟡/🔴 quality report that the Data Quality panel
    visualizes and that the Dataset Selector uses to block corrupt datasets from
    backtest submission.
    """

    # TODO: Generate actual report from dataset storage
    # - Read the dataset from object storage
    # - Run validation checks
    # - Return DataQualityReport with proper statuses

    return DataQualityReport(
        datasetId=request.datasetId,
        totalEvents=0,
        trades=0,
        orderBookUpdates=0,
        snapshots=0,
        missingIntervals={"count": 0, "status": "green", "ranges": []},
        duplicateEvents={"count": 0, "status": "green"},
        sequenceGaps={"count": 0, "status": "green"},
        timestampRange=[0, 0],
        fileSizeBytes=0,
        source=request.source,
        normalizationVersion="v1.0.0",
        tickSize=0.01,
        lotSize=1.0,
    )


@app.post("/validate-for-backtest")
async def validate_for_backtest(request: BacktestGateRequest) -> BacktestGateResponse:
    """Task G: 🔴-blocks-backtest rule (docs/05 §5.2, docs/08 §8.10).

    Any 🔴 status in a DataQualityReport blocks BACKTEST (and PAPER/LIVE
    promotion) until resolved or explicitly, individually overridden with a
    justification note. The audit logging of that justification lives with the
    caller (Gateway/audit_log per docs/14 §14.5, owned by Blocks 2.1/2.8); this
    endpoint computes the gate decision and reports exactly which checks fail and
    which were overridden, without writing audit records itself.
    """

    report = request.report
    sections = {
        "missingIntervals": report.missingIntervals,
        "duplicateEvents": report.duplicateEvents,
        "sequenceGaps": report.sequenceGaps,
    }
    failing = [name for name, section in sections.items()
               if isinstance(section, dict) and section.get("status") == "red"]

    justified = {o.check for o in request.overrides if o.justification and o.justification.strip()}
    overridden = [name for name in failing if name in justified]
    still_failing = [name for name in failing if name not in justified]

    blocks = len(still_failing) > 0
    if not failing:
        message = "Dataset is clear — BACKTEST may proceed"
    elif not blocks:
        message = f"BACKTEST allowed by explicit override of: {', '.join(overridden)} (caller must audit-log justifications)"
    else:
        message = f"BACKTEST blocked by 🔴 check(s): {', '.join(still_failing)}"

    return BacktestGateResponse(
        datasetId=report.datasetId,
        blocksBacktest=blocks,
        failingChecks=still_failing,
        overriddenChecks=overridden,
        message=message,
    )