# -*- coding: utf-8 -*-
# ============================================================================
# LLM-as-judge — 기계가 못 재는 것을 잰다 (골든셋의 4단계)
# ============================================================================
#   python -m eval.judge --calibrate       심판 자신을 먼저 채점 (권장 첫 실행)
#   python -m eval.judge                   골든셋 전 케이스 채점
#   python -m eval.judge --only scene1_restock
#   python -m eval.judge --real            실물 백엔드로
#
# ⚠ **과금.** 골든셋 실행(케이스당 LLM 2~4회) + 심판 1회가 케이스마다 붙는다.
#   사용자가 돌린다. 세션은 import 검산까지만.
#
# ─── 무엇을 재나 — 「이미 재는 것」을 다시 재지 않는다 ───────────────────────
# `eval/runner.py` 는 이미 넷을 기계적으로 잰다:
#   ① 도구 시퀀스(부분 수열) ② 필수 요소 포함 ③ 금지 요소 ④ **가드 통과**
# 그러므로 심판이 "사실이 맞나"를 다시 묻는 것은 **낭비이자 위험**이다 —
# 가드는 원장 대조라 확정적인데, 심판은 확률적이라 **가드가 통과시킨 것을
# 심판이 뒤집으면 어느 쪽을 믿을지 규칙이 없어진다.**
#
# 그래서 심판은 **runner 가 원리적으로 못 재는 것**만 맡는다. runner 의 주석이
# 스스로 적어 뒀다 — *"말투·품질은 채점 밖이라 눈으로 본다."* 그 "눈"이 여기다.
#
# ─── 왜 심판을 먼저 채점하나 (`--calibrate`) ────────────────────────────────
# 심판이 아무 발화에나 4~5점을 주면 그 점수는 **정보가 0**이다. 그런데 그런
# 심판도 표는 예쁘게 나온다 — 평균 4.6, 전 항목 초록. 그걸 보고 "품질이 좋다"고
# 적으면 그 문장이 거짓이 된다.
#
# 그래서 **일부러 나쁜 발화**를 짝으로 넣어 둔다. 심판이 좋은 것과 나쁜 것을
# **1점 이상 벌리지 못하면** 그 심판의 판정은 쓰지 않는다.
# (T15 에서 대조표가 규칙 바닥을 먼저 세운 것과 같은 계열 — **바닥을 못 이기는
#  모델은 채택하지 않는다.** 여기서는 심판이 바닥을 못 가르면 채택하지 않는다.)
#
# ─── 왜 5점 척도인가 ────────────────────────────────────────────────────────
# 이진(좋다/나쁘다)이면 "조금 아쉽다"를 못 적고, 10점이면 6과 7의 차이를
# 심판도 나도 설명 못 한다. 5점은 **각 눈금에 말이 붙는** 크기다 — 아래
# `SCALE` 이 눈금마다 문장을 하나씩 준다. 눈금에 말이 없으면 점수는 취향이다.
# ============================================================================
import argparse
import json
import sys

sys.path.insert(0, __file__.rsplit("eval", 1)[0])

from app import env                                    # noqa: E402
env.use_utf8_stdout()
env.load_env()

from app import config                                 # noqa: E402  ← load_env() 뒤
from eval import golden_set                            # noqa: E402

JUDGE_MODEL = "claude-opus-5"     # 심판은 루프보다 큰 모델을 쓴다 — 판정은
#   한 번뿐이고 지연이 UX 가 아니다. 루프가 sonnet 인 이유(응답 지연=UX)가
#   여기엔 없다. **같은 모델로 자기 발화를 채점하게 하지 않는다**: 자기가 쓴
#   문장을 좋게 보는 쪽으로 기운다(self-preference). 다른 모델이면 그 편향의
#   방향이 최소한 우리 발화와 무관해진다.

# ── 눈금 ────────────────────────────────────────────────────────────────────
SCALE = """1 = 못 지켰다 (손님이 다시 물어야 한다)
2 = 아쉽다 (뜻은 통하나 거슬린다)
3 = 무난하다 (감점 요소는 없으나 도움도 아니다)
4 = 좋다 (매장 직원이 이렇게 말하면 만족스럽다)
5 = 이보다 나을 수 없다 (이 상황에서 최선의 한 마디)"""

# ── 항목 — 전부 runner 가 못 재는 것들이다 ──────────────────────────────────
DIMENSIONS = [
    ("직답", "손님이 물은 것에 답했는가. 묻지 않은 정보로 채우거나, "
             "되묻고 끝내거나, 답을 뒤에 묻어 두지 않았는가."),
    ("행동가능", "이 말을 듣고 **다음에 무엇을 할지**가 정해지는가. "
                 "위치·가격·수량·시각처럼 몸을 움직이게 하는 정보가 있는가. "
                 "(그 정보가 없는 것이 옳은 상황이면 감점하지 않는다)"),
    ("정직", "못 하는 것을 못 한다고 했는가. 실패·부재·불확실을 얼버무리거나 "
             "'개발 중'같은 내부 사정을 손님에게 떠넘기지 않았는가."),
    ("어조", "창고형 대형매장 직원의 말투인가. 과잉 사과·과잉 수식·빈 공감·"
             "이모지 남발이 없는가. 반대로 무뚝뚝해서 불친절하지도 않은가."),
    ("간결", "모바일 화면에서 한눈에 읽히는가(2~4문장). 같은 말을 두 번 하거나, "
             "표·목록으로 부풀리지 않았는가."),
]

RUBRIC = f"""당신은 창고형 대형매장(트레이더스·코스트코형) 매장 안내 에이전트의
발화를 채점하는 심사원입니다.

**사실 여부는 채점하지 마세요.** 사실 대조는 이미 기계(가드·원장)가 끝냈습니다.
당신이 볼 것은 **같은 사실을 얼마나 잘 전했는가**입니다.

눈금:
{SCALE}

항목:
{chr(10).join(f'- {k}: {v}' for k, v in DIMENSIONS)}

반드시 아래 JSON **만** 출력하세요. 설명 문장을 앞뒤에 붙이지 마세요.
{{"직답": {{"점수": 1~5, "근거": "한 줄"}},
 "행동가능": {{...}}, "정직": {{...}}, "어조": {{...}}, "간결": {{...}}}}

근거는 **발화에서 실제로 인용**하세요. 인용할 수 없으면 그 점수는 근거가 없는
것이니 다시 생각하세요."""


def judge_once(question: str, reply: str, situation: str = "") -> dict:
    """발화 하나를 채점한다. 반환 = 항목 -> {"점수","근거"}.

    [왜 도구 원장을 안 넘기나] 넘기면 심판이 사실 검사를 시작한다 —
      "재고가 3개라는데 원장엔 4개"처럼. 그건 가드의 일이고, 심판이 거기에
      점수를 쓰면 **정작 재라고 시킨 것을 안 잰다.** 볼 것을 좁히는 것이
      루브릭의 절반이다.
    """
    import anthropic
    client = anthropic.Anthropic()
    body = f"손님의 말: {question}\n\n에이전트의 발화:\n{reply}"
    if situation:
        body += f"\n\n(상황 참고: {situation})"
    r = client.messages.create(
        model=JUDGE_MODEL, max_tokens=1200,
        system=RUBRIC,
        messages=[{"role": "user", "content": body}],
    )
    txt = "".join(b.text for b in r.content if b.type == "text").strip()
    # 모델이 ```json 울타리를 치는 일이 있다 — 벗겨 낸다. 벗기지 않으면
    # json.loads 가 죽고, 그 케이스만 조용히 빠진 표가 나온다.
    if txt.startswith("```"):
        txt = txt.split("\n", 1)[1].rsplit("```", 1)[0]
    try:
        return json.loads(txt)
    except json.JSONDecodeError:
        return {k: {"점수": None, "근거": f"심판 응답 파싱 실패: {txt[:80]}"}
                for k, _ in DIMENSIONS}


# ── 심판 자신을 채점할 재료 ─────────────────────────────────────────────────
# 짝마다 **같은 질문·같은 사실**이고 전달만 다르다. 사실이 다르면 심판이
# 사실로 가르게 되어 우리가 재려는 것을 못 잰다.
CALIBRATION = [
    {"항목": "직답",
     "질문": "물티슈 리필형 어디 있어요?",
     "좋음": "2층 B구역 첫 번째 랙에 있어요. 매대에 18개 있습니다.",
     "나쁨": "물티슈는 저희 매장에서 인기가 많은 품목이라 여러 종류를 갖추고 "
             "있습니다. 캡형과 리필형이 있고 용량도 다양한데요, 혹시 어떤 "
             "종류를 찾으시는지 알려주시면 더 정확히 안내해 드릴 수 있어요."},
    {"항목": "행동가능",
     "질문": "물티슈 리필형 어디 있어요?",
     "좋음": "2층 B구역 첫 번째 랙, 매대에 18개 있습니다.",
     "나쁨": "네, 리필형 물티슈는 매장에 있습니다. 재고도 충분합니다."},
    {"항목": "정직",
     "질문": "물티슈 캡형 장바구니에 담아줘",
     "좋음": "지금은 로그인 전이라 담아드릴 수가 없어요. 로그인하시면 바로 "
             "담아드릴게요. 캡형 100매 9입, 12,900원입니다.",
     "나쁨": "네, 장바구니에 담아드렸습니다! 더 필요하신 건 없으실까요?"},
    {"항목": "어조",
     "질문": "물티슈 얼마예요?",
     "좋음": "캡형 100매 9입이 12,900원이에요.",
     "나쁨": "아이고 정말 죄송합니다 고객님!! 😊😊 문의주셔서 너무너무 "
             "감사드려요!! 말씀해주신 소중한 물티슈는요~ 무려 12,900원이라는 "
             "정말 착한 가격으로 모시고 있답니다!! 🎉"},
    {"항목": "간결",
     "질문": "물티슈 얼마예요?",
     "좋음": "캡형 100매 9입이 12,900원이에요. 지금 행사는 없습니다.",
     "나쁨": "문의하신 물티슈 가격을 안내해 드리겠습니다. 저희 매장에서 "
             "판매 중인 물티슈 중 캡형 제품에 대해 말씀드리자면, 해당 상품은 "
             "100매가 들어 있는 팩이 9개 구성으로 되어 있는 제품이며, "
             "총 900매입니다. 가격은 12,900원입니다. 즉, 12,900원에 "
             "구매하실 수 있습니다. 참고로 100매당 단가로 환산하면 "
             "약 1,433원 수준이 되겠습니다. 더 궁금하신 점 있으실까요?"},
]


def calibrate() -> int:
    """심판이 좋은 것과 나쁜 것을 가르는지 본다. **다른 무엇보다 먼저 돌린다.**

    통과 기준: 각 짝에서 **그 항목의 점수 차가 1점 이상**.
      차이가 0이거나 뒤집히면 그 항목의 판정은 쓰지 않는다 — 심판이 그
      항목에 대해 아무것도 못 보고 있다는 뜻이다.
    """
    print(f"■ 심판 검증 — {JUDGE_MODEL} · 짝 {len(CALIBRATION)}개")
    print("  같은 질문·같은 사실, 전달만 다르다. 심판이 가르는지 본다.\n")
    bad = []
    for c in CALIBRATION:
        k = c["항목"]
        g = judge_once(c["질문"], c["좋음"]).get(k, {})
        b = judge_once(c["질문"], c["나쁨"]).get(k, {})
        gs, bs = g.get("점수"), b.get("점수")
        if gs is None or bs is None:
            bad.append((k, "파싱 실패"))
            print(f"  ❌ {k:6s} 심판 응답을 못 읽었다")
            continue
        gap = gs - bs
        mark = "✅" if gap >= 1 else "❌"
        if gap < 1:
            bad.append((k, f"차이 {gap}"))
        print(f"  {mark} {k:6s} 좋음 {gs} · 나쁨 {bs} · 차이 {gap:+d}")
        print(f"       좋음 근거: {g.get('근거', '')[:70]}")
        print(f"       나쁨 근거: {b.get('근거', '')[:70]}")
    if bad:
        print(f"\n❌ {len(bad)}개 항목에서 심판이 못 갈랐다: "
              f"{', '.join(k for k, _ in bad)}")
        print("   **그 항목의 점수는 쓰지 마라.** 심판이 거기서 아무것도 "
              "못 보고 있다는 뜻이고, 그런 점수로 만든 표는 예쁘지만 비어 있다.")
        print("   고칠 곳은 발화가 아니라 루브릭이다 — 그 항목의 설명이 "
              "심판에게 무엇을 보라고 말하지 못하고 있다.")
        return 1
    print(f"\n✅ {len(CALIBRATION)}개 항목 전부 갈랐다 — 이 심판의 판정을 쓴다")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--calibrate", action="store_true",
                    help="심판 자신을 먼저 채점 (권장 첫 실행)")
    ap.add_argument("--only", default=None)
    ap.add_argument("--real", action="store_true")
    a = ap.parse_args()

    if a.calibrate:
        return calibrate()

    # ⚠ 가드를 **양쪽으로** 건다 — `runner.py` 가 08-27 에 배운 것을 그대로
    #   물려받는다. 한쪽만 막으면 mock 판을 돌렸는데 도구가 실물 백엔드를
    #   두드리고, 백엔드가 없으면 전 케이스가 "지금 조회가 안 되네요"로
    #   낮은 점수를 받는다. **품질이 나쁜 게 아니라 백엔드를 안 켠 것**인데
    #   점수표만 보면 구분이 안 된다 — 심판이 있는 쪽이 더 위험하다.
    #   러너는 FAIL 이라도 뜨지만 심판은 **그럴듯한 낮은 점수와 근거**를 지어낸다.
    if not a.real and not config.USE_MOCK_SOT:
        print("⚠ mock 판인데 USE_MOCK_SOT=false 다 — 도구가 실물 백엔드를 부른다.")
        print("   백엔드가 켜져 있으면 `--real`, 아니면 .env 의 USE_MOCK_SOT 를 true 로.")
        return 2
    if a.real and config.USE_MOCK_SOT:
        print("⚠ --real 인데 USE_MOCK_SOT=true 다. .env 를 고치고 다시.")
        return 2

    # 골든셋을 실제로 돌려 발화를 얻는다 — 심판은 그 발화를 본다.
    from app import loop, prompts                       # noqa: F401
    from app.tools import query
    if a.real:
        # ⚠ 실물 골든셋은 **상수가 아니라 함수**다. 세계 상태(재고·큐·이력)를
        #   실행 시각에 뽑아 케이스를 조립한다 — 케이스에 값을 박으면 DES 를
        #   다시 돌리는 날 통째로 죽는다(golden_real 머리말). runner 와 같은
        #   경로로 부른다.
        from app import sot_client
        from eval import golden_real
        pool = golden_real.build(golden_real.fixtures(sot_client))
        # 재료가 없어 질문이 빈 케이스는 건너뛴다(세계 탓이지 코드 탓이 아니다).
        pool = [c for c in pool if c.get("q")]
    else:
        pool = golden_set.GOLDEN
    cases = [c for c in pool if a.only is None or c["id"] == a.only]
    if not cases:
        print(f"그런 케이스가 없다: {a.only}")
        return 2

    print(f"■ LLM-as-judge — {len(cases)}케이스 · 심판 {JUDGE_MODEL} · "
          f"{'실물' if a.real else 'mock'}")
    print("  ⚠ `--calibrate` 를 먼저 돌려 심판이 갈리는지 확인했는가?\n")

    totals = {k: [] for k, _ in DIMENSIONS}
    for c in cases:
        # ⚠ 09-01 제거: 여기서 신원을 직접 박지 않는다. `run_chat` 이
        #   `config.to_member_id` 로 변환해 등록하므로, 여기서 consumer_id 를
        #   member_id 자리에 넣으면 **변환 전 값으로 덮어썼다가** run_chat 이
        #   다시 덮는 무의미한 왕복이었고, 읽는 사람에게는 두 축이 같은 것처럼 보였다.
        out = loop.run_chat(c["q"], consumer_id=c.get("consumer_id"),
                            session_id=c.get("session_id"))
        reply = out["reply"] if isinstance(out, dict) else str(out)
        v = judge_once(c["q"], reply, situation=c.get("why", ""))
        line = []
        for k, _ in DIMENSIONS:
            sc = (v.get(k) or {}).get("점수")
            if isinstance(sc, int):
                totals[k].append(sc)
            line.append(f"{k} {sc if sc is not None else '?'}")
        avg = [s for k, _ in DIMENSIONS
               for s in [(v.get(k) or {}).get("점수")] if isinstance(s, int)]
        mean = sum(avg) / len(avg) if avg else 0
        print(f"  {mean:.1f}  {c['id']:24s} {' · '.join(line)}")
        for k, _ in DIMENSIONS:
            sc = (v.get(k) or {}).get("점수")
            if isinstance(sc, int) and sc <= 2:
                print(f"        ⚠ {k}: {(v.get(k) or {}).get('근거', '')[:90]}")
        print(f"        발화: {reply[:110]}")

    print("\n■ 항목별 평균")
    for k, _ in DIMENSIONS:
        xs = totals[k]
        if xs:
            print(f"  {k:6s} {sum(xs) / len(xs):.2f}  (n={len(xs)}  "
                  f"최저 {min(xs)} 최고 {max(xs)})")
    print("\n  ⚠ 평균만 보지 마라. **2점 이하가 하나라도 있으면** 그 케이스가 "
          "곧 손님이 겪는 장면이다 — 평균 4.2 는 그것을 가린다.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
