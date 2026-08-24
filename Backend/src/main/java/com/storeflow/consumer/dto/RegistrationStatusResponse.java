package com.storeflow.consumer.dto;

public class RegistrationStatusResponse {

    private final boolean registered;
    private final String nextAction;

    public RegistrationStatusResponse(boolean registered) {
        this.registered = registered;
        this.nextAction = registered ? "LOGIN" : "SIGNUP";
    }

    public boolean isRegistered() { return registered; }
    public String getNextAction() { return nextAction; }
}