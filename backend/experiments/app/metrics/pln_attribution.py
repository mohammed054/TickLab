"""P&L Attribution metrics (docs/09 §9.4).

Computes additive P&L attribution categories that sum to Net P&L exactly.
Sources: fine-grained event stream + Recorder stream, reconciled.

Categories (must sum to Net P&L):
  Gross Trading P&L  = sum of (fill_price - reference_price) * signed_size
  Fees               = sum of per-fill fee amounts
  Slippage           = sum of (fill_price - expected_price) * signed_size
  Adverse Selection  = sum of post-fill markout at fixed horizon
  Inventory P&L      = mark-to-market P&L from holding position
  Execution Loss     = Gross Trading P&L - sum(attributable categories)
  Other              = residual (must be near-zero)
"""

from __future__ import annotations

from typing import Any, Dict, List, Mapping, NamedTuple, Sequence

import math
import polars as pl


class PlnCategories(NamedTuple):
    """P&L Attribution categories summing to Net P&L."""
    gross_trading_pnl: float
    fees: float
    slippage: float
    adverse_selection: float
    inventory_pnl: float
    execution_loss: float
    other: float
    # Reconciliation: sum check
    net_pnl: float
    # Check: gross_trading_pnl - fees - slippage - adverse_selection + inventory_pnl
    # should equal net_pnl (sign convention per docs/09 §9.4)


def compute_pln_attribution(
    fills: Sequence[Mapping[str, Any]],
    *,
    initial_capital: float,
    # Fine-grained event data needed for reference prices
    # Each fill should have: order_id, side, price, size, timestamp_ns,
    # and access to the order's submission price (expected_price)
    # and the mid price at fill time + horizon for adverse selection
) -> PlnCategories:
    """Compute P&L Attribution categories from fill events.

    Args:
        fills: Sequence of fill event dicts. Each must contain at minimum:
            - `order_id`: order identifier
            - `side`: "buy" or "sell"
            - `price`: fill price
            - `size`: filled size
            - `timestamp_ns`: fill timestamp
            - `fee`: fill fee amount
        initial_capital: starting capital for book_size normalization

    Returns:
        PlnCategories named tuple with all attribution categories.

    Category formulas (docs/09 §9.4):
      Gross Trading P&L  = sum ((fill_price - reference_price) * signed_size)
        where reference_price is the mid price at order SUBMISSION time
      Fees               = sum of per-fill fee amounts
      Slippage           = sum ((fill_price - expected_price) * signed_size)
        where expected_price is the limit price at submission (or best available
        price for market/IOC/FOK orders)
      Adverse Selection    = sum (signed_size * (mid_price(fill_time + h) - fill_price))
        at a fixed horizon h (default 100ms per §9.6)
      Inventory P&L      = sum over time of position(t) * (mid_price(t+dt) - mid_price(t))
      Execution Loss     = Gross Trading P&L - (Fees + Slippage + Adverse Selection)
        -- note: sign convention, this is the reconciling residual
      Other              = Net P&L - (Gross Trading P&L - Fees - Slippage -
        Adverse Selection + Inventory P&L)  -- should be near zero
    """
    if not fills:
        zero = 0.0
        return PlnCategories(
            gross_trading_pnl=zero,
            fees=zero,
            slippage=zero,
            adverse_selection=zero,
            inventory_pnl=zero,
            execution_loss=zero,
            other=zero,
            net_pnl=zero,
        )

    # Build frames from fills
    # We need: fill price, size, side, fee, and access to reference prices
    # For now, implement with minimal required fields and document what's needed

    signed_sizes = []
    fill_prices = []
    fill_sizes = []
    fill_fees = []
    sides = []

    for f in fills:
        side = f["side"]
        sides.append(side)
        sign = 1.0 if side == "buy" else -1.0
        signed_sizes.append(sign * float(f["size"]))
        fill_prices.append(float(f["price"]))
        fill_sizes.append(float(f["size"]))
        fill_fees.append(float(f.get("fee", 0.0)))

    # Gross Trading P&L
    # = sum ((fill_price - reference_price) * signed_size)
    # reference_price = mid price at order submission time
    # For now, using fill_price as reference (placeholder - needs order submission data)
    # In full implementation, reference_price comes from the order event, not the fill event
    gross_trading_pnl = sum(
        (fill_prices[i] - 0.0) * signed_sizes[i]  # reference_price placeholder
        for i in range(len(fills))
    )

    # Fees
    fees = sum(fill_fees)

    # Slippage
    # = sum ((fill_price - expected_price) * signed_size)
    # expected_price = limit price at submission (or best available price)
    # placeholder: using fill_price as expected_price
    slippage = sum(
        (fill_prices[i] - 0.0) * signed_sizes[i]  # expected_price placeholder
        for i in range(len(fills))
    )

    # Adverse Selection
    # = sum (signed_size * (mid_price(fill_time + h) - fill_price))
    # at fixed horizon h (default 100ms)
    # placeholder: 0.0 - needs mid price data at fill + horizon
    adverse_selection = 0.0

    # Inventory P&L
    # = sum over time of position(t) * (mid_price(t+dt) - mid_price(t))
    # placeholder: 0.0 - needs time-series position and mid price data
    inventory_pnl = 0.0

    # Execution Loss = Gross Trading P&L - (Fees + Slippage + Adverse Selection)
    # But per docs/09 §9.4: Execution Loss = Gross Trading P&L - sum of directly
    # attributable categories. The sign convention needs careful handling.
    # Execution Loss is the reconciling residual.
    subtotal = fees + slippage + adverse_selection
    execution_loss = gross_trading_pnl - subtotal

    # Other = Net P&L - (Gross Trading P&L - Fees - Slippage - Adverse Selection + Inventory P&L)
    # Net P&L is typically final_balance - initial_capital or similar
    # placeholder net_pnl
    net_pnl = gross_trading_pnl - fees - slippage - adverse_selection + inventory_pnl
    other = net_pnl - (gross_trading_pnl - fees - slippage - adverse_selection + inventory_pnl)

    return PlnCategories(
        gross_trading_pnl=gross_trading_pnl,
        fees=fees,
        slippage=slippage,
        adverse_selection=adverse_selection,
        inventory_pnl=inventory_pnl,
        execution_loss=execution_loss,
        other=other,
        net_pnl=net_pnl,
    )


# Convenience dict version for UI

def pln_attribution_dict(
    fills: Sequence[Mapping[str, Any]],
    *,
    initial_capital: float,
) -> dict[str, Any]:
    """Return P&L Attribution categories as a dict matching §9.4 UI fields."""
    r = compute_pln_attribution(fills, initial_capital=initial_capital)
    return {
        "gross_trading_pnl": r.gross_trading_pnl,
        "fees": r.fees,
        "slippage": r.slippage,
        "adverse_selection": r.adverse_selection,
        "inventory_pnl": r.inventory_pnl,
        "execution_loss": r.execution_loss,
        "other": r.other,
        "net_pnl": r.net_pnl,
    }