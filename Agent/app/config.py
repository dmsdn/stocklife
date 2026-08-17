# Agent 판단의 핵 - 설정

# 왜 상수를 전부 여기에 모으는가 : 개입 정책, 루프상한 같은 값은 "튜닝 대상"
# 튜닝 대상이 코드 곳곳에 흩어지면 실험 한번에 파일 다섯개를 고치게 되는 상황 발생
# 설정이 한 파일이면 "이 실험에서 바꾼 것"이 diff한 곳에 모임

from  datetime import datetime


# 관제 시계
# mock 세계의 "지금"을 고정하는 이유: 샘플 데이터의 사건들이 20260813 오후에 몰려있음
# 실제 시계를 사용하면 n+1일 이후에 실행할때, "46일 경과"가 47일이 되어 골든셋 기대 응답이 매일 틀어짐
# 평가의 재현성이 시계 고정에 달려 있음
# 백엔드 연동을 할 때 datetime.now()로 교체
DEMO_NOW = datetime(2026, 8 ,13, 14 ,20, 0)


# 서버
AGENT_PORT = 8001


# SoT 연결
# True면 sot_client가 mock_data를 읽고, False면 백엔드 HTTP를 부름
# 스위치를 sot_client "내부"가 아니라 여기 둔 이유: 루프 및 도구 코드는 mock인지 실물인지 몰라야 함
# 알면 분기가 새어감
USE_MOCK_SOT=True
# SpringBoot. 팀계약 API 8종의 뿌리
BACKEND_BASE_URL = "http://localhost:8080"
# SoT조회가 3초를 넘으면 사용자 발화가 멈춘 것으로 보임 - 짧게 실패 및 "지금 확인 어려움"으로 착지하는게 나음
BACKEND_TIMEOUT_SEC = 3.0


# LLM
LLM_MODEL = "claude-sonnet-5"
LLM_MAX_TOKENS = 1024


# 루프
# LLM --- 도구 왕복 상한. 상한이 없으면 도구 결과가 애매할 때 같은 조회를 반복하며 맴돔
# 실패 시나리오: 품절상품을 get_inventory로 다섯번 재확인
# 상한 도달 시 "지금까지 알아낸 것으로 답하라"로 강제 착지
MAX_TURNS = 6


# 개입 정책
INTERVENTION_MAX_PER_SESSION = 4
INTERVENTION_COOLDOWN_SEC = 90
INTERVENTION_ONCE_PER_TOPIC = True
# ML이 알고 있는 자발형의 감시자 전부가 들어가야함
# 우선순위: 숫자가 클수록 급한 것. 판단 기준: 지금 말하지 않으면 사용자가 무엇을 손해보는가
# 동점을 두지 않음: 동점이면 도착 순서로 갈려서 시나리오 재생 평가가 같은 입력에 다른 개입을 내고, 회귀 테스트가 의미를 잃음
INTERVENTION_PRIORITY = {
    "LOCATION_MOVED": 50,  # 자리가 바뀐 걸 모르면 빈 매대 앞에 선다 — 손해가 가장 크다
    "AVAILABILITY_CHANGE": 40,  # 장면 1: 품절 → 입고 전환
    "HESITATION_HELP": 30,  # 장면 2: 지금 그 진열대 앞에 있을 때만 유효 — 시간 창이 좁다
    "DISCONTINUED_ALT": 25,  # 단종 → 대체. 못 사고 지나가는 손해
    "STORE_ENTRY_BRIEF": 20,  # 장면 3: 진입 직후 1회. 시점이 고정이라 경쟁이 거의 없다
    "REPURCHASE_DUE": 15,  # 이번에 놓쳐도 다음 방문에 다시 온다
    "BUDGET_WARNING": 10,  # 정보성 — 가장 먼저 밀린다
}