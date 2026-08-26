package com.storeflow.notification.repository;

import com.storeflow.notification.entity.Notification;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface NotificationRepository extends JpaRepository<Notification, Long> {

    List<Notification> findByConsumerIdOrderByCreatedAtDesc(Long consumerId);

    Optional<Notification> findByNotificationIdAndConsumerId(Long notificationId, Long consumerId);
}
