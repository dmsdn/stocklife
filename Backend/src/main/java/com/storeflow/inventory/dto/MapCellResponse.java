package com.storeflow.inventory.dto;

import com.storeflow.inventory.entity.MapCell;

public class MapCellResponse {
    private short x;
    private short y;
    private boolean passable;
    private String transitId;

    public MapCellResponse(MapCell cell) {
        this.x = cell.getX();
        this.y = cell.getY();
        this.passable = cell.isPassable();
        this.transitId = cell.getTransitId();
    }

    public short getX() { return x; }
    public short getY() { return y; }
    public boolean isPassable() { return passable; }
    public String getTransitId() { return transitId; }
}