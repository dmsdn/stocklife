// VerificationNotCompletedException.java — verify-code 없이 최종 가입/재설정을 시도할 때
package com.storeflow.verification.exception;

public class VerificationNotCompletedException extends RuntimeException {
    public VerificationNotCompletedException(String message) {
        super(message);
    }
}