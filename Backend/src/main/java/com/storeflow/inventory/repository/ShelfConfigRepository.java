package com.storeflow.inventory.repository;

import com.storeflow.inventory.entity.ShelfConfig;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface ShelfConfigRepository extends JpaRepository<ShelfConfig, ShelfConfig.ShelfConfigId> {
    Optional<ShelfConfig> findBySkuIdAndLocationId(Integer skuId, String locationId);
}