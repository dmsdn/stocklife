#===============================================
# Agent 평가 하네스 - 회귀 러너
#===============================================

#[역할] 골든셋의 케이스를 하나씩 하네스에 넣고 PASS/FAIL 확인
#프롬프트·description·config를 고친 뒤 반드시 돌림. "좋아진 것 같다"라는 느낌이 근거가 될 수 없음

# [HTTP가 아닌 loop.run_chat을 직접 부르는 이유]
# 서버를 띄우지 않아도 평가가 돌아야 함. 잠깐 문구만 바꿔서 확인하는 경우가 빈번함. main.py가 하는 가드 및 정책은 여기서 직접 재현(가드 통과 여부를 채점에 포함)

# [비용주의]
# 케이스 12개 x 턴 2~4회 = LLM 호출 30~50번 (--only로 한 케이스만 돌리는 문이 있음)

#===============================================

import re
import sys

from app.env import load_env
load_env()

# **sys.path를 손대는 코드는 없을수록 좋음** 실행 위치에 따라 되기도 하고 안 되기도 해서, "내 컴퓨터에서는 되는데"류의 고장을 만듦
# 폴더 배치로 풀 수 있으면 그 쪽이 나음
from app import guard, loop
from eval.golden_set import GOLDEN

#===============================================

def _is_subsequence(expected: list, actual: list) -> bool:
    i = 0
    for name in actual:
        if i < len(expected) and name == expected[i]:
            i += 1
    return i == len(expected)

def _check_includes(reply: str, items: list) -> list:
    missing = []
    for item in items:
        alts = item if isinstance(item, tuple) else (item,)
        if not any(a in reply for a in alts):
            missing.append(" | ".join(alts))
    return missing

def run_one(case: dict) -> dict:
    result = loop.run_chat(case["q"],
                           consumer_id=case.get("consumer_id"),
                           session_id=case.get("session_id"),
                           history=[])
    reply = result["reply"] or ""

    tools = [t for turn in result["trace"] for t in turn["tools"]]

    fails = []

    if not _is_subsequence(case["expect_tools"], tools):
        fails.append(f"도구 시퀀스: 기대 {case['expect_tools']} / 실제 {tools}")

    for m in _check_includes(reply, case["must_include"]):
        fails.append(f"필수 요소 없음: {m}")

    for pat in case["must_not_include"]:
        hit = re.search(pat, reply)
        if hit:
            fails.append(f"금지 요소 발견: '{hit.group(0)}' (패턴 {pat})")

    verdict = guard.check(reply, result["ledgers"])
    if not verdict["ok"]:
        for v in verdict["violations"]:
            fails.append(f"가드 위반: {v['reason']} ({v.get('text', '')})")

    return {"ok": not fails, "fails": fails, "reply": reply, "tools": tools, "q": case["q"]}

def main() -> None:
    only = None
    if "--only" in sys.argv:
        only = sys.argv[sys.argv.index("--only") + 1]

    cases = [c for c in GOLDEN if only is None or c["id"] == only]
    if not cases:
        print(f"해당 id 없음: {only}")
        sys.exit(2)

    print(f"골든셋 v0 - {len(cases)}케이스 실행\n")
    n_pass = 0
    for i, case in enumerate(cases, 1):
        try:
            r = run_one(case)
        except Exception as e:
            r = {"ok": False, "fails": [f"실행 오류: {type(e).__name__}: {e}"],
                 "reply": "", "tools": []}
        mark = "PASS" if r["ok"] else "FAIL"
        if r["ok"]:
            n_pass += 1
        print(f"{i:>2}. {mark}  {case['id']:<22} {case['why'][:44]}")
        for f in r["fails"]:
            print(f"        └ {f}")
        if r["reply"]:
            print(f"        └ 질문: {r['q'][:80]}")
            print(f"        └ 발화: {r['reply'][:80]}")

    print(f"\n결과: {n_pass}/{len(cases)} PASS")
    # 하나라도 깨졌으면 실패 코드로 끝낸다 — 스크립트가 이어지는 걸 막는다
    sys.exit(0 if n_pass == len(cases) else 1)

if __name__ == "__main__":
    main()