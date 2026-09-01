package com.storeflow.point.controller;

import com.storeflow.global.security.CurrentConsumer;
import com.storeflow.point.dto.PointTransactionResponse;
import com.storeflow.point.service.PointService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/points")
public class PointController {

    private final PointService pointService;

    public PointController(
            PointService pointService
    ) {
        this.pointService = pointService;
    }

    /**
     * 내 포인트 거래내역 조회
     *
     * GET /api/points/history
     */
    @GetMapping("/history")
    public ResponseEntity<List<PointTransactionResponse>>
    getHistory(
            @CurrentConsumer Long consumerId
    ) {

        return ResponseEntity.ok(
                pointService.getHistory(consumerId)
        );
    }
}