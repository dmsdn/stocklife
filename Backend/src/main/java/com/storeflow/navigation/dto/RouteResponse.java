package com.storeflow.navigation.dto;

import java.util.List;

public class RouteResponse {
    private List<RouteLegResponse> legs;
    private int totalDistance;

    public RouteResponse(List<RouteLegResponse> legs, int totalDistance) {
        this.legs = legs;
        this.totalDistance = totalDistance;
    }

    public List<RouteLegResponse> getLegs() { return legs; }
    public int getTotalDistance() { return totalDistance; }
}