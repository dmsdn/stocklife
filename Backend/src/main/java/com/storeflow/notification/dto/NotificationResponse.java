package com.storeflow.notification.dto;

import com.storeflow.notification.entity.Notification;

import java.time.LocalDateTime;

public class NotificationResponse {

    private final Long notificationId;
    private final String type;
    private final String title;
    private final String message;
    private final String linkUrl;
    private final boolean read;
    private final LocalDateTime createdAt;
    private final LocalDateTime readAt;

    public NotificationResponse(Notification notification) {
        this.notificationId = notification.getNotificationId();
        this.type = notification.getType();
        this.title = notification.getTitle();
        this.message = notification.getMessage();
        this.linkUrl = notification.getLinkUrl();
        this.read = notification.isRead();
        this.createdAt = notification.getCreatedAt();
        this.readAt = notification.getReadAt();
    }

    public Long getNotificationId() {
        return notificationId;
    }

    public String getType() {
        return type;
    }

    public String getTitle() {
        return title;
    }

    public String getMessage() {
        return message;
    }

    public String getLinkUrl() {
        return linkUrl;
    }

    public boolean isRead() {
        return read;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public LocalDateTime getReadAt() {
        return readAt;
    }
}
