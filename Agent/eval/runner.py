# ============================================================================
# StoreFlow 평가 하네스 — 회귀 러너 (실행계획 A단계 08/17 칸)
# ============================================================================
# [역할] 골든셋의 케이스를 하나씩 하네스에 넣고 PASS/FAIL 표를 찍는다.
#   프롬프트·description·config를 고친 뒤 **반드시** 이걸 돌린다 —
#   "좋아진 것 같다"는 근거가 아니다(prompts.py의 튜닝 규칙).
#
# [왜 HTTP가 아니라 loop.run_chat을 직접 부르는가]
#   서버를 띄우지 않아도 돌아야 한다. 평가가 서버에 묶이면 "잠깐 문구만 바꿔서
#   확인"이 매번 기동 절차를 요구하게 되고, 그러면 결국 안 돌리게 된다.
#   main.py가 하는 가드·정책은 여기서 직접 재현한다(가드 통과 여부를 채점에 포함).
#
# [비용 주의] 케이스 12개 × 턴 2~4회 = LLM 호출 30~50번. 돈과 시간이 든다.
#   그래서 --only 로 한 케이스만 돌리는 문이 있다(문구 하나 실험할 때).
#
# 실행:
#   cd Agent 옆(warehouse-store 루트)에서
#   C:\venvs\2nd_project311\Scripts\python.exe -m eval.runner            # 전체
#   C:\venvs\2nd_project311\Scripts\python.exe -m eval.runner --only scene1_restock
#   C:\venvs\2nd_project311\Scripts\python.exe -m eval.runner --real
#   C:\venvs\2nd_project311\Scripts\python.exe -m eval.runner --real --repeat 3
#     같은 케이스를 3번 돌려 **흔들리는 케이스를 드러낸다**(비용 3배).
#     08-28: 실물을 네 번 돌리니 13·15·14·14 였다 — 단발 판정은 동전던지기다.
#     ⚠ --real 은 백엔드 8080 + 시드 적재 + USE_MOCK_SOT=false 가 선행이다.
#       `python backend_probe.py` 가 "전환 가능"이어야 한다.
# ============================================================================
#
# ─── 개념 사전 — 이 파일에 처음 나오는 개념 3개 (㊽~㊿) ──────────────────────
# (①~㊼: Agent/app 파일들의 사전은 아는 것으로 전제.
#  ㊿ 다음부터는 원문자가 없어 (51) (52) … 로 표기한다.)
#
# ㊽ enumerate(목록) — 돌면서 번호도 같이 받기
#    for i, x in enumerate(cases): 는 x만 주는 for와 달리 (0, 첫항목),
#    (1, 둘째항목)… 처럼 **몇 번째인지**를 함께 준다. 표를 찍을 때 행 번호가
#    필요해서 쓴다. enumerate(cases, 1) 처럼 시작 번호도 정할 수 있다.
#
# ㊾ sys.argv 와 종료 코드
#    sys.argv = 명령줄에서 준 낱말들의 리스트. `python -m eval.runner --only x`면
#    ["...runner.py", "--only", "x"]. 인자 파서 라이브러리(argparse) 없이
#    이 정도는 리스트 검사로 충분하다.
#    sys.exit(1) = 프로그램을 끝내며 OS에 "실패했음(0이 아님)"을 알린다.
#    이 숫자 덕에 CI·스크립트가 "골든셋 깨졌으면 멈춰라"를 만들 수 있다 —
#    사람이 표를 읽지 않아도 기계가 성패를 안다.
#
# ㊿ f-문자열 정렬 지정 — f"{x:<10}"
#    콜론 뒤가 "어떻게 채울까"다: <10 = 왼쪽 정렬로 10칸 확보(모자라면 공백).
#    >5 = 오른쪽 정렬 5칸. 표를 세로로 맞춰 찍을 때 쓴다.
#    (한글은 폭이 2칸이라 완벽히는 안 맞는다 — 우리는 대충 맞으면 된다.)
# ────────────────────────────────────────────────────────────────────────────

import re
import os
import sys

# 08-19: `eval/`을 `Agent/eval/`로 옮기면서 `sys.path.insert(0, "Agent")`를 지웠다.
# 전에는 eval이 Agent의 **형제**라 app이 안 보였고, 경로를 손으로 끼워 넣어야 했다.
#
#   전:  warehouse-store/eval/     ←→  warehouse-store/Agent/app/   (남남)
#   후:  Agent/eval/               ←→  Agent/app/                   (형제)
#
# 형제가 되면 파이썬이 알아서 찾는다 — `Agent/`에서 실행하면 그 폴더가 import
# 경로의 뿌리가 되고, app과 eval이 둘 다 그 아래 있기 때문이다.
#
# **sys.path를 손대는 코드는 없을수록 좋다.** 실행 위치에 따라 되기도 하고 안 되기도
# 해서, "내 컴퓨터에선 되는데" 류의 고장을 만든다. 폴더 배치로 풀 수 있으면 그쪽이 낫다.
# (저장소 경로와 1:1로 맞춘 효과도 있다 — 작업장·저장소 둘 다 `Agent/eval/`이다.)
# ── .env 적재 — 러너도 입구다 (08-20, 첫 실호출에서 발견된 구멍) ─────────────
# 로더(load_env)는 app/env.py에 산다. 처음엔 main.py 안에 있었는데, 러너는
# 설계상 main을 안 거치고 loop를 직접 부르므로 키를 아무도 안 읽어
# "Could not resolve authentication method"로 12케이스가 전멸했다.
# 입구가 둘이면 준비 코드는 입구가 아니라 **공용 자리**에 — 그래서 분리했다.
# guard·loop보다 **먼저** 불러야 한다: action.py가 import되는 순간
# INTERNAL_SERVICE_KEY를 읽으므로, .env가 그 전에 환경에 들어가 있어야 한다.
from app.env import load_env, use_utf8_stdout

# ⚠ 로그보다 먼저 부른다. 윈도우 콘솔은 cp949라 한글 로그의 `—`에서
#   UnicodeEncodeError 가 나고, 그게 광범위 except 안에서 터지면
#   **개입이 통째로 사라지면서 원인도 안 남는다**(08-26 실측 · env.py 주석).
use_utf8_stdout()
load_env()

from app import guard, loop                    # noqa: E402
# `read_as` 가 시킨 것을 발화가 했는지 — 규율을 **내는 코드 옆**에 검사를 둔다
# (`app/read_as_check.py` 머리말 참조). 여기서는 부르기만 한다.
from app import read_as_check                  # noqa: E402
# 발화의 **형식** — 코드가 새어 나온 흔적(괄호 조사·%자리표시·내부 식별자·
# 조사만 남은 자리). 심판 셋과 가드가 안 보는 축이다.
from app import speech_check                   # noqa: E402
from app.tools import infer                    # noqa: E402

# ── 출하물 적재 — 러너도 입구다 (08-27, 실물 골든셋 첫 실행에서 발견) ────────
# [무엇이 문제였나] 서버는 main.py 의 lifespan 이 `infer.load_all()` 을 부르는데,
#   러너는 **설계상 main 을 안 거치고 loop 를 직접 부른다**(서버 없이 채점하려고).
#   그래서 추론 도구 5종이 전부 "model_not_loaded" 로 떨어진 채 채점됐다 —
#   발화가 "소비주기 모델이 서버에서 로드가 안 돼서"라고 말하는데도 **케이스는
#   PASS 였다**(must_not_include 에 안 걸려서). 자산이 통째로 빠진 채 13/15 를
#   보고 "잘 된다"고 읽을 뻔했다.
# [08-20 과 같은 계열이다] 그때는 `.env` 를 러너가 안 읽어 12케이스가 전멸했고,
#   그 교훈으로 `env.load_env()` 를 두 입구가 명시 호출하게 했다. **입구가 둘이면
#   준비 코드는 입구마다 명시적으로 부른다** — 이번엔 출하물이 그 대상이었다.
# [사진 인코더는 안 올린다] 3.5GB 이고 골든셋에 사진 케이스가 없다. 필요해지면
#   `with_photo_encoder=True` 로 켠다(config.LOAD_PHOTO_ENCODER 와 같은 판단).
_loaded = infer.load_all()
if not _loaded:
    print("⚠ 출하물이 하나도 없습니다 — 추론 케이스가 전부 '준비 안 됨'으로 채점됩니다.")
else:
    print("출하물 " + " · ".join(f"{k}={v}" for k, v in _loaded.items()))
# ── 검색어 색인 적재 — **러너도 입구다** (08-29, 세 번째 같은 병) ───────────
# [무엇이 있었나] `real_typo_corrected` 케이스가 **재료 없음으로 조용히 SKIP**
#   됐다. 오타 후보정은 `searchterm` 색인이 있어야 도는데 러너가 그것을 안
#   올렸다. 그러면 `_search_products` 가 `corrected_from` 을 못 붙이고, 재료를
#   찾는 fixtures 가 None 을 내고, 케이스가 목록에서 빠진다.
#
# ⚠ **SKIP 은 초록이다.** FAIL 이면 눈에 띄는데 SKIP 은 "세계에 재료가 없구나"로
#   읽힌다 — 실제로는 **우리가 색인을 안 올린 것**이고, 그 둘은 고칠 곳이 다르다.
#
# [08-20 .env · 08-27 출하물 과 같은 계열이다] 러너는 설계상 `main.py` 를 안
#   거치므로 lifespan 이 하는 준비를 **입구마다 명시적으로** 다시 해야 한다.
#   같은 병이 오늘 하루에 셋이었다(`eval/read_as_coverage.py` 도 같은 자리).
try:
    from app import searchterm                 # noqa: E402
    searchterm.load()
except Exception as e:                         # noqa: BLE001
    print("⚠ 검색어 색인 적재 실패 — 오타 후보정 케이스가 SKIP 된다: %r" % e)

from eval.golden_set import GOLDEN             # noqa: E402


def _is_subsequence(expected: list, actual: list) -> bool:
    """expected가 actual의 **부분 수열**인가 — 순서는 지키되 사이 끼어듦은 허용.

    예) expected=[A, C] 는 actual=[A, B, C]에서 참, [C, A]에서는 거짓.
    왜 완전 일치가 아닌가: LLM이 도구를 **더** 부르는 것은 잘못이 아니다
    (재고를 보고 나서 상세를 한 번 더 확인하는 식). 우리가 지키려는 것은
    "필요한 것을 필요한 순서로 불렀는가"이지 "정확히 그것만 불렀는가"가 아니다.
    후자로 채점하면 프롬프트를 조금만 고쳐도 전 케이스가 흔들린다(취약한 테스트).

    [알고리즘] expected 쪽에 손가락(i) 하나를 두고 actual을 한 번 훑는다.
    같은 것을 만나면 손가락을 오른쪽으로. 끝까지 갔으면(전부 만났으면) 참.
    """
    i = 0
    for name in actual:
        if i < len(expected) and name == expected[i]:
            i += 1
    return i == len(expected)


def _check_includes(reply: str, items: list) -> list:
    """must_include 채점. 튜플이면 '그중 하나면 됨'(동의어 묶음). 실패 목록을 돌려준다.

    ⚠ **`re:` 를 앞에 붙이면 정규식이다** (08-30 신설).

    [왜 필요했나] `real_cold_start_repurchase` 가 이렇게 떨어졌다.

        발화:  "구매하신 이력**은** 없으시네요"
        필수:  "이력**이** 없"          ← 조사 하나 차이

    모델은 옳게 말했다. 조사는 문맥에 따라 바뀌는데(`이/은`, `를/을`,
    `과/와`) 부분문자열 검사는 그걸 못 넘는다. 낱말을 하나씩 늘리면
    두더지잡기가 되고, **빠뜨린 변형이 남는 한 그 검사는 「맞은 것」이
    아니라 「안 걸린 것」이다.**

    > `guard.py` 의 `stockout_denial` 머리말이 08-27 에 이미 적었다 —
    > *"조사 하나가 PASS/FAIL 을 갈랐다면 그 검사는 맞은 게 아니라
    > 안 걸린 것이다."* 같은 병을 채점표 쪽에서 다시 만났다.

    [왜 전부를 정규식으로 안 바꾸나] 대부분의 필수 요소는 상품명·가격처럼
    **글자 그대로**여야 한다. 정규식으로 열면 `.` `(` 같은 글자가 조용히
    메타문자가 되어 **의도보다 넓게 맞는다.** 필요한 칸만 `re:` 로 연다.
    """
    missing = []
    for item in items:
        # isinstance로 "동의어 묶음인가 단일 문자열인가"를 가른다(개념 ㊱).
        alts = item if isinstance(item, tuple) else (item,)
        ok = False
        for a in alts:
            if isinstance(a, str) and a.startswith("re:"):
                ok = ok or bool(re.search(a[3:], reply))
            else:
                ok = ok or (a in reply)
        if not ok:
            missing.append(" | ".join(alts))
    return missing


class ChatContractError(RuntimeError):
    """`chat=` 로 물린 발화기가 계약을 안 지켰다. **케이스 실패가 아니라 환경 오류**다.

    러너는 케이스 하나가 터져도 나머지를 계속 돈다(main 의 try/except). 그 규율은
    케이스의 실패에 맞는 것이지 **발화기 자체가 잘못 물린 경우**에는 안 맞는다 —
    19케이스 × 3회 = 57번 같은 오류를 내고 "0/57" 이라는 보고서가 나온다.
    08-28 의 `anthropic` ImportError 45번이 그 모양이었다(preflight 머리말 참조).
    그래서 이 예외만은 **위로 뚫고 나간다.**
    """


# `run_one` 이 발화기에서 실제로 읽는 것 — 이 셋이 전부다.
#   reply   : 채점 ②③(must_include·must_not_include)과 가드의 입력
#   trace   : `[{"tools": [이름, …]}, …]` — 채점 ①(도구 시퀀스)의 재료
#   ledgers : `{"sot": [...], "compute": [...], "infer": [...], "web": [...]}`
#             — 채점 ④ `guard.check(reply, ledgers)` 의 대조 원장
# ⚠ `run_chat` 은 `actions` · `session_id` 도 돌려주지만 **채점은 안 본다.**
#   넓은 계약을 요구하면 래퍼가 안 쓰이는 칸을 지어내게 되고, 지어낸 칸은
#   언젠가 채점에 쓰이면서 조용히 거짓을 통과시킨다. 좁게 못박는다.
_CHAT_KEYS = ("reply", "trace", "ledgers")


def _validate_chat_result(result, who: str) -> None:
    """발화기의 반환을 **첫 케이스에서** 검사한다 — 늦게 터지면 자가 헛것이 된다.

    [왜 빈 칸을 허용하지 않나] `trace=[]` 면 도구 시퀀스가 늘 실패하고,
    `ledgers={}` 면 발화 속 모든 수치가 `unsupported` 로 걸린다. 둘 다 **빨간불로
    끝나서** 눈에는 띈다. 문제는 그 빨간불이 *모델이 틀렸다*로 읽힌다는 것이다 —
    실제로는 **래퍼가 칸을 안 채운 것**이고, 그 둘은 고칠 곳이 완전히 다르다.
    """
    if not isinstance(result, dict):
        raise ChatContractError(
            f"{who} 가 dict 가 아닌 {type(result).__name__} 을 돌려줬다.")
    missing = [k for k in _CHAT_KEYS if k not in result]
    if missing:
        raise ChatContractError(
            f"{who} 의 반환에 {missing} 가 없다. 필요한 칸: {list(_CHAT_KEYS)} "
            "(reply=str · trace=[{'tools': [이름]}] · ledgers={출처: [원장]})")
    if not isinstance(result["trace"], list):
        raise ChatContractError(f"{who}: trace 는 리스트여야 한다 "
                                f"(받은 것 {type(result['trace']).__name__}).")
    for turn in result["trace"]:
        if not isinstance(turn, dict) or "tools" not in turn:
            raise ChatContractError(
                f"{who}: trace 의 각 항목은 'tools' 를 가진 dict 여야 한다 "
                f"(받은 것 {turn!r}).")
    if not isinstance(result["ledgers"], dict):
        raise ChatContractError(
            f"{who}: ledgers 는 dict 여야 한다 "
            f"(받은 것 {type(result['ledgers']).__name__}). "
            "빈 dict 는 허용되지만 그러면 발화 속 모든 수치가 unsupported 로 걸린다 "
            "— 모델이 틀린 게 아니라 원장을 안 실은 것이다.")


# ── 원인 라벨 — FAIL 마다 「어느 층이 틀렸나」를 하나 붙인다 (09-02 신설) ────
#
# [왜] 축 일곱이 내는 FAIL 은 자유 문자열이라, 판이 끝나면 사람이 읽고
#   **손으로 진단**했다. B회신22 §5 의 D5 처방 다섯이 전부 그렇게 나왔다.
#   그 진단은 매 판 다시 해야 하고, 사람마다 다르게 한다.
#
# [어디서 왔나] TRIAGE(NLP 강의 T3 · "Diagnose before you retry")의 요지 —
#   실패를 **유형화**해야 맞는 수리를 고를 수 있다. 그쪽은 추론 시점에
#   승급 단계를 고르고, 우리는 **학습 데이터 층**에서 재료를 고친다.
#   유형이 있어야 「지원 0/28 인데 PASS」같은 것을 미리 분류할 수 있다.
#
# [원리] 원인은 **축에서 기계적으로** 나온다 — 어느 검사가 걸렸는가가 곧
#   어느 층이 틀렸는가다. 새 판단을 넣는 게 아니라 있던 판단에 이름을 단다.
#
#   cause        어느 축                      뜻
#   ─────────    ─────────────────────────    ──────────────────────────────
#   routing      ① 시퀀스 · ①-b 금지 도구     부를 도구를 틀렸다
#   source       ①-c 웹 · 가드 web_only        매장 사실을 웹에서 가져왔다
#   unsupported  가드 unsupported/contradicts  원장에 없는 값, 또는 반대 뜻
#   content      ② 필수 요소                  있어야 할 내용이 없다
#   discipline   ③ 금지 요소 · ⑤ read_as      결과가 시킨 규율을 안 지켰다
#   format       ⑥ 발화 형식 · non_korean     사람이 안 쓰는 꼴
#   crash        실행 오류                    채점까지 못 갔다 — 환경
#
# ⚠ 이 라벨은 **증상 층**이다. 같은 `content` 라도 「재료에 그 행동이 0건」과
#   「재료는 14건인데 규율 문구가 약함」은 다른 병이고, 그 갈림은 B 의
#   명세 칸 지원량 표와 붙여야 난다. 그래서 처방표는 「먼저 볼 곳」까지만 적는다.
REPAIR = {
    "routing":     "definitions 설명문의 경계 문장 → 명세 칸의 시퀀스(routing_audit) "
                   "→ 그 문형 칸의 재료 수",
    "source":      "prompts 의 웹 경계 → 명세에 웹 칸이 없는지",
    "unsupported": "도구를 안 부르고 답한 것이면 routing 과 같이 본다 → "
                   "명세의 unsupported 칸",
    "content":     "**재료 지원량 먼저**(그 행동이 몇 건 실려 있나) → 0 이면 재료, "
                   "있으면 read_as·must_include 문구",
    "discipline":  "**재료 지원량 먼저** → read_as 문구 → 그 갈래를 밟는 칸 수",
    "format":      "distill_text 템플릿 · speech_check 규칙",
    "crash":       "환경(인터프리터·백엔드·시드) — 코드가 아니다",
}


def run_one(case: dict, chat=None) -> dict:
    """케이스 하나를 하네스에 넣고 채점한다. 반환: {ok, fails[], causes[], reply, tools}

    `causes[i]` 는 `fails[i]` 의 원인 라벨이다(위 REPAIR 의 키). 같은 길이,
    같은 순서 — 소비처(`scenario_runner` 등)는 `fails` 문자열만 읽어도 된다.

    [`chat=` 이음매 — 08-29 B 요청 ①] 발화를 만드는 함수를 갈아끼운다.
    기본값은 지금 그대로 `loop.run_chat`(Claude 하네스)이고, 로컬 모델 래퍼를
    물리면 **같은 19케이스를 같은 자로** 잰다.

    ⚠ **왜 자를 하나로 두는가**: 채점 규칙을 저쪽에 복제하면 자가 둘이 되고
    언젠가 갈라진다. 08-29 에 `golden_set.GOLDEN` 에 위치 케이스를 넣고
    `golden_real.py` 로 돌린 일이 그것이다 — *자를 고쳤는데 다른 자를 고쳤다.*
    """
    chat = chat or loop.run_chat
    # ⚠ `position` 을 넘긴다(08-28 신설). 안 넘기면 앵커가 늘 없어서
    #   `get_position` 이 언제나 `no_scan_anchor` 를 내고, **신뢰 등급을
    #   재는 케이스가 전부 같은 갈래로 떨어진다.**
    #   골든셋이 위치를 못 재던 것이 08-28 가드 결함이 45/45 를 통과한
    #   이유였다 — 자가 없으면 결함이 눈금 사이로 지나간다.
    # ── 고장 주입 — **실패했을 때의 발화**를 재는 유일한 길 (08-30) ─────────
    # [왜 필요한가] 정본(`prompts.py`)이 이렇게 못박는다:
    #   *"도구를 불렀는데 실패한 경우는 범위 밖이 아니라 **지금 안 되는 것**
    #     입니다. '제 역할이 아니라서'로 포장하지 말고 '지금 확인이 어렵네요'
    #     라고 말하세요. **손님이 잠시 뒤 다시 물어볼 수 있어야 합니다.**"*
    #   둘을 뭉치면 손님이 **그 질문을 영영 안 한다** — 5분 뒤면 됐을 것인데도.
    #
    # [왜 주입인가] 08-30 실측: 검색에 나온 상품 136건 전부 `get_inventory` 가
    #   성공했다. **세계가 건강해서 이 갈래를 못 밟는다.** 백엔드를 내리면
    #   전 케이스가 같이 죽어 아무것도 못 잰다.
    #
    # ⚠ 이 파일의 설계 원칙(살아 있는 세계를 읽는다)에 대한 **의도된 예외**다.
    #   케이스에 명시적으로 적을 때만 돈다.
    _fault = case.get("inject_fault")
    _orig_dispatch = None
    if _fault:
        _fname, _ferr = _fault
        _orig_dispatch = loop._dispatch

        def _faulty(name, tool_input, _o=_orig_dispatch, _n=_fname, _e=_ferr):
            if name == _n:
                return dict(_e), "sot"
            return _o(name, tool_input)
        loop._dispatch = _faulty
    try:
        result = chat(case["q"],
                      consumer_id=case.get("consumer_id"),
                      session_id=case.get("session_id"),
                      position=case.get("position"),
                      history=[])
    finally:
        if _orig_dispatch is not None:
            loop._dispatch = _orig_dispatch     # ⚠ 반드시 되돌린다 — 안 그러면
                                                #   **다음 케이스까지 고장 난다**
    _validate_chat_result(result, getattr(chat, "__name__", repr(chat)))
    reply = result["reply"] or ""

    # 트레이스에서 도구 이름만 시간순으로 편다.
    # [t for turn in ... for t in ...] = 이중 for 컴프리헨션(평평하게 펴기) —
    # 바깥 for가 먼저, 안쪽 for가 나중. 중첩 리스트를 한 줄 리스트로 만든다.
    tools = [t for turn in result["trace"] for t in turn["tools"]]

    fails, causes = [], []

    def _fail(cause: str, msg: str) -> None:
        # 두 목록을 **한 곳에서** 같이 늘린다 — 따로 append 하면 언젠가 길이가
        # 어긋나고, 그러면 라벨이 옆 칸의 실패에 붙는다.
        assert cause in REPAIR, cause
        fails.append(msg)
        causes.append(cause)

    # ① 도구 시퀀스
    if not _is_subsequence(case["expect_tools"], tools):
        _fail("routing", f"도구 시퀀스: 기대 {case['expect_tools']} / 실제 {tools}")

    # ①-b **부르면 안 되는 도구** (08-30 신설)
    #
    # [왜 필요한가] ①은 "필요한 것을 순서대로 불렀나"만 본다 — 부분 수열이라
    #   **더 부르는 것은 잘못이 아니다**로 설계했다(도구를 하나 더 확인하는
    #   것은 정상이다). 그런데 규율 중에는 **부르면 안 되는 것**이 있다.
    #
    #     "재고·위치·가격·보충 시각은 절대 웹에서 가져오지 않는다" (prompts.py)
    #     "'뭐가 더 싸요?' 는 compare_products 다 — compare_unit_price 가 아니다"
    #
    #   이걸 ②③(문구)으로는 못 잡는다. 발화가 그럴듯하면 통과하는데, **어디서
    #   가져왔는지**가 틀린 것이다. 08-28 에 골든셋이 흔들린 자리도 이 축이었다
    #   (`find_substitutes` 대신 손으로 재구현).
    #
    # ⚠ 기본값은 빈 목록이다 — 기존 케이스는 하나도 안 바뀐다.
    for _f in case.get("forbid_tools") or []:
        if _f in tools:
            _fail("routing", f"부르면 안 되는 도구: {_f} (실제 {tools})")

    # ①-c **웹을 쓰면 안 되는 질문** (08-30)
    #
    # ⚠ `forbid_tools: ["web_search"]` 로는 **영영 못 잡는다.** 웹 검색은
    #   앤트로픽이 실행하는 서버 사이드 도구라, `loop.py:393` 이
    #   `SERVER_TOOL_NAMES` 를 만나면 `continue` 로 건너뛴다 —
    #   `trace[].tools` 에 **애초에 안 실린다.**
    #   그 상태로 케이스를 써 두면 **늘 초록인 자**가 된다(08-28 위치 케이스와
    #   같은 병 · 트러블슈팅 `재는_자가…` ①).
    #
    # [신호는 어디 있나] 웹 결과는 `ledgers["web"]` 에 쌓인다
    #   (`_harvest_web_results`). **원장이 비었나**를 보면 된다 —
    #   도구 목록이 아니라 **출처 장부**가 답을 갖고 있다.
    if case.get("forbid_web") and (result.get("ledgers") or {}).get("web"):
        _fail("source", "웹을 썼다: 매장 사실(재고·위치·가격·보충)은 도구의 몫이다 "
                        f"(웹 원장 {len(result['ledgers']['web'])}건)")

    # ② 필수 요소
    for m in _check_includes(reply, case["must_include"]):
        _fail("content", f"필수 요소 없음: {m}")

    # ③ 금지 요소 — 정규식이다(품절, 반올림 가격 패턴 등)
    for pat in case["must_not_include"]:
        hit = re.search(pat, reply)
        if hit:
            _fail("discipline", f"금지 요소 발견: '{hit.group(0)}' (패턴 {pat})")

    # ④ 가드 — main.py를 안 거치므로 여기서 직접 검사에 포함한다.
    #    가드 위반은 그 자체로 실패다(서빙이었다면 재생성·차단됐을 발화).
    verdict = guard.check(reply, result["ledgers"])
    if not verdict["ok"]:
        for v in verdict["violations"]:
            # 가드 사유가 곧 층이다 — 출처 문제와 지어낸 값은 고칠 곳이 다르다.
            _c = {"web_only": "source", "non_korean_leak": "format"}.get(
                v["reason"], "unsupported")
            _fail(_c, f"가드 위반: {v['reason']} ({v.get('text', '')})")

    # ⑤ `read_as` — **결과가 시킨 것을 발화가 했나** (08-29 신설)
    #
    # [왜 새 축인가] ㉠ 축약으로 규율을 도구 정의에서 **결과(`read_as`)로
    #   옮기고 있다. 짧아지면서 발화에 가까워지는 좋은 거래인데, 옮긴 규율이
    #   지켜지는지는 **아무도 안 보고 있었다.**
    #   ①도구시퀀스는 라우팅을, ②③은 케이스가 손으로 적은 문구를, ④가드는
    #   지어낸 숫자를 본다. **결과에 실린 지시**는 넷 다 안 본다.
    #
    # [왜 케이스에 안 적고 여기서 보나] `must_include` 에 적으면 도구 결과를
    #   내는 코드가 바뀔 때 **케이스를 같이 고쳐야 한다** — 안 고치면 조용히
    #   낡는다. `read_as_check` 는 결과 자체에서 요구 사항을 뽑으므로
    #   케이스가 몰라도 되고, 새 도구가 늘어도 자동으로 따라온다.
    #
    # ⚠ `unmechanized`(문자열로 안 떨어지는 규율)는 위반으로 세지 않는다.
    #   못 잡는 것을 위반으로 세면 멀쩡한 케이스가 빨간불이 되고, 그러면
    #   이 검사를 아무도 안 본다.
    for _src, _rows in (result.get("ledgers") or {}).items():
        if _src == "web":
            continue                       # 웹은 우리 도구가 아니라 read_as 가 없다
        for _e in _rows or []:
            if not isinstance(_e, dict) or "tool" not in _e:
                continue
            for _v in read_as_check.violations(_e["tool"], _e.get("result") or {},
                                               reply):
                _fail("discipline",
                    "read_as 위반: %s 가 시킨 것을 발화가 안 했다 — %s"
                    % (_v["tool"],
                       (f"'{_v['want']}' 가 발화에 없다" if _v["rule"] == "read_as_must"
                        else f"금지된 '{_v['hit']}' 를 말했다")))

    # ⑥ 발화 **형식** — 값도 시퀀스도 옳은데 문장이 깨진 것 (08-30 신설)
    #
    # [왜] 08-28 이후 같은 부류가 **네 번** 났다 — `"98%%"` · `"면은(는)"`
    #   (2,195건 중 840건) · `count_roll` · `"오시면 을 받아보실"`.
    #   넷 다 심판 셋과 가드를 통과한다. **형식은 아무도 안 봤다.**
    #   B 가 08-30 에 넷째로 물렸고, 그때 킬링 장면 1 이 죽었다.
    #
    # ⚠ 이것은 말투 검사가 아니다 — 어색한 문장은 안 잡는다. 잡는 것은
    #   **사람이 쓰지 않는 꼴**, 즉 코드가 새어 나온 흔적뿐이다.
    for _d in speech_check.defects(reply):
        _fail("format", "발화 형식: %s — '%s' (%s)"
                     % (_d["rule"], _d["hit"], _d["why"]))

    # q를 되돌려주는 이유: 출력 표에서 질문과 발화를 나란히 보기 위해서다.
    # (08-20 개조 — 튜닝 국면에는 PASS의 발화도 눈으로 봐야 한다)
    return {"ok": not fails, "fails": fails, "causes": causes, "reply": reply,
            "tools": tools, "q": case["q"]}


def preflight() -> None:
    """**케이스를 하나라도 돌리기 전에** 환경을 확인한다.

    [무엇이 있었나 — 08-28] `python -m eval.runner --real --repeat 3` 을 venv 가
      아닌 파이썬으로 돌렸다. `anthropic` 이 없어 15케이스 × 3회 = **45번 같은
      ImportError** 를 내고, 마지막에 *"0/45 · 항상 실패 15개"* 라는 보고서가
      나왔다. 코드가 통째로 무너진 것처럼 보이는데 실은 **인터프리터를 잘못
      고른 것**이었다.

    [왜 이게 나쁜가] 러너는 케이스 하나가 터져도 나머지를 계속 돈다 — 전체
      그림이 목적이라 그렇게 만들었다. 그 규율은 **케이스의 실패**에 맞는
      것이지 **환경의 부재**에는 안 맞는다. 환경이 없으면 45번 돌려도 45번
      같은 답이고, 그동안 진짜 신호는 하나도 안 나온다.
      `--repeat` 를 붙이기 전에는 15번이라 눈에 덜 띄었다 — 반복이 이 결함을
      드러냈다.

    [무엇을 보나] LLM 을 부를 수 있는가만. 백엔드·시드는 여기서 안 본다 —
      그건 케이스마다 다르고, 없으면 그 케이스만 FAIL 하는 게 맞다.
    """
    try:
        import anthropic                                    # noqa: F401
    except ImportError:
        print("❌ `anthropic` 이 없다 — 이 파이썬에는 하네스 의존성이 안 깔려 있다.")
        print(f"   지금 인터프리터: {sys.executable}")
        print("   프로젝트 venv 로 돌려라:")
        print("     C:\\venvs\\2nd_project311\\Scripts\\python.exe -m eval.runner --real")
        print("   (케이스를 돌리기 전에 멈춘다 — 안 그러면 같은 오류가 케이스×회차")
        print("    만큼 반복돼 '전부 실패' 처럼 보인다. 08-28 에 45번 그랬다.)")
        sys.exit(3)
    if not os.environ.get("ANTHROPIC_API_KEY"):
        print("❌ ANTHROPIC_API_KEY 가 없다. `.env` 를 확인하라 —")
        print("   `Agent/.env` 가 있어야 하고, load_env() 가 그것을 읽는다.")
        sys.exit(3)


def _load_chat(spec: str):
    """`--chat 모듈:함수` 를 실제 함수로 바꾼다 (예: `local_eval.wrap:chat`).

    [왜 CLI 로도 여는가] `run_one` 만 열어 두면 저쪽이 케이스 순회·반복·집계표를
    다시 짜야 하고, 그 순간 **자가 둘이 된다.** `--repeat 3` 과 흔들림 집계까지
    같은 코드로 도는 것이 이 이음매의 목적이다.
    """
    if ":" not in spec:
        print(f"❌ --chat 은 `모듈:함수` 꼴이어야 한다 (받은 것: {spec})")
        sys.exit(3)
    mod_name, fn_name = spec.split(":", 1)
    import importlib
    try:
        mod = importlib.import_module(mod_name)
    except ImportError as e:
        print(f"❌ --chat 모듈 '{mod_name}' 을 못 읽었다: {e}")
        print(f"   지금 인터프리터: {sys.executable}")
        print(f"   sys.path[0]={sys.path[0]}")
        sys.exit(3)
    fn = getattr(mod, fn_name, None)
    if not callable(fn):
        print(f"❌ '{mod_name}' 에 호출 가능한 '{fn_name}' 이 없다.")
        sys.exit(3)
    return fn


def main() -> None:
    # ⚠ `--chat` 이 있으면 preflight 를 건너뛴다. preflight 가 보는 것은
    #   **Claude 를 부를 수 있는가**(`anthropic` · API 키)인데, 로컬 모델로
    #   돌릴 때 그건 있어야 할 이유가 없다. 안 가르면 로컬 판이 키가 없다는
    #   이유로 sys.exit(3) 한다 — 있지도 않은 조건을 요구하는 문지기다.
    chat = None
    if "--chat" in sys.argv:
        chat = _load_chat(sys.argv[sys.argv.index("--chat") + 1])
    else:
        preflight()

    # --only <id> : 그 케이스만 (문구 하나 실험할 때 전체 비용을 안 태우게)
    only = None
    if "--only" in sys.argv:                            # ㊾
        only = sys.argv[sys.argv.index("--only") + 1]

    # --real : 실물 골든셋(백엔드·DB 필요). 없으면 mock 판.
    #   두 벌을 나란히 두는 이유는 golden_real.py 머리말 참조 —
    #   mock 은 백엔드 없이 도는 유일한 검증이라 버리지 않는다.
    real = "--real" in sys.argv
    # --repeat N : 같은 케이스를 N 번 돌려 **흔들림을 드러낸다.**
    #   비용이 N 배다. 기본 1 — 평소에는 회귀만 보고, 튜닝 뒤 판정할 때만 올린다.
    repeat = 1
    if "--repeat" in sys.argv:
        repeat = max(1, int(sys.argv[sys.argv.index("--repeat") + 1]))
    skipped = []
    # ⚠ 가드는 **양쪽으로** 걸어야 한다(08-27). 전에는 `--real` 인데 mock 인
    #   경우만 막았는데, 실연동 전환으로 .env 가 false 가 된 뒤로는 **반대쪽이
    #   더 자주** 터진다: mock 판을 돌렸는데 도구가 실물 백엔드를 두드리고,
    #   백엔드가 없으면 15케이스가 전부 "지금 조회가 안 되네요"로 FAIL 한다.
    #   골든셋이 죽은 게 아니라 **백엔드를 안 켠 것**인데, 출력만 보면 구분이
    #   안 돼서 코드를 뒤지게 된다.
    from app import config, sot_client
    if not real and not config.USE_MOCK_SOT:
        print("⚠ mock 골든셋인데 USE_MOCK_SOT=false 다 — 도구가 실물 백엔드를 부른다.\n"
              "   백엔드를 켠 상태면 `--real` 로 실물 골든셋을 돌리는 게 맞고,\n"
              "   백엔드 없이 검증만 하려면 .env 의 USE_MOCK_SOT 를 true 로.")
        sys.exit(2)
    if real:
        if config.USE_MOCK_SOT:
            print("⚠ --real 인데 USE_MOCK_SOT=true 다. .env 를 고치고 다시.")
            sys.exit(2)
        from eval import golden_real
        # 세계 상태(재고·큐·이력·인기)는 **실행 시각에** 뽑는다. 케이스에 박으면
        # DES 를 다시 돌리는 날(설계 §10 세계 버전 대조) 통째로 죽는다.
        fx = golden_real.fixtures(sot_client)
        all_cases = golden_real.build(fx)
        # 재료가 없는 케이스는 FAIL 이 아니라 SKIP 이다 — 세계 탓이지 코드 탓이 아니다.
        skipped = [c["id"] for c in all_cases
                   if c.get("needs") and not fx.get(c["needs"])]
        pool = [c for c in all_cases if c["id"] not in skipped]
    else:
        pool = GOLDEN

    cases = [c for c in pool if only is None or c["id"] == only]
    if not cases:
        print(f"해당 id 없음: {only}")
        sys.exit(2)

    print(f"골든셋 {'실물' if real else 'mock'} — {len(cases)}케이스 실행"
          + (f" (재료 없어 SKIP {len(skipped)}: {', '.join(skipped)})" if skipped else "")
          + "\n")
    n_pass = 0
    crashes = []                               # 채점 실패가 아니라 **터진** 것
    tally = {c["id"]: [] for c in cases}       # id -> [ok, ok, …]  (반복용)
    # 원인 집계 — 전체와 케이스별. Counter 는 dict 의 하위형으로, 없는 키를
    # 세면 0 에서 시작한다(`+= 1` 에 KeyError 가 안 난다).
    from collections import Counter
    cause_all = Counter()
    cause_by_case = {c["id"]: Counter() for c in cases}
    # ── ② 도구 시퀀스 수집 (09-02) — PASS 안정성과 **다른 축**이다 ──────────
    # tally 는 「붙었나」를 모으고, 이것은 「어느 길로 갔나」를 모은다.
    # 같은 케이스가 3판 다 PASS 인데 매판 다른 도구 순서로 갔다면, 그 PASS 는
    # 규율이 아니라 **아직 안 걸린 것**이다 — B회신22 의 「지원 0 인데 PASS」
    # (D3 에서 붙고 D4 에서 뒤집힘)의 실시간 짝. J2 심판도 이걸 원리적으로
    # 못 본다(실행된 호출만 재검하므로). tuple 로 바꿔 담는 이유: set 에 넣어
    # 종수를 세려면 해시 가능해야 한다(리스트는 안 된다).
    seqs = {c["id"]: [] for c in cases}
    for rep_i in range(1, repeat + 1):
        if repeat > 1:
            print(f"── {rep_i}/{repeat} 회차 " + "─" * 46)
        for i, case in enumerate(cases, 1):                 # ㊽
            try:
                r = run_one(case, chat=chat)
            except ChatContractError:
                # 발화기가 잘못 물렸다 — 케이스 실패가 아니다. **멈춘다.**
                # 삼키면 57번 같은 오류를 내고 "0/57" 이 나온다(preflight 머리말).
                raise
            except Exception as e:
                # 러너는 케이스 하나가 터져도 나머지를 계속 돈다 — 전체 그림이 목적.
                r = {"ok": False, "fails": [f"실행 오류: {type(e).__name__}: {e}"],
                     "causes": ["crash"], "reply": "", "tools": [], "crashed": True}
                crashes.append(f"{case['id']}: {type(e).__name__}")
            mark = "PASS" if r["ok"] else "FAIL"
            tally[case["id"]].append(bool(r["ok"]))
            seqs[case["id"]].append(tuple(r.get("tools") or ()))
            if r["ok"]:
                n_pass += 1
            print(f"{i:>2}. {mark}  {case['id']:<22} {case['why'][:44]}")   # ㊿
            for f, c in zip(r["fails"], r.get("causes") or []):
                print(f"        └ [{c}] {f}")
                cause_all[c] += 1
                cause_by_case[case["id"]][c] += 1
            # 08-20 개조: FAIL만이 아니라 **모든** 케이스의 질문·발화를 찍는다.
            # 채점(PASS/FAIL)은 판단의 표본일 뿐이고 말투·품질은 채점 밖에 있다 —
            # 튜닝 국면에는 통과한 답이 어떻게 좋아지는지도 눈으로 봐야 한다.
            if r["reply"]:
                print(f"        └ 질문: {r['q'][:80]}")
                print(f"        └ 발화: {r['reply'][:80]}")

    total = len(cases) * repeat
    if repeat > 1:
        # ── 흔들림 보고 ────────────────────────────────────────────────────
        # **이게 --repeat 의 요점이다.** 한 번 돌려 14/15 를 보면 "한 케이스가
        # 깨졌다"로 읽히는데, 실제로는 그 케이스가 **반쯤 깨진** 것일 수 있다.
        # 08-28 에 실물 골든셋을 네 번 돌려 13·15·14·14 가 나왔다 — 같은 코드
        # 같은 세계에서. 단발 결과로 "고쳤다/깨졌다"를 판정하면 그 판정 자체가
        # 동전던지기다(파일명세의 「시드 3개 · 단일 시드 숫자는 적지 않는다」).
        flaky = {k: v for k, v in tally.items() if 0 < sum(v) < len(v)}
        always = [k for k, v in tally.items() if not any(v)]
        print(f"\n■ 케이스별 통과율 ({repeat}회)")
        for k, v in tally.items():
            r = sum(v) / len(v)
            bar = "".join("●" if x else "○" for x in v)
            tag = ("  ← 흔들림" if k in flaky else
                   "  ← 항상 실패" if k in always else "")
            # 시퀀스 종수 — 1종이 정상이다. 2종 이상이면 모델이 매판 길을
            # 새로 고르고 있다는 뜻이라, PASS 여도 여기 표시가 남는다.
            _ns = len(set(seqs[k]))
            if _ns > 1:
                tag += f"  · 시퀀스 {_ns}종"
            # 흔들리거나 늘 깨지는 케이스는 **어느 층에서** 그런지를 같이 찍는다.
            # 같은 「흔들림」이라도 routing 이면 설명문, content 면 재료다.
            if cause_by_case[k]:
                top = ", ".join(f"{c}×{n}" for c, n in cause_by_case[k].most_common(2))
                tag += f"  ({top})"
            print(f"  {r:5.0%}  {bar}  {k}{tag}")
        if flaky:
            print(f"\n  ⚠ **흔들리는 케이스 {len(flaky)}개** — "
                  f"{', '.join(flaky)}")
            print("     같은 입력에 붙었다 떨어진다. 원인은 대개 **도구 설명의")
            print("     경계가 모호한 것**이지 모델의 변덕이 아니다 — 어느 도구를")
            print("     부를지 LLM 이 매번 새로 판단하고 있다는 뜻이다.")
            print("     고칠 곳은 프롬프트·description 이다.")
        if always:
            print(f"  ❌ 항상 실패 {len(always)}개: {', '.join(always)}")

        # ── ② 시퀀스 갈림 보고 ──────────────────────────────────────────────
        # 전판 PASS 인데 갈린 케이스가 **제일 위험하다** — 채점으로는 안 보이고
        # 다음 판(모델·설명문이 조금 바뀐 날)에 뒤집힌다. FAIL 이 섞인 갈림은
        # 이미 흔들림 보고에 잡히므로 여기서는 위험 표시만 더한다.
        diverged = {k: len(set(v)) for k, v in seqs.items() if len(set(v)) > 1}
        if diverged:
            risky = [k for k in diverged if all(tally[k])]
            print(f"\n■ 도구 시퀀스 갈림 {len(diverged)}건"
                  + (f" — 그중 **전판 PASS 인 채 갈림 {len(risky)}건** ← 위험"
                     if risky else ""))
            for k, ns in sorted(diverged.items()):
                mark = " ← PASS 인데 갈림" if k in risky else ""
                print(f"  {k}: {ns}종{mark}")
                for sq in sorted(set(seqs[k])):
                    print(f"      · {' → '.join(sq) if sq else '(도구 없음)'}")
            if risky:
                print("     PASS 라서 아무도 안 보게 되는 자리다. 원인은 대개")
                print("     설명문 경계의 모호함이고, 로컬 모델이면 그 문형 칸의")
                print("     재료가 두 길을 반반 가르치고 있는 것이다(28:28 계열).")

    if cause_all:
        # ── 원인 분포 — 「무엇이 깨졌나」가 아니라 「어느 층이 깨졌나」 ──────────
        # 이 표가 있어야 다음 판의 처방이 사람 손을 안 탄다. 처방은 REPAIR 가
        # 「먼저 볼 곳」까지만 적는다 — 재료 지원량은 여기서 모른다(B 의 표).
        print(f"\n■ 원인 분포 (FAIL {sum(cause_all.values())}건)")
        for c, n in cause_all.most_common():
            print(f"  {n:3d}  {c:<12} → {REPAIR[c]}")

    if crashes:
        # ⚠ **터진 것과 틀린 것은 다르다.** 둘을 같은 FAIL 로 세면 "채점이
        #   나빴다" 로 읽히는데, 실제로는 채점까지 가지도 못한 것이다.
        kinds = sorted({c.split(": ", 1)[1] for c in crashes})
        print(f"\n  ⚠ **실행 중 터진 것 {len(crashes)}건** — 채점 실패가 아니다.")
        print(f"     예외: {', '.join(kinds)}")
        print("     같은 예외가 전 케이스에 걸렸으면 코드가 아니라 **환경**을 본다")
        print("     (인터프리터·백엔드·시드). 케이스마다 다르면 그때가 코드다.")

    # ── ③ 소계 분리 — 부정 행동 케이스는 **딴 표**다 ────────────────────────
    # 본표 수(28)는 D3·D4 채점의 기준선이라 여기 섞으면 판 간 비교가 죽는다.
    # 합계는 그대로 두고(종료 코드도 합계 기준) 소계만 갈라 찍는다.
    _grp = {c["id"]: c.get("group", "main") for c in cases}
    if any(g != "main" for g in _grp.values()):
        for gname, glabel in (("main", "본표"), ("negative", "부정 행동")):
            ids = [k for k, g in _grp.items() if g == gname]
            if ids:
                gp = sum(sum(tally[k]) for k in ids)
                gt = sum(len(tally[k]) for k in ids)
                print(f"  {glabel:5s} {gp}/{gt}")
    print(f"\n결과: {n_pass}/{total} PASS" + (f" ({repeat}회 합산)" if repeat > 1 else ""))
    # 하나라도 깨졌으면 실패 코드로 끝낸다 — 스크립트가 이어지는 걸 막는다(㊾)
    sys.exit(0 if n_pass == total else 1)


if __name__ == "__main__":                              # ㊼: import될 때는 안 돈다
    main()
