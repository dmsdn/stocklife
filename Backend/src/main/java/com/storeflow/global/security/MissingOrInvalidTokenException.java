package com.storeflow.global.security;

/**
 * @CurrentConsumer 인자 리졸버 전용 인증 실패 예외.
 * 예전엔 그냥 IllegalStateException을 던졌는데, 이 타입은 다른 곳(비즈니스 로직의
 * 상태 오류 등)에서도 흔히 쓰여서 전역 핸들러가 이것만 콕 집어 401로 매핑하기엔
 * 너무 광범위하고 위험하다(엉뚱한 500이 401로 둔갑해버릴 수 있음). 그래서 인증
 * 실패만을 위한 전용 타입을 따로 둔다.
 */
public class MissingOrInvalidTokenException extends RuntimeException {
    public MissingOrInvalidTokenException(String message) {
        super(message);
    }
}