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
    """must_include 채점. 튜플이면 '그중 하나면 됨'(동의어 묶음). 실패 목록을 돌려준다."""
    missing = []
    for item in items:
        # isinstance로 "동의어 묶음인가 단일 문자열인가"를 가른다(개념 ㊱).
        alts = item if isinstance(item, tuple) else (item,)
        if not any(a in reply for a in alts):
            missing.append(" | ".join(alts))
    return missing


def run_one(case: dict) -> dict:
    """케이스 하나를 하네스에 넣고 채점한다. 반환: {ok, fails[], reply, tools}"""
    result = loop.run_chat(case["q"],
                           consumer_id=case.get("consumer_id"),
                           session_id=case.get("session_id"),
                           history=[])
    reply = result["reply"] or ""

    # 트레이스에서 도구 이름만 시간순으로 편다.
    # [t for turn in ... for t in ...] = 이중 for 컴프리헨션(평평하게 펴기) —
    # 바깥 for가 먼저, 안쪽 for가 나중. 중첩 리스트를 한 줄 리스트로 만든다.
    tools = [t for turn in result["trace"] for t in turn["tools"]]

    fails = []

    # ① 도구 시퀀스
    if not _is_subsequence(case["expect_tools"], tools):
        fails.append(f"도구 시퀀스: 기대 {case['expect_tools']} / 실제 {tools}")

    # ② 필수 요소
    for m in _check_includes(reply, case["must_include"]):
        fails.append(f"필수 요소 없음: {m}")

    # ③ 금지 요소 — 정규식이다(품절, 반올림 가격 패턴 등)
    for pat in case["must_not_include"]:
        hit = re.search(pat, reply)
        if hit:
            fails.append(f"금지 요소 발견: '{hit.group(0)}' (패턴 {pat})")

    # ④ 가드 — main.py를 안 거치므로 여기서 직접 검사에 포함한다.
    #    가드 위반은 그 자체로 실패다(서빙이었다면 재생성·차단됐을 발화).
    verdict = guard.check(reply, result["ledgers"])
    if not verdict["ok"]:
        for v in verdict["violations"]:
            fails.append(f"가드 위반: {v['reason']} ({v.get('text', '')})")

    # q를 되돌려주는 이유: 출력 표에서 질문과 발화를 나란히 보기 위해서다.
    # (08-20 개조 — 튜닝 국면에는 PASS의 발화도 눈으로 봐야 한다)
    return {"ok": not fails, "fails": fails, "reply": reply, "tools": tools,
            "q": case["q"]}


def main() -> None:
    # --only <id> : 그 케이스만 (문구 하나 실험할 때 전체 비용을 안 태우게)
    only = None
    if "--only" in sys.argv:                            # ㊾
        only = sys.argv[sys.argv.index("--only") + 1]

    cases = [c for c in GOLDEN if only is None or c["id"] == only]
    if not cases:
        print(f"해당 id 없음: {only}")
        sys.exit(2)

    print(f"골든셋 v0 — {len(cases)}케이스 실행\n")
    n_pass = 0
    for i, case in enumerate(cases, 1):                 # ㊽
        try:
            r = run_one(case)
        except Exception as e:
            # 러너는 케이스 하나가 터져도 나머지를 계속 돈다 — 전체 그림이 목적.
            r = {"ok": False, "fails": [f"실행 오류: {type(e).__name__}: {e}"],
                 "reply": "", "tools": []}
        mark = "PASS" if r["ok"] else "FAIL"
        if r["ok"]:
            n_pass += 1
        print(f"{i:>2}. {mark}  {case['id']:<22} {case['why'][:44]}")   # ㊿
        for f in r["fails"]:
            print(f"        └ {f}")
        # 08-20 개조: FAIL만이 아니라 **모든** 케이스의 질문·발화를 찍는다.
        # 채점(PASS/FAIL)은 판단의 표본일 뿐이고 말투·품질은 채점 밖에 있다 —
        # 튜닝 국면에는 통과한 답이 어떻게 좋아지는지도 눈으로 봐야 한다.
        if r["reply"]:
            print(f"        └ 질문: {r['q'][:80]}")
            print(f"        └ 발화: {r['reply'][:80]}")

    print(f"\n결과: {n_pass}/{len(cases)} PASS")
    # 하나라도 깨졌으면 실패 코드로 끝낸다 — 스크립트가 이어지는 걸 막는다(㊾)
    sys.exit(0 if n_pass == len(cases) else 1)


if __name__ == "__main__":                              # ㊼: import될 때는 안 돈다
    main()
