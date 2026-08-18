package com.storeflow.event.repository;

import com.storeflow.event.entity.ConsumerEvent;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ConsumerEventRepository extends JpaRepository<ConsumerEvent, Long> {
}