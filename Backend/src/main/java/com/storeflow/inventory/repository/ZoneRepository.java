package com.storeflow.inventory.repository;

import com.storeflow.inventory.entity.Zone;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ZoneRepository extends JpaRepository<Zone, String> {
    List<Zone> findByFloorNo(Byte floorNo);
}