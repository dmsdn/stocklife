"""외부 DB/LLM 없이 실제 lifespan·HTTP 계약과 사진 오류/후보 응답을 검사한다."""
import os
import unittest
from unittest.mock import patch

os.environ["USE_MOCK_SOT"] = "true"
os.environ["LOAD_PHOTO_ENCODER"] = "0"
os.environ["INTERNAL_SERVICE_KEY"] = "integration-test-only"

from fastapi.testclient import TestClient
from app.main import app


class IntegrationHTTP(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)
        cls.client.__enter__()

    @classmethod
    def tearDownClass(cls):
        cls.client.__exit__(None, None, None)

    def test_startup_assets(self):
        response = self.client.get("/health")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertTrue(body["ok"])
        self.assertTrue(body["mock_sot"])
        self.assertGreater(body["search_index"], 0)
        for asset in ("preference", "availability", "repurchase", "photo", "floormap"):
            self.assertIn(asset, body["assets"])

    def test_route_no_fabricated_map(self):
        response = self.client.post("/api/ai/route-optimize", json={"skuIds": []})
        self.assertEqual(response.json()["error"], "real_map_required")
        invalid = self.client.post("/api/ai/route-optimize", json={"skuIds": [1] * 41})
        self.assertEqual(invalid.status_code, 422)

    def test_insights_requires_service_auth(self):
        body = {"skuIds": [], "consumerId": 1}
        self.assertEqual(self.client.post("/api/ai/list-insights", json=body).status_code, 403)
        response = self.client.post("/api/ai/list-insights", json=body,
                                    headers={"X-Internal-Service-Key": "integration-test-only"})
        self.assertEqual(response.status_code, 200)

    def test_photo_disabled_and_candidates(self):
        files = {"photo": ("test.jpg", b"test", "image/jpeg")}
        disabled = self.client.post("/api/ai/photo-search", files=files)
        self.assertEqual(disabled.status_code, 200)
        self.assertTrue(disabled.json().get("error"))
        self.assertIsNone(disabled.json()["productName"])
        candidate = {"sku_id": 200000, "name": "상품", "item": "품목"}
        for tier in ("confident", "unsure"):
            with patch("app.routes_frontend.infer.identify_product_photo",
                       return_value={"tier": tier, "candidates": [candidate]}):
                response = self.client.post("/api/ai/photo-search", files=files).json()
                self.assertEqual(response["results"][0]["skuId"], 200000)
                self.assertEqual(response["productName"], "품목" if tier == "confident" else None)


if __name__ == "__main__":
    unittest.main(verbosity=2)
