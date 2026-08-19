package com.storeflow.global.exception;

import com.storeflow.consumer.exception.MemberNotFoundException;
import com.storeflow.verification.dto.MessageResponse;
import com.storeflow.verification.exception.ResendTooSoonException;
import com.storeflow.verification.exception.VerificationCodeExpiredException;
import com.storeflow.verification.exception.VerificationCodeInvalidException;
import com.storeflow.verification.exception.VerificationNotCompletedException;
import com.storeflow.verification.service.NaverSensSmsSender;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/**
 * SMS 인증 관련 예외만 다루는 스코프 좁은 핸들러.
 * 프로젝트에 전역 @ControllerAdvice가 이미 있다면 그쪽으로 합치는 게 나을 수 있음 —
 * 이번에 넘겨받은 파일 세트에는 없어서 일단 독립적으로 뒀습니다.
 */
@RestControllerAdvice
public class VerificationExceptionHandler {

    @ExceptionHandler(MemberNotFoundException.class)
    public ResponseEntity<MessageResponse> handleMemberNotFound(MemberNotFoundException e) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(new MessageResponse(e.getMessage()));
    }

    @ExceptionHandler(VerificationCodeInvalidException.class)
    public ResponseEntity<MessageResponse> handleInvalidCode(VerificationCodeInvalidException e) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(new MessageResponse(e.getMessage()));
    }

    @ExceptionHandler(VerificationCodeExpiredException.class)
    public ResponseEntity<MessageResponse> handleExpiredCode(VerificationCodeExpiredException e) {
        return ResponseEntity.status(HttpStatus.GONE).body(new MessageResponse(e.getMessage()));
    }

    @ExceptionHandler(VerificationNotCompletedException.class)
    public ResponseEntity<MessageResponse> handleNotVerified(VerificationNotCompletedException e) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(new MessageResponse(e.getMessage()));
    }

    @ExceptionHandler(ResendTooSoonException.class)
    public ResponseEntity<MessageResponse> handleResendTooSoon(ResendTooSoonException e) {
        return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                .header(HttpHeaders.RETRY_AFTER, String.valueOf(e.getRetryAfterSeconds()))
                .body(new MessageResponse(e.getMessage()));
    }

    @ExceptionHandler(NaverSensSmsSender.SmsSendFailedException.class)
    public ResponseEntity<MessageResponse> handleSmsSendFailed(NaverSensSmsSender.SmsSendFailedException e) {
        return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                .body(new MessageResponse("SMS 발송에 실패했습니다. 잠시 후 다시 시도해주세요."));
    }
}