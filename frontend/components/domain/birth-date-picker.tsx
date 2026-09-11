"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

import { Button } from "@/components/ui/button";
import { StickyBottomBar } from "@/components/domain/sticky-bottom-bar";

const ITEM_HEIGHT = 36;
const VISIBLE_ITEMS = 3;
const PICKER_HEIGHT =
  ITEM_HEIGHT * VISIBLE_ITEMS;

const CURRENT_YEAR =
  new Date().getFullYear();

const MONTHS = Array.from(
  { length: 12 },
  (_, index) => index + 1
);

function getDaysInMonth(
  year: number,
  month: number
) {
  return new Date(
    year,
    month,
    0
  ).getDate();
}

function getToday() {
  const today = new Date();

  return {
    year: today.getFullYear(),
    month: today.getMonth() + 1,
    day: today.getDate(),
  };
}

function parseBirthDate(
  value: string
) {
  if (!value) return null;

  const [year, month, day] =
    value.split("-").map(Number);

  if (
    !year ||
    !month ||
    !day
  ) {
    return null;
  }

  return {
    year,
    month,
    day,
  };
}

function WheelPicker({
  values,
  value,
  onChange,
  suffix = "",
}: {
  values: number[];
  value: number;
  onChange: (value: number) => void;
  suffix?: string;
}) {
  const containerRef =
    useRef<HTMLDivElement>(null);

  const scrollTimeoutRef =
    useRef<ReturnType<typeof setTimeout> | null>(
      null
    );

  const paddingCount =
    Math.floor(
      VISIBLE_ITEMS / 2
    );

  useEffect(() => {
    const container =
      containerRef.current;

    if (!container) return;

    const index =
      values.indexOf(value);

    if (index === -1) return;

    const targetTop =
      index * ITEM_HEIGHT;

    if (
      Math.abs(
        container.scrollTop -
          targetTop
      ) > 1
    ) {
      container.scrollTo({
        top: targetTop,
        behavior: "smooth",
      });
    }
  }, [value, values]);

  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(
          scrollTimeoutRef.current
        );
      }
    };
  }, []);

  const handleScroll = () => {
    if (
      scrollTimeoutRef.current
    ) {
      clearTimeout(
        scrollTimeoutRef.current
      );
    }

    scrollTimeoutRef.current =
      setTimeout(() => {
        const container =
          containerRef.current;

        if (!container) return;

        const index =
          Math.round(
            container.scrollTop /
              ITEM_HEIGHT
          );

        const safeIndex =
          Math.max(
            0,
            Math.min(
              index,
              values.length - 1
            )
          );

        const nextValue =
          values[safeIndex];

        container.scrollTo({
          top:
            safeIndex *
            ITEM_HEIGHT,
          behavior: "smooth",
        });

        if (
          nextValue !== value
        ) {
          onChange(nextValue);
        }
      }, 80);
  };

  const handleClick = (
    nextValue: number
  ) => {
    const container =
      containerRef.current;

    if (!container) return;

    const index =
      values.indexOf(
        nextValue
      );

    if (index === -1) return;

    container.scrollTo({
      top:
        index * ITEM_HEIGHT,
      behavior: "smooth",
    });

    onChange(nextValue);
  };

  return (
    <div className="relative flex-1 overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 h-6 bg-gradient-to-b from-popover to-transparent" />

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-6 bg-gradient-to-t from-popover to-transparent" />

      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="relative snap-y snap-proximity overflow-y-auto overscroll-contain scroll-smooth scrollbar-none"
        style={{
          height: PICKER_HEIGHT,
          paddingTop:
            paddingCount *
            ITEM_HEIGHT,
          paddingBottom:
            paddingCount *
            ITEM_HEIGHT,
        }}
      >
        {values.map((item) => {
          const selected =
            item === value;

          return (
            <button
              key={item}
              type="button"
              onClick={() =>
                handleClick(item)
              }
              className={`
                relative z-30
                flex w-full
                snap-center
                items-center
                justify-center
                transition-all
                duration-150
                ${
                  selected
                    ? "text-sm font-semibold text-foreground"
                    : "text-md font-normal text-muted-foreground/40"
                }
              `}
              style={{
                height:
                  ITEM_HEIGHT,
              }}
            >
              {item}
              {suffix}
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface BirthDatePickerProps {
  value: string;
  onChange: (value: string) => void;
  /** ✅ "modal"(기본, 회원가입 화면에서 쓰는 버튼+팝업 방식) | "inline"(버튼 없이
   *  휠 선택 UI를 그 자리에 바로 보여줌 — 별도 페이지에서 곧장 뜨게 할 때 사용) */
  mode?: "modal" | "inline";
  /** ✅ 신규 — 생년월일(과거)이 아닌 다른 날짜(예: 장 볼 날짜, 미래 포함)에도 재사용할 수
   *  있게 연도 범위를 열어둠. 기본값은 기존 생년월일 동작(최근 100년~올해) 그대로. */
  minYear?: number;
  maxYear?: number;
  /** modal 모드의 트리거 버튼 placeholder 텍스트. 기본은 기존 문구 그대로. */
  placeholder?: string;
  /** modal 모드의 다이얼로그 제목. 기본은 기존 문구("생년월일") 그대로. */
  title?: string;
  /** ✅ 신규 — "box"(기본, 테두리 있는 버튼) | "bare"(테두리·배경 없이 텍스트+화살표만 —
   *  저장 리스트 상세의 장 볼 날짜, 새 리스트 만들기 모달처럼 폼 박스 느낌을 안 주고 싶을 때). */
  variant?: "box" | "bare";
  /** ✅ 신규 — bare variant에서 텍스트 정렬. "새 리스트 만들기"처럼 라벨은 왼쪽에 따로 두고
   *  값만 오른쪽 정렬하고 싶을 때 "right". */
  align?: "left" | "right";
  /** ✅ 신규 — 켜면 오늘보다 이전 날짜는 연/월/일 휠에서 아예 고를 수 없게 막음(장 볼
   *  날짜처럼 미래 날짜만 의미 있는 필드용). 년도 범위(minYear)는 호출부에서 이미
   *  올해로 좁혀서 넘기는 걸 전제로, 여기서는 그 해의 "오늘 이전 월/일"만 추가로 막음. */
  disablePast?: boolean;
  /** ✅ 신규(요청 — "장 볼 날짜 모달이 열려있는 동안 화면 하단 동선/리브 버튼이 위로
   *  겹쳐 보임") — 이 모달의 열림/닫힘을 호출부(예: 저장 리스트 상세)에 알려서, 호출부가
   *  자기 화면의 다른 하단 고정 버튼을 모달이 떠 있는 동안 숨길 수 있게 함. */
  onOpenChange?: (open: boolean) => void;
}

export function BirthDatePicker({
  value,
  onChange,
  mode = "modal",
  minYear = CURRENT_YEAR - 100,
  maxYear = CURRENT_YEAR,
  placeholder = "생년월일을 선택해주세요",
  title = "생년월일",
  variant = "box",
  align = "left",
  disablePast = false,
  onOpenChange,
}: BirthDatePickerProps) {
  const [open, setOpenState] =
    useState(mode === "modal" ? false : true);
  const setOpen = (v: boolean) => {
    setOpenState(v);
    onOpenChange?.(v);
  };

  const years = useMemo(
    () =>
      Array.from(
        { length: maxYear - minYear + 1 },
        (_, index) => maxYear - index
      ),
    [minYear, maxYear]
  );

  const today = getToday();

  const [selectedYear, setSelectedYear] =
    useState(today.year);

  const [selectedMonth, setSelectedMonth] =
    useState(today.month);

  const [selectedDay, setSelectedDay] =
    useState(today.day);

  const days = useMemo(() => {
    const lastDay =
      getDaysInMonth(
        selectedYear,
        selectedMonth
      );

    return Array.from(
      {
        length: lastDay,
      },
      (_, index) =>
        index + 1
    );
  }, [
    selectedYear,
    selectedMonth,
  ]);

  // ✅ 신규 — disablePast: 오늘 이전 월/일은 휠에 아예 안 뜨게(선택 못 하게) 거름.
  //   올해가 아니면(미래 연도) 전부 그대로 보여줌 — 그 해는 몇 월이든 이미 미래라서.
  const visibleMonths = useMemo(() => {
    if (!disablePast || selectedYear !== today.year) return MONTHS;
    return MONTHS.filter((m) => m >= today.month);
  }, [disablePast, selectedYear]);

  const visibleDays = useMemo(() => {
    if (!disablePast || selectedYear !== today.year || selectedMonth !== today.month) return days;
    return days.filter((d) => d >= today.day);
  }, [disablePast, selectedYear, selectedMonth, days]);

  useEffect(() => {
    const maxDay =
      getDaysInMonth(
        selectedYear,
        selectedMonth
      );

    if (
      selectedDay >
      maxDay
    ) {
      setSelectedDay(
        maxDay
      );
    }
  }, [
    selectedYear,
    selectedMonth,
    selectedDay,
  ]);

  // ✅ disablePast — 연도를 올해로 바꿨는데 이미 골라둔 월이 지난 달이면 이번 달로,
  //   월까지는 맞는데 일이 지난 날이면 오늘로 자동 보정.
  useEffect(() => {
    if (!disablePast) return;
    if (selectedYear === today.year && selectedMonth < today.month) {
      setSelectedMonth(today.month);
    }
  }, [disablePast, selectedYear, selectedMonth]);

  useEffect(() => {
    if (!disablePast) return;
    if (selectedYear === today.year && selectedMonth === today.month && selectedDay < today.day) {
      setSelectedDay(today.day);
    }
  }, [disablePast, selectedYear, selectedMonth, selectedDay]);

  // ✅ inline 모드는 페이지 들어오자마자 현재/기존 값 기준으로 휠을 세팅
  useEffect(() => {
    if (mode !== "inline") return;
    const parsed = parseBirthDate(value);
    if (parsed) {
      setSelectedYear(parsed.year);
      setSelectedMonth(parsed.month);
      setSelectedDay(parsed.day);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const openPicker = () => {
    const parsed =
      parseBirthDate(value);

    if (parsed) {
      setSelectedYear(
        parsed.year
      );
      setSelectedMonth(
        parsed.month
      );
      setSelectedDay(
        parsed.day
      );
    } else {
      const current =
        getToday();

      setSelectedYear(
        current.year
      );
      setSelectedMonth(
        current.month
      );
      setSelectedDay(
        current.day
      );
    }

    setOpen(true);
  };

  const handleConfirm = () => {
    const birthDate = [
      selectedYear,
      String(
        selectedMonth
      ).padStart(2, "0"),
      String(
        selectedDay
      ).padStart(2, "0"),
    ].join("-");

    onChange(
      birthDate
    );

    if (mode === "modal") setOpen(false);
  };

  const formattedValue =
    value
      ? (() => {
          const parsed =
            parseBirthDate(
              value
            );

          if (!parsed) {
            return "";
          }

          return `${parsed.year}년 ${parsed.month}월 ${parsed.day}일`;
        })()
      : "";

  const wheelRows = (
    <div className="relative overflow-hidden">
      <div
        className="pointer-events-none absolute left-0 right-0 top-1/2 z-10 -translate-y-1/2 bg-muted/40"
        style={{
          height:
            ITEM_HEIGHT,
        }}
      />

      <div className="relative z-20 flex gap-0">
        <WheelPicker
          values={years}
          value={selectedYear}
          onChange={
            setSelectedYear
          }
          suffix="년"
        />

        <WheelPicker
          values={visibleMonths}
          value={selectedMonth}
          onChange={
            setSelectedMonth
          }
          suffix="월"
        />

        <WheelPicker
          values={visibleDays}
          value={selectedDay}
          onChange={
            setSelectedDay
          }
          suffix="일"
        />
      </div>
    </div>
  );

  if (mode === "inline") {
    return (
      <div>
        {wheelRows}
        <Button
          type="button"
          className="mt-4 h-11 w-full rounded-[8px]"
          onClick={handleConfirm}
        >
          선택하기
        </Button>
      </div>
    );
  }

  return (
    <>
      {/* 생년월일 입력란 — ✅ variant="bare"면 테두리·배경 없이 텍스트+화살표만(요청:
          저장 리스트 상세/새 리스트 만들기처럼 폼 박스 느낌을 안 주고 싶을 때). */}
      <button
        type="button"
        onClick={openPicker}
        className={
          variant === "bare"
            ? `flex h-auto w-full items-center gap-1 bg-transparent text-left text-sm ${
                align === "right" ? "justify-end" : "justify-start"
              } ${formattedValue ? "text-foreground" : "text-muted-foreground/55"}`
            : `
          flex h-12 w-full
          items-center justify-between
          rounded-[8px]
          border
          px-4
          text-left
          text-sm
          transition
          ${
            formattedValue
              ? "border-foreground bg-foreground text-background"
              : "border-border bg-background text-muted-foreground/55 hover:bg-muted/40"
          }
        `
        }
      >
        <span>
          {formattedValue ||
            placeholder}
        </span>

        <span
          className={
            variant === "bare"
              ? "text-muted-foreground/50"
              : formattedValue
                ? "text-background/70"
                : "text-muted-foreground/50"
          }
        >
          ›
        </span>
      </button>

      <Dialog
        open={open}
        onOpenChange={setOpen}
      >
        <DialogContent
          showCloseButton
          className="max-w-sm px-5 py-6"
        >
          <DialogHeader>
            <DialogTitle className="text-md">
              {title}
            </DialogTitle>
          </DialogHeader>

          {wheelRows}
        </DialogContent>
      </Dialog>

      {/* ✅ 수정(요청) — "선택하기" 확정 버튼을 모달 밖 화면 하단(h-60, 텍스트 폭 맞춤)으로. */}
      {open && (
        <StickyBottomBar elevated>
          <Button
            type="button"
            className="flex mx-auto h-[60px] w-fit px-5 rounded-full shadow-[0_-2px_20px_rgba(0,0,0,0.1)]"
            onClick={handleConfirm}
          >
            선택하기
          </Button>
        </StickyBottomBar>
      )}
    </>
  );
}