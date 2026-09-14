"""Decode chat attachments for the existing SigLIP retrieval model; no URL fetching."""
import base64
import io
import os
import tempfile
from PIL import Image
from app.tools import infer

def identify_attachments(refs):
    results = []
    for ref in refs:
        tmp = None
        try:
            prefix, encoded = ref.split(",", 1)
            if prefix not in {"data:image/jpeg;base64", "data:image/png;base64", "data:image/webp;base64"}:
                raise ValueError("unsupported photo")
            if len(encoded) > 1_200_000:
                raise ValueError("photo too large")
            data = base64.b64decode(encoded, validate=True)
            with Image.open(io.BytesIO(data)) as image:
                if image.width * image.height > 25_000_000:
                    raise ValueError("photo dimensions too large")
                image.verify()
            with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as file:
                tmp = file.name
                file.write(data)
            results.append(infer.identify_product_photo(tmp))
        except Exception:
            results.append({"error": "photo_unavailable", "tier": "unsure", "candidates": [],
                            "message": "첨부 사진을 읽지 못했습니다. JPG·PNG 사진으로 다시 선택해 주세요."})
        finally:
            if tmp:
                try: os.unlink(tmp)
                except OSError: pass
    return results
