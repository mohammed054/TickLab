"""AI Research Assistant — FastAPI application.

This module provides the AI Research Assistant features:
- LLM-powered strategy idea generation
- Evidence retrieval from backtest results and market data
- Experiment note generation and organization
- Research question answering with citations to underlying data
- Tool-calling for evidence retrieval from docs/09 §9.14

The interface is provider-agnostic (configured via environment variable)
and supports tool-calling for evidence retrieval.
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .llm_client import ask_question, generate_draft_experiment_config, Citation

app = FastAPI(
    title="TickLab AI Research Assistant",
    description="AI-powered research assistant for strategy development and investigation",
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


@app.get("/")
async def root() -> dict:
    {"message": "TickLab AI Research Assistant API"}


@app.get("/health")
async def health() -> dict:
    {"status": "healthy"}


@app.post("/query")
async def research_query(question: str) -> dict:
    """Accept a research question and return an answer with evidence citations.

    Per docs/10 §10.5.2:
    - Every substantive claim must cite the query/evidence it came from,
      shown in a persistent side panel next to the chat.
    - A response with no linked evidence for a factual claim about the data
      is a bug, not an acceptable informal answer.
    - Never state a conclusion as certain when the underlying analysis is
      statistical — mirror the product-wide honesty-about-uncertainty principle.

    The model-agnostic client (llm_client.py) uses OpenRouter by default (OD-5)
    but is configured via environment variable to support other providers without
    vendor lock-in.

    Constraints (docs/10 §10.5.2):
    - No write access to strategy code, order submission, risk limits, or any
      execution-affecting configuration.
    - Cannot start a job — only produces a DraftExperimentConfig payload.
    - Every substantive claim must cite the query/evidence it came from.
    - Never state a conclusion as certain when the underlying analysis is statistical.
    """
    if not question or not question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty")

    try:
        result = ask_question(question.strip())
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/create-experiment")
async def create_experiment(
    strategy_description: str,
    assumptions: str,
    parameter_schema: dict,
    dataset_id: str,
    exchange: str,
    symbol: str,
) -> dict:
    """Generate a draft experiment configuration per docs/10 §10.5.3.

    Given a natural-language description (e.g., "create a market-making strategy
    that adjusts quote width based on volatility and inventory"), the assistant
    generates:
    - Strategy description and assumptions
    - Starting parameters
    - Generated code (conforming to SimulatorContract-facing strategy interface)
    - Draft experiment configuration to backtest it

    The result lands in the Strategy Editor as a new DRAFT-status strategy
    (§8.3) for the user to review, edit, and explicitly run VALIDATE/BACKTEST
    themselves.

    Never auto-runs, and never eligible for PAPER or LIVE status without passing
    through the same human-gated status transitions as any other strategy.

    Generated code is visually marked as AI-generated (badge) until a human has
    reviewed and it has passed VALIDATE at least once.

    Constraints (docs/10 §10.5.2):
    - No write access to strategy code, order submission, risk limits, or any
      execution-affecting configuration.
    - Cannot start a job — only produces a DraftExperimentConfig payload.
    - The assistant never calls the creation flow itself — clicking [CREATE
      EXPERIMENT] hands the payload to the normal experiment-creation flow.
    """
    if not strategy_description.strip():
        raise HTTPException(status_code=400, detail="Strategy description cannot be empty")

    try:
        config = generate_draft_experiment_config(
            strategy_description=strategy_description,
            assumptions=assumptions,
            parameter_schema=parameter_schema,
            dataset_id=dataset_id,
            exchange=exchange,
            symbol=symbol,
        )
        return config
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))