// lib/store-hours.ts
// ✅ 영업시간/휴무 판단 — 전부 프론트 상수(백엔드에 이 개념 자체가 없음, 확인 완료).
//
// 세 가지를 구분해서 다룹니다:
//   1. 정기 영업시간(평일 / 주말·공휴일) — 값 자체가 거의 안 바뀌므로 상수로 고정
//      ⚠ 실제 오픈/마감 시각은 아직 확정받은 적이 없어서 예시값입니다 — 실제 시간으로 교체 필요.
//   2. 정기휴무일(매월 둘째·넷째 주 월요일) — "날짜"가 아니라 "규칙"이라 계산 함수로 처리.
//      연도가 바뀌어도 코드를 안 건드려도 항상 정확합니다.
//   3. 법정공휴일 — 대체공휴일 규정이 휴일마다 다르고(예: 현충일은 대체공휴일 자체가 없음,
//      설/추석은 일요일과 겹칠 때만 대체), 선거일 같은 임시공휴일은 아예 규칙으로 예측이
//      안 됩니다. 그래서 "계산"하지 않고, 정부 발표 기준 확정된 날짜를 그대로 나열합니다.
//      ⚠️ 매년 12월에 다음 해 날짜를 추가해줘야 합니다 — 안 하면 그 해 1월부터 공휴일이
//      전부 "정상영업"으로 잘못 표시됩니다.
//   임시휴무(폭설, 시설 점검 등 갑작스러운 휴무)는 이 파일로 다루지 않습니다 — 이미 있는
//   공지(Notices) 시스템으로 안내하는 쪽이 맞습니다(마이페이지 "정기 점검 안내"와 같은 방식).
//   앱 재배포 없이 바로 반영할 수 있어야 하는 정보라 상수로 박아둘 대상이 아닙니다.

export interface StoreHours {
  open: string; // "HH:mm"
  close: string; // "HH:mm"
}

// 1. 정기 영업시간 (예시값 — 실제 시간 확정되면 교체)
export const WEEKDAY_HOURS: StoreHours = { open: "10:00", close: "22:00" };
export const WEEKEND_OR_HOLIDAY_HOURS: StoreHours = { open: "10:00", close: "21:00" };

// 3. 법정공휴일 — 2026년 (정부 발표 기준 확정 날짜, "yyyy-MM-dd")
// 여러 출처 교차 검증 완료(공휴일 총 20일 집계와 일치 확인).
// ⚠️ 대체공휴일 규정: 국경일(3·1절/광복절/개천절/한글날)은 토·일 겹치면 모두 대체,
//    설날·추석은 "일요일"과 겹칠 때만 대체(토요일 겹침은 대체 없음), 현충일은 대체 자체가 없음.
//    아래 목록은 이 규정을 이미 반영해 확정된 날짜만 담았습니다 — 코드가 규칙을 계산하지 않습니다.
export const PUBLIC_HOLIDAYS_2026: { date: string; name: string }[] = [
  { date: "2026-01-01", name: "신정" },
  { date: "2026-02-16", name: "설날 연휴" },
  { date: "2026-02-17", name: "설날" },
  { date: "2026-02-18", name: "설날 연휴" },
  { date: "2026-03-01", name: "삼일절" },
  { date: "2026-03-02", name: "삼일절 대체공휴일" },
  { date: "2026-05-05", name: "어린이날" },
  { date: "2026-05-24", name: "부처님오신날" },
  { date: "2026-05-25", name: "부처님오신날 대체공휴일" },
  { date: "2026-06-06", name: "현충일" },
  { date: "2026-07-17", name: "제헌절" }, // 2026년부터 18년 만에 공휴일로 재지정
  { date: "2026-08-15", name: "광복절" },
  { date: "2026-08-17", name: "광복절 대체공휴일" },
  { date: "2026-09-24", name: "추석 연휴" },
  { date: "2026-09-25", name: "추석" },
  { date: "2026-09-26", name: "추석 연휴" },
  { date: "2026-10-03", name: "개천절" },
  { date: "2026-10-05", name: "개천절 대체공휴일" },
  { date: "2026-10-09", name: "한글날" },
  { date: "2026-12-25", name: "성탄절" },
];
// TODO(매년 12월): 다음 해 공휴일 확정되면 PUBLIC_HOLIDAYS_2027 추가하고 아래
// ALL_PUBLIC_HOLIDAYS 배열에 이어붙이기.
const ALL_PUBLIC_HOLIDAYS = [...PUBLIC_HOLIDAYS_2026];

function toDateOnly(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function findHoliday(date: Date): { date: string; name: string } | null {
  const key = toDateOnly(date);
  return ALL_PUBLIC_HOLIDAYS.find((h) => h.date === key) ?? null;
}

// 2. 정기휴무일 — "매월 둘째·넷째 주 월요일". 특정 날짜를 저장하지 않고 매번 계산합니다.
function isSecondOrFourthMonday(date: Date): boolean {
  if (date.getDay() !== 1) return false; // 월요일(0=일 ... 1=월)이 아니면 바로 false
  const nth = Math.ceil(date.getDate() / 7); // 이번 달의 몇 번째 월요일인지
  return nth === 2 || nth === 4;
}

export interface StoreDayInfo {
  /** 휴무일 여부 (정기휴무 또는 법정공휴일) */
  closed: boolean;
  /** 휴무 사유. 정기휴무면 "정기휴무일", 공휴일이면 그 이름 */
  closedReason: string | null;
  /** 휴무가 아닐 때만 의미 있음 — 그날 적용되는 영업시간 */
  hours: StoreHours;
}

/** 특정 날짜의 영업 정보를 한 번에 반환 — 정기휴무/공휴일 여부 + 그날의 영업시간 */
export function getStoreDayInfo(date: Date): StoreDayInfo {
  const holiday = findHoliday(date);
  if (holiday) {
    return { closed: true, closedReason: holiday.name, hours: WEEKEND_OR_HOLIDAY_HOURS };
  }
  if (isSecondOrFourthMonday(date)) {
    return { closed: true, closedReason: "정기휴무일", hours: WEEKDAY_HOURS };
  }

  const day = date.getDay(); // 0=일, 6=토
  const isWeekend = day === 0 || day === 6;
  return { closed: false, closedReason: null, hours: isWeekend ? WEEKEND_OR_HOLIDAY_HOURS : WEEKDAY_HOURS };
}

export function getTodayStoreDayInfo(): StoreDayInfo {
  return getStoreDayInfo(new Date());
}
