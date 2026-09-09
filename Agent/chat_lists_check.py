import unittest
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from unittest.mock import patch

from app import cart_context, config, navigation_links, recommendations, sot_client
from app.tools import action, query, infer

GROUPS = [
    {"cartGroupId": 11, "title": "주말 장보기", "status": "ACTIVE", "items": [{"cartItemId": 101, "skuId": 5, "quantity": 2}]},
    {"cartGroupId": 22, "title": "캠핑 준비", "status": "ACTIVE", "items": [{"cartItemId": 202, "skuId": 5, "quantity": 3}]},
]


class CartScopeTests(unittest.TestCase):
    def setUp(self):
        self.real = patch.object(config, "USE_MOCK_SOT", False); self.real.start(); self.addCleanup(self.real.stop)
        self.owned = patch.object(cart_context, "groups", return_value=GROUPS); self.owned.start(); self.addCleanup(self.owned.stop)
        action.set_consumer_id(7)

    def test_two_chats_cannot_cross_add_destination(self):
        barrier = Barrier(2)
        def run(group):
            action.set_consumer_id(7, group); barrier.wait()
            return action._add_to_cart(5)
        with patch.object(action, "_call", side_effect=lambda *a, **kw: {"ok": True, "sent": kw["json_body"]}):
            with ThreadPoolExecutor(2) as pool:
                rows = list(pool.map(run, [11, 22]))
        self.assertEqual([r["sent"]["groupId"] for r in rows], [11, 22])

    def test_unbound_multiple_groups_do_not_write(self):
        with patch.object(action, "_call") as write:
            self.assertEqual(action._add_to_cart(5)["error"], "choose_group"); write.assert_not_called()

    def test_explicit_owned_group_overrides_chat_selection(self):
        action.set_consumer_id(7, 11)
        with patch.object(action, "_call", return_value={"ok": True}) as write:
            self.assertEqual(action._add_to_cart(5, group_id=22)["group_id"], 22)
            self.assertEqual(write.call_args.kwargs["json_body"]["groupId"], 22)

    def test_missing_or_other_members_group_does_not_fall_back(self):
        for group in (99, 200):
            action.set_consumer_id(7, group)
            with patch.object(action, "_call") as write:
                self.assertEqual(action._add_to_cart(5)["error"], "invalid_group"); write.assert_not_called()

    def test_previous_request_group_is_cleared(self):
        action.set_consumer_id(7, 11); action.set_consumer_id(7)
        self.assertEqual(cart_context.resolve_group()[1]["error"], "choose_group")

    def test_other_list_item_cannot_be_updated_or_removed(self):
        action.set_consumer_id(7, 11)
        with patch.object(action, "_call") as write:
            self.assertEqual(action._update_cart_quantity(202, 5)["error"], "wrong_group_item")
            self.assertEqual(action._remove_from_cart(202)["error"], "wrong_group_item")
            write.assert_not_called()

    def test_selected_cart_uses_its_own_rows_and_total(self):
        action.set_consumer_id(7, 22)
        with patch.object(sot_client, "get_products_by_skus", return_value=[{"sku_id": 5, "name": "물", "final_price_krw": 1000}]):
            row = cart_context.read_cart("chat-b")
        self.assertEqual(row["items"][0]["cart_item_id"], 202)
        self.assertEqual(row["total_krw"], 3000)

    def test_lookup_failure_does_not_write(self):
        with patch.object(cart_context, "groups", side_effect=RuntimeError("offline")), patch.object(action, "_call") as write:
            self.assertEqual(action._add_to_cart(5)["error"], "cart_lookup_failed"); write.assert_not_called()

    def test_completed_group_cannot_be_used(self):
        with patch.object(cart_context, "groups", return_value=[dict(GROUPS[0], status="COMPLETED")]):
            action.set_consumer_id(7, 11)
            self.assertEqual(cart_context.resolve_group()[1]["error"], "invalid_group")


class NavigationTests(unittest.TestCase):
    def test_owned_list_and_order_links_survive_as_message_text(self):
        ledger = {"sot": [{"tool": "get_session_cart", "result": {"groups": [{"group_id": 11, "title": "주말 장보기"}]}},
                          {"tool": "get_purchase_history", "result": {"orders": [{"order_id": 45, "ordered_at": "2026-09-09", "items": [{"productName": "물"}]}]}}]}
        reply = navigation_links.with_references("목록을 확인했어요.", ledger)
        self.assertIn("[주말 장보기](/saved/11)", reply)
        self.assertIn("[2026-09-09 구매내역 · 물](/mypage/orders/45)", reply)

    def test_purchase_basket_id_never_becomes_an_order_id(self):
        reply = navigation_links.with_references("[이력](/mypage/orders/123)", {"sot": [{"tool": "get_purchase_history", "result": {"purchases": [{"basket_id": "123"}]}}]})
        self.assertNotIn("/mypage/orders", reply)


class RecommendationTests(unittest.TestCase):
    def setUp(self):
        self.products = patch.object(sot_client, "get_product_cards", return_value=[{"sku_id": 5, "name": "물", "final_price_krw": 900, "image_url": "/img/water.webp"}]); self.products.start(); self.addCleanup(self.products.stop)

    def test_guest_does_not_run_personal_models(self):
        with patch.object(infer, "match_preferences") as model:
            self.assertEqual(recommendations.recommend(None)["status"], "login_required"); model.assert_not_called()

    def test_real_model_evidence_and_sot_price_are_projected(self):
        with patch.object(infer, "predict_repurchase", return_value={"items": [{"sku_id": 5, "days_since_last": 12, "typical_cycle_days": 10, "past_intervals": 2}]}), patch.object(infer, "match_preferences", return_value={"items": []}):
            result = recommendations.recommend(7)
        card = result["items"][0]
        self.assertEqual(card["priceKrw"], 900)
        self.assertEqual(card["imageUrl"], "/img/water.webp")
        self.assertIn("12일", card["reason"]); self.assertIn("추정", card["reason"])

    def test_missing_models_do_not_become_fake_recommendations(self):
        with patch.object(infer, "predict_repurchase", return_value={"error": "model_not_loaded"}), patch.object(infer, "match_preferences", return_value={"error": "model_not_loaded"}):
            result = recommendations.recommend(7)
        self.assertEqual(result["items"], []); self.assertEqual(result["status"], "unavailable")

    def test_cold_start_does_not_claim_personal_purchase(self):
        with patch.object(infer, "predict_repurchase", return_value={"error": "no_history"}), patch.object(infer, "match_preferences", return_value={"history_skus": 0, "items": [{"sku_id": 5, "why": {"l2": "음료", "bought_in_l2": 0}}]}):
            card = recommendations.recommend(7)["items"][0]
        self.assertFalse(card["personalized"]); self.assertIn("일반적인", card["reason"])

    def test_identity_restored_even_when_product_service_fails(self):
        query._CURRENT_MEMBER_ID.set(10001000)
        with patch.object(infer, "predict_repurchase", return_value={"error": "no_history"}), patch.object(infer, "match_preferences", return_value={"items": [{"sku_id": 5}]}), patch.object(sot_client, "get_product_cards", side_effect=RuntimeError()):
            with self.assertRaises(RuntimeError): recommendations.recommend(7)
        self.assertEqual(query.current_member_id(), 10001000)


if __name__ == "__main__":
    unittest.main()
