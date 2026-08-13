from enum import Enum


class Intent(str, Enum):
    STOCK_CHECK = "STOCK_CHECK"   # "있어?", "재고 남아있어?"
    RECOMMEND = "RECOMMEND"       # "추천해줘", "필요해"
    PRICE_CHECK = "PRICE_CHECK"   # "얼마야?", "가격 알려줘"
    UNKNOWN = "UNKNOWN"           # 어느 트리거에도 안 걸림 -> 나중에 Claude API로 넘길 대상


# 순서가 중요: 위에서부터 검사해서 먼저 걸리는 걸 채택
INTENT_TRIGGERS: dict[Intent, list[str]] = {
    Intent.PRICE_CHECK: ["얼마", "가격", "값이"],
    Intent.STOCK_CHECK: ["있어", "있나", "있니", "재고", "남아있", "남았"],
    Intent.RECOMMEND: ["추천", "필요해", "필요한", "뭐가 좋", "뭐 사"],
}


def classify_intent(text: str) -> Intent:
    for intent, triggers in INTENT_TRIGGERS.items():
        for trigger in triggers:
            if trigger in text:
                return intent
    return Intent.UNKNOWN
