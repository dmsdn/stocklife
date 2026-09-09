package com.storeflow.navigation.dto;

import java.util.List;

public class NavigationResponse {

    private final Long cartGroupId;
    private final int totalDistance;
    private final List<Stop> stops;
    private final List<PathPoint> path;

    public NavigationResponse(
            Long cartGroupId,
            int totalDistance,
            List<Stop> stops,
            List<PathPoint> path
    ) {
        this.cartGroupId = cartGroupId;
        this.totalDistance = totalDistance;
        this.stops = stops;
        this.path = path;
    }

    public Long getCartGroupId() {
        return cartGroupId;
    }

    public int getTotalDistance() {
        return totalDistance;
    }

    public List<Stop> getStops() {
        return stops;
    }

    public List<PathPoint> getPath() {
        return path;
    }

    public static class Stop {

        private final Integer skuId;
        private final String name;
        private final String locationId;
        private final int floor;
        private final int x;
        private final int y;

        public Stop(
                Integer skuId,
                String name,
                String locationId,
                int floor,
                int x,
                int y
        ) {
            this.skuId = skuId;
            this.name = name;
            this.locationId = locationId;
            this.floor = floor;
            this.x = x;
            this.y = y;
        }

        public Integer getSkuId() {
            return skuId;
        }

        public String getName() {
            return name;
        }

        public String getLocationId() {
            return locationId;
        }

        public int getFloor() {
            return floor;
        }

        public int getX() {
            return x;
        }

        public int getY() {
            return y;
        }
    }

    public static class PathPoint {

        private final int floor;
        private final int x;
        private final int y;

        public PathPoint(int floor, int x, int y) {
            this.floor = floor;
            this.x = x;
            this.y = y;
        }

        public int getFloor() {
            return floor;
        }

        public int getX() {
            return x;
        }

        public int getY() {
            return y;
        }
    }
}