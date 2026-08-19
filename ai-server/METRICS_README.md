# 상품 통합 지표 (ai-server 테스트용)

Backend가 원시 구매/행동 데이터를 집계하고 ai-server는 숫자만 받아 Claude에게 전달한다.
최종 Agent/ 폴더는 이번 변경에서 수정하지 않았다.

## Backend 내부 API

`GET /internal/products/metrics?skuIds=101,102`

Header:

`X-Internal-Service-Key: <Backend와 ai-server가 공유하는 키>`

반환 지표:

- `salesQty30d`: 최근 30일 판매 수량
- `salesQtyTotal`: DB에 쌓인 전체 누적 판매 수량
- `cartAddCount30d`: 최근 30일 `SCAN_ADD` 횟수
- `searchCount30d`: 최근 30일 `SEARCH` 횟수 (`sku_id`가 기록된 SEARCH만)
- `viewCount30d`: 최근 30일 `VIEW` 횟수
- `uniqueBuyerCount`: 전체 기간 구매자 수
- `repeatBuyerCount`: 서로 다른 basket에서 2회 이상 산 구매자 수
- `repurchaseRate`: `repeatBuyerCount / uniqueBuyerCount * 100` (%), 소수 둘째 자리

## ai-server Tool

`get_product_metrics`

예시 질문:

- `A샴푸랑 B샴푸 최근 판매량, 조회수, 재구매율까지 비교해줘`
- `이 두 상품 중 실제 반응이 더 좋은 건 뭐야?`

Agent는 먼저 `search_products`로 sku_id를 확정한 다음 `get_product_metrics`를 호출한다.

## 주의

1. `SEARCH` 이벤트의 스키마상 `sku_id`는 NULL 가능이다. 현재 검색어만 기록하는 SEARCH 이벤트는 상품별 `searchCount30d`에 포함되지 않는다. 상품별 검색 횟수를 진짜 지표로 쓰려면 '검색어 이벤트'와 '상품 선택/검색 결과 클릭 이벤트'의 의미를 팀에서 확정한 뒤 sku_id를 기록해야 한다.
2. `cartAddCount30d`는 요구사항의 `SCAN_ADD`를 기준으로 센다. 쇼핑리스트 편집(`LIST_EDIT`)까지 합칠지 여부는 별도 정책 결정이 필요하다.
3. 웹 평판은 Backend 지표가 아니다. Agent가 별도 웹 검색으로 가져와야 하며, 이 API에는 넣지 않았다.
