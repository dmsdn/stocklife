package com.storeflow.inventory.dto;

import java.util.List;

public class FloorMapResponse {
    private byte floorNo;
    private List<ZoneMapResponse> zones;
    private List<MapCellResponse> cells;
    private List<LocationResponse> locations;

    public FloorMapResponse(byte floorNo, List<ZoneMapResponse> zones, List<MapCellResponse> cells,
                             List<LocationResponse> locations) {
        this.floorNo = floorNo;
        this.zones = zones;
        this.cells = cells;
        this.locations = locations;
    }

    public byte getFloorNo() { return floorNo; }
    public List<ZoneMapResponse> getZones() { return zones; }
    public List<MapCellResponse> getCells() { return cells; }
    public List<LocationResponse> getLocations() { return locations; }
}
