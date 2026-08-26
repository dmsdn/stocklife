package com.storeflow.notification.controller;

import com.storeflow.global.security.CurrentConsumer;
import com.storeflow.notification.dto.NotificationSettingResponse;
import com.storeflow.notification.dto.UpdateNotificationSettingRequest;
import com.storeflow.notification.service.NotificationSettingService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/notification-settings")
public class NotificationSettingController {

    private final NotificationSettingService notificationSettingService;

    public NotificationSettingController(
            NotificationSettingService notificationSettingService
    ) {
        this.notificationSettingService = notificationSettingService;
    }

    /** 로그인한 사용자의 현재 알림 설정 조회 */
    @GetMapping
    public ResponseEntity<NotificationSettingResponse> getMySetting(
            @CurrentConsumer Long consumerId
    ) {
        return ResponseEntity.ok(
                notificationSettingService.getMySetting(consumerId)
        );
    }

    /**
     * 로그인한 사용자의 알림 설정 일부/전체 변경.
     * 보내지 않은 필드는 기존 값 유지.
     */
    @PatchMapping
    public ResponseEntity<NotificationSettingResponse> updateMySetting(
            @CurrentConsumer Long consumerId,
            @RequestBody UpdateNotificationSettingRequest request
    ) {
        return ResponseEntity.ok(
                notificationSettingService.updateMySetting(consumerId, request)
        );
    }
}
