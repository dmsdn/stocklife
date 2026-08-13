from app.dictionary import product_dictionary, strip_particle


def extract_keywords(text: str) -> list[str]:
    """
    문장을 공백 기준으로 쪼갠 뒤 조사를 제거하고, 사전에 있는 단어와 매칭.
    "스프레이가 필요해" -> ["스프레이가", "필요해"] -> 조사 제거 -> ["스프레이", "필요해"]
    -> 사전에 "스프레이"가 있으면 매칭 성공, "필요해"는 사전에 없으니 버려짐(의도 판별용으로만 쓰임)
    """
    raw_tokens = text.split()
    matched = []

    dictionary_words = product_dictionary.all_keywords()

    for token in raw_tokens:
        cleaned = strip_particle(token)

        # 1) 정확히 사전 단어와 일치
        if cleaned in dictionary_words:
            matched.append(cleaned)
            continue

        # 2) 부분 포함 관계도 체크 (문장 토큰이 사전 단어를 포함하거나, 반대의 경우)
        #    예: "아이스박스25L" 처럼 붙어 있어도 "아이스박스"가 걸리게
        for word in dictionary_words:
            if word in cleaned or cleaned in word:
                if len(word) >= 2:  # 한 글자짜리 우연한 매칭 방지
                    matched.append(word)
                    break

    # 중복 제거하되 순서는 유지
    seen = set()
    unique_matched = []
    for word in matched:
        if word not in seen:
            seen.add(word)
            unique_matched.append(word)

    return unique_matched
