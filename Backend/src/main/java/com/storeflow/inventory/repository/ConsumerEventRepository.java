package com.storeflow.inventory.repository;

import com.storeflow.inventory.entity.ConsumerEvent;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ConsumerEventRepository extends JpaRepository<ConsumerEvent, Long> {
}