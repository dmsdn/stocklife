package com.storeflow.inventory.dto;

import java.util.List;

public class FloorMapResponse {
    private byte floorNo;
    private List<ZoneMapResponse> zones;
    private List<MapCellResponse> cells;

    public FloorMapResponse(byte floorNo, List<ZoneMapResponse> zones, List<MapCellResponse> cells) {
        this.floorNo = floorNo;
        this.zones = zones;
        this.cells = cells;
    }

    public byte getFloorNo() { return floorNo; }
    public List<ZoneMapResponse> getZones() { return zones; }
    public List<MapCellResponse> getCells() { return cells; }
}