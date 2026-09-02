# -*- coding: utf-8 -*-
# ============================================================================
# 세계 재생성 — 버전 하나를 한 줄로 (DES설계 §10 의 선행 조건)
# ============================================================================
#   python sim/rebuild_world.py --list
#   python sim/rebuild_world.py --version v1            기준 세계 + 스냅샷
#   python sim/rebuild_world.py --version v3            축 하나만 켠 세계
#   python sim/rebuild_world.py --version v3 --dry      무엇을 돌릴지만
#   python sim/rebuild_world.py --verify-v1             훅이 v1 을 안 건드렸나
#   python sim/rebuild_world.py --restore               데모 세계(v1)로 되돌린다
#
# ─── 왜 이 파일이 마감 전에 있어야 하나 ─────────────────────────────────────
# §10 은 세계를 흔들어 결론의 민감도를 재는 실험이다. 그런데 지금 파이프라인은
# `mode1 → 학습 → 출하 → R` 이 **손으로** 이어져 있다. 버전 다섯을 손으로
# 돌리면 그 자체가 이틀이고, 그러면 §10 은 "하고 싶었던 것" 목록으로 끝난다.
# §10.5 가 이 스크립트를 이름까지 적어 선행 조건으로 못박은 이유다.
#
# ─── 왜 실험 자체는 09/06 뒤인가 ────────────────────────────────────────────
# 세계 파라미터 변경은 증분이 아니라 **rebuild** 다. 난수 소비 순서가 바뀌면
# 그 뒤 전원이 딴사람이 되므로 딸린 산출물이 **전부** 무효가 된다. 자산이
# 늘수록 비용이 계단식으로 커지니, 자산 12종이 다 선 뒤가 가장 싸다.
# **가장 비싼 시점이 유일하게 가능한 시점**이라는 뒤집힌 구조다(§10.2).
#
# ─── 안전 규율 셋 ───────────────────────────────────────────────────────────
# ① **데모 세계를 변종 상태로 두지 않는다.** v2~v5 를 돌리면 표준 출력 경로
#    (`sim/out/mode1/`)가 그 세계로 덮인다. 그런데 DB 에 적재된 시드도, 서빙
#    출하물도 v1 기준이다. 그래서 끝나면 **자동으로 v1 을 복원**한다
#    (`--keep` 으로 끌 수 있다). 안 그러면 다음 시연에서 "왜 재고가 다르지"가
#    난다 — 그때는 원인이 이틀 전 실험이라 아무도 못 찾는다.
# ② **v1 은 비트 단위로 재현돼야 한다.** 축 훅을 넣으면서 난수를 하나라도 더
#    뽑았으면 v1 이 v1 이 아니게 된다. `--verify-v1` 이 산출물 해시로 확인한다.
# ③ **한 축씩만 켠다**(one-at-a-time). 32조합이 아니라 v2~v5 넷 — 우리 질문은
#    "결론이 흔들리나"이지 "어느 조합이 최적인가"가 아니다(§10.4).
# ============================================================================
import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
import time

# ── 저장소 루트 찾기 (배치 무관) ────────────────────────────────────────────
# 이 파일은 두 곳에서 돈다: warehouse 는 `<루트>/sim`, 팀 저장소는
# `<루트>/Agent/sim` 다. 그래서 "두 칸 위가 루트"라고 박으면 한쪽에서 깨진다
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


_HERE = os.path.dirname(os.path.abspath(__file__))
_ROOT = _find_root(_HERE)
sys.path.insert(0, os.path.join(_ROOT, "Agent"))
from app.env import use_utf8_stdout                       # noqa: E402

OUT_MODE1 = os.path.join(_HERE, "out", "mode1")
WORLDS = os.path.join(_HERE, "out", "worlds")
ARTIFACTS = os.path.join(_ROOT, "Agent", "app", "artifacts")
MODELS_OUT = os.path.join(_ROOT, "models", "out")
PY = sys.executable

# ── 버전 정의 — 한 축씩 ─────────────────────────────────────────────────────
# 값의 근거는 DES설계 §10.1 표(W-5 현실성 결함 대장에서 나온 것들).
# `params` 는 `sim/params.py` 의 상수를 그대로 덮어쓴다.
VERSIONS = {
    "v1": {
        "축": "기준 — 아무것도 안 바꾼다",
        "params": {},
        "직격": "—",
        "왜": "비교의 원점. 다른 버전의 숫자는 전부 이것과의 차이로만 뜻이 있다",
    },
    "v2": {
        "축": "행사 반응",
        "params": {"PROMO_CYCLE_MULT": 0.8},
        "직격": "소비주기",
        "왜": "지금 consume.py 에 행사 항이 없다 — 행사 이력이 수요와 완전히 "
              "무관하다. 켜면 행사 때 20% 빨리 사고, 재구매 간격 분포가 흔들린다",
    },
    "v3": {
        "축": "이동 잡음",
        "params": {"TRAVEL_NOISE_SD": 0.15},
        "직격": "가용예측",
        "왜": "(sku, path) 조합 안의 이동시간 sd 가 실측 0.00초 — 완전 상수다. "
              "잡음을 넣으면 log_travel 특징이 상수에서 변수가 되고, "
              "B-5 재학습의 전제가 바뀐다",
    },
    "v4": {
        "축": "야간 보충",
        "params": {"NIGHT_RESTOCK": True},
        "직격": "가용예측 · 데모 서사",
        "왜": "지금은 영업시간에만 보충한다. 야간 보충은 현실적이지만 "
              "⚠ **아침에 큐가 비어 킬링 장면 1이 약해진다** — 채택 후보가 "
              "아니라 '결론이 흔들리나'를 재는 축이다",
    },
    "v5": {
        "축": "하역 CV",
        "params": {"HANDLING_GAMMA_K": 3.0},
        "직격": "가용예측(리드타임 꼬리)",
        "왜": "실측 CV 0.83 인데 감마 k=2 설계값은 0.71 — DEEP 혼합 탓이다. "
              "k 를 올리면 꼬리가 얇아진다. 새 상수가 필요 없는 유일한 축",
    },
}

# ── 단계 — 순서에 의존이 있다 ───────────────────────────────────────────────
# 각 항: (이름, 작업 디렉터리, 명령, 설명)
# ⚠ 사진·검색어 출하물은 여기 없다. 사진은 상품 이미지에서, 검색어는 카탈로그
#   이름에서 나오는데 **둘 다 세계 파라미터와 무관**하다 — 다시 구울 이유가 없다.
STAGES = [
    ("sim",   _HERE, [PY, "mode1.py", "--full"],
     "DES 완주 → purchases·shelf_events·consumer_events·lead_times"),
    ("pp",    os.path.join(_ROOT, "models"), [PY, "person_period.py"],
     "리드타임 → 구간(person-period) 표"),
    ("avail", os.path.join(_ROOT, "models"), [PY, "hazard_ship.py"],
     "가용예측 학습 → artifacts/availability_model.joblib"),
    ("rp",    os.path.join(_ROOT, "models"), [PY, "repurchase_period.py"],
     "구매 이력 → 재구매 구간 표"),
    ("cycle", os.path.join(_ROOT, "models"), [PY, "repurchase_ship.py"],
     "소비주기 학습 → artifacts/repurchase_model.joblib"),
    ("pref",  os.path.join(_ROOT, "models"), [PY, "preference_ship.py"],
     "취향 대조표 → artifacts/preference_model.npz"),
]

# 스냅샷에 담는 것 — **입력이 아니라 결과**만. 카탈로그·도면은 세계와 무관하다.
SNAP_FILES = [
    (OUT_MODE1, "purchases.csv.gz"),
    (OUT_MODE1, "shelf_events.csv.gz"),
    (OUT_MODE1, "consumer_events.csv.gz"),
    (OUT_MODE1, "lead_times.csv.gz"),
    (OUT_MODE1, "history_seed.sql"),
    (OUT_MODE1, "stock_sync.sql"),
    (ARTIFACTS, "availability_model.joblib"),
    (ARTIFACTS, "repurchase_model.joblib"),
    (ARTIFACTS, "preference_model.npz"),
]


def _sha(path: str) -> str:
    """파일 해시. 세계가 정말 같은지/다른지를 **눈이 아니라 수로** 가른다.

    [왜 필요한가] "v1 을 다시 돌렸더니 같아 보인다"는 증거가 아니다. csv.gz 는
      1,000만 행이라 사람이 볼 수 없고, 요약 통계는 다른 세계에서도 비슷하게
      나온다. 해시는 한 바이트만 달라도 갈린다.
    ⚠ gzip 은 타임스탬프를 헤더에 넣는다 — mode1 이 `mtime=0` 으로 쓰지 않으면
      같은 내용도 해시가 갈린다. 그래서 `--verify-v1` 은 어긋났을 때
      **압축을 풀어 다시 비교**한다(아래 `_same_content`).
    """
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def _same_content(a: str, b: str) -> bool:
    """내용이 같은가. gz 는 풀어서 본다(헤더의 타임스탬프를 무시하려고)."""
    if _sha(a) == _sha(b):
        return True
    if not (a.endswith(".gz") and b.endswith(".gz")):
        return False
    import gzip
    ha, hb = hashlib.sha256(), hashlib.sha256()
    for path, h in ((a, ha), (b, hb)):
        with gzip.open(path, "rb") as f:
            for chunk in iter(lambda: f.read(1 << 20), b""):
                h.update(chunk)
    return ha.hexdigest() == hb.hexdigest()


def _write_params(overrides: dict) -> None:
    """`sim/params_override.py` 를 쓴다. `params.py` 끝이 이 파일을 읽는다.

    [왜 params.py 를 직접 안 고치나] 소스를 스크립트가 고치면 git diff 가
      실행할 때마다 더러워지고, 중간에 죽으면 **변종 상수가 남는다.** 다음
      사람(또는 내일의 나)이 그걸 모르고 v1 이라 믿는 세계를 만든다.
      덮어쓰기 파일은 git 이 무시하고, 지우면 자동으로 원상복귀다.
    """
    path = os.path.join(_HERE, "params_override.py")
    if not overrides:
        if os.path.exists(path):
            os.remove(path)
        return
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write("# 자동 생성 — rebuild_world.py 가 쓴다. 손으로 고치지 말 것.\n")
        f.write("# 이 파일이 있으면 params.py 의 상수가 아래로 덮인다.\n")
        for k, v in overrides.items():
            f.write(f"{k} = {v!r}\n")


def _run_stage(name: str, cwd: str, cmd: list, desc: str, dry: bool) -> float:
    print(f"\n── [{name}] {desc}")
    print(f"   $ {' '.join(os.path.basename(c) for c in cmd)}   (cwd={os.path.basename(cwd)})")
    if dry:
        return 0.0
    t0 = time.time()
    r = subprocess.run(cmd, cwd=cwd)
    dt = time.time() - t0
    if r.returncode != 0:
        # 중간에 죽으면 **덮어쓰기 파일을 반드시 지운다** — 남으면 다음 실행이
        # 조용히 변종 세계가 된다.
        _write_params({})
        raise SystemExit(f"\n❌ [{name}] 실패(코드 {r.returncode}). "
                         f"params_override.py 는 지웠다 — 다음 실행은 v1 이다.")
    print(f"   ✅ {dt:.0f}초")
    return dt


def snapshot(version: str, timings: dict) -> None:
    """산출물을 `sim/out/worlds/<version>/` 으로 뜬다 + 해시 대장."""
    dst = os.path.join(WORLDS, version)
    os.makedirs(dst, exist_ok=True)
    manifest = {"version": version, "축": VERSIONS[version]["축"],
                "params": VERSIONS[version]["params"],
                "직격": VERSIONS[version]["직격"], "초": timings, "파일": {}}
    for base, name in SNAP_FILES:
        src = os.path.join(base, name)
        if not os.path.exists(src):
            manifest["파일"][name] = None       # 없는 것도 적는다 — 침묵은 증거가 아니다
            continue
        shutil.copy2(src, os.path.join(dst, name))
        manifest["파일"][name] = {"sha256": _sha(src)[:16],
                                  "bytes": os.path.getsize(src)}
    with open(os.path.join(dst, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
    n = sum(1 for v in manifest["파일"].values() if v)
    print(f"\n■ 스냅샷 → sim/out/worlds/{version}/  ({n}/{len(SNAP_FILES)}개)")
    for k, v in manifest["파일"].items():
        print(f"   {'✅' if v else '⚠ 없음'} {k:32s} {v['sha256'] if v else ''}")


def restore() -> None:
    """v1 스냅샷을 표준 경로로 되돌린다 — 데모 세계 복구."""
    src = os.path.join(WORLDS, "v1")
    if not os.path.isdir(src):
        raise SystemExit("v1 스냅샷이 없다. 먼저 `--version v1` 을 한 번 돌려라 —\n"
                         "  그게 없으면 되돌릴 곳이 없어서 변종 세계가 그대로 남는다.")
    n = 0
    for base, name in SNAP_FILES:
        s = os.path.join(src, name)
        if os.path.exists(s):
            os.makedirs(base, exist_ok=True)
            shutil.copy2(s, os.path.join(base, name))
            n += 1
    _write_params({})
    print(f"■ v1 복원 — {n}개 되돌림. 데모 세계가 원상태다.")
    print("  ⚠ DB 는 별개다. 시드를 다시 적재해야 백엔드도 v1 을 본다"
          "(db/README_시드적재.md)")


def verify_v1() -> None:
    """축 훅이 v1 을 건드렸는지 본다 — **이 스크립트에서 제일 중요한 명령.**

    [무엇을 확인하나] `params_override` 없이 mode1 을 다시 돌린 결과가
      `worlds/v1/` 과 **바이트 단위로 같은가.** 다르면 훅 어딘가가 난수를
      더 뽑았다는 뜻이고, 그러면 v1 과의 비교가 전부 무의미해진다
      (차이가 축 때문인지 난수 어긋남 때문인지 갈리지 않는다).
    """
    base = os.path.join(WORLDS, "v1")
    if not os.path.isdir(base):
        raise SystemExit("v1 스냅샷이 없다. 먼저 `--version v1`.")
    _write_params({})
    _run_stage("sim", _HERE, [PY, "mode1.py", "--full"], "v1 재현 시도", False)
    bad = []
    for b, name in SNAP_FILES:
        if b != OUT_MODE1:
            continue                      # 학습 산출물은 여기서 안 본다(시간)
        ref, now = os.path.join(base, name), os.path.join(b, name)
        if not (os.path.exists(ref) and os.path.exists(now)):
            continue
        (print(f"   ✅ {name}") if _same_content(ref, now) else bad.append(name))
    if bad:
        print(f"\n❌ v1 이 재현되지 않았다 — {', '.join(bad)}")
        print("   축 훅 어딘가가 기본값에서도 난수를 뽑고 있다.")
        print("   `if P.X > 0:` 로 감싼 자리를 다시 보라 — 0 을 곱하는 것과")
        print("   아예 안 부르는 것은 다르다.")
        raise SystemExit(1)
    print("\n✅ v1 비트 단위 재현 — 축 훅이 기본값에서 세계를 안 건드린다")


def main() -> int:
    use_utf8_stdout()
    ap = argparse.ArgumentParser(add_help=True)
    ap.add_argument("--version", choices=list(VERSIONS))
    ap.add_argument("--list", action="store_true")
    ap.add_argument("--dry", action="store_true")
    ap.add_argument("--keep", action="store_true",
                    help="끝나고 v1 로 복원하지 않는다(연달아 돌릴 때)")
    ap.add_argument("--restore", action="store_true")
    ap.add_argument("--verify-v1", action="store_true")
    ap.add_argument("--stages", default="",
                    help="쉼표로 일부만 (예: sim,pp,avail)")
    a = ap.parse_args()

    if a.list:
        print("■ 세계 버전 — 한 축씩만 켠다 (DES설계 §10.4)\n")
        for k, v in VERSIONS.items():
            p = ", ".join(f"{x}={y}" for x, y in v["params"].items()) or "—"
            print(f"  {k}  {v['축']:12s} {p:28s} 직격: {v['직격']}")
            print(f"      {v['왜']}\n")
        print("  단계:", " → ".join(s[0] for s in STAGES))
        return 0
    if a.restore:
        restore()
        return 0
    if a.verify_v1:
        verify_v1()
        return 0
    if not a.version:
        ap.print_help()
        return 2

    v = VERSIONS[a.version]
    stages = [s for s in STAGES
              if not a.stages or s[0] in a.stages.split(",")]
    print(f"■ 세계 재생성 — {a.version} · {v['축']}")
    print(f"  {v['왜']}")
    print(f"  덮어쓸 상수: {v['params'] or '없음 (기준)'}")
    print(f"  단계 {len(stages)}개 · 예상 20~30분" + ("  (dry)" if a.dry else ""))

    if not a.dry:
        _write_params(v["params"])
    timings = {}
    try:
        for name, cwd, cmd, desc in stages:
            timings[name] = round(_run_stage(name, cwd, cmd, desc, a.dry), 1)
    finally:
        if not a.dry:
            _write_params({})          # 성공이든 실패든 상수는 원상복귀

    if a.dry:
        return 0
    snapshot(a.version, timings)

    if a.version != "v1" and not a.keep:
        print()
        restore()
    elif a.version != "v1":
        print("\n  ⚠ --keep — 표준 경로가 아직 "
              f"{a.version} 세계다. 시연 전에 `--restore` 를 잊지 말 것.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
