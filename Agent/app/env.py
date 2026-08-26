# ============================================================================
# StoreFlow 하네스 — .env 로더 (2026-08-20, main.py에서 분리)
# ============================================================================
# [왜 별도 파일인가] 하네스의 입구가 둘이다 — 서버(main.py)와 평가 러너(eval/runner.py).
#   .env 적재가 main 안에 있으면 러너가 빠뜨린다. 실제로 첫 실호출(08-20)이
#   "키는 .env에 있는데 아무도 안 읽어서" 인증 오류로 12케이스 전멸했다.
#   **공용 준비 코드는 입구가 아니라 공용 자리에 둔다** — 두 입구가 같은 함수를
#   명시적으로 부른다. (임시로 썼던 "main을 import해 부작용으로 적재"는 동작은
#   하지만 '왜 안 쓰는 걸 import하지?'라는 질문을 낳는다 — 명시가 낫다.)
#
# [왜 config.py가 아닌가] config의 헌장이 "로직 없음, import 부작용 없음"이다.
#   파일을 읽고 환경(os.environ)을 바꾸는 코드는 그 헌장을 깬다.
#
# [왜 import만으로 자동 실행하지 않는가] 이 파일 끝에 load_env()를 적어두면
#   import 순간 저절로 돌아 편하지만, 그러면 다시 "부작용 import"가 된다.
#   부르는 쪽에 load_env() 한 줄이 보이는 것이 곧 문서다.
# ============================================================================
import os
import sys


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


def use_utf8_stdout() -> None:
    """표준출력을 utf-8로 바꾼다. **모든 진입점이 맨 먼저 부른다.**

    [무엇을 막나] 윈도우 콘솔의 기본 코드페이지는 cp949다. 우리 로그는 한글이고
      `—`(em dash)·`※` 같은 글자가 섞여 있는데, 그런 글자를 print 하면
      **UnicodeEncodeError 가 난다.** 파일 출력은 멀쩡한데 콘솔만 터진다.

    [왜 심각한가 — 08-26에 실제로 겪었다] dispatch._deliver 는 전체를
      `try/except Exception` 으로 감싼다(개입 하나가 실패해도 서버는 살아야 하니까).
      그 안의 **경고 print 가 인코딩으로 터지면** 광범위 except 가 그것까지 삼켜
      **개입이 통째로 사라진다.** 그리고 로그도 못 남기므로 원인이 안 보인다.
      스모크에서 미등록 유형 검사가 "통과"했는데, 알고 보니 의도한 경로가 아니라
      print 가 터져서 통과한 것이었다 — 검사가 거짓 안심을 주고 있었다.

    [왜 진입점인가] 라이브러리 모듈이 각자 표준출력을 만지면 누가 언제 바꿨는지
      알 수 없게 된다. `env.load()` 와 같은 규약 — **입구가 명시적으로 부른다.**

    [안 되는 환경] reconfigure 는 파이썬 3.7+ 의 io.TextIOWrapper 메소드다.
      stdout 이 파이프로 바뀐 경우 등 없을 수도 있어 hasattr 로 확인한다.
    """
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8")
