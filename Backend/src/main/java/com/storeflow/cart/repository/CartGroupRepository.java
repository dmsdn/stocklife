package com.storeflow.cart.repository;

import com.storeflow.cart.entity.CartGroup;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;

public interface CartGroupRepository extends JpaRepository<CartGroup, Long> {
    List<CartGroup> findByConsumerIdOrderByCartGroupIdAsc(Long consumerId);
    Optional<CartGroup> findByCartGroupIdAndConsumerId(Long cartGroupId, Long consumerId);
    Optional<CartGroup> findFirstByConsumerIdAndTitle(Long consumerId, String title);
}
