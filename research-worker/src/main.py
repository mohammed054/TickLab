# research-worker/src/main.py
#
# Local research worker entry point (docs/09-research-system.md sec 9.2).
# Executed as a top-level script by the Electron main-process supervisor:
#
#     <venv python> research-worker/src/main.py
#
# Reads JSONL requests from stdin, writes JSONL responses + progress events to
# stdout (protocol only), writes diagnostics to stderr. Allows only the
# commands in COMMANDS; every other command is a typed UNKNOWN_COMMAND error.
# Unexpected crashes are caught and returned as a typed WORKER_CRASH error so
# the worker process stays alive for the lifetime of the child.
#
# Shutdown: SIGTERM sets a graceful flag; the loop finishes the current request
# and exits. The supervisor owns the 10-second graceful window (docs/09 sec 9.2)
# and force-terminates the child if it does not exit in time. On Windows both
# SIGTERM and SIGKILL map to TerminateProcess, so shutdown degrades to immediate
# termination, which still satisfies "then terminates the child."

from __future__ import annotations

import os
import queue
import signal
import sys
import threading
import traceback

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from protocol import (  # noqa: E402  (sibling module on sys.path)
    RESPONSE_LIMIT,
    ProtocolError,
    WorkerError,
    decode_line,
    encode_progress,
    encode_response,
    fail_response,
    log,
    write,
)

_RUNNING = True
_INQ: queue.Queue[str | None] = queue.Queue()


def _handle_sigterm(signum: int, frame) -> None:
    global _RUNNING
    _RUNNING = False
    log("SIGTERM received; shutting down after current request")


def _reader() -> None:
    try:
        for line in sys.stdin:
            _INQ.put(line)
    except Exception as exc:  # pragma: no cover - defensive
        log(f"stdin reader error: {exc}")
    finally:
        _INQ.put(None)  # EOF marker (parent closed stdin / went away)


threading.Thread(target=_reader, daemon=True).start()

COMMANDS = frozenset({"ping", "echo", "compute", "health"})


def cmd_ping(payload: object) -> dict:
    return {"ok": True}


def cmd_echo(payload: object) -> dict:
    return {"echo": payload}


def cmd_health(payload: object) -> dict:
    return {"python": sys.version.split()[0], "pid": os.getpid()}


def cmd_compute(payload: object) -> dict:
    if not isinstance(payload, dict):
        raise WorkerError("VALIDATION", "compute payload must be an object")
    if payload.get("crash"):
        raise RuntimeError("injected worker crash")
    size = payload.get("size", 0)
    if not isinstance(size, int) or isinstance(size, bool) or size < 0:
        raise WorkerError("VALIDATION", "size must be a non-negative integer")
    numbers = payload.get("numbers", [])
    if not isinstance(numbers, list) or not all(
        isinstance(n, (int, float)) and not isinstance(n, bool) for n in numbers
    ):
        raise WorkerError("VALIDATION", "numbers must be a list of int/float")
    total = int(payload.get("steps", 0) or 0)
    job_id = payload.get("jobId")
    if total > 0 and isinstance(job_id, str):
        for i in range(total):
            if not _RUNNING:
                break
            write(
                encode_progress(
                    job_id=job_id,
                    stage="hashing",
                    completed=i + 1,
                    total=total,
                    message=f"step {i + 1}/{total}",
                )
            )
    result = {"sum": float(sum(numbers)), "count": len(numbers)}
    if size:
        result["pad"] = "x" * size
    return result


_COMMANDS = {
    "ping": cmd_ping,
    "echo": cmd_echo,
    "health": cmd_health,
    "compute": cmd_compute,
}


def dispatch(req: dict) -> dict:
    command = req["command"]
    if command not in COMMANDS:
        raise WorkerError("UNKNOWN_COMMAND", f"command {command!r} is not allowed")
    return _COMMANDS[command](req["payload"])


def _respond(request_id: object, result=None, error=None) -> None:
    text = encode_response(request_id, result=result, error=error)
    if len(text.encode("utf-8")) <= RESPONSE_LIMIT:
        write(text)


def main() -> None:
    signal.signal(signal.SIGTERM, _handle_sigterm)
    log(f"worker started pid={os.getpid()}")
    try:
        while _RUNNING:
            try:
                line = _INQ.get(timeout=0.5)
            except queue.Empty:
                continue
            if line is None:
                break  # stdin closed: parent went away
            line = line.strip()
            if not line:
                continue
            try:
                req = decode_line(line)
                result = dispatch(req)
                _respond(req["id"], result=result)
            except ProtocolError as exc:
                # Undecodable inbound line: cannot address it by id; log and
                # keep the worker alive (the supervisor never sends malformed JSON).
                log(f"protocol error: {exc.code} {exc.message}")
            except WorkerError as exc:
                rid = req["id"] if isinstance(req, dict) else None
                _respond(rid, error={"code": exc.code, "message": exc.message})
                log(f"worker error: {exc.code} {exc.message}")
            except Exception as exc:  # unexpected crash -> typed error, stay alive
                rid = req["id"] if isinstance(req, dict) else None
                tb = "".join(traceback.format_exception(type(exc), exc, exc.__traceback__))
                log(f"worker crash: {exc}\n{tb}")
                _respond(rid, error={"code": "WORKER_CRASH", "message": str(exc) or type(exc).__name__})
    finally:
        log("worker exiting")
    sys.exit(0)


if __name__ == "__main__":
    main()
