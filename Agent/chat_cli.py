# ============================================================================
# 대화 확인 도구 — 떠 있는 하네스에 말을 걸어 눈으로 본다 (2026-08-27 신설)
# ============================================================================
# [왜 필요한가 — 기존 셋으로는 안 되는 자리]
#   backend_probe.py  계약·인증·시드   (LLM 안 부름 · 무료)
#   infer_check.py    추론 도구 직접   (LLM 안 부름 · 무료)
#   eval/runner.py    골든셋 자동 채점 (LLM 부름 · PASS/FAIL만)
#   → **"그냥 아무거나 물어보고 답을 읽어 보는"** 자리가 비어 있었다.
#     08-27에 나는 이걸 scratchpad 일회용 스크립트로 했는데, 저장소에 없으니
#     사용자가 재현할 수 없었다. 도구가 아니라 흔적을 남긴 셈이다.
#
# [러너와 무엇이 다른가] 러너는 **채점**한다(기대값과 대조). 이건 **본다**.
#   말투·길이·근거 제시 방식처럼 채점 밖에 있는 것들은 눈으로만 잡힌다 —
#   골든셋 PASS 인데 발화가 어색한 경우가 실제로 있었다(러너가 08-20에
#   "PASS 도 발화를 찍는다"로 개조된 이유와 같다).
#
# [왜 HTTP 인가 — runner 는 loop 를 직접 부르는데]
#   러너는 서버 없이 도는 게 목적이라 loop.run_chat 을 직접 부른다. 이 도구는
#   반대로 **서버가 실제로 하는 일**을 봐야 한다 — main.py 의 lifespan 적재,
#   요청 스키마(camelCase!), 가드 정책 ⓒ(재생성), 응답 포장까지 전부 거친다.
#   즉 프론트가 보게 될 것과 같은 경로다.
#
# [⚠ 셸에서 한글이 깨진다] cmd·git-bash 에서 `curl -d '{"message":"물티슈..."}'`
#   를 하면 인코딩이 뭉개져 400 이 온다(08-27에 세 번 겪었다). 그래서 이
#   스크립트가 요청 본문을 **파이썬에서 UTF-8 로 직렬화**한다 — 셸을 안 거친다.
#
# 실행 (Agent/ 에서):
#   python chat_cli.py "물티슈 있어요?"          한 번 묻고 끝
#   python chat_cli.py                           대화형(빈 줄이면 종료)
#   python chat_cli.py --member 1005 "..."       회원으로 (기본 1005)
#   python chat_cli.py --guest "..."             비회원으로
#   python chat_cli.py --raw "..."               응답 JSON 통째로
# ============================================================================
from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.env import use_utf8_stdout                              # noqa: E402

use_utf8_stdout()

URL = os.environ.get("AGENT_URL", "http://127.0.0.1:8000")
TIMEOUT = 180          # 도구를 여러 번 부르는 질문은 1분을 넘기기도 한다


def _post(payload: dict) -> dict:
    """/agent/chat 에 POST. 본문은 **여기서** UTF-8 로 만든다(셸을 안 거친다)."""
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        f"{URL}/agent/chat", data=data,
        headers={"Content-Type": "application/json; charset=utf-8"})
    with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
        return json.loads(r.read().decode("utf-8"))


def _health() -> dict | None:
    try:
        with urllib.request.urlopen(f"{URL}/health", timeout=5) as r:
            return json.loads(r.read().decode("utf-8"))
    except Exception:                                            # noqa: BLE001
        return None


def ask(q: str, member: int | None, session: str, raw: bool) -> None:
    """한 번 묻고 답을 찍는다. 소요 시간도 — 데모에서 체감 지연이 곧 UX다."""
    t0 = time.perf_counter()
    try:
        d = _post({"sessionId": session, "consumerId": member, "message": q})
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", "replace")[:300]
        print(f"  ✗ HTTP {e.code} — {body}")
        # 400 은 대개 요청 스키마 문제다. 계약이 camelCase 라는 것을 여기서 알린다.
        if e.code == 400:
            print("    (계약은 sessionId·consumerId·message 다 — snake_case 가 아니다)")
        return
    except Exception as e:                                       # noqa: BLE001
        print(f"  ✗ {type(e).__name__}: {e}")
        return
    dt = time.perf_counter() - t0

    if raw:
        print(json.dumps(d, ensure_ascii=False, indent=2))
        return
    reply = d.get("reply") or "(발화 없음)"
    print(f"  {reply}")
    if d.get("actions"):
        print(f"  [액션] {d['actions']}")
    print(f"  ({dt:.1f}초)")


def main() -> int:
    argv = sys.argv[1:]
    raw = "--raw" in argv
    guest = "--guest" in argv
    member = None if guest else 1005
    if "--member" in argv:
        member = int(argv[argv.index("--member") + 1])
        del argv[argv.index("--member"):argv.index("--member") + 2]
    argv = [a for a in argv if a not in ("--raw", "--guest")]

    h = _health()
    if h is None:
        print(f"✗ 하네스가 안 떠 있다 ({URL})")
        print("   Agent/ 에서:  python -m uvicorn app.main:app --port 8000")
        return 2
    assets = h.get("assets", {})
    print(f"■ {URL} · mock={h.get('mock_sot')} · 도구 {h.get('tools')} · "
          f"모델 {h.get('model')}")
    print(f"  출하물 " + " · ".join(f"{k}={'O' if v else 'X'}"
                                   for k, v in assets.items()))
    print(f"  손님   {'비회원' if member is None else f'회원 {member}'}\n")

    # 세션 id 를 매 실행 새로 만든다 — 예절 장부(사안당 1회·쿨다운)가 이전
    # 실행의 기록을 물고 오면 "왜 이번엔 말을 안 하지"가 된다.
    session = f"cli-{int(time.time())}"

    if argv:                                    # 한 번 묻고 끝
        for q in argv:
            print(f"▶ {q}")
            ask(q, member, session, raw)
        return 0

    print("(빈 줄이면 종료 · 같은 세션이 유지된다)")
    while True:
        try:
            q = input("▶ ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            return 0
        if not q:
            return 0
        ask(q, member, session, raw)
        print()


if __name__ == "__main__":
    sys.exit(main())
