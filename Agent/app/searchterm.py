# ============================================================================
# 검색어 후보정 — 자모 편집거리로 오타·오인식을 카탈로그 이름에 붙인다
# ============================================================================
# [무엇을 고치나] 손님이 "무리슈"라고 치거나 STT 가 "물티슈"를 "물치슈"로
#   받아쓰면, 백엔드의 `LIKE '%무리슈%'` 는 **0건**을 돌려준다. 상품은 있는데
#   글자가 한 칸 어긋났을 뿐이다.
#
# [왜 백엔드가 아니라 여기인가 — 08-28 배선 결정]
#   원래 계획은 `sot_client` 의 부분일치에 자모 편집거리를 붙이는 것이었는데,
#   그 부분일치는 **mock 경로**다. 실연동에서 검색은 백엔드 SQL 이 하므로
#   sot_client 를 고쳐도 데모에서는 아무것도 안 바뀐다.
#   선택지는 둘이었다:
#     (a) 백엔드에 퍼지 검색 — 자바로 자모 편집거리를 다시 짜야 하고 팀 협의
#     (b) **하네스가 호출 전에 검색어를 고친다** ← 채택
#   (b) 는 음성 후보정과 타이핑 오타를 **한 부품**으로 합친다. 음성 전용으로
#   짰으면 타이핑 오타에는 안 들었을 것이다.
#
# [왜 0건일 때만 고치나 — 이 파일에서 제일 중요한 결정]
#   매 검색마다 고치면 **멀쩡한 질의를 망친다.** "우유"는 "우육"으로, "커피"는
#   "코피"로 갈 수 있다. 편집거리는 "가까운 것"을 찾을 뿐 "맞는 것"을 모른다.
#   그래서 **백엔드가 0건을 돌려줬을 때만** 부른다 — 그때는 잃을 것이 없다.
#
# [고쳤다는 사실을 반드시 말한다]
#   조용히 다른 낱말로 검색하면 손님은 자기가 물은 것의 답을 들었다고 믿는다.
#   그래서 결과에 `corrected_from` 을 실어, 발화가
#   *"'무리슈'로는 없어서 '물티슈'로 찾아봤어요"* 가 되게 한다.
#
# [출하물] `Agent/app/artifacts/searchterm.npz` — 카탈로그 이름·브랜드·소분류의
#   자모 색인. 취향 npz 와 같은 계열(모델이 아니라 표)이다.
#   ⚠ **카탈로그를 다시 만들면 이 출하물도 다시 굽는다** — `catalog/searchterm_gen.py`.
#
# ─── 개념 사전 — 이 파일에 처음 나오는 것 (61)~(63) ─────────────────────────
# (61) 한글 자모 분해
#    한글 음절은 유니코드에서 **초성 19 × 중성 21 × 종성 28** 의 조합으로
#    한 칸에 들어 있다. `(코드 - 0xAC00)` 을 그 세 수로 나눠 떨어뜨리면
#    "물" → ㅁ ㅜ ㄹ 이 된다. 음절 단위로 세면 "물"과 "불"의 거리가 1인데,
#    자모로 풀면 ㅁ↔ㅂ 하나 차이라 **오인식의 실제 모양**에 맞는다.
# (62) 레벤슈타인 거리 (편집거리)
#    한 글자를 넣고·빼고·바꿔서 다른 문자열로 만드는 최소 횟수. 동적계획법으로
#    앞 행만 들고 굴리면 O(길이곱) 시간·O(길이) 공간이다.
# (63) 조기 가지치기 (early abort)
#    후보가 수천 개인데 전부 정확히 재면 느리다. 길이 차이가 이미 임계를
#    넘으면 계산 자체를 건너뛴다 — 편집거리는 길이 차이보다 작을 수 없다.
# ============================================================================
from __future__ import annotations

import os

import numpy as np

ARTIFACT = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                        "artifacts", "searchterm.npz")

_STATE: dict = {"terms": None, "jamo": None, "kind": None}

# (61) 자모 표 — 유니코드 한글 음절 블록의 조합 규칙 그대로.
_CHO = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ"
_JUNG = "ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ"
_JONG = " ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ"

# 후보정을 걸 최대 편집거리. 낱말이 짧을수록 엄격해야 한다 —
# 두 글자(자모 4~6개)에서 거리 2를 허용하면 아무거나 붙는다.
def _max_dist(n_jamo: int) -> int:
    if n_jamo <= 6:
        return 1
    if n_jamo <= 12:
        return 2
    return 3


def to_jamo(text: str) -> str:
    """한글 음절을 자모로 편다. 한글이 아닌 글자는 그대로 둔다.

    "물티슈" → "ㅁㅜㄹㅌㅣ ㅅㅠ "   (종성 없음은 공백 한 칸)
    ⚠ 종성 자리를 **빈칸으로라도 채운다.** 안 채우면 "무"(2)와 "물"(3)의
      자모 수가 달라 길이 기반 가지치기가 어긋난다.
    """
    out = []
    for ch in text:
        code = ord(ch) - 0xAC00
        if 0 <= code < 11172:
            out.append(_CHO[code // 588])
            out.append(_JUNG[(code % 588) // 28])
            out.append(_JONG[code % 28])
        else:
            out.append(ch)
    return "".join(out)


def _lev(a: str, b: str, cap: int) -> int:
    """(62) 레벤슈타인 거리. cap 을 넘으면 즉시 cap+1 을 돌려준다.

    [왜 cap 인가] 우리는 "얼마나 먼가"가 아니라 "임계 안인가"만 알면 된다.
    행 하나를 다 계산하고도 최소값이 cap 을 넘었으면 그 뒤는 볼 필요가 없다 —
    편집거리는 행을 내려가며 줄지 않기 때문이다.
    """
    if abs(len(a) - len(b)) > cap:          # (63) 길이 차이만으로 탈락
        return cap + 1
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1,          # 삭제
                           cur[j - 1] + 1,       # 삽입
                           prev[j - 1] + (ca != cb)))   # 치환
        if min(cur) > cap:
            return cap + 1
        prev = cur
    return prev[-1]


def load() -> str:
    """출하물을 상주시킨다. main.py 의 lifespan 이 한 번 부른다.

    없으면 **조용히 꺼진다** — 후보정은 있으면 좋은 것이지 없으면 검색이
    죽는 것이 아니다. 자산 하나가 서버 전체를 내리지 않는다(infer.load_all 과 같은 규율).
    """
    if not os.path.exists(ARTIFACT):
        return "✗ 없음 (catalog/searchterm_gen.py)"
    z = np.load(ARTIFACT, allow_pickle=True)
    _STATE["terms"] = [str(t) for t in z["terms"]]
    _STATE["jamo"] = [str(t) for t in z["jamo"]]
    _STATE["kind"] = [str(t) for t in z["kind"]]
    return f'{z["version"]} ({len(_STATE["terms"]):,}개)'


def count() -> int:
    """상주 중인 낱말 수. /health 가 "색인이 실제로 올라왔나"를 보여준다.
    0 이면 후보정이 꺼진 상태 — 오타가 그냥 0건으로 돌아간다."""
    return len(_STATE["terms"] or [])


def suggest(keyword: str) -> tuple[str, str] | None:
    """가장 가까운 카탈로그 낱말. 임계 밖이면 None.

    [반환] (고친 낱말, 종류) — 종류는 name·brand·l2 중 하나.
      부르는 쪽이 "무엇으로 고쳤는지"를 발화에 실을 수 있게 한다.

    [왜 최단 하나만 주나] 여러 후보를 주면 LLM 이 고르게 되는데, 그건
      "가까운 낱말 중 무엇이 맞나"를 판단하는 일이라 근거가 없다.
      하나만 주고 **고쳤다는 사실을 말하게** 하는 편이 정직하다.
    """
    if not keyword or _STATE["jamo"] is None:
        return None
    q = to_jamo(keyword.strip())
    if not q:
        return None
    cap = _max_dist(len(q))
    best, best_d = None, cap + 1
    for i, j in enumerate(_STATE["jamo"]):
        d = _lev(q, j, cap)
        if d < best_d:
            best_d, best = d, i
            if d == 0:
                break
    if best is None or best_d > cap:
        return None
    return _STATE["terms"][best], _STATE["kind"][best]


if __name__ == "__main__":
    from app.env import use_utf8_stdout
    use_utf8_stdout()

    # (61) 자모 분해 — 종성 자리가 비어도 칸을 채운다
    assert to_jamo("물") == "ㅁㅜㄹ", to_jamo("물")
    assert to_jamo("무") == "ㅁㅜ ", repr(to_jamo("무"))
    assert to_jamo("a1") == "a1", "한글이 아닌 것은 그대로"

    # (62)(63) 편집거리 — cap 을 넘으면 재지 않는다
    assert _lev("abc", "abc", 2) == 0
    assert _lev("abc", "abd", 2) == 1
    assert _lev("abc", "xyz", 2) == 3, "cap+1 이 나와야"
    assert _lev("a", "abcdef", 2) == 3, "길이 차이만으로 탈락"

    # 짧은 낱말은 엄격하다 — 안 그러면 두 글자에 아무거나 붙는다
    assert _max_dist(6) == 1 and _max_dist(12) == 2

    # 출하물 없이도 안 죽는다
    _STATE["jamo"] = None
    assert suggest("무리슈") is None, "출하물이 없으면 조용히 꺼진다"

    # 가짜 색인으로 후보정 자체를 검증
    _STATE["terms"] = ["물티슈", "우유", "커피"]
    _STATE["jamo"] = [to_jamo(t) for t in _STATE["terms"]]
    _STATE["kind"] = ["l2", "l2", "l2"]
    assert suggest("물티슈") == ("물티슈", "l2"), "정확히 같으면 그대로"
    assert suggest("물치슈") == ("물티슈", "l2"), suggest("물치슈")
    assert suggest("무리슈") == ("물티슈", "l2"), suggest("무리슈")
    assert suggest("자동차") is None, "먼 낱말은 붙이지 않는다"

    print("searchterm 스모크 11갈래 전부 통과")
