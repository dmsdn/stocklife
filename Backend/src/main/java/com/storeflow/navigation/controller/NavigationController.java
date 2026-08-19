package com.storeflow.navigation.controller;

import com.storeflow.navigation.dto.RouteRequest;
import com.storeflow.navigation.dto.RouteResponse;
import com.storeflow.navigation.service.NavigationService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 매장 지도 데이터(요구사항 35번)와 마찬가지로 공개 조회 성격이라 별도 인증은 없다.
 * 방문 순서(stops의 배열 순서)는 이 API를 부르는 쪽(Agent)이 자연어를 해석해서
 * 이미 정해서 넘긴다 — 이 컨트롤러/서비스는 순서를 재판단하지 않는다.
 */
@RestController
@RequestMapping("/api/navigation")
public class NavigationController {

    private final NavigationService navigationService;

    public NavigationController(NavigationService navigationService) {
        this.navigationService = navigationService;
    }

    @PostMapping("/route")
    public ResponseEntity<RouteResponse> getRoute(@Valid @RequestBody RouteRequest request) {
        return ResponseEntity.ok(navigationService.buildRoute(request));
    }
}