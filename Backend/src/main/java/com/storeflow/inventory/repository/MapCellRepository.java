package com.storeflow.inventory.repository;

import com.storeflow.inventory.entity.MapCell;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface MapCellRepository extends JpaRepository<MapCell, MapCell.MapCellId> {
    List<MapCell> findByFloorNo(Byte floorNo);
}