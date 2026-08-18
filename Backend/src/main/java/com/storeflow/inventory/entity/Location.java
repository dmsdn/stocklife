package com.storeflow.inventory.entity;

import jakarta.persistence.*;

@Entity
@Table(name = "locations")
public class Location {

    @Id
    @Column(name = "location_id")
    private String locationId;

    @Column(name = "zone_id", nullable = false)
    private String zoneId;

    @Column(name = "rack_no", nullable = false)
    private byte rackNo;

    @Column(name = "bay_no", nullable = false)
    private byte bayNo;

    @Column(name = "level_no", nullable = false)
    private byte levelNo;

    @Enumerated(EnumType.STRING)
    @Column(name = "tier_role", nullable = false)
    private TierRole tierRole;

    @Column(name = "floor_no", nullable = false)
    private byte floorNo;

    @Column(name = "x", nullable = false)
    private short x;

    @Column(name = "y", nullable = false)
    private short y;

    public enum TierRole { PICK, BULK }

    protected Location() {}

    public String getLocationId() { return locationId; }
    public String getZoneId() { return zoneId; }
    public byte getRackNo() { return rackNo; }
    public byte getBayNo() { return bayNo; }
    public byte getLevelNo() { return levelNo; }
    public TierRole getTierRole() { return tierRole; }
    public byte getFloorNo() { return floorNo; }
    public short getX() { return x; }
    public short getY() { return y; }
}