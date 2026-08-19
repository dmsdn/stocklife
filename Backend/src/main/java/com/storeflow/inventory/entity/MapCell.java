package com.storeflow.inventory.entity;

import jakarta.persistence.*;
import java.io.Serializable;
import java.util.Objects;

@Entity
@Table(name = "map_cells")
@IdClass(MapCell.MapCellId.class)
public class MapCell {

    @Id
    @Column(name = "floor_no")
    private Byte floorNo;

    @Id
    @Column(name = "x")
    private Short x;

    @Id
    @Column(name = "y")
    private Short y;

    @Column(name = "passable", nullable = false)
    private boolean passable;

    // 'MW-UP'/'MW-DN' 등 무빙워크 식별자 — 같은 값을 가진 셀들이 층간 간선
    @Column(name = "transit_id", length = 8)
    private String transitId;

    protected MapCell() {}

    public Byte getFloorNo() { return floorNo; }
    public Short getX() { return x; }
    public Short getY() { return y; }
    public boolean isPassable() { return passable; }
    public String getTransitId() { return transitId; }

    public static class MapCellId implements Serializable {
        private Byte floorNo;
        private Short x;
        private Short y;

        public MapCellId() {}
        public MapCellId(Byte floorNo, Short x, Short y) {
            this.floorNo = floorNo; this.x = x; this.y = y;
        }

        @Override
        public boolean equals(Object o) {
            if (this == o) return true;
            if (!(o instanceof MapCellId that)) return false;
            return Objects.equals(floorNo, that.floorNo) && Objects.equals(x, that.x) && Objects.equals(y, that.y);
        }
        @Override
        public int hashCode() { return Objects.hash(floorNo, x, y); }
    }
}