# ===============================================
# Agent 하네스 - Fact에 대한 Guard
# ===============================================

# [역할] 발화가 사용자에게 나가기 **직전**, 그 안의 매장 사실(가격·재고·위치·시각)이 실제로 도구 결과에서 나온 것이지 대조
# 통과/차단 판정과 사유만 생성

# [왜 프롬프트로 충분하지 않은가]
# ledger에 도구 산출값을 저장하는 것만으로는 LLM이 그 값을 그대로 발화한다는 보장이 생기지 않음
# LLM이 자연어를 생성해서 발화하는 단계가 별도의 생성과정이기 때문에 문제가 발생할 수 있음
# LLM은 기본적으로 값을 조회해서 출력하는 deterministic renderer가 아님 → 학습된 언어적 패턴에 근간하여 의미를 재구성할 수 있음

# [왜 loop.py와 분리하는가]
# 루프는 "대화를 굴리는 일", 가드는 "나가도 되는지 판정하는 일"
# ⇒ 둘을 섞으면 프롬프트 실험(루프)과 안전기준(가드)의 변경이 git에서 뒤엉켜 골든셋 점수가 떨어졌을때 무엇 때문인지 분리할 수 없음

# [핵심 규칙 — 출처별 원장]
# 웹 검색은 **일반 사실의 출처로는 인정**하되(성분 차이·고르는 기준), **매장 사실의 출처로는 인정하지 않는다.**
# 실패 시나리오: LLM이 웹에서 "물티슈 3,900원"을 보고 그대로 말한다. 문장만 보면 완벽하고 근거도 있다
# ⇒다만 그건 **다른 가게 가격**이다. 출처를 나눠 기록해두지 않으면 이 오류는 영원히 검출되지 않는다.
#
# [안 하는 일 — 경계]
# 문장을 고치지 않는다. 다듬기는 재생성(LLM)의 몫이고, 가드가 손대면
# 누가 쓴 문장인가"가 흐려져 책임 소재가 사라진다.
# 차단 후 무엇을 할지도 정하지 않는다(재생성? 안전 문구?) — main.py의 정책.
# 일반 상식·인사말은 검사하지 않는다. 전부 검사하면 못 쓴다.
#
# ===============================================

import re

# ===============================================

# 검사 대상
# 발화의 모든 문장을 검사하면 '안녕하세요"까지 근거를 요구하게 되어 쓸 수 없음 ⇒ 틀렸을 때 손님이 손해를 보는 것만 고름

# 매장 사실의 모양 (종류, 정규식, 허용출처들, 허용 오차)
_FACT_RULES = [
    # 가격: "12,900원" · "2190 원". 오차 0 — 가격은 반올림해서 말하면 안 된다.
    ("price", r"(\d[\d,]*)\s*원", ("sot", "compute"), 0),

    # 재고 수량: "3개 남았어요" 처럼 **수량 단위 + 남/있** 이 붙은 것만 본다.
    # 단위만으로 잡으면 "100ml당"의 100까지 재고로 오인한다.
    ("qty", r"(\d+)\s*(?:개|병|입|봉|팩|롤|장)\s*(?:정도\s*)?(?:남|있)", ("sot",), 0),

    # 보충 시각: "약 15분 후". 오차 3분 — 예측은 본래 구간이라 LLM이 반올림해
    # 말하는 것이 정상이다. 여기서 오차를 0으로 두면 정상 발화가 계속 차단된다.
    ("eta", r"(\d+)\s*분", ("infer", "compute"), 3),
]

# 범주 일관성 (categorical consistency)
# 숫자 대조 만의 구멍: **숫자가 하나도 안 틀렸는데 의미가 정반대**인 발화를 잡지 못함
# 원장에 "보충 예정·약 15분"이 있는데 LLM이 "약 15분 안에 보충될 가능성은 낮아보여요"라고 하면 15가 원장에 있으므로 숫자대조가 통과됨

# [왜 발화를 통째로 구조화하지 않는가]
# 이상적으로는 발화를 {"eta":15,"replenish":true}로 파싱해 원장과 비교하면 된다.
#  그런데 그 파서를 무엇으로 만드느냐가 문제다:
# · 규칙/정규식 → "낮아요"·"어렵겠는데요"·"쉽지 않아요"… 표현이 무한하다
# · LLM 파서   → 검증기가 또 LLM이라 그것도 틀리고, 왕복이 하나 더 는다
# 그래서 **"맞게 말했나"가 아니라 "정반대로 말했나"**만 본다. 긍정 표현은  무한하지만 **부정 표현의 어간은 한정적**이다(낮·어렵·힘들·없·안 될).
# 놓치는 건 있어도(재현율 낮음) 잘못 잡지는 않는다(정밀도 높음) — 가드에서는 이쪽이 옳다. 정상 발화를 막는 검사기는 결국 꺼지기 때문이다.

# [원장이 판정을 내려둔 것만 검사한다]
# 각 규칙은 "원장에 이 조건이 성립할 때만" 켜진다. 조건이 없으면 검사도 없다.  그래서 원장이 비어 있는 일반 대화("우유팩은 헹궈서 배출하세요")는 영향이 없다.

# 각 항목: (규칙 이름, 원장 조건 판정 함수, 발화에 나오면 안 되는 패턴, 면제 패턴 또는 None, 사유 문구)

# [면제 패턴 — 08-20 첫 골든셋 실호출에서 추가, 트러블슈팅_시점모름_보충부정_뭉갬]
# 걸린 구간(m.group(0)) 안에 이 패턴이 있으면 봐준다. 필요해진 이유: "곧 채워질 예정인데, 정확한 시점은 확인이 어렵네요"는 **옳은 발화**다 —
# 부정하는 것이 보충 여부가 아니라 시점이기 때문이다(predict_availability가 스텁이라 시점을 정말 모른다).
# 그런데 replenish_negation의 패턴만으로는 "채워…어렵"의 거리가 가까울 때 이것까지 걸린다. 시점을 부정하는 낱말 (시점·언제·정확)이 걸린 구간에 있으면 방향이 뒤집힌 게 아니라고 본다.
# "채워질지 확인이 어렵네요"(보충 여부 자체를 부정 — 나쁜 발화)에는 그 낱말들이 없으므로 여전히 걸린다. 놓치는 쪽보다 잘못 잡는 쪽을 줄이는 설계(정밀도 우선)의 연장이다.
_CONTRADICTIONS = [
    # 매대는 비었지만 예비 재고가 있다 → "품절"로 끝내는 것이 이 매장에서 가장
    # 나쁜 답이다(prompts.py의 재고 3분기). 킬링 장면 1이 여기서 죽는다.
    ("stockout_denial",
     lambda f: f.get("backup_qty", 0) > 0 and f.get("pick_qty", 1) == 0,
     r"품절|없습니다|없어요|없네요|다 나갔",
     None,
     "예비 재고가 있는데 품절이라고 말함"),

    # 보충 예정인데 부정적으로 말함 — 숫자는 맞는데 방향이 뒤집힌 전형
    ("replenish_negation",
     lambda f: f.get("backup_qty", 0) > 0,
     r"(보충|채워|들어오|입고)[^.!?]{0,12}(어렵|힘들|낮|안 될|안될|불투명|기대하기)",
     r"시점|언제|정확",
     "보충 예정인데 가능성을 부정함"),

    # 매대가 비었는데 있다고 함 — 손님을 빈 매대 앞으로 보낸다(헛걸음)
    ("shelf_presence_flip",
     lambda f: f.get("pick_qty", 1) == 0,
     r"매대에\s*(있|진열|놓여)|진열대에\s*(있|놓여)",
     None,
     "매대가 비었는데 있다고 말함"),

    # 단종품을 지금 살 수 있는 것처럼 말함
    ("discontinued_flip",
     lambda f: f.get("discontinued") is True,
     r"지금\s*(구매|구입|사실|살)|바로\s*(구매|구입|담)",
     None,
     "단종품인데 지금 살 수 있는 것처럼 말함"),
]


def _sot_facts(ledgers: dict) -> dict:
    # sot 원장에서 판정에 쓸 사실을 뽑아 평평한 dict로 만듦
    # 원장은 도구 호출 기록의 리스트라 중첩이 깊음. 모순 규칙이 매번 그 구조를 헤집으면 규칙 하나 늘 때마다 탐색코드가 붙음
    # ⇒ 규칙이 보는 면을 여기서 한 번 평평하게 만들어 규칙은 dict만 읽게 함
    facts = {}
    for entry in ledgers.get("sot", ()):
        r = entry.get("result")
        if not isinstance(r, dict):
            continue
        for k in ("pick_qty", "backup_qty", "on_shelf"):
            if k in r:
                facts[k] = r[k]
        # 단종 여부는 get_product 결과 안쪽에 들어 있다
        p = r.get("product")
        if isinstance(p, dict) and p.get("lifecycle_status") == "DISCONTINUED":
            facts["discontinued"] = True
    return facts


# 위치는 숫자 대조가 아니라 **층·구역 문자**로 본다.
# 프롬프트가 "F2-B-R01-B05-L2 → 2층 B구역"으로 바꿔 말하라고 시켰으므로, 발화에는 코드가 아니라 사람 말이 나온다. 그 사람 말을 원장의 코드와 견준다.
_LOC_RE = re.compile(r"(\d)\s*층(?:\s*([A-H])\s*구역)?")


def _to_int(s: str) -> int:
    # 12,900" → 12900. 쉼표를 지우고 정수로
    return int(s.replace(",", ""))


def _walk_numbers(obj, out):
    # 중첩 구조를 끝까지 파고들며 숫자를 전부 모음 (재귀)
    # 재귀함수: 자기 자신을 다시 부르는 함수 ⇒ 값이 dict면 그 값들을 같은 함수에 다시 넣고, list면 항목들을 다시 넣고, 숫자·문자열(멈추는 조건)이면 담는다.

    # 불리언 타입을 걸러내지 않으면 on_shelf=False가 0이라는 근거가 될 수 있음 (파이썬은 True/False를 1/0으로도 취급)
    if isinstance(obj, bool):
        return

    if isinstance(obj, (int, float)):
        out.add(int(obj))
        return

    if isinstance(obj, str):
        for n in re.findall(r"\d[\d,]*", obj):
            out.add(_to_int(n.rstrip(",")))
        return

    # dict는 값만 / 키 이름은 사실의 근거가 되는 것이지 사실 자체가 아님
    if isinstance(obj, dict):
        for v in obj.values():
            _walk_numbers(v, out)
        return

    if isinstance(obj, (list, tuple)):
        for v in obj:
            _walk_numbers(v, out)


# 출처 칸별로 '그 칸에서 나온 숫자 집합"을 만듦
# 가드의 판정은 결국 "발화의 이 숫자가 어느 집합에 있나"로 환원. {"sot": {101042, 12900, 160, ...}, "web": {3900, ...}, ...}
def _numbers_by_source(ledgers: dict) -> dict:
    out = {}
    for source, entries in ledgers.items():
        acc = set()
        _walk_numbers(entries, acc)
        out[source] = acc
    return out


# 원장에 실제로 등장한 (층, 존) 쌍을 모음
def _locations(ledgers: dict) -> set:
    found = set()
    # repr: ()안의 값을 코드로 어떻게 쓰냐(representation) [print(x) → str / 파이썬 대화형 셸에서 값만치면 나오는 것 → repr]
    # 중첩구조를 통째로 문자열화 (모호함 없이. 가능하면 그대로 코드에 붙여넣을 수 있게)
    # str을 사용해도 되지만, "사람에게 보여주려는게 아니라 기계가 훑을 문자열을 만든다"는 의도로서 repr사용
    ours = {k: v for k, v in ledgers.items() if k != "web"}
    text = repr(ours)
    for floor, zone in re.findall(r"F(\d)-([A-H])", text):
        found.add((floor, zone))
    return found


# 판정
def check(reply: str, ledgers: dict) -> dict:
    if not reply:
        return {"ok": True, "violations": [], "checked": 0}

    nums = _numbers_by_source(ledgers)
    violations = []
    checked = 0

    for kind, pattern, allowed, tol in _FACT_RULES:
        # re.findall: reply에서 pattern에 맞는 부분을 전부 리스트로 받음
        for raw in re.findall(pattern, reply):
            value = _to_int(raw)
            checked += 1
            # 두겹의 any
            # 안쪽: 이 출처의 숫자 중 오차 안에 드는게 있나
            # 바깥쪽: 허용 출처 중 한 곳에라도 있나
            supported = any(
                any(abs(n - value) <= tol for n in nums.get(src, ()))
                for src in allowed
            )
            if supported:
                continue
            # 웹에만 있다 vs 어디에도 없다
            from_web = any(abs(n - value) <= tol for n in nums.get("web", ()))
            violations.append({
                "kind": kind,
                "value": value,
                "text": raw,
                "reason": "web_only" if from_web else "unsupported",
            })

    # 위치 판정: 숫자가 아니라 층·존으로 대조
    seen_loc = _locations(ledgers)
    for floor, zone in _LOC_RE.findall(reply):
        checked += 1
        # 존 없이 층만 말한 경우: 층만 맞으면 통과
        if not zone:
            if any(f == floor for f, _z in seen_loc):
                continue
        elif (floor, zone) in seen_loc:
            continue
        violations.append({"kind": "location", "value": f"{floor}층{zone or ''}",
                           "text": f"{floor}층{zone or ''}", "reason": "unsupported"})

        # 범주 일관성: "숫자는 맞는데 의미가 반대"를 잡는다
    facts = _sot_facts(ledgers)
    for name, applies, pattern, exempt, why in _CONTRADICTIONS:
        # applies(facts)가 참일 때만 = 원장이 그 판정을 내려둔 경우에만 검사한다.
        # 조건을 안 걸면 원장이 비어 있는 일반 대화까지 이 규칙에 걸린다.
        if not applies(facts):
            continue
        checked += 1
        m = re.search(pattern, reply)  # findall과 달리 **첫 하나**만 찾으면 충분
        if m and exempt and re.search(exempt, m.group(0)):
            # 걸린 구간이 면제 조건에 해당 — 부정의 대상이 사실이 아니라 시점 같은 부수 정보다(위 _CONTRADICTIONS의 면제 패턴 주석, 트러블슈팅_시점모름_보충부정_뭉갬)
            continue
        if m:
            violations.append({
                "kind": "contradiction", "rule": name,
                "value": why, "text": m.group(0),  # group(0) = 실제로 걸린 글자
                "reason": "contradicts_ledger",  # 세 번째 사유 — 아래 주석 참조
            })

    return {"ok": not violations, "violations": violations, "checked": checked}


# ── 자체 검산 ───────────────────────────────────────────────────────────────
# 가드는 **조용히 망가지면 가장 위험한 파일**이다. 정규식 하나를 잘못 고치면
# 아무것도 안 걸러내는데, 결과는 "전부 통과"라 겉으로는 정상처럼 보인다.
# 그래서 import 시점에 "잡아야 할 것을 잡는가 / 통과시켜야 할 것을 통과시키는가"를
# 양방향으로 확인한다(한 방향만 보면 '전부 차단'하는 가드도 합격해버린다).
_L = {"sot": [{"result": {"price_krw": 12900, "locations": [{"location_id": "F2-B-R01-B05-L2"}]}}],
      "compute": [], "infer": [], "web": [{"url": "x", "title": "물티슈 3,900원 최저가"}]}

assert check("12,900원입니다. 2층 B구역에 있어요.", _L)["ok"], "근거 있는 발화를 막았다"
assert not check("3,900원입니다.", _L)["ok"], "웹 가격을 통과시켰다"
assert check("3,900원입니다.", _L)["violations"][0]["reason"] == "web_only", "웹 출처를 구분 못 했다"
assert not check("9,900원입니다.", _L)["ok"], "지어낸 가격을 통과시켰다"
assert check("9,900원입니다.", _L)["violations"][0]["reason"] == "unsupported"
assert not check("3층 A구역에 있어요.", _L)["ok"], "없는 위치를 통과시켰다"
assert check("안녕하세요. 무엇을 도와드릴까요?", _L)["checked"] == 0, "일반 문장을 검사했다"

# ── 2단계 검산: 원장이 "매대 0 + 예비 40 + 보충 예정"을 판정해둔 상황 ──────
# 여기서도 양방향이다 — 반대로 말한 것을 잡는가 / 바르게 말한 것을 통과시키는가.
_L2 = {"sot": [{"result": {"pick_qty": 0, "backup_qty": 40, "on_shelf": False}}],
       "compute": [], "infer": [{"result": {"eta_minutes": 15}}], "web": []}

assert check("매대엔 지금 없는데 약 15분 뒤에 채워질 것 같아요.", _L2)["ok"], \
    "올바른 3분기 발화를 막았다"
assert not check("품절입니다.", _L2)["ok"], "예비 재고가 있는데 품절을 통과시켰다"
assert not check("약 15분 안에 보충될 가능성은 낮아 보여요.", _L2)["ok"], \
    "숫자만 맞고 의미가 뒤집힌 발화를 통과시켰다"
assert check("품절입니다.", _L2)["violations"][0]["reason"] == "contradicts_ledger"
# 면제 패턴(08-20): 부정의 대상이 보충 여부가 아니라 **시점**이면 옳은 발화다.
# 스텁(predict_availability)이 시점을 못 줄 때의 정상 착지를 막으면 안 된다.
assert check("곧 채워질 예정이에요. 채워질 정확한 시점은 어렵네요.", _L2)["ok"], \
    "시점만 모른다는 옳은 발화를 막았다"
# 반대 방향도 그대로여야 한다 — 보충 여부 자체의 부정은 여전히 잡는다.
assert not check("채워질지는 지금 확인이 어렵네요.", _L2)["ok"], \
    "보충 여부를 부정한 발화를 면제해버렸다"
# 원장에 판정이 없으면(예비 재고 정보 자체가 없으면) 규칙이 꺼져 있어야 한다 —
# 안 그러면 일반 대화에서 "없어요"만 나와도 차단된다.
assert check("품절입니다.", {"sot": [], "compute": [], "infer": [], "web": []})["ok"], \
    "원장에 근거가 없는데 모순 규칙이 켜졌다"
