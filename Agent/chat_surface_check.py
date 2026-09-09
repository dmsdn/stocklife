import os
import unittest
from unittest.mock import patch
from fastapi.testclient import TestClient
from app.main import app
from app import loop, guard, recommendations


class ChatSurfaceTests(unittest.TestCase):
    def test_backend_group_reaches_loop(self):
        result = {"reply": "확인", "actions": [], "ledgers": {}}
        with patch.object(loop, "run_chat", return_value=result) as run, patch.object(guard, "check", return_value={"ok": True}):
            response = TestClient(app).post("/agent/chat", json={"sessionId": "a", "consumerId": 7, "groupId": 22, "message": "물 담아줘"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(run.call_args.kwargs["group_id"], 22)

    def test_guard_retry_keeps_the_same_group(self):
        result = {"reply": "확인", "actions": [], "ledgers": {}}
        with patch.object(loop, "run_chat", return_value=result) as run, patch.object(guard, "check", side_effect=[{"ok": False, "violations": [{"reason": "web_only"}]}, {"ok": True}]):
            response = TestClient(app).post("/agent/chat", json={"sessionId": "a", "consumerId": 7, "groupId": 22, "message": "목록 보여줘"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual([call.kwargs["group_id"] for call in run.call_args_list], [22, 22])

    def test_recommendation_internal_auth_required(self):
        with patch.dict(os.environ, {"INTERNAL_SERVICE_KEY": "test-only"}), patch.object(recommendations, "recommend") as run:
            response = TestClient(app).post("/api/ai/recommendations", json={"consumerId": 7})
        self.assertEqual(response.status_code, 403); run.assert_not_called()

    def test_authenticated_recommendation_passes_identity_and_limit(self):
        with patch.dict(os.environ, {"INTERNAL_SERVICE_KEY": "test-only"}), patch.object(recommendations, "recommend", return_value={"items": [], "status": "insufficient_history"}) as run:
            response = TestClient(app).post("/api/ai/recommendations", headers={"X-Internal-Service-Key": "test-only"}, json={"consumerId": 7, "limit": 5})
        self.assertEqual(response.status_code, 200); run.assert_called_once_with(7, 5)

    def test_invalid_recommendation_limit_rejected_before_inference(self):
        with patch.object(recommendations, "recommend") as run:
            response = TestClient(app).post("/api/ai/recommendations", json={"consumerId": 7, "limit": 900})
        self.assertEqual(response.status_code, 422); run.assert_not_called()


if __name__ == "__main__":
    unittest.main()
