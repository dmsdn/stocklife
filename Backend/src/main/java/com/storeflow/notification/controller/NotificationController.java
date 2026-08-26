package com.storeflow.notification.controller;

import com.storeflow.global.security.CurrentConsumer;
import com.storeflow.notification.dto.NotificationResponse;
import com.storeflow.notification.service.NotificationService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/notifications")
public class NotificationController {

    private final NotificationService notificationService;

    public NotificationController(NotificationService notificationService) {
        this.notificationService = notificationService;
    }

    /** 로그인한 사용자의 알림을 최신순으로 조회한다. */
    @GetMapping
    public ResponseEntity<List<NotificationResponse>> getNotifications(
            @CurrentConsumer Long consumerId
    ) {
        return ResponseEntity.ok(notificationService.getNotifications(consumerId));
    }

    /** 로그인한 사용자 본인의 특정 알림을 읽음 처리한다. */
    @PatchMapping("/{notificationId}/read")
    public ResponseEntity<NotificationResponse> markAsRead(
            @CurrentConsumer Long consumerId,
            @PathVariable Long notificationId
    ) {
        return ResponseEntity.ok(notificationService.markAsRead(consumerId, notificationId));
    }
}
