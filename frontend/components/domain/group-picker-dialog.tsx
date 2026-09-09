// components/domain/group-picker-dialog.tsx
// ✅ 상품 담기(스캔) 화면의 "담는 곳" — 이미 있는 리스트 중 골라서 담거나, 리스트 없이
//   바로 시작하는 두 가지만 지원. (수정: 그 자리에서 새 리스트 만드는 기능은 제거 — 리스트
//   생성은 "내 리스트" 화면에서 하고, 여기선 고르기만.)
"use client";

import { RiCheckLine } from "@remixicon/react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { CartGroup } from "@/lib/cart-storage";

interface GroupPickerDialogProps {
  open: boolean;
  groups: CartGroup[];
  selectedGroupId: number;
  onClose: () => void;
  onSelect: (groupId: number) => void;
  onGroupsChange: () => void;
  /** "리스트 없이 장보기". 누르면 리스트를 고르지 않고 바로 스캔을 시작합니다(내부적으로는
   *  이름 없는 임시 리스트 하나를 만들어서 담습니다 — 나중에 "내 리스트"에서 이름을 정할
   *  수 있음). */
  onStartWithoutList?: () => void;
}

export function GroupPickerDialog({
  open,
  groups,
  selectedGroupId,
  onClose,
  onSelect,
  onStartWithoutList,
}: GroupPickerDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>담는 곳을 선택하세요</DialogTitle>
        </DialogHeader>

        <div className="space-y-2">
          {groups.map((group) => {
            const selected = group.id === selectedGroupId;
            return (
              <button
                key={group.id}
                type="button"
                onClick={() => {
                  onSelect(group.id);
                  onClose();
                }}
                className={`flex w-full items-center justify-between rounded-sm border px-3 py-3 text-left text-sm ${
                  selected ? "border-primary bg-muted" : "border-border hover:bg-muted"
                }`}
              >
                <div>
                  <p className="font-medium">{group.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{group.products.length}개 상품</p>
                </div>
                {selected && <RiCheckLine size={24} className="shrink-0" />}
              </button>
            );
          })}

          {onStartWithoutList && (
            <button
              type="button"
              onClick={onStartWithoutList}
              className="flex w-full items-center justify-between rounded-sm border border-border px-3 py-3 text-left text-sm hover:bg-muted"
            >
              <div>
                <p className="font-medium">리스트 없이 시작하기</p>
                <p className="mt-0.5 text-xs text-muted-foreground">담은 상품은 나중에 리스트로 정리할 수 있어요</p>
              </div>
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
