package com.storeflow.consumer.service;

import com.storeflow.consumer.dto.ConsumerMeResponse;
import com.storeflow.consumer.dto.LoginRequest;
import com.storeflow.consumer.dto.LoginResponse;
import com.storeflow.consumer.dto.ResetPasswordRequest;
import com.storeflow.consumer.dto.RegistrationStatusResponse;
import com.storeflow.consumer.dto.SignupRequest;
import com.storeflow.consumer.dto.UpdateConsumerRequest;
import com.storeflow.consumer.entity.Consumer;
import com.storeflow.consumer.entity.Member;
import com.storeflow.consumer.exception.InvalidCredentialsException;
import com.storeflow.consumer.exception.MemberNotFoundException;
import com.storeflow.consumer.repository.ConsumerRepository;
import com.storeflow.consumer.repository.MemberRepository;
import com.storeflow.global.jwt.ConsumerJwtUtil;
import com.storeflow.inventory.repository.ConsumerEventRepository;
import com.storeflow.verification.entity.VerificationPurpose;
import com.storeflow.verification.service.PhoneVerificationService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;

@Service
public class ConsumerService {

    private static final Logger log = LoggerFactory.getLogger(ConsumerService.class);

    private final ConsumerRepository consumerRepository;
    private final MemberRepository memberRepository;
    private final PasswordEncoder passwordEncoder;
    private final ConsumerJwtUtil jwtUtil;
    private final ConsumerEventRepository consumerEventRepository;
    private final PhoneVerificationService phoneVerificationService;

    public ConsumerService(ConsumerRepository consumerRepository,
                           MemberRepository memberRepository,
                           PasswordEncoder passwordEncoder,
                           ConsumerJwtUtil jwtUtil,
                           ConsumerEventRepository consumerEventRepository,
                           PhoneVerificationService phoneVerificationService) {
        this.consumerRepository = consumerRepository;
        this.memberRepository = memberRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtUtil = jwtUtil;
        this.consumerEventRepository = consumerEventRepository;
        this.phoneVerificationService = phoneVerificationService;
    }

    @Transactional
    public void signup(SignupRequest request) {
        // 전화번호는 필수 항목이 아니므로, 값이 있을 때만 중복 체크한다.
        if (request.getPhoneNumber() != null && !request.getPhoneNumber().isBlank()
                && consumerRepository.existsByPhoneNumber(request.getPhoneNumber())) {
            throw new IllegalStateException("이미 가입된 전화번호입니다.");
        }

        // signup/send-code -> signup/verify-code를 거쳐 verified=true가 된 레코드가 있어야 가입 완료 가능.
        // 통과하면 레코드는 소비(삭제)되어 재사용할 수 없다.
        phoneVerificationService.assertVerifiedAndConsume(request.getPhoneNumber(), VerificationPurpose.SIGNUP);

        String encodedPassword = passwordEncoder.encode(request.getPassword());

        Consumer consumer = new Consumer(
                request.getPhoneNumber(),
                request.getName().trim(),
                encodedPassword,
                request.getGender(),
                request.getBirthDate(),
                request.isCameraConsent(),
                request.isPersonalInfoConsent(),
                request.isMicConsent(),
                request.isMarketingConsent()
        );

        consumerRepository.save(consumer); // IDENTITY라 save 직후 consumerId가 채워짐

        // member_id는 저장하지 않고 계산(Member.toMemberId).
        // 스키마 v2.5: persona_type 폐기 → household_size/has_pet/has_child/by_car.
        // 전부 선택 입력이라 안 받은 값은 그대로 null로 저장한다.
        // 주의: null을 임의로 0/1(=false)로 채우면 안 됨 — "안 물어봄"과 "아니오"는 다른 의미이고,
        // 잘못 채우면 Agent 쪽 추천이 조용히 틀어진다.
        Byte householdSize = request.getHouseholdSize() == null
                ? null
                : request.getHouseholdSize().byteValue();

        int memberId = Member.toMemberId(consumer.getConsumerId());
        memberRepository.save(new Member(
                memberId,
                householdSize,
                request.getHasPet(),
                request.getHasChild(),
                request.getByCar(),
                Instant.now()
        ));
    }

    @Transactional(readOnly = true)
    public RegistrationStatusResponse getRegistrationStatus(String phoneNumber) {
        return new RegistrationStatusResponse(consumerRepository.existsByPhoneNumber(phoneNumber));
    }

    @Transactional
    public LoginResponse login(LoginRequest request) {
        Consumer consumer = consumerRepository.findByPhoneNumber(request.getPhoneNumber())
                .orElseThrow(() -> new InvalidCredentialsException("전화번호 또는 비밀번호가 일치하지 않습니다."));

        if (consumer.isWithdrawn()) {
            throw new InvalidCredentialsException("전화번호 또는 비밀번호가 일치하지 않습니다.");
        }

        if (!passwordEncoder.matches(request.getPassword(), consumer.getPassword())) {
            throw new InvalidCredentialsException("전화번호 또는 비밀번호가 일치하지 않습니다.");
        }

        String accessToken = jwtUtil.generateAccessToken(consumer.getConsumerId());
        String refreshToken = jwtUtil.generateRefreshToken(consumer.getConsumerId());

        consumer.updateRefreshToken(refreshToken);

        // 요구사항 29: 비회원 상태로 쌓인 데이터(행동 기록 + 장바구니)를 이 계정으로 승계한다.
        // 두 승계 모두 이 메서드의 @Transactional 하나 안에서 처리 — 한쪽만 성공하고 롤백되는
        // 상황이 생기지 않도록 같은 트랜잭션에 둔다.
        // member_id는 Member.toMemberId(consumerId)와 동일한 계산식으로 구해야 값이 일치한다.
        if (request.getSessionId() != null && !request.getSessionId().isBlank()) {
            Integer memberId = Member.toMemberId(consumer.getConsumerId());
            int claimedEvents = consumerEventRepository.claimGuestEvents(request.getSessionId(), memberId);
            if (claimedEvents > 0) {
                log.info("비회원 이벤트 {}건을 sessionId={} → memberId={} 로 승계했습니다.",
                        claimedEvents, request.getSessionId(), memberId);
            }

        }

        return new LoginResponse(accessToken, refreshToken);
    }

    /** 마이페이지 "내 정보". Member 행이 없는 구가입자도 조회는 되어야 하므로 findById는 optional 그대로 둔다. */
    @Transactional(readOnly = true)
    public ConsumerMeResponse getMe(Long consumerId) {
        Consumer consumer = consumerRepository.findById(consumerId)
                .orElseThrow(() -> new IllegalStateException("존재하지 않는 회원입니다."));
        Member member = memberRepository.findById(Member.toMemberId(consumerId)).orElse(null);
        return new ConsumerMeResponse(consumer, member);
    }

    /**
     * 마이페이지 회원정보 수정. Consumer(성별/생년월일)와 Member(가구원수/반려동물/자녀/차량) 양쪽을
     * 한 트랜잭션에서 갱신한다. Member 행이 아직 없는 구가입자가 처음 수정하는 경우도 있으므로
     * 없으면 새로 만든다.
     */
    @Transactional
    public ConsumerMeResponse updateMe(Long consumerId, UpdateConsumerRequest request) {
        Consumer consumer = consumerRepository.findById(consumerId)
                .orElseThrow(() -> new IllegalStateException("존재하지 않는 회원입니다."));
        consumer.updateProfile(request.getGender(), request.getBirthDate());
        if (request.getMarketingConsent() != null) {
            consumer.updateMarketingConsent(request.getMarketingConsent());
        }

        Byte householdSize = request.getHouseholdSize() == null ? null : request.getHouseholdSize().byteValue();
        int memberId = Member.toMemberId(consumerId);
        Member member = memberRepository.findById(memberId).orElse(null);
        if (member == null) {
            member = new Member(memberId, householdSize, request.getHasPet(), request.getHasChild(),
                    request.getByCar(), Instant.now());
            memberRepository.save(member);
        } else {
            member.updateProfile(householdSize, request.getHasPet(), request.getHasChild(), request.getByCar());
        }

        return new ConsumerMeResponse(consumer, member);
    }

    /**
     * 회원탈퇴. 전화번호를 tombstone 값으로 바꿔서 원래 번호는 재가입에 쓸 수 있게 풀어주고,
     * 비밀번호도 랜덤값으로 덮어써서 재로그인을 원천 차단한다. 구매내역(purchases)·리뷰 등
     * 과거 기록은 그대로 남긴다 — 삭제하면 다른 도메인(재구매 주기 계산 등)이 참조하는 이력이
     * 끊기므로, "계정만 잠그고 데이터는 보존"하는 소프트 삭제 방식을 쓴다.
     */
    @Transactional
    public void withdraw(Long consumerId) {
        Consumer consumer = consumerRepository.findById(consumerId)
                .orElseThrow(() -> new IllegalStateException("존재하지 않는 회원입니다."));
        if (consumer.isWithdrawn()) {
            return; // 이미 탈퇴한 회원 — 멱등하게 처리
        }
        String tombstonePhoneNumber = "WITHDRAWN_" + consumerId + "_" + consumer.getPhoneNumber();
        String randomizedPassword = passwordEncoder.encode(java.util.UUID.randomUUID().toString());
        consumer.withdraw(tombstonePhoneNumber, randomizedPassword);
    }

    @Transactional
    public void logout(Long consumerId) {
        Consumer consumer = consumerRepository.findById(consumerId)
                .orElseThrow(() -> new IllegalStateException("존재하지 않는 회원입니다."));

        consumer.updateRefreshToken(null);
    }

    /**
     * 비밀번호 재설정 인증번호 발송 "전에" 호출한다. 회원이 없으면 SMS를 보내지 않고 예외를 던진다.
     */
    @Transactional(readOnly = true)
    public void assertMemberExistsByPhoneNumber(String phoneNumber) {
        if (!consumerRepository.existsByPhoneNumber(phoneNumber)) {
            throw new MemberNotFoundException("가입된 회원이 없습니다.");
        }
    }

    @Transactional
    public void resetPassword(ResetPasswordRequest request) {
        Consumer consumer = consumerRepository.findByPhoneNumber(request.getPhoneNumber())
                .orElseThrow(() -> new MemberNotFoundException("가입된 회원이 없습니다."));

        phoneVerificationService.assertVerifiedAndConsume(request.getPhoneNumber(), VerificationPurpose.PASSWORD_RESET);

        String encodedPassword = passwordEncoder.encode(request.getNewPassword());
        consumer.updatePassword(encodedPassword);
    }
}