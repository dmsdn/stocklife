# 예산형 목적 세트 (캠핑) — 임시 ai-server 구현

새 `Agent/` 하네스의 기존 파일을 건드리지 않기 위해 현재 동작 경로인 `ai-server`에 구현했다.
나중에 `Agent/app/tools/compute.py`가 생기면 `budget_bundle.py`의 `optimize_bundle()` / `solve_bundle()`를 옮기기 쉽게 분리해 두었다.

## 지원 문장 예시

- `5만원으로 우리 매장에서 실제로 살 수 있는 캠핑 준비 세트 짜줘`
- `예산 3만원 안에서 캠핑 갈 물건 골라줘`

## 동작

1. Claude가 `optimize_bundle` 도구를 선택한다.
2. `budget_bundle.py`가 캠핑 필요품목별로 Spring Boot 상품 API를 검색한다.
3. 각 후보의 `/api/products/{skuId}/inventory`를 확인해 **재고가 1개 이상인 상품만** 남긴다.
4. Python 솔버가 예산 이하에서 필요도 점수가 가장 높은 조합을 선택한다.
5. 총액과 남은 예산도 Python이 계산해 LLM은 산술하지 않는다.

## 변경 파일

- 신규: `budget_bundle.py`
- 신규: `test_budget_bundle.py`
- 수정: `backend_client.py` (`get_inventory` 추가)
- 수정: `ai_agent_shop.py` (`optimize_bundle` 도구/dispatch/프롬프트)
- 수정: `agent_chat.py` (백엔드가 실제 호출하는 `/agent/chat`에서도 같은 도구 연결)

## 테스트

```powershell
cd ai-server
python -m unittest test_budget_bundle.py
```

실서비스 통합 테스트는 Backend가 8080에서 실행된 상태에서 채팅으로 예시 문장을 입력한다.
