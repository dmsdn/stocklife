// components/domain/group-picker-dialog.tsx
// ✅ 상품 담기(스캔) 화면의 "담는 곳" — 라벨+select 대신 리스트를 디자인해서 보여주고
//   그 자리에서 새 리스트도 만들 수 있게 함.
"use client";

import { useEffect, useState } from "react";
import { RiCheckLine } from "@remixicon/react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { createCartGroup, type CartGroup } from "@/lib/cart-storage";

interface GroupPickerDialogProps {
  open: boolean;
  groups: CartGroup[];
  selectedGroupId: number;
  onClose: () => void;
  onSelect: (groupId: number) => void;
  onGroupsChange: () => void;
}

export function GroupPickerDialog({
  open,
  groups,
  selectedGroupId,
  onClose,
  onSelect,
  onGroupsChange,
}: GroupPickerDialogProps) {
  const [showNewInput, setShowNewInput] = useState(false);
  const [newTitle, setNewTitle] = useState("");

  useEffect(() => {
    if (open) {
      setShowNewInput(false);
      setNewTitle("");
    }
  }, [open]);

  const handleCreate = async () => {
    if (!newTitle.trim()) return;
    const group = await createCartGroup(newTitle.trim());
    onGroupsChange();
    onSelect(group.id);
    onClose();
  };

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
        </div>

        {showNewInput ? (
          <div className="flex gap-2 pt-1">
            <Input
              placeholder="새 리스트 이름"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              autoFocus
            />
            <Button onClick={handleCreate}>추가</Button>
          </div>
        ) : (
          <Button variant="outline" className="w-full" onClick={() => setShowNewInput(true)}>
            + 새 리스트 만들기
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}
