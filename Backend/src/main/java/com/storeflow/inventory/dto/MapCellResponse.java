package com.storeflow.inventory.dto;

import com.storeflow.inventory.entity.MapCell;

public class MapCellResponse {
    private short x;
    private short y;
    private boolean passable;
    private String transitId;
    private String kind;        // 09-02: AISLE/SHELF/FACILITY/TRANSIT
    private String shelfZone;   // 09-02: kind=SHELF 일 때 zone_id

    public MapCellResponse(MapCell cell) {
        this.x = cell.getX();
        this.y = cell.getY();
        this.passable = cell.isPassable();
        this.transitId = cell.getTransitId();
        this.kind = cell.getKind();
        this.shelfZone = cell.getShelfZone();
    }

    public String getKind() { return kind; }
    public String getShelfZone() { return shelfZone; }

    public short getX() { return x; }
    public short getY() { return y; }
    public boolean isPassable() { return passable; }
    public String getTransitId() { return transitId; }
}