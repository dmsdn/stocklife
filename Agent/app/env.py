# ============================================================================
# Agent 하네스 — .env 로더
# ============================================================================

# [왜 별도 파일인가] 하네스의 입구가 둘이다 — 서버(main.py)와 평가 러너(eval/runner.py).

# ============================================================================
import os


def load_env() -> None:
    """Agent/.env 파일을 읽어 os.environ에 넣는다. 이미 있는 키는 건드리지 않는다.

    입구(main·runner)가 **다른 app 모듈보다 먼저** 불러야 한다 —
    tools/action.py가 import되는 순간 INTERNAL_SERVICE_KEY를 읽기 때문이다.
    """
    # __file__ = 이 파일의 경로. 그 부모의 부모가 Agent/ 이므로 Agent/.env 를 찾는다.
    # 실행 위치(cwd)에 기대지 않는 이유: 어느 폴더에서 띄우든 같아야 한다.
    path = os.path.join(os.path.dirname(__file__), "..", ".env")
    if not os.path.exists(path):
        return                # .env가 없으면 조용히 — 키는 셸 환경변수로 줄 수도 있다
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            # 빈 줄·주석(#)·= 없는 줄은 건너뛴다
            if not line or line.startswith("#") or "=" not in line:
                continue
            # partition("=") = 처음 만난 =를 기준으로 (앞, "=", 뒤) 세 조각.
            # split("=")과 달리 값 안에 =가 또 있어도(키가 base64 등) 안 깨진다.
            k, _, v = line.partition("=")
            # setdefault = "없을 때만 넣기". 셸에서 이미 준 환경변수가 파일보다
            # 우선한다 — 배포 환경이 파일을 덮어쓸 수 있어야 하기 때문.
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))
