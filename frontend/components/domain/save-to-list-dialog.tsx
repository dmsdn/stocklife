// components/domain/save-to-list-dialog.tsx
// ✅ 신규. 하트(=담기=저장) 눌렀을 때 어느 리스트에 담을지 고르는 다이얼로그.
// lib/cart-storage.ts의 리스트(그룹)를 그대로 보여주고, 새 리스트도 그 자리에서 만들 수 있음.
"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { readCartGroups, createCartGroup, type CartGroup } from "@/lib/cart-storage";

interface SaveToListDialogProps {
  open: boolean;
  onClose: () => void;
  onSelect: (groupId: number) => void;
}

export function SaveToListDialog({ open, onClose, onSelect }: SaveToListDialogProps) {
  const [groups, setGroups] = useState<CartGroup[]>([]);
  const [showNewInput, setShowNewInput] = useState(false);
  const [newTitle, setNewTitle] = useState("");

  useEffect(() => {
    if (open) {
      setGroups(readCartGroups());
      setShowNewInput(false);
      setNewTitle("");
    }
  }, [open]);

  const handleCreateAndSelect = async () => {
    if (!newTitle.trim()) return;
    const group = await createCartGroup(newTitle.trim());
    onSelect(group.id);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>어느 리스트에 저장할까요?</DialogTitle>
        </DialogHeader>

        <div className="space-y-1">
          {groups.map((group) => (
            <button
              key={group.id}
              type="button"
              onClick={() => {
                onSelect(group.id);
                onClose();
              }}
              className="flex w-full items-center justify-between rounded-sm px-3 py-3 text-left text-sm hover:bg-muted"
            >
              <span>{group.title}</span>
              <span className="text-xs text-muted-foreground">{group.products.length}개</span>
            </button>
          ))}
        </div>

        {showNewInput ? (
          <div className="flex gap-2 pt-2">
            <Input
              placeholder="새 리스트 이름"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              autoFocus
            />
            <Button onClick={handleCreateAndSelect}>추가</Button>
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
