package com.storeflow.order.repository;

import com.storeflow.order.entity.Order;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface OrderRepository extends JpaRepository<Order, Long> {
    List<Order> findByConsumerIdOrderByCreatedAtDesc(Long consumerId);
    Optional<Order> findByOrderIdAndConsumerId(Long orderId, Long consumerId);
}