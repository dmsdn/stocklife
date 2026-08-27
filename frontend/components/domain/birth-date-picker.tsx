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

const ITEM_HEIGHT = 36;
const VISIBLE_ITEMS = 3;
const PICKER_HEIGHT =
  ITEM_HEIGHT * VISIBLE_ITEMS;

const CURRENT_YEAR =
  new Date().getFullYear();

const MIN_YEAR =
  CURRENT_YEAR - 100;

const MAX_YEAR =
  CURRENT_YEAR;

const YEARS = Array.from(
  {
    length:
      MAX_YEAR -
      MIN_YEAR +
      1,
  },
  (_, index) =>
    MAX_YEAR - index
);

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
                    : "text-[11px] font-normal text-muted-foreground/40"
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
}

export function BirthDatePicker({
  value,
  onChange,
  mode = "modal",
}: BirthDatePickerProps) {
  const [open, setOpen] =
    useState(mode === "modal" ? false : true);

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
          values={YEARS}
          value={selectedYear}
          onChange={
            setSelectedYear
          }
          suffix="년"
        />

        <WheelPicker
          values={MONTHS}
          value={selectedMonth}
          onChange={
            setSelectedMonth
          }
          suffix="월"
        />

        <WheelPicker
          values={days}
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
      {/* 생년월일 입력란 */}
      <button
        type="button"
        onClick={openPicker}
        className={`
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
        `}
      >
        <span>
          {formattedValue ||
            "생년월일을 선택해주세요"}
        </span>

        <span
          className={
            formattedValue
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
              생년월일
            </DialogTitle>
          </DialogHeader>

          {wheelRows}

          <DialogFooter className="mt-2 -mx-5 -mb-6 rounded-b-sm px-5 py-4">
            <Button
              type="button"
              className="h-11 w-full rounded-[8px]"
              onClick={
                handleConfirm
              }
            >
              선택하기
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}