"use client";

import {
  Camera,
  FileText,
  Image as ImageIcon,
  Receipt,
} from "lucide-react";

export type AttachmentType =
  | "photo"
  | "image"
  | "document"
  | "receipt";

interface AttachmentPickerProps {
  open: boolean;
  onClose: () => void;

  onCamera: () => void;
  onImage: () => void;
  onDocument: () => void;
  onReceipt: () => void;
}

export function AttachmentPicker({
  open,
  onClose,
  onCamera,
  onImage,
  onDocument,
  onReceipt,
}: AttachmentPickerProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[110]">
      {/* 바깥 영역 */}
      <button
        type="button"
        onClick={onClose}
        className="absolute inset-0 bg-black/30"
        aria-label="자료 추가 닫기"
      />

      {/* 바텀시트 */}
      <div className="absolute bottom-0 left-0 right-0 rounded-t-3xl bg-background px-5 pb-8 pt-4 shadow-2xl">
        <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-muted" />

        <div className="mb-5">
          <h2 className="text-lg font-semibold">
            자료 추가
          </h2>

          <p className="mt-1 text-sm text-muted-foreground">
            AI에게 보여줄 자료를 선택해주세요.
          </p>
        </div>

        <div className="grid grid-cols-4 gap-2">
          <AttachmentButton
            icon={<Camera size={24} />}
            label="사진 촬영"
            onClick={onCamera}
          />

          <AttachmentButton
            icon={<ImageIcon size={24} />}
            label="이미지"
            onClick={onImage}
          />

          <AttachmentButton
            icon={<FileText size={24} />}
            label="문서"
            onClick={onDocument}
          />

          <AttachmentButton
            icon={<Receipt size={24} />}
            label="영수증"
            onClick={onReceipt}
          />
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full rounded-[8px] py-3 text-sm text-muted-foreground transition hover:bg-muted"
        >
          취소
        </button>
      </div>
    </div>
  );
}

function AttachmentButton({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center gap-2 rounded-[8px] border border-border px-2 py-4 text-xs transition hover:bg-muted active:scale-[0.98]"
    >
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-muted">
        {icon}
      </div>

      <span>{label}</span>
    </button>
  );
}