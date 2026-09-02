# ============================================================================
# 출하물이 사는 자리 — 세 자산이 공유하는 한 줄
# ============================================================================
# [왜 models/out 이 아닌가] 08-25에 소비주기 joblib을 `models/out/`에 넣고
#   .gitignore 예외로 추적했다. warehouse에서는 잘 돌지만 **서빙 경로가 끊긴다** —
#   팀 저장소(`2nd_Project`)에는 `models/` 폴더가 **아예 없다.**
#   거기 있는 것은 `Agent/`·`Backend/`·`frontend/`뿐이고, 손코딩으로 넘어가는 것도
#   `Agent/app/` 아래뿐이다. `infer.py`가 `../../models/out/`을 참조할 수 없다.
#
# [그래서 여기] `Agent/app/artifacts/`. 손코딩본과 **함께 움직이는** 유일한 자리다.
#   `main.py`의 lifespan이 상대경로로 적재한다(헌법 6 — 1회 로드 상주).
#
# [출하물과 중간 산출물의 경계] 둘 다 `out`에 나오지만 성격이 다르다.
#   중간 산출물  person_period.npz(13MB) · repurchase_intervals.npz(13MB)
#               → 다시 만들면 되고 아무도 적재하지 않는다. gitignore.
#   출하물      계수 · GBM · 갤러리 임베딩
#               → **하네스가 적재하는 그 파일**이다. 저장소에 있어야 한다.
#   B가 joblib을 추적하기로 한 판단은 옳았다(재생성이 몇 시간이라 원칙 ②가 안 걸린다).
#   바꾸는 것은 **자리**뿐이다.
# ============================================================================

import os

_HERE = os.path.dirname(os.path.abspath(__file__))
# ── 저장소 루트 찾기 (배치 무관) ────────────────────────────────────────────
# 이 파일은 두 곳에서 돈다: warehouse 는 `<루트>/models`, 팀 저장소는
# `<루트>/Agent/models` 다. 그래서 "두 칸 위가 루트"라고 박으면 한쪽에서 깨진다
# (팀 저장소에서는 `Agent/Agent/app/artifacts` 를 찾게 된다).
#
# **위로 올라가며 `Agent/app` 을 품은 조상을 찾는다.** 그러면 같은 파일이 양쪽에서
# 그대로 돈다 — 옮길 때 사람이 고칠 것이 없다.
# ⚠ 형제 참조(`../catalog` 등)는 이 처리가 필요 없다. 묶음이 함께 움직이므로
#   두 배치에서 이미 같다. 고쳐야 하는 것은 **묶음 밖을 가리키는 것뿐**이다.
def _find_root(start: str) -> str:
    d = start
    while not os.path.isdir(os.path.join(d, "Agent", "app")):
        parent = os.path.dirname(d)
        if parent == d:
            raise SystemExit(
                "저장소 루트를 못 찾았다 — `Agent/app` 을 품은 조상이 없다.\n"
                f"  시작점: {start}")
        d = parent
    return d


ARTIFACTS = os.path.join(_find_root(_HERE), "Agent", "app", "artifacts")


def path(name: str) -> str:
    """출하물 하나의 절대 경로. 폴더가 없으면 만든다."""
    os.makedirs(ARTIFACTS, exist_ok=True)
    return os.path.join(ARTIFACTS, name)
