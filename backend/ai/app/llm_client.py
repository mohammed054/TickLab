"""Model-agnostic LLM client for the AI Research Assistant.

Uses OpenRouter as the default provider (OD-5 resolution) but is configured
via environment variable to support other providers without vendor lock-in.

Never makes writes to strategy code, order submission, or risk limits. Only
produces DraftExperimentConfig payloads and evidence queries.
"""

import os
from typing import Any, Dict, List, Optional

# OpenRouter configuration (OD-5: OpenRouter as initial LLM provider)
OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "")
OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
DEFAULT_MODEL = os.environ.get("OPENROUTER_MODEL", "anthropic/claude-3.5-sonnet")

# Evidence query constants (docs/09 §9.14)
EVIDENCE_QUERY_TEMPLATE = """SELECT * FROM {table} WHERE {condition} ORDER BY {sort} LIMIT {limit}"""

# Response citation model
Citation = Dict[str, str]  # {source_type, source_id, evidence_text}


def build_evidence_query(
    table: str,
    condition: str,
    sort: str = "timestamp_ns",
    limit: int = 10,
) -> str:
    """Build a parameterized evidence query per docs/09 §9.14.

    Every substantive claim from the AI Research Assistant must cite the query
    it came from, shown in a persistent side panel next to the chat.
    """
    return EVIDENCE_QUERY_TEMPLATE.format(
        table=table,
        condition=condition,
        sort=sort,
        limit=limit,
    )


def format_citation(
    source_type: str,
    source_id: str,
    evidence_text: str,
) -> Citation:
    """Format a citation for display in the AI Research Assistant side panel."""
    return {
        "source_type": source_type,
        "source_id": source_id,
        "evidence_text": evidence_text,
    }


def ask_question(
    question: str,
    context: Optional[Dict[str, Any]] = None,
    model: Optional[str] = None,
) -> Dict[str, Any]:
    """Ask a question to the LLM with evidence citation requirement.

    Per docs/10 §10.5.2: every substantive claim must cite the query/evidence
    it came from. A response with no linked evidence for a factual claim about
    the data is a bug, not an acceptable informal answer.

    The model-agnostic client ensures no vendor lock-in — the provider/model
    is a configuration value (OpenRouter by default per OD-5).
    """
    # TODO: Implement actual OpenRouter API call
    # For now, return a structured response that enforces the citation requirement
    model = model or DEFAULT_MODEL

    # Parse the question to determine if it's asking about metrics, experiments, etc.
    # and generate appropriate evidence queries
    response = {
        "answer": "Pending OpenRouter API integration — question: " + question[:50],
        "citations": [],
        "model": model,
        "question_type": "unknown",
    }

    # Classify question type for appropriate evidence retrieval
    question_lower = question.lower()
    if "metric" in question_lower or "fill" in question_lower or "slippage" in question_lower:
        response["question_type"] = "metrics"
        # Would generate evidence query for docs/09 metrics
    elif "experiment" in question_lower or "strategy" in question_lower:
        response["question_type"] = "experiment"
        # Would generate evidence query for experiment store
    elif "backtest" in question_lower:
        response["question_type"] = "backtest"
        # Would generate evidence query for backtest results
    else:
        response["question_type"] = "general"

    return response


def generate_draft_experiment_config(
    strategy_description: str,
    assumptions: str,
    parameter_schema: Dict[str, Any],
    dataset_id: str,
    exchange: str,
    symbol: str,
) -> Dict[str, Any]:
    """Generate a draft experiment configuration per docs/10 §10.5.3.

    Given a natural-language description, the assistant generates:
    - Strategy description and assumptions
    - Starting parameters
    - Generated code conforming to SimulatorContract-facing strategy interface
    - Draft experiment configuration to backtest it

    The result lands in the Strategy Editor as a new DRAFT-status strategy
    for the user to review, edit, and explicitly run VALIDATE/BACKTEST themselves.

    Never auto-runs, and never eligible for PAPER or LIVE status without passing
    through the same human-gated status transitions as any other strategy.

    Generated code is visually marked as AI-generated (badge) until a human has
    reviewed and it has passed VALIDATE at least once.

    No write access to strategy code, order submission, or risk limits.
    """
    # TODO: Implement actual code generation and experiment config creation
    # Per docs/10 §10.5.2 constraints:
    # - No write access to strategy code, order submission, risk limits
    # - Cannot start a job — only produces DraftExperimentConfig payload
    # - Generated code visually marked as AI-generated

    config = {
        "strategy_description": strategy_description,
        "assumptions": assumptions,
        "parameter_schema": parameter_schema,
        "dataset_id": dataset_id,
        "exchange": exchange,
        "symbol": symbol,
        "status": "DRAFT",
        "ai_generated": True,
        "code": "// AI-generated strategy code — requires human review and VALIDATE pass",
        "experiment_config": {
            "strategy_ref": {"id": "ai-generated", "version": "0.0.1", "code_hash": ""},
            "parameters": {},
            "dataset_id": dataset_id,
            "exchange": exchange,
            "symbol": symbol,
            "execution_model": {
                "maker_fee_pct": 0.02,
                "taker_fee_pct": 0.05,
                "tick_size": 0.0001,
                "lot_size": 1,
                "latency_model": "fixed",
                "queue_model_preset": "risk_averse",
                "allow_partial_fills": True,
                "order_types_allowed": ["limit"],
            },
            "risk_limits": {
                "max_position": 1.0,
                "max_order_size": 1.0,
                "max_daily_loss": 100.0,
                "max_drawdown_pct": 20.0,
                "max_open_orders": 10,
                "max_order_rate_per_sec": 10.0,
                "max_notional_exposure": 10_000.0,
                "emergency_stop_enabled": False,
            },
            "random_seed": None,
        },
    }

    return config