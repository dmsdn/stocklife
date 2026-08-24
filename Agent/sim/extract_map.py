# ============================================================================
# Agent 세계 생성 — 맵 추출기 (프론트 확정 맵 PDF → 배치표 파이썬 모듈)
# ============================================================================
# [역할] 프론트가 확정한 `애지중지_map.pdf`에서 랙·시설의 좌표를 기계적으로 뽑아 `sim/map_layout.py`로 굳힌다.

# [왜 world_gen이 PDF를 직접 읽지 않는가]
# ① PDF는 팀이 언제든 다시 내보내는 산출물이라, 세계 생성이 그 파일에 매달리면 "어제와 같은 세계"를 재현할 수 없다.
# 중간에 **사람이 검토한 배치표**를 두어야 세계가 결정적이 된다(catalog.py가 사전을 읽는 것과 같은 구조).
# ② 추출 결과를 diff할 수 있어야 "맵이 뭐가 바뀌었나"를 코드리뷰로 볼 수 있다.
# ③ world_gen이 pymupdf에 의존하지 않게 된다(배포·재현 부담 감소).

# [좌표계 — 이 파일이 정하고 이후 전부가 따른다]
# 단위: PDF 10pt = 격자 1칸 = **1m**. 맵의 매대 칸은 20pt(=2m)라 격자 2×2를 쓴다.
# 왜 20pt가 아니라 10pt인가: 프론트 맵의 일부 랙이 10pt(=반 칸) 어긋나 있어서, 20pt 격자로 스냅하면 랙이 서로 밀리거나 겹친다.
# 10pt면 **모든 좌표가 정수로 딱 떨어진다.**
# 원점: 매장 내부 좌상단. **y는 아래로 증가**(화면 좌표계).
# 왜 y-up이 아닌가: 이 좌표를 실제로 그리는 쪽은 프론트이고 CSS/캔버스는 y-down이다. 중간에 뒤집기를 넣으면 그 변환이 영원히 버그 표면으로 남는다.
# ============================================================================


import io
import os
import pymupdf

# 경로는 cwd가 아니라 이 파일 위치 기준 (08-20 개정 — world_gen과 같은 이유).
# PDF는 두 후보를 차례로 본다: ① sim/ 안(저장소 배치) ② 형제 기타파일/(작업장 배치).
_HERE = os.path.dirname(os.path.abspath(__file__))
_PDF_CANDIDATES = [os.path.join(_HERE, "애지중지_map.pdf"),
                   os.path.join(_HERE, "..", "기타파일", "애지중지_map.pdf")]
PDF = next((p for p in _PDF_CANDIDATES if os.path.exists(p)), _PDF_CANDIDATES[-1])
OUT = os.path.join(_HERE, "map_layout.py")

GRID = 10          # PDF pt per 격자 1칸 (= 1m)
BAY = 20           # 매대 한 칸의 PDF 크기 (= 격자 2칸 = 2m)

# 층별 [존 문자 → (색, 라벨)] — 색은 프론트 맵의 채움색, 우리 zone_id의 뒷글자와 일치.
# taxonomy.py의 존 문자를 08-18에 이 맵 기준으로 재배정했으므로 양쪽이 같은 글자를 쓴다.
ZONE_BY_COLOR = {
    1: {(0.84, 0.75, 0.72): ("A", "쌀·면·통조림"), (0.91, 0.75, 0.63): ("B", "간식·베이커리"),
        (0.74, 0.88, 0.75): ("C", "청과·채소"),   (0.96, 0.71, 0.72): ("D", "정육·수산·계란"),
        (0.93, 0.93, 0.74): ("E", "소스·조미료·오일"), (0.78, 0.89, 0.93): ("F", "음료·주류"),
        (0.83, 0.81, 0.91): ("G", "냉장식품"),     (0.72, 0.81, 0.87): ("H", "냉동식품")},
    2: {(0.74, 0.88, 0.75): ("A", "반려용품"),     (0.96, 0.71, 0.72): ("B", "뷰티·헬스"),
        (0.95, 0.81, 0.71): ("C", "수납·생활잡화"), (0.93, 0.93, 0.74): ("D", "화장지·위생"),
        (0.83, 0.81, 0.91): ("E", "주방용품"),     (0.78, 0.89, 0.93): ("F", "세탁·청소")},
    3: {(0.74, 0.88, 0.75): ("A", "스포츠·레저"),  (0.78, 0.89, 0.93): ("B", "홈·가전"),
        (0.93, 0.93, 0.74): ("C", "완구·문구"),    (0.96, 0.71, 0.72): ("D", "의류"),
        (0.83, 0.81, 0.91): ("E", "잡화·가방")},
}

# 회색 계열 = 시설(계산대·푸드코트·화장실·에스컬레이터·행사매대). 상품은 없지만
# **통행 불가**라 동선 솔버가 피해 다녀야 한다 — map_cells.passable=FALSE로 나간다.
FACILITY_FILLS = {(0.6, 0.6, 0.6), (0.85, 0.85, 0.85)}
IGNORE_FILLS = {(1.0, 1.0, 1.0), (0.0, 0.0, 0.0), (0.4, 0.4, 0.4)}

# 매장 내부 영역(PDF 좌표). 바깥 테두리와 상단 층수 배너를 제외한 실제 매장 바닥.
INTERIOR = (4, 104, 955, 851)      # x0, y0, x1, y1


def _rects(page):
    """페이지의 채워진 사각형을 (rect, fill) 목록으로. 중복 좌표는 한 번만."""
    seen, out = set(), []
    for dr in page.get_drawings():
        r, f = dr["rect"], dr.get("fill")
        if f is None:
            continue
        key = (round(r.x0, 1), round(r.y0, 1), round(r.width, 1), round(r.height, 1))
        if key in seen:
            continue
        seen.add(key)
        out.append((r, tuple(round(c, 2) for c in f)))
    return out


def _grid_lines(page):
    """격자 분할선을 세로/가로로 나눠 모은다. 매대 칸 수는 이 선을 세어 확정한다 —
    블록 폭을 20으로 나누는 방식은 폭이 20의 배수가 아닌 랙에서 틀린다."""
    v, h = [], []
    for dr in page.get_drawings():
        r = dr["rect"]
        if dr.get("fill") is None:
            continue
        if r.width <= 2 and r.height > 10:
            v.append((r.x0, r.y0, r.y1))
        if r.height <= 2 and r.width > 10:
            h.append((r.y0, r.x0, r.x1))
    return v, h


def _cells(rect, vlines, hlines):
    """블록 안의 분할선을 세어 (열, 행) 칸 수를 낸다."""
    nv = sum(1 for x, y0, y1 in vlines
             if rect.x0 + 2 < x < rect.x1 - 2 and y0 <= rect.y0 + 3 and y1 >= rect.y1 - 3)
    nh = sum(1 for y, x0, x1 in hlines
             if rect.y0 + 2 < y < rect.y1 - 2 and x0 <= rect.x0 + 3 and x1 >= rect.x1 - 3)
    return nv + 1, nh + 1


def _face(rect, cols, rows, ci, ri):
    """이 베이가 어느 방향 통로를 보고 있는가 → 'U'/'D'/'L'/'R'.

    왜 필요한가: locations.x,y는 스키마 정의상 **접근 지점**이다("평면상 접근 지점이고
    레벨은 높이일 뿐"). 랙 안쪽 좌표를 넣으면 통행 불가 셀을 목적지로 주게 되어
    동선 솔버가 매번 인접 셀을 되찾아야 한다. 양면 랙은 두 줄이 서로 **반대 통로**를
    보므로, 같은 랙이라도 줄에 따라 접근 지점이 갈린다.
    """
    horizontal = rect.width >= rect.height
    if horizontal:
        # 가로 랙: 위 줄은 위쪽 통로, 아래 줄은 아래쪽 통로를 본다.
        # 단면(1줄)이면 벽에 붙은 것이므로 벽 반대쪽을 본다.
        if rows == 1:
            return "D" if rect.y0 <= INTERIOR[1] + BAY else "U"
        return "U" if ri == 0 else "D"
    else:
        if cols == 1:
            return "R" if rect.x0 <= INTERIOR[0] + BAY else "L"
        return "L" if ci == 0 else "R"


def extract():
    doc = pymupdf.open(PDF)
    racks, facilities = [], []
    for pi, page in enumerate(doc):
        floor = pi + 1
        vlines, hlines = _grid_lines(page)
        zmap = ZONE_BY_COLOR[floor]
        for rect, fill in _rects(page):
            if fill in IGNORE_FILLS:
                continue
            # ── 시설: 내부 영역과 겹치는 회색 블록만. 페이지 배경·테두리는 제외
            if fill in FACILITY_FILLS:
                x0 = max(rect.x0, INTERIOR[0]); y0 = max(rect.y0, INTERIOR[1])
                x1 = min(rect.x1, INTERIOR[2]); y1 = min(rect.y1, INTERIOR[3])
                if x1 - x0 < 5 or y1 - y0 < 5:
                    continue
                if (x1 - x0) * (y1 - y0) > 0.8 * (INTERIOR[2] - INTERIOR[0]) * (INTERIOR[3] - INTERIOR[1]):
                    continue                      # 바닥 전체를 덮는 배경 사각형
                facilities.append((floor,
                                   round((x0 - INTERIOR[0]) / GRID), round((y0 - INTERIOR[1]) / GRID),
                                   round((x1 - x0) / GRID), round((y1 - y0) / GRID)))
                continue
            # ── 랙: 존 색으로 식별
            if fill not in zmap or rect.width * rect.height < 150:
                continue
            zletter, _ = zmap[fill]
            cols, rows = _cells(rect, vlines, hlines)
            for ri in range(rows):
                for ci in range(cols):
                    bx = rect.x0 + ci * BAY
                    by = rect.y0 + ri * BAY
                    racks.append((floor, zletter,
                                  round((bx - INTERIOR[0]) / GRID),
                                  round((by - INTERIOR[1]) / GRID),
                                  _face(rect, cols, rows, ci, ri)))
    return racks, facilities


def write(racks, facilities):
    gw = round((INTERIOR[2] - INTERIOR[0]) / GRID)
    gh = round((INTERIOR[3] - INTERIOR[1]) / GRID)
    with io.open(OUT, "w", encoding="utf-8", newline="\n") as f:
        f.write('"""프론트 확정 맵에서 추출한 배치표 — extract_map.py 생성물.\n\n'
                '직접 수정 금지: 맵이 바뀌면 PDF를 갈고 `python sim/extract_map.py`로 재생성한다.\n'
                '좌표계: 격자 1칸 = 1m, 원점 = 매장 내부 좌상단, **y는 아래로 증가**(화면 좌표계).\n'
                'BAYS 한 줄 = 매대 한 칸(2m×2m, 격자 2×2) = 6단 로케이션의 밑동.\n'
                'face = 이 베이가 보는 통로 방향(U/D/L/R) → 접근 지점 계산에 쓴다.\n"""\n\n')
        f.write(f"GRID_M = 1          # 격자 1칸의 실제 크기(m)\n")
        f.write(f"FLOOR_W = {gw}        # 매장 가로 격자 수\n")
        f.write(f"FLOOR_H = {gh}        # 매장 세로 격자 수\n")
        f.write(f"BAY_CELLS = 2       # 매대 한 칸이 차지하는 격자 (2×2)\n\n")
        f.write("# (floor, zone_letter, gx, gy, face)\n")
        f.write(f"BAYS = [\n")
        for r in sorted(racks, key=lambda t: (t[0], t[1], t[3], t[2])):
            f.write(f"    ({r[0]}, {r[1]!r}, {r[2]}, {r[3]}, {r[4]!r}),\n")
        f.write("]\n\n")
        # 존 라벨을 여기서 함께 내보내는 이유: 에이전트가 "1층 A구역(쌀·면·통조림)"
        # 이라고 말할 때 **손님이 매장에서 보는 안내판과 같은 말**이어야 한다.
        # 대분류명(가공식품)으로 대신하면 맵의 글자와 에이전트의 말이 갈린다.
        f.write("# (floor, zone_letter) → 맵 안내판 라벨\n")
        f.write("ZONE_LABELS = {\n")
        for fl in sorted(ZONE_BY_COLOR):
            for _c, (zl, label) in sorted(ZONE_BY_COLOR[fl].items(), key=lambda kv: kv[1][0]):
                f.write(f"    ({fl}, {zl!r}): {label!r},\n")
        f.write("}\n\n")
        f.write("# (floor, gx, gy, w, h) — 통행 불가 시설(계산대·푸드코트·에스컬레이터·행사매대 등)\n")
        f.write("FACILITIES = [\n")
        for t in sorted(set(facilities)):
            f.write(f"    ({t[0]}, {t[1]}, {t[2]}, {t[3]}, {t[4]}),\n")
        f.write("]\n\n")
        f.write(f"assert len(BAYS) == {len(racks)}, len(BAYS)\n")


if __name__ == "__main__":
    racks, facilities = extract()
    write(racks, facilities)
    from collections import Counter
    per = Counter((r[0], r[1]) for r in racks)
    print(f"베이 {len(racks)} · 시설 {len(set(facilities))} → {OUT}")
    for k in sorted(per):
        print(f"   {k[0]}F-{k[1]}: {per[k]:>4}칸 → PICK {per[k]*3}")
