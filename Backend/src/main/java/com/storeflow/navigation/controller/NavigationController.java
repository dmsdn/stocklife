package com.storeflow.navigation.controller;

import com.storeflow.global.jwt.ConsumerJwtUtil;
import com.storeflow.navigation.dto.NavigationRequest;
import com.storeflow.navigation.dto.NavigationResponse;
import com.storeflow.navigation.service.CartRouteService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/navigation")
public class NavigationController {

    private final CartRouteService cartRouteService;
    private final ConsumerJwtUtil jwtUtil;

    public NavigationController(
            CartRouteService cartRouteService,
            ConsumerJwtUtil jwtUtil
    ) {
        this.cartRouteService =
                cartRouteService;

        this.jwtUtil =
                jwtUtil;
    }

    @PostMapping("/cart-route")
    public ResponseEntity<NavigationResponse>
    getCartRoute(
            @RequestHeader("Authorization")
            String authorization,

            @RequestBody
            NavigationRequest request
    ) {

        Long consumerId =
                requireConsumerId(
                        authorization
                );

        return ResponseEntity.ok(
                cartRouteService.buildCartRoute(
                        consumerId,
                        request
                )
        );
    }

    /*
     * 기존 CartController에서 쓰는 인증 방식과 동일.
     */
    private Long requireConsumerId(
            String authorization
    ) {
        if (authorization == null
                || !authorization.startsWith(
                "Bearer "
        )) {

            throw new IllegalStateException(
                    "로그인이 필요합니다."
            );
        }

        String token =
                authorization.substring(7);

        if (!jwtUtil.validateToken(token)) {
            throw new IllegalStateException(
                    "유효하지 않은 로그인입니다."
            );
        }

        return jwtUtil
                .getConsumerIdFromToken(token);
    }
}