"""
'사전 구축'이란: 머신러닝 학습이 아니라, DB에 실제로 존재하는
브랜드명/카테고리명/상품명 단어들을 모아서 "이 단어가 나오면 이 상품과 관련있다"는
매칭 테이블을 만드는 작업입니다.

예) DB에 '코베아' 브랜드 상품이 있으면, 사전에 '코베아'가 등록되고,
    이후 사용자가 "코베아 제품 있어?"라고 물으면 이 단어가 매칭됩니다.

이 사전은 상품 데이터가 바뀔 때마다(신상품 추가 등) 다시 만들어져야 하므로,
refresh() 함수를 통해 언제든 재구축할 수 있게 만들었습니다.
"""

import re
from app.db import fetch_all_products

# 상품명에서 의미 없는 단위/수량 표현은 사전에서 제외 (검색 잡음 방지)
STOPWORDS = {
    "1kg", "1개", "1망", "1L", "1팩", "1box", "500g", "2개", "3개",
    "국산", "수입", "대용량", "세트",
}

# 문장에서 조사를 떼어내기 위한 정규식 (완벽하진 않지만 실사용 문장 대부분 커버)
PARTICLE_PATTERN = re.compile(
    r"(은|는|이|가|을|를|에|에서|으로|로|와|과|의|도|만|까지|부터|이나|나)$"
)


class ProductDictionary:
    def __init__(self):
        self.brand_set: set[str] = set()
        self.category_tokens: set[str] = set()   # '캠핑용품-텐트' -> '캠핑용품', '텐트'
        self.name_tokens: set[str] = set()        # 상품명을 공백 기준으로 쪼갠 단어들
        self.products: list[dict] = []             # 원본 상품 데이터 (매칭 후 반환용)

    def refresh(self):
        """DB에서 최신 상품 목록을 읽어 사전을 다시 구축한다."""
        self.products = fetch_all_products()

        self.brand_set.clear()
        self.category_tokens.clear()
        self.name_tokens.clear()

        for product in self.products:
            if product.get("brand"):
                self.brand_set.add(product["brand"])

            if product.get("category"):
                # '캠핑용품-텐트' 같은 계층형 카테고리를 '-' 기준으로 분리해서 각각 등록
                for token in product["category"].split("-"):
                    token = token.strip()
                    if token:
                        self.category_tokens.add(token)

            if product.get("name"):
                for token in product["name"].split():
                    token = token.strip()
                    if token and token not in STOPWORDS and len(token) >= 2:
                        self.name_tokens.add(token)

    def all_keywords(self) -> set[str]:
        """길이가 긴 단어부터 매칭해야 부분 겹침 오류가 적으므로, 정렬은 매칭 시점에 처리."""
        return self.brand_set | self.category_tokens | self.name_tokens


# 서버 전체에서 공유하는 싱글턴 사전 (앱 시작 시 1회 로드, 이후 /admin/refresh로 갱신)
product_dictionary = ProductDictionary()


def strip_particle(word: str) -> str:
    """'스프레이가' -> '스프레이' 처럼 조사를 제거"""
    return PARTICLE_PATTERN.sub("", word)
