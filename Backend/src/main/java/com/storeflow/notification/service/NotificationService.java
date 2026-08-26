package com.storeflow.notification.service;

import com.storeflow.notification.dto.NotificationResponse;
import com.storeflow.notification.entity.Notification;
import com.storeflow.notification.repository.NotificationRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

@Service
public class NotificationService {

    private final NotificationRepository notificationRepository;
    private final NotificationSettingService notificationSettingService;

    public NotificationService(
            NotificationRepository notificationRepository,
            NotificationSettingService notificationSettingService
    ) {
        this.notificationRepository = notificationRepository;
        this.notificationSettingService = notificationSettingService;
    }

    @Transactional(readOnly = true)
    public List<NotificationResponse> getNotifications(Long consumerId) {
        return notificationRepository
                .findByConsumerIdOrderByCreatedAtDesc(consumerId)
                .stream()
                .map(NotificationResponse::new)
                .toList();
    }

    @Transactional
    public NotificationResponse markAsRead(Long consumerId, Long notificationId) {
        Notification notification = notificationRepository
                .findByNotificationIdAndConsumerId(notificationId, consumerId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "존재하지 않는 알림입니다."
                ));

        notification.markAsRead();
        return new NotificationResponse(notification);
    }

    /**
     * 다른 서비스에서 알림 생성 시 사용.
     *
     * 사용자의 알림 설정이 OFF인 종류는 DB에 알림을 생성하지 않는다.
     * OFF인 경우 null 반환.
     */
    @Transactional
    public NotificationResponse createNotification(
            Long consumerId,
            String type,
            String title,
            String message,
            String linkUrl
    ) {
        if (!notificationSettingService.isEnabled(consumerId, type)) {
            return null;
        }

        Notification notification =
                new Notification(consumerId, type, title, message, linkUrl);

        return new NotificationResponse(
                notificationRepository.save(notification)
        );
    }
}