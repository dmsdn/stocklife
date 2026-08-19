// VerificationCodeExpiredException.java — 3분 초과, 또는 5회 오류로 폐기됐을 때
package com.storeflow.verification.exception;

public class VerificationCodeExpiredException extends RuntimeException {
    public VerificationCodeExpiredException(String message) {
        super(message);
    }
}