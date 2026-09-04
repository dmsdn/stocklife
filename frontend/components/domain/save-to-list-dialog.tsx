// components/domain/save-to-list-dialog.tsx
// ✅ 예전엔 리스트 하나 누르면 바로 닫히는 단일 선택이었는데, 체크박스로 여러 리스트에
//   동시에 담을 수 있게 바꿨습니다("확인" 눌러야 닫힘). 그래서 하트가 "이 리스트에 담겼다"는
//   단일 상태를 표현할 수가 없어져서, 호출부(검색/상세 화면)의 하트 채우기는 빼는 게 맞습니다.
// ✅ readCartGroups()(캐시, 비어있을 수 있음) 대신 loadCartGroups()(실제 서버 조회)로 교체.
// ✅ 수정(요청) — "새 리스트 만들기"는 그대로 모달 안에 두고, 최종 "담기" 확인 버튼만
//   모달 밖 화면 하단(h-60, 텍스트 폭 맞춤)으로 뺐습니다.
"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { StickyBottomBar } from "@/components/domain/sticky-bottom-bar";
import { loadCartGroups, createCartGroup, type CartGroup } from "@/lib/cart-storage";

interface SaveToListDialogProps {
  open: boolean;
  onClose: () => void;
  /** 체크된 리스트 id 전체를 한 번에 넘겨줍니다(여러 개 가능). */
  onSelect: (groupIds: number[]) => void;
}

export function SaveToListDialog({ open, onClose, onSelect }: SaveToListDialogProps) {
  const [groups, setGroups] = useState<CartGroup[]>([]);
  const [checkedIds, setCheckedIds] = useState<Set<number>>(new Set());
  const [showNewInput, setShowNewInput] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setCheckedIds(new Set());
      setShowNewInput(false);
      setNewTitle("");
      setLoading(true);
      loadCartGroups()
        .then(setGroups)
        .finally(() => setLoading(false));
    }
  }, [open]);

  const toggle = (groupId: number) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  const handleCreate = async () => {
    if (!newTitle.trim()) return;
    const group = await createCartGroup(newTitle.trim());
    setGroups((prev) => [...prev, group]);
    setCheckedIds((prev) => new Set(prev).add(group.id));
    setShowNewInput(false);
    setNewTitle("");
  };

  const handleConfirm = () => {
    if (checkedIds.size === 0) return;
    onSelect([...checkedIds]);
    onClose();
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>어느 리스트에 저장할까요?</DialogTitle>
          </DialogHeader>

          {loading && <p className="py-4 text-center text-sm text-muted-foreground">불러오는 중...</p>}

          <div className="space-y-1">
            {groups.map((group) => (
              <button
                key={group.id}
                type="button"
                onClick={() => toggle(group.id)}
                className="flex w-full items-center justify-between rounded-sm px-3 py-3 text-left text-sm hover:bg-muted"
              >
                <span className="flex items-center gap-2">
                  <Checkbox checked={checkedIds.has(group.id)} onChange={() => toggle(group.id)} />
                  {group.title}
                </span>
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
              <Button onClick={handleCreate}>추가</Button>
            </div>
          ) : (
            <Button variant="outline" className="w-full" onClick={() => setShowNewInput(true)}>
              + 새 리스트 만들기
            </Button>
          )}
        </DialogContent>
      </Dialog>

      {open && (
        <StickyBottomBar elevated>
          <Button
            className="flex mx-auto h-[60px] w-fit px-5 rounded-full shadow-[0_-2px_20px_rgba(0,0,0,0.1)]"
            disabled={checkedIds.size === 0}
            onClick={handleConfirm}
          >
            {checkedIds.size > 0 ? `${checkedIds.size}개 리스트에 담기` : "리스트를 선택해주세요"}
          </Button>
        </StickyBottomBar>
      )}
    </>
  );
}
