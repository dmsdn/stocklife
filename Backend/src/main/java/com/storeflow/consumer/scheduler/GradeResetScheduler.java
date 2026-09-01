//package com.storeflow.consumer.scheduler;
//
//import com.storeflow.consumer.entity.Consumer;
//import com.storeflow.consumer.repository.ConsumerRepository;
//import org.springframework.scheduling.annotation.Scheduled;
//import org.springframework.stereotype.Component;
//import org.springframework.transaction.annotation.Transactional;
//
//import java.util.List;
//
//@Component
//public class GradeResetScheduler {
//
//    private final ConsumerRepository consumerRepository;
//
//    public GradeResetScheduler(ConsumerRepository consumerRepository) {
//        this.consumerRepository = consumerRepository;
//    }
//
//    // 매달 1일 00:00에 실행 (초 분 시 일 월 요일)
//    @Scheduled(cron = "0 0 0 1 * *")
//    @Transactional
//    public void resetMonthlySpend() {
//        List<Consumer> consumers = consumerRepository.findAll();
//        for (Consumer consumer : consumers) {
//            consumer.resetMonthlySpend();
//        }
//    }
//}