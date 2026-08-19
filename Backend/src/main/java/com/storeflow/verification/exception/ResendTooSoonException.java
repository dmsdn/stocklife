// ResendTooSoonException.java — 재발송 쿨다운 이내 재요청
package com.storeflow.verification.exception;

public class ResendTooSoonException extends RuntimeException {
    private final long retryAfterSeconds;

    public ResendTooSoonException(String message, long retryAfterSeconds) {
        super(message);
        this.retryAfterSeconds = retryAfterSeconds;
    }

    public long getRetryAfterSeconds() {
        return retryAfterSeconds;
    }
}