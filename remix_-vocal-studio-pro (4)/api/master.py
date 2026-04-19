"""Synchronous reference-based mastering for Vercel Python Functions.

The client POSTs multipart form-data with `target` and `reference` audio files
and receives the mastered WAV in the response body. No job IDs, no polling,
no persistent storage — everything happens inside one invocation on /tmp.
"""
import io
import os
import tempfile
import traceback
from http.server import BaseHTTPRequestHandler

try:
    import matchering as mg
except ImportError as exc:  # surfaced clearly in deploy logs
    mg = None
    _MATCHERING_IMPORT_ERROR = exc
else:
    _MATCHERING_IMPORT_ERROR = None


def _parse_multipart(body: bytes, content_type: str):
    """Returns {field_name: (filename, bytes)} for multipart/form-data."""
    import cgi
    env = {"REQUEST_METHOD": "POST", "CONTENT_TYPE": content_type}
    fp = io.BytesIO(body)
    form = cgi.FieldStorage(fp=fp, environ=env, keep_blank_values=True)
    out = {}
    for key in form.keys():
        item = form[key]
        if getattr(item, "file", None):
            out[key] = (item.filename or key, item.file.read())
    return out


class handler(BaseHTTPRequestHandler):
    def _send_json(self, status: int, payload: dict):
        body = repr(payload).encode() if False else __import__("json").dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        if _MATCHERING_IMPORT_ERROR is not None:
            return self._send_json(500, {
                "error": f"matchering failed to import: {_MATCHERING_IMPORT_ERROR}"
            })

        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0:
                return self._send_json(400, {"error": "Empty body"})

            ctype = self.headers.get("Content-Type", "")
            if "multipart/form-data" not in ctype:
                return self._send_json(400, {"error": "Expected multipart/form-data"})

            body = self.rfile.read(length)
            fields = _parse_multipart(body, ctype)

            if "target" not in fields or "reference" not in fields:
                return self._send_json(400, {"error": "Both 'target' and 'reference' files are required"})

            with tempfile.TemporaryDirectory(prefix="master_", dir="/tmp") as tmp:
                target_name, target_bytes = fields["target"]
                reference_name, reference_bytes = fields["reference"]

                target_path = os.path.join(tmp, f"target_{os.path.basename(target_name) or 'in.wav'}")
                reference_path = os.path.join(tmp, f"reference_{os.path.basename(reference_name) or 'ref.wav'}")
                output_path = os.path.join(tmp, "mastered.wav")

                with open(target_path, "wb") as f:
                    f.write(target_bytes)
                with open(reference_path, "wb") as f:
                    f.write(reference_bytes)

                # Matchering's default handler logs to stdout; that's fine on Vercel
                # (shows up in function logs) and keeps this endpoint stateless.
                mg.process(
                    target=target_path,
                    reference=reference_path,
                    results=[mg.pcm16(output_path)],
                )

                with open(output_path, "rb") as f:
                    mastered = f.read()

            self.send_response(200)
            self.send_header("Content-Type", "audio/wav")
            self.send_header("Content-Disposition", 'attachment; filename="mastered.wav"')
            self.send_header("Content-Length", str(len(mastered)))
            self.end_headers()
            self.wfile.write(mastered)
        except Exception as exc:
            traceback.print_exc()
            self._send_json(500, {"error": f"{type(exc).__name__}: {exc}"})

    def do_GET(self):
        self._send_json(405, {"error": "POST multipart/form-data with 'target' and 'reference' fields"})
