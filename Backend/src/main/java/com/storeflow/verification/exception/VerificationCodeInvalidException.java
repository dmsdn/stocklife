// VerificationCodeInvalidException.java — 인증번호가 틀렸을 때
package com.storeflow.verification.exception;

public class VerificationCodeInvalidException extends RuntimeException {
    public VerificationCodeInvalidException(String message) {
        super(message);
    }
}