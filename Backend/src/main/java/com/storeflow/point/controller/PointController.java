package com.storeflow.point.controller;

import com.storeflow.global.security.CurrentConsumer;
import com.storeflow.point.dto.PointSummaryResponse;
import com.storeflow.point.service.PointService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/points")
public class PointController {

    private final PointService pointService;

    public PointController(PointService pointService) {
        this.pointService = pointService;
    }

    @GetMapping("/me")
    public ResponseEntity<PointSummaryResponse> getMyPoints(@CurrentConsumer Long consumerId) {
        return ResponseEntity.ok(pointService.getMyPoints(consumerId));
    }
}