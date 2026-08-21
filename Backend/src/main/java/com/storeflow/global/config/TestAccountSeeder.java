package com.storeflow.global.config;

import com.storeflow.consumer.entity.Consumer;
import com.storeflow.consumer.entity.Member;
import com.storeflow.consumer.repository.ConsumerRepository;
import com.storeflow.consumer.repository.MemberRepository;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.time.LocalDate;

@Component
@Profile("local") // 로컬 개발 프로파일에서만 동작 — 운영에는 절대 올라가면 안 됨
public class TestAccountSeeder implements CommandLineRunner {

    private static final String TEST_PHONE = "01000000000";
    private static final String TEST_PASSWORD = "test1234!"; // 영문+숫자+특수문자 조건 충족

    private final ConsumerRepository consumerRepository;
    private final MemberRepository memberRepository;
    private final PasswordEncoder passwordEncoder;

    public TestAccountSeeder(ConsumerRepository consumerRepository,
                              MemberRepository memberRepository,
                              PasswordEncoder passwordEncoder) {
        this.consumerRepository = consumerRepository;
        this.memberRepository = memberRepository;
        this.passwordEncoder = passwordEncoder;
    }

    @Override
    public void run(String... args) {
        if (consumerRepository.existsByPhoneNumber(TEST_PHONE)) {
            return; // 이미 시드되어 있으면 건너뜀 (중복 생성 방지)
        }

        Consumer consumer = new Consumer(
                TEST_PHONE,
                passwordEncoder.encode(TEST_PASSWORD),
                null,                       // gender — 선택 입력이라 비워둠
                LocalDate.of(2000, 1, 1),   // birthDate — 임의값, 의미 없음
                true,
                true,
                true,
                true
        );
        consumerRepository.save(consumer);

        int memberId = Member.toMemberId(consumer.getConsumerId());
        // v2.5 스키마: householdSize/hasPet/hasChild/byCar 전부 NULL 허용 — 테스트 계정이라 전부 비워둠
        Member member = new Member(memberId, null, null, null, null, Instant.now());
        memberRepository.save(member);
    }
}