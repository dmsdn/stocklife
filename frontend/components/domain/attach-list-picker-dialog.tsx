// components/domain/attach-list-picker-dialog.tsx
// AI 채팅 "+"에서 "저장된 리스트 불러오기" 선택 시 뜨는 목록.
// ✅ 리스트 안의 실제 상품(lib/cart-storage.ts)을 펼쳐서 보여주고, 기존 체크박스 컴포넌트로
//   담을 상품을 고르면 담긴 개수·체크 여부에 따라 예상 금액이 바로 계산됩니다.
"use client";

import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { readCartGroups, updateCartGroups, type CartGroup } from "@/lib/cart-storage";

interface AttachListPickerDialogProps {
  open: boolean;
  onClose: () => void;
  onSelect: (groupId: number, title: string) => void;
}

function groupTotal(group: CartGroup) {
  return group.products
    .filter((p) => p.checked)
    .reduce((sum, p) => sum + p.price * p.quantity, 0);
}

export function AttachListPickerDialog({ open, onClose, onSelect }: AttachListPickerDialogProps) {
  const [groups, setGroups] = useState<CartGroup[]>([]);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  useEffect(() => {
    if (open) {
      setGroups(readCartGroups());
      setExpandedId(null);
    }
  }, [open]);

  const toggleProductChecked = (groupId: number, productId: number) => {
    const next = updateCartGroups((gs) =>
      gs.map((g) =>
        g.id !== groupId
          ? g
          : {
              ...g,
              products: g.products.map((p) =>
                p.id === productId ? { ...p, checked: !p.checked } : p
              ),
            }
      )
    );
    setGroups(next);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>불러올 리스트를 선택하세요</DialogTitle>
        </DialogHeader>

        <div className="space-y-2">
          {groups.map((group) => {
            const expanded = expandedId === group.id;
            const checkedCount = group.products.filter((p) => p.checked).length;

            return (
              <div key={group.id} className="rounded-sm border border-border">
                <button
                  type="button"
                  onClick={() => setExpandedId(expanded ? null : group.id)}
                  className="flex w-full items-center justify-between px-3 py-3 text-left text-sm"
                >
                  <div>
                    <p className="font-medium">{group.title}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {group.products.length}개 · 선택 {checkedCount}개 · {groupTotal(group).toLocaleString()}원
                    </p>
                  </div>
                  <ChevronDown
                    size={24}
                    className={`shrink-0 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`}
                  />
                </button>

                {expanded && (
                  <div className="space-y-2 border-t border-border px-3 py-2">
                    {group.products.map((p) => (
                      <label
                        key={p.id}
                        className="flex items-center gap-2.5 rounded-sm py-1.5 text-sm"
                      >
                        <Checkbox
                          checked={p.checked}
                          onChange={() => toggleProductChecked(group.id, p.id)}
                        />
                        <span className="min-w-0 flex-1 truncate">{p.name}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {p.price.toLocaleString()}원 × {p.quantity}
                        </span>
                      </label>
                    ))}
                    {group.products.length === 0 && (
                      <p className="py-2 text-center text-xs text-muted-foreground">담긴 상품이 없어요.</p>
                    )}

                    <Button
                      className="mt-1 w-full"
                      size="sm"
                      onClick={() => {
                        onSelect(group.id, group.title);
                        onClose();
                      }}
                    >
                      이 리스트 첨부 · {groupTotal(group).toLocaleString()}원
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
          {groups.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">저장된 리스트가 없어요.</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
