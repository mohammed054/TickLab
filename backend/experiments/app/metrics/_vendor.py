"""Load vendored upstream stats modules without the compiled extension.

`py-hftbacktest`'s top-level `__init__` imports the compiled Rust extension
(`hftbacktest._hftbacktest`), which Phase 2 never builds — the backtest-only
engine meets Python over gRPC (docs/03 §3.4), not via PyO3. The stats
subpackage (`stats/metrics.py`, `stats/utils.py`) is pure Python on top of
Polars/numpy, so it is loaded file-by-file under a synthetic package name;
relative imports inside those files (`from .utils import ...`) resolve within
the synthetic package and the compiled extension is never touched.

Pinned to the vendored tree (Block 1.1, commit 5f3ec40), never PyPI: the
parity claims in `headline.py` hold only against this exact source.
"""

import importlib.util
import os
import sys
import types
from types import ModuleType

_PACKAGE_NAME = "ticklab_vendor_stats"


def _repo_root() -> str:
    here = os.path.dirname(os.path.abspath(__file__))
    # backend/experiments/app/metrics/_vendor.py -> up 4 -> repo root.
    root = here
    for _ in range(4):
        root = os.path.dirname(root)
    return root


def stats_dir() -> str:
    """Absolute path of the vendored `hftbacktest/stats/` directory."""
    return os.path.join(
        _repo_root(),
        "engine",
        "vendor",
        "hftbacktest",
        "py-hftbacktest",
        "hftbacktest",
        "stats",
    )


def load_stats_module(name: str) -> ModuleType:
    """Import vendored `stats/<name>.py` (result cached in `sys.modules`)."""
    full_name = f"{_PACKAGE_NAME}.{name}"
    cached = sys.modules.get(full_name)
    if cached is not None:
        return cached
    if _PACKAGE_NAME not in sys.modules:
        pkg = types.ModuleType(_PACKAGE_NAME)
        pkg.__path__ = [stats_dir()]  # type: ignore[attr-defined]
        sys.modules[_PACKAGE_NAME] = pkg
    path = os.path.join(stats_dir(), name + ".py")
    if not os.path.isfile(path):
        raise ImportError(f"vendored stats module missing: {path}")
    spec = importlib.util.spec_from_file_location(full_name, path)
    if spec is None or spec.loader is None:
        raise ImportError(f"cannot load vendored stats module: {path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[full_name] = module
    spec.loader.exec_module(module)
    return module
