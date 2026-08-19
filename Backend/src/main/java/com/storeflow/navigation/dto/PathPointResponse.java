package com.storeflow.navigation.dto;

import com.storeflow.navigation.model.GridKey;

/** 프론트가 순서대로 이으면 경로선이 되는 좌표 한 점. */
public class PathPointResponse {
    private int floorNo;
    private int x;
    private int y;

    public PathPointResponse(GridKey key) {
        this.floorNo = key.floorNo();
        this.x = key.x();
        this.y = key.y();
    }

    public int getFloorNo() { return floorNo; }
    public int getX() { return x; }
    public int getY() { return y; }
}