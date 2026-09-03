package com.storeflow.inventory.dto;

import com.storeflow.inventory.entity.MapCell;

public class MapCellResponse {
    private short x;
    private short y;
    private boolean passable;
    private String transitId;
    private String kind;        // 09-02: AISLE/SHELF/FACILITY/TRANSIT
    private String shelfZone;   // 09-02: kind=SHELF 일 때 zone_id
    private String facilityKind; // 09-03: kind=FACILITY/TRANSIT 일 때 시설 종류

    public MapCellResponse(MapCell cell) {
        this.x = cell.getX();
        this.y = cell.getY();
        this.passable = cell.isPassable();
        this.transitId = cell.getTransitId();
        this.kind = cell.getKind();
        this.shelfZone = cell.getShelfZone();
        this.facilityKind = cell.getFacilityKind();
    }

    public String getKind() { return kind; }
    public String getShelfZone() { return shelfZone; }
    public String getFacilityKind() { return facilityKind; }

    public short getX() { return x; }
    public short getY() { return y; }
    public boolean isPassable() { return passable; }
    public String getTransitId() { return transitId; }
}