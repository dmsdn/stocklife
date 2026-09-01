# -*- coding: utf-8 -*-
"""**골든셋이 `read_as` 를 몇 개나 밟나** — 옮긴 규율의 커버리지를 잰다.

[왜 이 파일이 있나 — 08-29]
㉠ 로 규율을 도구 정의에서 **결과(`read_as`)로 옮기고 있다.** 그 자리 바꿈이
옳았는지는 "결과에 실린 규율을 모델이 지키나"로만 판정되는데, 그러려면
**골든셋이 그 갈래를 실제로 밟아야 한다.**

밟지 않으면 어떻게 되나: 규율을 옮기고, 골든셋은 초록이고, 아무도 그 규율이
지켜지는지 모른다. 실제로 그랬다 — `compare_products` 의 행사 안내를 결과로
옮긴 날, 골든셋의 비교 케이스 두 상품이 **둘 다 정가**라 57회 내내 그 갈래를
한 번도 안 밟았다. 눈으로 발화를 읽다가 우연히 알았다.

> **있지도 않은 것을 검사한 자는 늘 초록이다.**
> 여기서는 한 겹 더 깊다 — 검사하기는 하는데, **검사 대상이 한 번도 안 온다.**

[무엇을 하나] 골든셋을 한 바퀴 돌리면서 도구 결과에 `read_as` 가 실릴 때마다
어느 도구의 어느 갈래였는지 기록한다. 끝나면 **소스에 있는 `read_as` 자리**와
대조해 **한 번도 안 밟힌 것**을 찍는다.

[부작용] 없다. `loop._dispatch` 를 감싸기만 하고 결과를 안 고친다.

실행:
    C:\\venvs\\2nd_project311\\Scripts\\python.exe -m eval.read_as_coverage
    (백엔드·MySQL 필요 — `--real` 골든셋을 쓴다)
"""
from __future__ import annotations

import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import env                                          # noqa: E402
env.load_env()

from app import loop, sot_client                             # noqa: E402
from eval import golden_real                                 # noqa: E402

_TOOLS_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                          "app", "tools")


def source_sites() -> list[tuple[str, int, str]]:
    """소스에서 `read_as` 를 내는 **자리**를 센다 (파일, 줄, 미리보기).

    갈래마다 `read_as` 가 하나씩이라 자리 수 = 갈래 수다. 도구 이름이 아니라
    **자리**로 세는 이유: 한 도구가 갈래마다 다른 규율을 싣는다(사진 tier 셋,
    재구매 이력有/無 둘). 도구 단위로 세면 갈래 하나만 밟고 "덮었다"가 된다.
    """
    out = []
    for fn in sorted(os.listdir(_TOOLS_DIR)):
        if not fn.endswith(".py"):
            continue
        path = os.path.join(_TOOLS_DIR, fn)
        with open(path, encoding="utf-8") as f:
            lines = f.readlines()
        for i, ln in enumerate(lines, 1):
            # ⚠ `"read_as"` 리터럴만 세면 **분모가 조용히 줄어든다** (08-30).
            #   `query.py` 의 두 규율(잘림·후보정)을 `notes` 리스트로 합치자
            #   자리 수가 13 → 12 가 됐다. 규율은 그대로 둘인데 세는 방법이
            #   바뀐 것이라, **커버리지가 실제보다 좋아 보인다.**
            #
            #   > 분모를 만드는 규칙이 코드 모양에 기대면, 코드를 정리하는 것
            #   > 만으로 점수가 오른다. 그건 잰 것이 아니라 눈금을 옮긴 것이다.
            #
            #   ⇒ 규율을 **쌓는** 꼴(`notes.append(`)도 한 자리로 센다.
            #   ⚠ 그리고 **내보내는 자리는 규율이 아니다.** `" ".join(notes)` 는
            #     쌓아 둔 것을 실어 보낼 뿐이라, 세면 규율 하나가 둘로 잡힌다.
            if "join(notes)" in ln:
                continue
            if '"read_as"' in ln or "notes.append(" in ln:
                # 미리보기는 그 줄 + 다음 줄에서 한글 조각을 뽑는다
                blob = ln + (lines[i] if i < len(lines) else "")
                m = re.findall(r"[가-힣][가-힣 ·’'\"]{6,}", blob)
                out.append((fn, i, (m[0].strip() if m else ln.strip())[:38]))
    return out


def main() -> None:
    for s in (sys.stdout, sys.stderr):
        try:
            s.reconfigure(encoding="utf-8")
        except Exception:                                    # noqa: BLE001
            pass

    sites = source_sites()
    print("소스의 read_as 자리 %d개\n" % len(sites))

    # ⚠⚠ **출하물을 손으로 적재한다.** `main.py` 의 lifespan 을 안 타므로 안 하면
    #   추론 도구 넷(가용·소비주기·사진·취향)이 `model_not_loaded` 를 내고,
    #   그 결과에는 `read_as` 가 없다.
    #
    #   08-29 에 이 줄이 없어서 **"골든셋이 안 밟는다"로 읽히는 표가 나왔다** —
    #   실제로는 `real_scene1` 이 `predict_availability` 를 제대로 부르고 있었다
    #   (직접 추적으로 확인). 재는 자가 **"안 부른다"와 "부르는데 모델이 없다"를
    #   못 갈랐다.** 그대로 보고했으면 없는 구멍 열 개를 메우게 했을 것이다.
    #
    #   ⚠ 이 경고는 **B 가 `distill_eval.py:283` 에 똑같이 써 놓았고 그날 아침
    #   내가 교차 검토로 읽었다.** 읽은 함정에 그대로 빠졌다 —
    #   **남의 코드에서 본 위험은 내 코드에서 안 보인다.**
    from app.tools import infer
    infer.load_all()
    try:
        from app import searchterm
        searchterm.load()                    # 후보정 갈래(query.py:203)의 선행
    except Exception as e:                                   # noqa: BLE001
        print("⚠ 검색어 색인 적재 실패 — 후보정 read_as 가 안 밟힌다: %r" % e)

    seen: dict[str, list[str]] = {}          # 도구 → [read_as 앞머리, …]
    orig = loop._dispatch

    def _walk(node, out, depth=0):
        """결과 안의 `read_as` 를 **중첩까지** 훑는다.

        ⚠ 08-29: 처음엔 최상위 `result["read_as"]` 만 봤다. 그런데
          `predict_repurchase` 는 **`items[]` 안쪽에 항목마다** `read_as` 를
          싣는다(`_repurchase_one` 이 그 자리다 — infer.py:513·633).
          그래서 그 두 자리가 **밟히는데도 ⬜ 로 찍혔고**, 나는 "골든셋에
          케이스가 없다"로 읽어 없는 구멍을 메우려 했다.

          > **자가 어디까지 들여다보는지가 곧 자가 재는 범위다.**
          > 결과의 모양은 도구마다 다른데 계측기는 하나의 모양을 가정했다.

          깊이는 3 까지만 — 그 아래는 우리 도구가 규율을 싣는 자리가 아니고,
          제한이 없으면 큰 결과(경로 폴리라인)에서 시간을 태운다.
        """
        if depth > 3 or not isinstance(node, (dict, list)):
            return
        if isinstance(node, dict):
            if node.get("read_as"):
                out.append(str(node["read_as"])[:38])
            for v in node.values():
                _walk(v, out, depth + 1)
        else:
            for v in node[:12]:                  # 목록은 앞 12개면 갈래가 다 나온다
                _walk(v, out, depth + 1)

    def spy(name, tool_input):
        result, src = orig(name, tool_input)
        heads: list = []
        _walk(result, heads)
        for head in heads:
            seen.setdefault(name, [])
            if head not in seen[name]:
                seen[name].append(head)
        return result, src

    loop._dispatch = spy
    try:
        cases = golden_real.build(golden_real.fixtures(sot_client))
        ran = skipped = 0
        for c in cases:
            need = c.get("needs")
            if not c["q"]:
                skipped += 1
                print("  SKIP %s (재료 없음)" % c["id"])
                continue
            loop.run_chat(c["q"], consumer_id=c.get("consumer_id"),
                          session_id=c.get("session_id"),
                          position=c.get("position"), history=[])
            ran += 1
            print("  · %s" % c["id"], flush=True)
    finally:
        loop._dispatch = orig

    print("\n케이스 %d개 실행 · %d개 SKIP\n" % (ran, skipped))
    print("── 밟힌 read_as ──────────────────────────────────")
    hit = 0
    for tool in sorted(seen):
        for head in seen[tool]:
            hit += 1
            print("  ✅ %-24s %s…" % (tool, head))
    # ⚠ **단위를 섞지 않는다.** `hit` 은 런타임 갈래 수이고 `sites` 는 소스 줄
    #   수인데, `get_position` 은 **소스 한 줄이 tier 셋**을 낸다(`read_as: say`).
    #   둘을 나란히 찍으면 "7/13" 이 되어 실제(자리 5/13)보다 후하게 보인다.
    #   08-29 에 실제로 그렇게 찍혔다 — **재는 자가 자기 눈금을 잘못 읽었다.**
    #   자리 커버리지는 **read_as 앞머리를 소스 미리보기와 맞춰** 센다.
    covered = set()
    for tool in seen:
        for head in seen[tool]:
            for j, (fn, ln, prev) in enumerate(sites):
                # ⚠ **앞머리를 16자까지 본다.** 처음엔 10자였는데 그 길이에서
                #   read_as 둘이 **글자까지 같다**:
                #     infer.py:456  "곡선은 '그 시점까지 보충이 끝날 확률'입니다"
                #     infer.py:633  "곡선은 '그 시점까지 다시 살 확률'입니다"
                #   앞 10자가 "곡선은 '그 시점까" 로 동일해서, **가용의 read_as
                #   하나가 재구매 자리까지 ✅ 로 칠했다**(08-29 실측 6/13 → 실제
                #   5/13). 두 규율이 같은 문형으로 시작하는 것은 우연이 아니라
                #   우리가 **일부러 같은 틀로 썼기 때문**이라, 이 충돌은 앞으로도
                #   는다. 13번째 글자에서 갈리므로 16 이면 넉넉하다.
                key = prev.strip('" ').strip()
                if key and len(key) >= 6 and (head.startswith(key[:16])
                                              or key[:16] in head):
                    covered.add(j)
    # 소스 줄에 한글이 없는 자리(`_PHOTO_SAY[tier]` · `say`)는 글자로 못 맞춘다.
    # 그 둘만 도구 이름으로 잇는다 — 손으로 적되 **적었다는 것을 남긴다.**
    _BY_TOOL = {"identify_product_photo": "_PHOTO_SAY", "get_position": '"read_as": say'}
    for tool, mark in _BY_TOOL.items():
        if tool in seen:
            for j, (fn, ln, prev) in enumerate(sites):
                if mark in prev:
                    covered.add(j)
    print("\n  밟은 **자리** %d / %d   (런타임 갈래 %d — 한 자리가 여러 갈래를 "
          "낸다: tier)" % (len(covered), len(sites), hit))
    if len(covered) < len(sites):
        print("\n⚠ **안 밟힌 자리가 있다.** 그 규율은 결과에 실려 있지만 "
              "골든셋이 한 번도 안 부른다 —\n"
              "   옮겨 놓고 재지 않는 것이라, 지켜지는지 아무도 모른다.")
        print("   소스 자리 전부 (⬜ = 골든셋이 한 번도 안 밟는다):")
        for j, (fn, ln, prev) in enumerate(sites):
            print("     %s %s:%-5d %s…"
                  % ("✅" if j in covered else "⬜", fn, ln, prev))


if __name__ == "__main__":
    main()
