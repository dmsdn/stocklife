"use client";

import * as React from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";

import { cn } from "@/lib/utils";
import { getAppFrame } from "@/lib/app-frame";
import { Button } from "@/components/ui/button";
import { RiCloseLine } from "@remixicon/react";

// 모달 전체
function Dialog({ ...props }: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

// 모달 여는 버튼
function DialogTrigger({ ...props }: DialogPrimitive.Trigger.Props) {
  return (
    <DialogPrimitive.Trigger
      data-slot="dialog-trigger"
      {...props}
    />
  );
}

// 모달을 화면 최상단에 띄움
// 모바일 화면 틀(#app-frame) 안에 띄워야 모달 폭과 위치가 틀에 맞춰진다.
// (document.body에 띄우면 PC에서 브라우저 전체 폭 기준으로 커짐)
function DialogPortal({ container, ...props }: DialogPrimitive.Portal.Props) {
  return (
    <DialogPrimitive.Portal
      data-slot="dialog-portal"
      container={container ?? getAppFrame() ?? undefined}
      {...props}
    />
  );
}

// 모달 닫기
function DialogClose({ ...props }: DialogPrimitive.Close.Props) {
  return (
    <DialogPrimitive.Close
      data-slot="dialog-close"
      {...props}
    />
  );
}

// 모달 뒤 배경
function DialogOverlay({
  className,
  ...props
}: DialogPrimitive.Backdrop.Props) {
  return (
    <DialogPrimitive.Backdrop
      data-slot="dialog-overlay"
      className={cn(
        // ✅ 수정(2026-09) — "주변이 흐려지는 게 구역별로 나뉘어 보임" 원인: 하단탭바가
        //   자기 자신에게도 backdrop-blur-2xl(진한 블러)을 걸고 있는데, 모달이 열리면 이
        //   오버레이(backdrop-blur-sm, 옅은 블러)가 그 위에 또 겹쳐져서 "하단탭바가 있는
        //   자리만 이중으로 블러 처리된 사각형"처럼 도드라져 보였음. 오버레이 블러를
        //   더 진하게 올려서 그 차이를 눈에 덜 띄게 하고, 검은 톤도 살짝 더 깔았습니다
        //   (요청: "검은 배경도 살짝").
        "fixed inset-0 isolate z-[105] bg-black/35 duration-100",
        "supports-backdrop-filter:backdrop-blur-md",
        "data-open:animate-in data-open:fade-in-0",
        "data-closed:animate-out data-closed:fade-out-0",
        className
      )}
      {...props}
    />
  );
}

// 모달 본체
function DialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: DialogPrimitive.Popup.Props & {
  showCloseButton?: boolean
}) {
  return (
    <DialogPortal>
      <DialogOverlay />

      <DialogPrimitive.Popup
        data-slot="dialog-content"
        className={cn(
          "fixed top-1/2 left-1/2 z-[105] grid w-[calc(100%-40px)] max-w-sm -translate-x-1/2 -translate-y-1/2 gap-4 rounded-sm bg-popover px-5 py-8 text-sm text-popover-foreground duration-100 outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
          className
        )}
        {...props}
      >
        {children}

        {/* 모달 닫기 버튼 */}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            render={
              <Button
                variant="ghost"
                className="absolute top-3 right-3 h-8 w-8 p-0"
              />
            }
          >
            <RiCloseLine />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Popup>
    </DialogPortal>
  );
}

// 모달 상단 영역
function DialogHeader({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2", className)}
      {...props}
    />
  );
}

// 모달 하단 버튼 영역
function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean;
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "-mx-5 -mb-6",
        "flex flex-col-reverse gap-2",
        "rounded-b-lg",
        "bg-muted/50",
        "px-5 py-5",
        "sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    >
      {children}

      {showCloseButton && (
        <DialogPrimitive.Close render={<Button variant="outline" />}>
          닫기
        </DialogPrimitive.Close>
      )}
    </div>
  );
}

// 모달 제목
function DialogTitle({
  className,
  ...props
}: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn(
        "font-heading text-base leading-none font-medium",
        className
      )}
      {...props}
    />
  );
}

// 모달 설명
function DialogDescription({
  className,
  ...props
}: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(
        "text-sm text-muted-foreground",
        "*:[a]:underline",
        "*:[a]:underline-offset-3",
        "*:[a]:hover:text-foreground",
        className
      )}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
};