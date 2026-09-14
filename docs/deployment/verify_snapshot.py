"""Verify the checked-in application files against the running-server snapshot."""
from pathlib import Path
import hashlib
import json

root = Path(__file__).resolve().parents[2]
manifest = json.loads((Path(__file__).parent / "server-snapshot-20260914.json").read_text(encoding="utf-8"))
failed = []
for name, entry in manifest["files"].items():
    path = root / name
    if not path.is_file():
        failed.append(name + " (missing)")
        continue
    data = path.read_bytes()
    if entry["mode"] == "lf-text":
        data = data.replace(b"\r\n", b"\n")
    if hashlib.sha256(data).hexdigest() != entry["sha256"]:
        failed.append(name)
if failed:
    raise SystemExit("Server snapshot mismatch:\n" + "\n".join(failed))
print(f"PASS: {len(manifest['files'])} files match the server snapshot (text line endings normalized).")
