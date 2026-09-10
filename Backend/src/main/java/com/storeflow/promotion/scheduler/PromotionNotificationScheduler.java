package com.storeflow.promotion.scheduler;

import com.storeflow.consumer.entity.Consumer;
import com.storeflow.consumer.repository.ConsumerRepository;
import com.storeflow.notification.service.NotificationService;
import com.storeflow.product.entity.Product;
import com.storeflow.product.repository.ProductRepository;
import com.storeflow.promotion.entity.Promotion;
import com.storeflow.promotion.repository.PromotionRepository;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.*;
import java.util.List;

@Component
public class PromotionNotificationScheduler {

    private final PromotionRepository promotionRepository;
    private final ConsumerRepository consumerRepository;
    private final ProductRepository productRepository;
    private final NotificationService notificationService;

    public PromotionNotificationScheduler(
            PromotionRepository promotionRepository,
            ConsumerRepository consumerRepository,
            ProductRepository productRepository,
            NotificationService notificationService
    ) {
        this.promotionRepository = promotionRepository;
        this.consumerRepository = consumerRepository;
        this.productRepository = productRepository;
        this.notificationService = notificationService;
    }

    /**
     * 매일 오전 9시에 실행.
     * 한국시간 기준 "내일 00:00 ~ 모레 00:00" 사이에 시작하는 할인을 찾아
     * 하루 전 할인 시작 알림을 생성한다.
     */
    @Scheduled(cron = "0 0 9 * * *", zone = "Asia/Seoul")
    @Transactional
    public void notifyPromotionStartingTomorrow() {

        ZoneId zone = ZoneId.of("Asia/Seoul");

        LocalDate tomorrow = LocalDate.now(zone).plusDays(1);

        Instant start = tomorrow
                .atStartOfDay(zone)
                .toInstant();

        Instant end = tomorrow
                .plusDays(1)
                .atStartOfDay(zone)
                .toInstant();

        List<Promotion> promotions =
                promotionRepository.findStartingBetween(start, end);

        if (promotions.isEmpty()) {
            return;
        }

        List<Consumer> consumers = consumerRepository.findAll();

        for (Promotion promotion : promotions) {
            if ("GOLDEN_DEMO".equals(promotion.getPromoType())) continue;

            Product product = productRepository
                    .findById(promotion.getSkuId())
                    .orElse(null);

            String productName =
                    product != null
                            ? product.getName()
                            : "상품";

            for (Consumer consumer : consumers) {

                if (consumer.isWithdrawn()) {
                    continue;
                }

                notificationService.createNotification(
                        consumer.getConsumerId(),
                        "PROMOTION",
                        "내일부터 할인이 시작돼요",
                        String.format(
                                "%s 상품이 내일부터 %,d원 할인돼요.",
                                productName,
                                promotion.getDiscountKrw()
                        ),
                        null
                );
            }
        }
    }
}