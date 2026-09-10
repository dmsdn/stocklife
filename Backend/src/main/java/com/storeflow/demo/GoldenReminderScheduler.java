package com.storeflow.demo;
import org.springframework.stereotype.Component;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
@Component
@ConditionalOnProperty(name="storeflow.golden-reminders-enabled",havingValue="true")
public class GoldenReminderScheduler {
 private final GoldenDemoController demo;
 public GoldenReminderScheduler(GoldenDemoController demo){this.demo=demo;}
 @Scheduled(initialDelay=120000,fixedDelay=21600000)
 @Scheduled(cron="0 5 0 * * *",zone="Asia/Seoul")
 public void remind(){for(Long id:demo.todayAccounts())try{demo.repurchase(id);}catch(Exception e){org.slf4j.LoggerFactory.getLogger(getClass()).warn("골든 소비주기 알림 보류: {}",e.getClass().getSimpleName());}}
}
