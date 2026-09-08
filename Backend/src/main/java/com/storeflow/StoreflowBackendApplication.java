package com.storeflow;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling

public class StoreflowBackendApplication {

    public static void main(String[] args) {
        // 09-08 성능. 커넥션 풀(Hikari)은 잠깐이라도 놀았던 커넥션을 빌려줄 때
        // "아직 살아있나" 검사를 한 번 한다. 그 기준이 기본 500ms라서, 요청이 그보다
        // 뜸하게 오는 우리 환경에서는 사실상 매 요청마다 검사가 걸렸다.
        //
        // 문제는 그 검사 한 번이 약 1초가 걸린다는 것이었다. 스레드 덤프로 확인한 위치는
        // HikariPool.getConnection -> PoolBase.isConnectionDead 이고, 검사 방식을 PING에서
        // SELECT 1 로 바꿔봐도 똑같았다. 잠깐 놀았던 TCP 연결의 첫 패킷이 중간 경로에서
        // 지연되면서 재전송을 기다리는 것으로 보인다(TCP 연결 자체는 6ms인데도 그렇다).
        //
        // 그래서 "최근 60초 안에 쓴 커넥션은 검사를 건너뛴다"로 창을 넓힌다. 이 값은
        // 설정 파일로는 못 바꾸고 시스템 속성으로만 지정할 수 있어서 여기에 둔다.
        // 안전망은 그대로다 - application.yml의 keepalive-time이 30초마다 백그라운드
        // 스레드에서 커넥션을 확인하므로, 죽은 커넥션은 요청 경로 밖에서 걸러진다.
        System.setProperty("com.zaxxer.hikari.aliveBypassWindowMs", "60000");

        SpringApplication.run(StoreflowBackendApplication.class, args);
    }
}
