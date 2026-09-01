package com.storeflow.global.exception;

import com.storeflow.consumer.exception.InvalidCredentialsException;
import com.storeflow.global.security.MissingOrInvalidTokenException;
import com.storeflow.verification.dto.MessageResponse;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/**
 * 인증/인가 관련 전역 예외 처리.
 *
 * 버그: 이 두 예외가 어디서도 안 잡혀서 그대로 500(Internal Server Error)으로 나가고 있었음.
 * - InvalidCredentialsException (로그인 실패, 전화번호/비밀번호 불일치)
 * - MissingOrInvalidTokenException (CurrentConsumerArgumentResolver: 토큰 없음/유효하지 않음)
 *
 * @CurrentConsumer를 쓰는 모든 인증 필요 API(알림함 포함)가 영향을 받고 있었어서
 * 우선순위 높음으로 바로 처리.
 */
@RestControllerAdvice
public class AuthExceptionHandler {

    @ExceptionHandler(InvalidCredentialsException.class)
    public ResponseEntity<MessageResponse> handleInvalidCredentials(InvalidCredentialsException e) {
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(new MessageResponse(e.getMessage()));
    }

    @ExceptionHandler(MissingOrInvalidTokenException.class)
    public ResponseEntity<MessageResponse> handleMissingOrInvalidToken(MissingOrInvalidTokenException e) {
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(new MessageResponse(e.getMessage()));
    }
}