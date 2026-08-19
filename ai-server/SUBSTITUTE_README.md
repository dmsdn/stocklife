# 대체상품 추천 (ai-server)

추가 도구: `find_substitutes`

흐름:
1. Claude가 `search_products`로 원래 상품의 `sku_id`를 확정
2. `find_substitutes(original_sku_id)` 호출
3. Spring Backend `/api/products/{skuId}/alternatives/candidates`가 같은 소분류 + 유사 가격대 후보를 반환
4. ai-server가 후보에 상품 지표(`/internal/products/metrics`)를 붙임
5. 로그인 회원이면 반복구매 이력(`/api/orders/frequent` 또는 `/internal/orders/frequent`)과 겹치는 후보를 우선
6. 정렬 우선순위: 개인 반복구매 > 행사 > 실판매가 > 재구매율 > 최근 30일 판매량
7. Claude는 반환된 후보 안에서만 이유를 설명

예시 질문:
- "이 샴푸 품절인데 대신 살 거 추천해줘"
- "신라면 말고 비슷한 라면 추천해줘"
- "이 상품보다 비슷하면서 싼 거 있어?"

Backend의 대체상품 후보 API가 이미 있어서 새 DB/Backend 스키마 변경은 하지 않았다.
`Agent/` 폴더는 수정하지 않았다.
