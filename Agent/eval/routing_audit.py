# -*- coding: utf-8 -*-
"""A3 — **명세 칸의 라우팅이 도구 정의와 맞나** (심판 셋이 못 보는 유일한 축)

[왜 이 파일이 있나]
A 와 B 가 갈릴 수 있는 축이 셋인데 **심판이 잡는 것은 둘뿐이다**
(`CLAUDE.md §7.1-a`).

| 축 | 어긋나면 | 누가 잡나 |
|---|---|---|
| 값(세계 상태) | 상관없다 — 궤적은 자기완결적이다 | 잡을 필요 없음 |
| 계약(이름·인자·결과 키) | 그 도구 쓰는 칸만 재생성 | **J2 가 기계적으로** |
| **라우팅**(어느 도구를 부를지) | 궤적이 **틀린 습관**을 가르친다 | **아무도 못 잡는다** |

셋째가 사각지대인 것은 구조적이다 — J2 는 궤적에 적힌 호출을 **다시 실행해**
대조하므로, 시퀀스가 통째로 잘못돼 있어도 그 호출들이 실행은 되니 전부 초록이다.
J1 은 없는 숫자만, J3 는 구조 규율만 본다.

> 08-28 골든셋이 13·15·14·14 로 흔들린 것이 정확히 이 부류였다. 도구는 다 돌고
> 답도 그럴듯했는데 `find_substitutes` 대신 `search + get_inventory×3` 으로
> **도구를 손으로 재구현**하고 있었다. 그 궤적에 심판 셋을 걸면 전부 통과한다.

[무엇을 하나] `definitions.py` 의 설명문에서 **「쓸 때」의 예시 발화**를 뽑고,
`distill_spec.py` 의 각 칸에서 **사용자 발화와 도구 시퀀스**를 뽑아 맞춘다.
칸의 질문이 도구 X 의 예시와 겹치는데 그 칸이 X 를 안 부르면 **후보로 찍는다.**

⚠ **자동 판정이 아니다.** 겹침은 신호지 증거가 아니다 — 낱말이 같아도 의도가
다를 수 있다(같은 "싸요"라도 총액이냐 단위가격이냐). 사람이 보라고 좁혀 주는
것이 이 파일의 일이고, **판정은 사람이 한다.**

실행:
    C:\\venvs\\2nd_project311\\Scripts\\python.exe -m eval.routing_audit
    (백엔드 불필요 — 소스만 읽는다)
"""
from __future__ import annotations

import os
import re
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
_AGENT = os.path.dirname(_HERE)
_ROOT = os.path.dirname(_AGENT)
sys.path.insert(0, _AGENT)

SPEC = os.path.join(_ROOT, "models", "distill_spec.py")

# 의미를 안 나르는 낱말 — 겹침을 세는 데서 뺀다. 안 빼면 "있어요"·"뭐"로
# 모든 칸이 모든 도구와 겹쳐서 목록이 쓸모없어진다.
#
# ⚠ **08-29: 처음에 라우팅을 나르는 낱말을 여기 넣어 자를 무디게 만들었다.**
#   `말고`·`대신`(대체품) · `얼마`(가격) · `어디`(위치) · `다시`·`또`(재구매) ·
#   `제일`·`가장`(순위) 를 불용어로 지웠더니, `cell_substitute` 가
#   `find_substitutes` 와 **한 낱말('비슷한')만 겹쳐 후보에서 빠졌다.**
#   민감도 시험(일부러 위반을 만들어 걸리는지)으로 잡았다.
#
#   > **불용어 목록은 자의 눈금이다.** 무엇을 버릴지가 무엇을 잴지를 정한다.
#   > "의미 없어 보이는 말"과 "이 도구를 부르게 하는 말"은 겹친다 —
#   > 짧고 흔한 낱말일수록 라우팅을 나르기 때문이다.
#
#   ⇒ **문법 기능어만** 남긴다. 의도를 가리키는 말은 아무리 짧아도 안 지운다.
_STOP = {"있어", "있어요", "있나", "뭐", "뭐가", "뭘", "좀", "거", "것",
         "이거", "그거", "저거", "해줘", "해주세요", "알려", "알려줘",
         "주세요", "어때", "어떤", "요즘", "지금", "정도", "같은", "같은데",
         "쪽", "안에", "더", "그리고", "그런데", "하고", "이랑", "랑"}


def _words(s: str) -> set:
    """한글 2자 이상 낱말만. 조사는 안 떼어낸다 — 정확도보다 **재현율**이 목적이다."""
    return {w for w in re.findall(r"[가-힣]{2,}", s) if w not in _STOP}


def tool_examples() -> dict:
    """도구 → 「쓸 때」 절의 예시 발화 낱말 집합.

    ⚠ **「쓰지 말 때」 뒤는 자른다.** 그 절에는 *다른* 도구의 예시가 실려 있어서,
      안 자르면 `compare_products` 가 `compare_unit_price` 의 예시('100ml당')를
      자기 것으로 들고 온다 — 그러면 감사기가 정반대로 찍는다.
    """
    from app.tools.definitions import TOOLS
    out = {}
    for t in TOOLS:
        d = t["description"]
        # ⚠ **「쓸 때」라는 낱말이 없는 설명문이 있다.** `compare_products` 는
        #   *"'뭐가 더 싸요?'·'제일 싼 거'… 는 전부 이 도구다"* 로 쓴다.
        #   처음엔 `find("쓸 때") < 0` 이면 건너뛰었는데, 그러면 **도구 5종이
        #   감사에서 통째로 빠졌다**(get_product · compare_purchase_popularity ·
        #   get_popular_products · compare_products · predict_availability).
        #   자가 **서식을 가정하고 그 가정이 틀린 곳을 안 본** 것이다.
        #   ⇒ 「쓸 때」가 없으면 **「쓰지 말 때」 앞 전부**를 쓴다.
        i = d.find("쓸 때")
        j = d.find("쓰지 말 때", max(i, 0))
        seg = d[max(i, 0): j if j > 0 else len(d)]
        # 작은따옴표 안의 예시 발화만 — 설명문 본문은 우리 말이지 손님 말이 아니다
        ex = re.findall(r"'([^']{2,40})'", seg)
        if ex:
            out[t["name"]] = _words(" ".join(ex))
    return out


def spec_cells() -> list:
    """`distill_spec.py` 에서 (칸 이름, 사용자 발화들, 부르는 도구들).

    정규식으로 소스를 읽는다 — import 하면 `models/` 의존성(백엔드·출하물)이
    전부 필요해지고, 그러면 **감사기가 검사 대상의 기동을 요구**하게 된다
    (`CLAUDE.md §2-5b` 의 모드 ②와 같은 판단).
    """
    src = open(SPEC, encoding="utf-8").read()
    cells = []
    # `def cell_xxx(rng, mat):` 부터 다음 `def ` 전까지가 한 칸
    for m in re.finditer(r"^def (cell_\w+)\(", src, re.M):
        name = m.group(1)
        nxt = re.search(r"^def \w+\(", src[m.end():], re.M)
        body = src[m.end(): m.end() + (nxt.start() if nxt else len(src))]
        # ⚠ `t.user(...)` 는 **괄호를 맞춰** 떠낸다 (08-30 수정).
        #   전에는 `chunk.split("))")` 로 잘랐는데, `t.user(fill(rng.choice([...])))`
        #   처럼 중첩이 깊으면 엉뚱한 데서 끊겨 **발화 대신 코드 조각**이
        #   잡혔다(`cell_stock_replen` 이 `['name', 'sku_id']` 로 나왔다).
        #   그 상태로 충돌을 세면 **자가 코드를 비교**하게 된다.
        def _balanced(text, start):
            depth, i = 1, start
            while i < len(text) and depth:
                depth += (text[i] == "(") - (text[i] == ")")
                i += 1
            return text[start:i]

        users = []
        for um in re.finditer(r"t\.user\(", body):
            seg = _balanced(body, um.end())
            found = re.findall(r'"([^"]{4,80})"', seg)
            # ⚠ **변수를 따라간다** (08-30). 칸의 절반은 발화를 먼저 변수에
            #   담는다 — `q = fill(rng.choice([...]))` 다음 `t.user(q)`.
            #   괄호만 떠내면 `q` 한 글자가 잡히고 **발화가 통째로 사라진다.**
            #   그렇게 빈 칸이 5개였고, 그중 하나가 B 가 08-30 에 라우팅
            #   충돌로 물린 `cell_stock_replen` 이다 — **잴 자리가 비어 있으면
            #   충돌은 영영 안 보인다.**
            if not found:
                var = seg.strip().rstrip(")").strip()
                if re.fullmatch(r"\w+", var):
                    am = re.search(r"%s\s*=\s*\w*\(" % re.escape(var), body)
                    if am:
                        found = re.findall(r'"([^"]{4,80})"',
                                           _balanced(body, am.end()))
            users += found
        cells.append((name, users, body))

    # ── 도구는 **헬퍼를 따라가서** 센다 (08-30) ──────────────────────────────
    # ⚠ 이걸 안 하면 자가 **틀린 것을 잡는다.** 08-30 에 왕복판 칸 넷을
    #   "라우팅 충돌"로 찍고 B 에게 보낼 뻔했다. 실제로는 그 칸들이
    #   `_replen_scene(t, row)` 라는 헬퍼를 부르고 그 안에서 `first_hit` +
    #   `get_inventory` 를 한다 — **부르는데 안 부르는 것으로 보였다.**
    #
    #   > 자가 소스를 읽을 때 **한 겹만 읽으면 한 겹 아래를 없는 것으로 센다.**
    #   > 그리고 없는 것은 늘 「덜 부른다」로 보여서, 이 검사기는 **거짓
    #   > 양성 쪽으로만** 틀린다.
    #
    #   완전한 호출 그래프는 아니다(재귀·간접 호출은 안 따라간다). 다만
    #   생성기의 헬퍼는 한 겹이라 이만큼이면 실측으로 맞는다.
    helpers = {}
    for hm in re.finditer(r"^def (_?\w+)\(", src, re.M):
        hn = hm.group(1)
        if hn.startswith("cell_"):
            continue
        hnx = re.search(r"^def \w+\(", src[hm.end():], re.M)
        hb = src[hm.end(): hm.end() + (hnx.start() if hnx else len(src))]
        t = set(re.findall(r't\.call\("(\w+)"', hb))
        if "first_hit(" in hb:
            t.add("search_products")
        if t:
            helpers[hn] = t

    def _tools_of(body: str) -> set:
        t = set(re.findall(r't\.call\("(\w+)"', body))
        if re.search(r"first_hit\(", body):
            t.add("search_products")           # first_hit 은 검색 한 번이다
        for hn, ht in helpers.items():
            if re.search(r"%s\(" % re.escape(hn), body):
                t |= ht
        return t

    return [(n, u, sorted(_tools_of(b))) for n, u, b in cells]


def _cell_materials() -> dict:
    """칸 → 그 칸이 쓰는 **재료 웅덩이 이름들**(`mat["replen"]` 의 키).

    [왜 이것이 「같은 세계 상태」의 대리 지표인가] 생성기는 칸마다 조건에 맞는
    재료를 미리 걸러 웅덩이에 담는다(`mat["replen"]` 은 08-28 실측으로
    **PICK 0 · 보충 대기**만 남긴 것이다). 같은 웅덩이에서 뽑았다면 그 칸들이
    보는 세계 국면이 같다는 뜻이고, 그러면 **도구 시퀀스도 같아야** 한다.

    발화의 낱말보다 이쪽이 정확하다 — 표현은 칸마다 다르게 쓰지만
    **재료는 코드가 고른다.**
    """
    src = open(SPEC, encoding="utf-8").read()
    out = {}
    for m in re.finditer(r"^def (cell_\w+)\(", src, re.M):
        nxt = re.search(r"^def \w+\(", src[m.end():], re.M)
        body = src[m.end(): m.end() + (nxt.start() if nxt else len(src))]
        # ⚠ **검색어 웅덩이(`kw*`)는 뺀다.** 그건 세계 상태가 아니라 **검색
        #   국면**이다(1건·소수·다수절단·0건). `kw1` 을 같이 쓴다는 것은
        #   "상품 아무거나 하나"라는 뜻이라, 그 위에서 도구가 갈리는 것은
        #   **의도가 달라서**지 모순이 아니다(재고를 묻느냐 가격을 묻느냐).
        #   안 빼면 39쌍 중 대부분이 이 잡음이었다.
        #
        #   > 같은 재료를 쓴다고 같은 국면인 것이 아니다. **무엇으로 걸러진
        #   > 웅덩이인가**가 신호다 — `replen` 은 「PICK 0 · 보충 대기」로
        #   > 걸러진 것이고, `kw1` 은 「검색하면 1건」으로 걸러진 것이다.
        out[m.group(1)] = {x for x in re.findall(r'mat\["(\w+)"\]', body)
                           if not x.startswith("kw")}
    return out


def main() -> None:
    for s in (sys.stdout, sys.stderr):
        try:
            s.reconfigure(encoding="utf-8")
        except Exception:                                    # noqa: BLE001
            pass

    ex = tool_examples()
    cells = spec_cells()
    print("도구 %d종의 「쓸 때」 예시 · 명세 칸 %d개\n" % (len(ex), len(cells)))

    flags = []
    for name, users, tools in cells:
        w = set()
        for u in users:
            w |= _words(u)
        if not w:
            continue
        for tool, tw in ex.items():
            if tool in tools:
                continue                       # 이미 부른다 — 볼 것 없다
            hit = w & tw
            # 두 낱말 이상 겹칠 때만. 하나면 우연이 너무 많다(실측으로 정했다).
            if len(hit) >= 2:
                flags.append((name, tool, sorted(hit), tools))

    # ── ② 칸 **사이**의 라우팅 충돌 (08-30 신설) ─────────────────────────────
    # [왜 따로 보나] ①은 칸을 **도구 정의**와 견준다. 그런데 08-30 에 B 가
    #   물린 것은 정의와의 어긋남이 아니라 **칸끼리의 모순**이었다.
    #
    #     stock_replen    22건  search + inventory + predict_availability
    #     guard_stockout  22건  search + inventory
    #
    #   같은 세계 상태(PICK 0 · BULK 있음)에 **정확히 반반으로 갈린 두 라우팅**
    #   이고 모델이 짧은 쪽을 골랐다. 킬링 장면 1 은 확률을 요구한다.
    #   ⚠ **두 칸은 따로 보면 심판 셋을 다 통과한다.** 모순이 칸 *사이*에 있다.
    #
    # [왜 사람이 못 보나] B 는 이 부류를 **이미 알고 있었다** —
    #   `cell_stock_replen` 주석에 *"같은 질문을 여기 두면 같은 물음에 두 가지
    #   도구 시퀀스를 가르치게 되고, 심판 셋은 그걸 못 잡는다"* 고 적고
    #   `avail_curve` 와의 충돌은 막았다. **그런데 `guard_stockout` 과의 충돌은
    #   못 봤다.** 같은 파일에서 한 쌍은 보고 다른 쌍은 못 본다 —
    #   칸이 93개면 쌍은 4,278개다. 사람이 훑을 수 있는 수가 아니다.
    #
    # [무엇을 신호로 보나] 발화의 낱말이 많이 겹치는데 도구 시퀀스가 다르면
    #   후보다. ⚠ 판정은 사람이 한다 — 일부러 다르게 가르치는 짝도 있다
    #   (`stock_zero` 는 대체품으로 가고 `stock_replen` 은 보충으로 간다.
    #   그건 세계 상태가 달라서지 모순이 아니다).
    # [무엇을 신호로 쓰나 — **낱말이 아니라 재료다**]
    #   처음엔 발화의 낱말 겹침으로 셌다. 그런데 표적(`stock_replen` ↔
    #   `guard_stockout`)이 겹치는 낱말이 둘뿐이라 신호가 얇고, 반대로
    #   `cell_vague`(되묻기 · 도구 0개)가 **모든 칸과 짝**이 되어 잡음이 넘쳤다.
    #
    #   더 날카로운 것이 코드에 있다 — **`mat["…"]` 재료 웅덩이**다.
    #
    #     stock_replen    mat["replen"]   inventory + predict_availability
    #     avail_curve     mat["replen"]   inventory + predict_availability
    #     guard_stockout  mat["replen"]   predict_availability            ← 갈린다
    #
    #   같은 웅덩이에서 뽑았다는 것은 **같은 세계 상태**라는 뜻이다(그 웅덩이가
    #   실측으로 걸러진 것이라 더 그렇다). 그 위에서 도구가 갈리면 모델은
    #   같은 국면에 두 가지 답을 배우고, **짧은 쪽으로 기운다.**
    #
    # ⚠ 판정은 사람이 한다 — 일부러 다르게 가르치는 짝도 있다(왕복판은
    #   틀린 뒤 돌아오는 법을 가르치므로 시퀀스가 달라도 된다. 다만 **착지가
    #   같아야** 한다).
    mats = _cell_materials()
    pairs = []
    for i, (n1, _u1, t1) in enumerate(cells):
        m1 = mats.get(n1) or set()
        if not m1 or not t1:
            continue                       # 재료가 없거나 도구를 안 부르는 칸
        for n2, _u2, t2 in cells[i + 1:]:
            m2 = mats.get(n2) or set()
            if not m2 or not t2 or set(t1) == set(t2):
                continue
            shared = m1 & m2
            # **한쪽이 다른 쪽의 부분집합**일 때만 — 도구가 통째로 다르면 그건
            # 다른 의도지 모순이 아니다. 위험한 것은 **같은 길을 가다 한쪽이
            # 덜 가는** 짝이다.
            if shared and (set(t1) < set(t2) or set(t2) < set(t1)):
                pairs.append((n1, t1, n2, t2, sorted(shared)))

    if pairs:
        print("\n── ② 칸 사이 라우팅 충돌 후보 %d쌍 ──────────────────" % len(pairs))
        print("   (같은 재료 = 같은 세계 상태. 거기서 도구가 갈리면 모델은")
        print("    **짧은 쪽**을 배운다 — 08-30 에 킬링 장면 1 이 그렇게 죽었다)\n")
        for n1, t1, n2, t2, shared in pairs:
            short = n1 if len(t1) < len(t2) else n2
            print("  재료 mat[%s]" % ", ".join('"%s"' % s for s in shared))
            print("    %-22s %s" % (n1, ", ".join(t1)))
            print("    %-22s %s" % (n2, ", ".join(t2)))
            print("    → **%s 가 짧다**\n" % short)

    if not flags:
        print("겹치는 칸 없음 — 라우팅 후보 0")
        return
    print("── 사람이 봐야 할 후보 %d건 ────────────────────────" % len(flags))
    print("   (겹침은 신호지 증거가 아니다. 의도가 다르면 정상이다)\n")
    for name, tool, hit, tools in flags:
        print("  %-24s 안 부름: %-24s 겹친 말: %s" % (name, tool, ", ".join(hit)))
        print("  %-24s 부르는 것: %s" % ("", ", ".join(tools) or "(없음)"))


if __name__ == "__main__":
    main()
