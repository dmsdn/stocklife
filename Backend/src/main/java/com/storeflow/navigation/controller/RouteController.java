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
 * 09-08: NavigationService(A* 경로 계산, DB map_cells 기반)는 이미 다 구현되어 있었는데
 * 이걸 연결하는 컨트롤러가 없어서 프론트(lib/navigation.ts의 getRoute → StoreMapDialog
 * "길찾기")가 POST /api/navigation/route를 호출하면 404가 나던 문제를 고친다.
 *
 * 방문 순서는 이미 요청(stops 배열 순서)에 정해져서 오므로 여기서 순서를 바꾸지 않는다 —
 * 로그인 여부와 무관하게 좌표 계산만 하는 순수 기능이라 인증을 요구하지 않는다
 * (장바구니 전체를 자동으로 최적 순서로 도는 기능은 이것과 별개로 이미 존재하는
 * NavigationController의 POST /api/navigation/cart-route가 담당한다).
 */
@RestController
@RequestMapping("/api/navigation")
public class RouteController {

    private final NavigationService navigationService;

    public RouteController(NavigationService navigationService) {
        this.navigationService = navigationService;
    }

    @PostMapping("/route")
    public ResponseEntity<RouteResponse> getRoute(@Valid @RequestBody RouteRequest request) {
        return ResponseEntity.ok(navigationService.buildRoute(request));
    }
}