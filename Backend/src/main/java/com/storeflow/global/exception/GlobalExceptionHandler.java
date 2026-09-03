package com.storeflow.global.exception;

import com.storeflow.verification.dto.MessageResponse;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/**
 * ⚠ 신규 파일 — 기존 파일은 하나도 안 건드렸습니다. AuthExceptionHandler와 같은 패키지에
 * 이 파일 하나만 추가하면 됩니다.
 *
 * 원인: OrderService.checkout()이 다음 상황에서 IllegalStateException을 던지는데
 *   - "결제할 상품이 선택되지 않았습니다." (체크된 상품 없음)
 *   - "PICK 위치 재고를 찾을 수 없습니다. skuId=..." (해당 상품의 판매 가능 재고 위치 없음)
 *   - "재고가 부족합니다. skuId=..." (요청 수량이 남은 재고보다 많음)
 *   - "존재하지 않는 상품입니다. skuId=..."
 * 이걸 잡아주는 핸들러가 어디에도 없어서 그대로 Spring 기본 에러 처리로 떨어져
 * 500(Internal Server Error)이 나가고 있었습니다. 프론트는 이 메시지를 못 받아서
 * "결제 실패"로만 보이고, 실제로 상품 위치/재고 시드가 문제인지 알 수 없었습니다.
 *
 * checkout뿐 아니라 IllegalStateException/IllegalArgumentException을 던지고 별도로
 * @ExceptionHandler가 없는 다른 곳(리스트 조회, 카트 등)에도 전부 적용됩니다 — 지금은
 * 이런 곳들이 전부 500으로 나가고 있을 가능성이 있습니다.
 *
 * ⚠ 스프링 기본 설정(server.error.include-message=never)이면 이 핸들러가 없어도
 * Whitelabel 에러 페이지 자체엔 메시지가 안 보였을 텐데, 이 핸들러는 그 설정과
 * 무관하게 항상 메시지를 명시적으로 응답 바디에 담아 보냅니다.
 */
@RestControllerAdvice
public class GlobalExceptionHandler {

    // 상태 충돌(이미 진행된 결제, 재고 부족, 잘못된 상태 전이 등) → 409 Conflict
    @ExceptionHandler(IllegalStateException.class)
    public ResponseEntity<MessageResponse> handleIllegalState(IllegalStateException e) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(new MessageResponse(e.getMessage()));
    }

    // 잘못된 요청 값(음수 포인트 등) → 400 Bad Request
    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<MessageResponse> handleIllegalArgument(IllegalArgumentException e) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(new MessageResponse(e.getMessage()));
    }
}
