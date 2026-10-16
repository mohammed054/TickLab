# research-worker/src/protocol.py
#
# JSON Lines protocol between the Electron main process and the local Python
# research worker (docs/09-research-system.md sec 9.2).
#
# Wire format (one JSON object per line):
#   request:   { "id": str, "command": str, "payload": object }
#   response:  { "id": str, "ok": true,  "result": object }
#              | { "id": str, "ok": false, "error": { "code": str, "message": str } }
#   progress:  { "event": "progress", "jobId": str, "stage": str,
#                "completed": int, "total": int, "message": str }
#
# Rules (docs/09 sec 9.2):
#   * stdout is protocol-only; nothing else is ever written to stdout.
#   * logs go to stderr (see log()).
#   * responses are bounded to RESPONSE_LIMIT (1 MiB); oversized output is a
#     protocol error, never silently truncated.
#   * requests echo their id in the response; a mismatch is a protocol error.
#
# This module is imported by research-worker/src/main.py, which is executed as
# a top-level script by the Electron supervisor, so protocol.py uses plain
# (non-relative) imports and is importable both as a script sibling and on
# sys.path.

from __future__ import annotations

import json
import sys
from typing import Any

RESPONSE_LIMIT = 1 * 1024 * 1024  # 1 MiB (docs/09 sec 9.2)

_STDOUT = sys.stdout
_STDERR = sys.stderr


class ProtocolError(Exception):
    """Malformed inbound line, oversized outbound message, or id mismatch."""


class WorkerError(Exception):
    """Typed worker error surfaced as { code, message } in a response.

    Codes follow docs/09 sec 9.2 typed-error convention: UNKNOWN_COMMAND,
    MALFORMED_JSON, VALIDATION, RESPONSE_TOO_LARGE, WORKER_CRASH, INTERNAL.
    """

    def __init__(self, code: str, message: str):
        self.code = code
        self.message = message
        super().__init__(message)


def _encode(obj: Any) -> str:
    return json.dumps(obj, separators=(",", ":"))


def encode_response(request_id: str, result: Any = None,
                    error: dict[str, str] | None = None) -> str:
    if error is not None:
        return _encode({"id": request_id, "ok": False, "error": error})
    return _encode({"id": request_id, "ok": True, "result": result})


def encode_progress(job_id: str, stage: str, completed: int, total: int,
                    message: str = "") -> str:
    return _encode({
        "event": "progress", "jobId": job_id, "stage": stage,
        "completed": int(completed), "total": int(total), "message": message,
    })


def decode_line(line: str) -> dict[str, Any]:
    """Parse one inbound request line, raising ProtocolError on malformed JSON
    or a missing/wrongly-shaped request."""
    try:
        obj = json.loads(line)
    except json.JSONDecodeError as exc:
        raise ProtocolError("MALFORMED_JSON", f"invalid JSON line: {exc}") from exc
    if not isinstance(obj, dict):
        raise ProtocolError("MALFORMED_JSON", "request line is not a JSON object")
    rid = obj.get("id")
    command = obj.get("command")
    if not isinstance(rid, str) or not rid:
        raise ProtocolError("MALFORMED_JSON", "request id must be a non-empty string")
    if not isinstance(command, str) or not command:
        raise ProtocolError("MALFORMED_JSON", "request command must be a non-empty string")
    payload = obj.get("payload", {})
    if payload is None:
        payload = {}
    if not isinstance(payload, dict):
        raise ProtocolError("MALFORMED_JSON", "request payload must be an object")
    return {"id": rid, "command": command, "payload": payload}


def check_response_size(text: str) -> None:
    """Raise ProtocolError if a serialized response would exceed the bound."""
    if len(text.encode("utf-8")) > RESPONSE_LIMIT:
        raise ProtocolError("RESPONSE_TOO_LARGE",
                            f"response exceeds {RESPONSE_LIMIT} bytes")


def write(line: str) -> None:
    """Write one protocol line to stdout and flush. Protocol-only output."""
    _STDOUT.write(line + "\n")
    _STDOUT.flush()


def log(message: str) -> None:
    """Write a diagnostic line to stderr. Never touches stdout."""
    _STDERR.write(f"[worker] {message}\n")
    _STDERR.flush()


def fail_response(request_id: str, code: str, message: str) -> str:
    return encode_response(request_id, error={"code": code, "message": message})
