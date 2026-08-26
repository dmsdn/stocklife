# app/watchers/ — 자발형을 깨우는 감시자들의 패키지 (파일명세 §3).
#
# 셋이 계획되어 있고 오늘은 하나가 실물이다:
#   behavior.py  행동 신호(브라우저 → SSE)   — ✅ 08-21 ai-server 인수로 실물
#   world.py     세계 신호(백엔드 DB → SSE)  — ⬜ 08/28 (장면 1: 재고 전환)
#   schedule.py  시간 신호(스스로 기상)      — ⬜ 08/28 (재구매 시점 알림)
#
# 공통 규율: 감시자는 **판정까지만** 한다. 말할 권한은 etiquette.py가 발급하고,
# 문장은 loop가 만들고(가드 통과), 전달은 sot_client.push_proactive_message가 한다.
# 이 빈 파일이 폴더를 파이썬 패키지로 만든다(tools/__init__.py와 같은 역할).
