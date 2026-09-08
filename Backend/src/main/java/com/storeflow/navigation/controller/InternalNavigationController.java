package com.storeflow.navigation.controller;

import com.storeflow.global.internal.InternalServiceAuth;
import com.storeflow.navigation.service.NavigationGraphCache;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 보행 그래프 캐시 재적재 (2026-09-03).
 *
 * <p>map_cells 는 시드를 다시 넣을 때만 바뀐다. 그때 이 창구를 한 번 부르면 다음 경로 요청이
 * 새 격자로 짓는다. 안 부르면 백엔드가 재기동할 때까지 옛 격자를 쓴다 — 그래서 시드 적재
 * 절차(db/README)에 이 호출이 들어간다.
 */
@RestController
@RequestMapping("/internal/navigation")
public class InternalNavigationController {

    private final NavigationGraphCache graphCache;
    private final InternalServiceAuth internalServiceAuth;

    public InternalNavigationController(NavigationGraphCache graphCache,
                                        InternalServiceAuth internalServiceAuth) {
        this.graphCache = graphCache;
        this.internalServiceAuth = internalServiceAuth;
    }

    @PostMapping("/graph/reload")
    public ResponseEntity<?> reload(@RequestHeader("X-Internal-Service-Key") String key) {
        try {
            internalServiceAuth.verify(key);
        } catch (SecurityException e) {
            return ResponseEntity.status(401).body(e.getMessage());
        }
        graphCache.invalidate();
        return ResponseEntity.ok().build();
    }
}
