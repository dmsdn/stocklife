package com.storeflow.notification.service;

import com.storeflow.consumer.repository.ConsumerRepository;
import com.storeflow.notification.dto.NotificationSettingResponse;
import com.storeflow.notification.dto.UpdateNotificationSettingRequest;
import com.storeflow.notification.entity.NotificationSetting;
import com.storeflow.notification.repository.NotificationSettingRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class NotificationSettingService {

    private final NotificationSettingRepository notificationSettingRepository;
    private final ConsumerRepository consumerRepository;

    public NotificationSettingService(
            NotificationSettingRepository notificationSettingRepository,
            ConsumerRepository consumerRepository
    ) {
        this.notificationSettingRepository = notificationSettingRepository;
        this.consumerRepository = consumerRepository;
    }

    @Transactional
    public NotificationSettingResponse getMySetting(Long consumerId) {
        NotificationSetting setting = getOrCreate(consumerId);
        return new NotificationSettingResponse(setting);
    }

    @Transactional
    public NotificationSettingResponse updateMySetting(
            Long consumerId,
            UpdateNotificationSettingRequest request
    ) {
        NotificationSetting setting = getOrCreate(consumerId);

        setting.update(
                request.getAllEnabled(),
                request.getOrderEnabled(),
                request.getCouponEnabled(),
                request.getPointEnabled(),
                request.getRestockEnabled(),
                request.getMarketingEnabled()
        );

        return new NotificationSettingResponse(setting);
    }

    @Transactional
    public boolean isEnabled(Long consumerId, String notificationType) {
        NotificationSetting setting = getOrCreate(consumerId);
        return setting.isEnabledFor(notificationType);
    }

    private NotificationSetting getOrCreate(Long consumerId) {
        return notificationSettingRepository.findById(consumerId)
                .orElseGet(() -> {
                    if (!consumerRepository.existsById(consumerId)) {
                        throw new ResponseStatusException(
                                HttpStatus.NOT_FOUND,
                                "존재하지 않는 회원입니다."
                        );
                    }

                    return notificationSettingRepository.save(
                            new NotificationSetting(consumerId)
                    );
                });
    }
}