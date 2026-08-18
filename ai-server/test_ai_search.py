"""
AI 검색 API에 다양한 질문을 한 번에 던져보고 결과를 요약해서 보여주는 테스트 스크립트.
서버가 켜져 있는 상태에서 실행해야 함 (uvicorn main:app --reload).

새로운 버그 패턴을 발견할 때마다 TEST_QUERIES에 케이스를 추가해나가면 됨.
"""

import requests

BASE_URL = "http://localhost:8000"

# (질문, 결과에 꼭 포함되어야 하는 단어 or None)
TEST_QUERIES = [
    ("고무장갑 어디있어?", "고무장갑"),
    ("가성비 좋은 고무장갑 찾아줘", "고무장갑"),
    ("저렴한 우유 추천해줘", "우유"),
    ("프리미엄 원두커피 있어?", "원두커피"),
    ("10만원 내로 여름휴가 아이템 추천해줘", None),
    ("5만원 안쪽으로 캠핑용품 추천", None),
    ("딸기우유 있나요", "딸기우유"),
    ("초코우유 어디 있어요", "초코우유"),
    ("에어프라이어 사고싶어", "에어프라이어"),
    ("고무장갑 대신 살만한거 뭐있어", "고무장갑"),  # 대체상품 패턴이지만 일반검색으로도 확인
    ("강아지 사료 추천", "사료"),
    ("반팔티 좀 찾아줘", "반팔티"),
]


def run_tests():
    print(f"총 {len(TEST_QUERIES)}개 질문 테스트 시작\n")
    fail_count = 0

    for query, must_contain in TEST_QUERIES:
        try:
            res = requests.post(f"{BASE_URL}/api/ai/search", json={"query": query}, timeout=30)
            data = res.json()
        except Exception as e:
            print(f"❌ [{query}] 요청 자체 실패: {e}")
            fail_count += 1
            continue

        items = data.get("items", [])
        ai_ok = data.get("ai_available", False)

        status = "✅"
        reason = ""

        if res.status_code != 200:
            status, reason = "❌", f"HTTP {res.status_code}"
        elif not items:
            status, reason = "❌", "결과 0개"
        elif must_contain and not any(must_contain in it["name"] for it in items):
            status, reason = "❌", f"'{must_contain}' 포함 상품 없음"

        if status == "❌":
            fail_count += 1

        print(f"{status} [{query}]")
        print(f"    intent_type={data.get('intent', {}).get('intent_type')}, "
              f"keywords={data.get('intent', {}).get('keywords')}, "
              f"결과 {len(items)}개, ai_available={ai_ok}")
        if reason:
            print(f"    → 문제: {reason}")
        if items:
            print(f"    → 첫 결과: {items[0]['name']}")
        print()

    print(f"{'='*40}")
    print(f"총 {len(TEST_QUERIES)}개 중 {len(TEST_QUERIES) - fail_count}개 통과, {fail_count}개 실패")


if __name__ == "__main__":
    run_tests()