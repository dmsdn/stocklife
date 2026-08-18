package com.storeflow.inventory.entity;

import jakarta.persistence.*;

@Entity
@Table(name = "zones")
public class Zone {

    @Id
    @Column(name = "zone_id", length = 8)
    private String zoneId;

    @Column(name = "floor_no", nullable = false)
    private Byte floorNo;

    @Column(name = "name", nullable = false)
    private String name;

    public enum ZoneType { SALES, BACKROOM }

    @Enumerated(EnumType.STRING)
    @Column(name = "zone_type", nullable = false)
    private ZoneType zoneType;

    protected Zone() {}

    public String getZoneId() { return zoneId; }
    public Byte getFloorNo() { return floorNo; }
    public String getName() { return name; }
    public ZoneType getZoneType() { return zoneType; }
}