package com.storeflow.verification.service;

public interface SmsSender {
    void send(String toPhoneNumber, String content);
}