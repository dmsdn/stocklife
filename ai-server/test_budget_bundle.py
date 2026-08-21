import unittest
from unittest.mock import patch

import budget_bundle


class BudgetBundleTest(unittest.TestCase):
    def test_solver_never_exceeds_budget_and_one_per_group(self):
        groups = [
            [
                {"need_key": "a", "need": "A", "priority": 30, "sku_id": 1, "final_price_krw": 37000},
            ],
            [
                {"need_key": "b", "need": "B", "priority": 12, "sku_id": 2, "final_price_krw": 5000},
            ],
            [
                {"need_key": "c", "need": "C", "priority": 8, "sku_id": 3, "final_price_krw": 2000},
            ],
        ]
        result = budget_bundle.solve_bundle(groups, 50000)
        self.assertLessEqual(result["total_krw"], 50000)
        self.assertEqual({x["sku_id"] for x in result["items"]}, {1, 2, 3})

    @patch("budget_bundle.backend_client.get_inventory")
    @patch("budget_bundle.backend_client.search_products")
    def test_optimize_bundle_filters_zero_stock(self, search_products, get_inventory):
        def fake_search(**kwargs):
            keyword = (kwargs.get("keywords") or [""])[0]
            return {
                "ok": True,
                "data": [{
                    "skuId": abs(hash(keyword)) % 100000 + 1,
                    "name": f"PB-{keyword}",
                    "brand": "PB",
                    "categoryL1": "스포츠·레저",
                    "categoryL2": "캠핑용품",
                    "priceKrw": 4000,
                    "finalPriceKrw": 4000,
                    "onPromo": False,
                    "discountKrw": 0,
                    "lifecycleStatus": "ACTIVE",
                    "discontinued": False,
                }],
            }

        search_products.side_effect = fake_search
        get_inventory.return_value = {
            "ok": True,
            "data": [{"locationId": "L1", "tierRole": "PICK", "floorNo": 1, "x": 1, "y": 2, "qty": 5}],
        }

        result = budget_bundle.optimize_bundle({"budget_krw": 50000, "purpose": "캠핑", "max_items": 8})
        self.assertTrue(result["ok"])
        self.assertLessEqual(result["total_krw"], 50000)
        self.assertTrue(result["items"])
        self.assertTrue(all(item["inventory_total"] > 0 for item in result["items"]))


if __name__ == "__main__":
    unittest.main()
