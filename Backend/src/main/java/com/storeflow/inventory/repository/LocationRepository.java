package com.storeflow.inventory.repository;

import com.storeflow.inventory.entity.Location;
import org.springframework.data.jpa.repository.JpaRepository;

public interface LocationRepository extends JpaRepository<Location, String> {
}