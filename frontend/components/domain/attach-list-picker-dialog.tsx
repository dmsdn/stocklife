// components/domain/attach-list-picker-dialog.tsx
// AI 채팅 "+"에서 "저장된 리스트 불러오기" 선택 시 뜨는 목록.
"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { readCartGroups } from "@/lib/cart-storage";

interface AttachListPickerDialogProps {
  open: boolean;
  onClose: () => void;
  onSelect: (groupId: number, title: string) => void;
}

export function AttachListPickerDialog({ open, onClose, onSelect }: AttachListPickerDialogProps) {
  const groups = readCartGroups();

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>불러올 리스트를 선택하세요</DialogTitle>
        </DialogHeader>
        <div className="space-y-1">
          {groups.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => {
                onSelect(g.id, g.title);
                onClose();
              }}
              className="flex w-full items-center justify-between rounded-md px-3 py-3 text-left text-sm hover:bg-muted"
            >
              <span>{g.title}</span>
              <span className="text-xs text-muted-foreground">{g.products.length}개</span>
            </button>
          ))}
          {groups.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">저장된 리스트가 없어요.</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
