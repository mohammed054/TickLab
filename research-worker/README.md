# research-worker

Local, pinned Python environment for the TickLab research worker
(docs/09-research-system.md §9.2). The worker is child process Python launched
by Electron main when Phase 1 task T1.3 lands; this directory pins what it runs
with. There is **no listening TCP/HTTP socket, no general network access, and no
model download** in this environment — ever.

owns: Executor (per `docs/07-phases-and-tasks.md` T1.2) · spec: docs/09 §§9.2, 9.8

## 1. What lives here

| File | Role |
|---|---|
| `requirements.txt` | Exact version pins for every direct research dependency, with the spec section / task card each is for. `torch` is pinned to the `+cu118` build proven by the T0.1 machine probe. |
| `requirements.sha256` | SHA256 of `requirements.txt`, written by the bootstrap script (also mirrored inside the venv). Recomputed and verified by the health script. |
| `README.md` | This file. |

## 2. Bootstrap (one-time, owner-invoked)

```powershell
pwsh ./scripts/research/bootstrap-worker.ps1            # default location below
pwsh ./scripts/research/bootstrap-worker.ps1 -VenvDir D:\moham\tickLab\research-worker-venv -Recreate
```

- Default venv: `D:\moham\tickLab\research-worker-venv` (owner-directed; `C:` has
  only ~12 GiB free while the pinned stack needs ~4 GiB). Override with
  `-VenvDir`. The path is user-specific by construction; a second Windows user
  bootstraps their own venv.
- Requires Python **3.11.x** on `PATH` (T0.1 measured 3.11.9). Any other
  major.minor is refused — the pins were chosen against this interpreter.
- Refuses to run when the target drive has < 8 GiB free.
- Installs *only* what `requirements.txt` pins. Nothing else, no extras, no
  model weights. The `torch` pin resolves from the PyTorch CUDA 11.8 wheel
  index (`--extra-index-url` line inside the pin file).
- Network is allowed for this one step (pip registries only). Everything after
  bootstrap — worker, health check — needs zero network.
- Records `requirements.sha256`, a `worker-env-record.json` (interpreter,
  venv pip version, pins, install outcome) and a `pip freeze` lock snapshot
  inside the venv. `-Recreate` deletes and rebuilds an existing venv.

## 3. Offline health check (run any time)

```powershell
pwsh ./scripts/research/worker-health.ps1               # default venv location
```

Prints and saves `data/p0/worker-health.json` (gitignored local evidence):

- venv Python + pip versions,
- every pinned package: importable, installed version == pin,
- GPU status via `torch.cuda`: device name, total/free VRAM — or an explicit
  `cpu_fallback` line when no CUDA device is available,
- `requirements.txt` hash matches the recorded hash from bootstrap,
- **no-listener check**: no process running this venv's `python.exe` holds a
  listening TCP socket (docs/09 §9.2 forbids one).

Exit code 0 = healthy (CPU fallback on a GPU-less host is still healthy); 1 =
something must be fixed or reported.

## 4. CUDA / CPU fallback

`torch==2.7.1+cu118` is the exact build T0.1 proved on this machine (RTX 2060,
6 GiB, driver CUDA 13.3 UMD runtime probing, `cudaAvailable=true`). The same
wheel is CPU-correct: on a host with no NVIDIA GPU, `torch.cuda.is_available()`
returns `false` and the worker runs on CPU. Torch CUDA 11.8 wheels bundle their
CUDA libraries, so no nvcc/toolkit install is required (T0.1 found the machine
has no nvcc). Jobs that need large outputs must still fit this machine's
budget: 6 GiB VRAM, 16 GiB system RAM — the model-ladder tasks (docs/09 §9.8)
size their configs to that reality, and Phase 0 forbade assuming more.

## 5. Hard rules (docs/09 §9.2, §9.8)

1. No listening socket: the worker is stdin/stdout-JSON-Lines only. Enforced in
   T1.3's protocol/supervisor tests and re-verified offline by
   `worker-health.ps1`.
2. No network access, no secrets: Electron main owns all provider clients; the
   worker never fetches anything and never sees credentials.
3. No model downloads here: model identifiers + hashes get pinned by their own
   task cards (§9.8) and are fetched only by those explicitly, never implicitly.
4. Pins do not float: change `requirements.txt` only when a task card directs
   it, re-run bootstrap, and re-record the hash; the health script flags drift.

## 6. Machine context (from T0.1, data/p0/system.json)

Windows 11 Pro · i5-8400 (6 cores) · 15.91 GiB RAM · RTX 2060 6 GiB ·
Python 3.11.9 · driver CUDA 13.3 UMD, no nvcc toolkit.
