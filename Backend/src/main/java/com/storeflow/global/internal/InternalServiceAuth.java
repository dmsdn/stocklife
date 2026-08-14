package com.storeflow.global.internal;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * 내부 서비스(Agent 등) 전용 인증. 사용자 JWT와 완전히 별개다.
 * consumerId를 body/쿼리로 직접 받는 /internal/** 엔드포인트는 전부 이걸로 검증해야 한다.
 * 이 키는 Backend <-> Agent만 아는 값이어야 하고, 절대 프론트에 노출되면 안 된다.
 */
@Component
public class InternalServiceAuth {

    @Value("${internal.service-key}")
    private String expectedKey;

    public void verify(String providedKey) {
        if (expectedKey == null || expectedKey.isBlank()) {
            throw new IllegalStateException("internal.service-key가 설정되지 않았습니다.");
        }
        if (providedKey == null || !providedKey.equals(expectedKey)) {
            throw new SecurityException("내부 서비스 인증 실패: X-Internal-Service-Key가 올바르지 않습니다.");
        }
    }
}