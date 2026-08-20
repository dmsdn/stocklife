"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, Map as MapIcon, Trash2, MessageSquare, PlayCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StoreMapDialog } from "@/components/domain/store-map-dialog";
import { QuantityStepper } from "@/components/domain/quantity-stepper";
import { apiFetch, getAccessToken } from "@/lib/api-client";
import { getOrCreateSessionId, startNewSession } from "@/lib/session";
import { getClientId } from "@/lib/client-id";
import { readCartGroups, updateCartGroups, createCartGroup, type CartGroup } from "@/lib/cart-storage";

interface ChatSession {
  sessionId: string;
  title: string | null;
  updatedAt: string;
}

function chatHeaders(): Record<string, string> {
  return getAccessToken() ? {} : { "X-Chat-Client-Id": getClientId() };
}

export default function SavedPage() {
  const router = useRouter();
  const [tab, setTab] = useState<"cart" | "ai">("cart");

  const [groups, setGroups] = useState<CartGroup[]>([]);
  const [openGroupId, setOpenGroupId] = useState<number | null>(null);
  const [newGroupTitle, setNewGroupTitle] = useState("");
  const [showNewGroupInput, setShowNewGroupInput] = useState(false);

  const [routeGroupId, setRouteGroupId] = useState<number | null>(null);

  useEffect(() => {
    setGroups(readCartGroups());
  }, []);

  const groupTotal = (group: CartGroup) =>
    group.products.filter((p) => p.checked).reduce((sum, p) => sum + p.price * p.quantity, 0);

  const handleCreateGroup = () => {
    if (!newGroupTitle.trim()) return;
    const group = createCartGroup(newGroupTitle.trim());
    setGroups(readCartGroups());
    setNewGroupTitle("");
    setShowNewGroupInput(false);
    setOpenGroupId(group.id);
  };

  const handleQuantityChange = (groupId: number, productId: number, quantity: number) => {
    if (quantity < 1) return;
    const next = updateCartGroups((gs) =>
      gs.map((g) =>
        g.id !== groupId
          ? g
          : { ...g, products: g.products.map((p) => (p.id === productId ? { ...p, quantity } : p)) }
      )
    );
    setGroups(next);
  };

  const handleToggleChecked = (groupId: number, productId: number) => {
    const next = updateCartGroups((gs) =>
      gs.map((g) =>
        g.id !== groupId
          ? g
          : { ...g, products: g.products.map((p) => (p.id === productId ? { ...p, checked: !p.checked } : p)) }
      )
    );
    setGroups(next);
  };

  const handleRemove = (groupId: number, productId: number) => {
    const next = updateCartGroups((gs) =>
      gs.map((g) => (g.id !== groupId ? g : { ...g, products: g.products.filter((p) => p.id !== productId) }))
    );
    setGroups(next);
  };

  const handleStartShopping = (groupId: number) => {
    router.push(`/scan?group=${groupId}`);
  };

  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);

  const loadSessions = async () => {
    setLoadingSessions(true);
    try {
      const list = await apiFetch<ChatSession[]>("/api/chat/sessions", { headers: chatHeaders() });
      setSessions(list);
    } catch {
      setSessions([]);
    } finally {
      setLoadingSessions(false);
    }
  };

  useEffect(() => {
    if (tab === "ai") loadSessions();
  }, [tab]);

  const handleNewChat = async () => {
    await startNewSession();
    router.push("/ai");
  };

  return (
    <div className="mx-auto max-w-md p-4 pb-24 md:max-w-3xl md:p-8">
      <p className="mb-4 text-base">저장</p>

      <div className="mb-4 flex gap-2 border-b border-border">
        <button
          type="button"
          onClick={() => setTab("cart")}
          className={`border-b-2 px-3 py-2 text-sm ${tab === "cart" ? "border-foreground font-medium" : "border-transparent text-muted-foreground"}`}
        >
          담은 리스트
        </button>
        <button
          type="button"
          onClick={() => setTab("ai")}
          className={`border-b-2 px-3 py-2 text-sm ${tab === "ai" ? "border-foreground font-medium" : "border-transparent text-muted-foreground"}`}
        >
          AI 대화
        </button>
      </div>

      {tab === "cart" && (
        <div className="space-y-3">
          {groups.map((group) => {
            const isOpen = openGroupId === group.id;
            return (
              <div key={group.id} className="rounded-lg border border-border">
                <button
                  type="button"
                  onClick={() => setOpenGroupId(isOpen ? null : group.id)}
                  className="flex w-full items-center justify-between p-4 text-left"
                >
                  <div>
                    <p className="text-sm font-medium">{group.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {group.products.length}개 · {groupTotal(group).toLocaleString()}원 · {group.createdAt}
                    </p>
                  </div>
                  <ChevronRight size={16} className={`text-muted-foreground transition-transform ${isOpen ? "rotate-90" : ""}`} />
                </button>

                {isOpen && (
                  <div className="border-t border-border p-4 pt-2">
                    {group.products.length === 0 && (
                      <p className="py-4 text-center text-xs text-muted-foreground">
                        아직 담긴 상품이 없어요. 검색이나 "장보기 시작"에서 스캔하면 여기로 옵니다.
                      </p>
                    )}
                    <div className="divide-y divide-border">
                      {group.products.map((product) => (
                        <div key={product.id} className="flex items-center gap-3 py-3">
                          <input
                            type="checkbox"
                            checked={product.checked}
                            onChange={() => handleToggleChecked(group.id, product.id)}
                            className="h-4 w-4 rounded border-border"
                          />
                          <div className="h-14 w-14 shrink-0 rounded-md border border-border bg-muted" />
                          <div className="flex-1">
                            <p className="text-sm">{product.name}</p>
                            <p className="text-xs text-muted-foreground">{product.price.toLocaleString()}원</p>
                            <div className="mt-1">
                              <QuantityStepper
                                quantity={product.quantity}
                                onChange={(q) => handleQuantityChange(group.id, product.id, q)}
                                size="sm"
                              />
                            </div>
                          </div>
                          <button
                            type="button"
                            aria-label="삭제"
                            onClick={() => handleRemove(group.id, product.id)}
                            className="text-muted-foreground"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      ))}
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <Button
                        variant="outline"
                        className="flex items-center gap-1.5"
                        onClick={() => setRouteGroupId(group.id)}
                      >
                        <MapIcon size={16} />
                        동선 보기
                      </Button>
                      <Button
                        className="flex items-center gap-1.5"
                        onClick={() => handleStartShopping(group.id)}
                      >
                        <PlayCircle size={16} />
                        장보기 시작
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {showNewGroupInput ? (
            <div className="flex gap-2">
              <Input
                placeholder="리스트 이름 (예: 이번 주 장보기)"
                value={newGroupTitle}
                onChange={(e) => setNewGroupTitle(e.target.value)}
              />
              <Button onClick={handleCreateGroup}>추가</Button>
            </div>
          ) : (
            <Button variant="outline" className="w-full" onClick={() => setShowNewGroupInput(true)}>
              + 새 리스트 만들기
            </Button>
          )}
        </div>
      )}

      {tab === "ai" && (
        <div className="space-y-2">
          <Button variant="outline" className="w-full" onClick={handleNewChat}>
            + 새 대화 시작
          </Button>

          {loadingSessions && <p className="py-8 text-center text-sm text-muted-foreground">불러오는 중...</p>}
          {!loadingSessions && sessions.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">대화 이력이 없어요.</p>
          )}

          <div className="divide-y divide-border">
            {sessions.map((s) => (
              <Link key={s.sessionId} href={`/ai?session=${s.sessionId}`} className="flex items-center gap-3 py-3">
                <MessageSquare size={18} className="shrink-0 text-muted-foreground" />
                <div className="flex-1">
                  <p className="text-sm">{s.title ?? "새 대화"}</p>
                  <p className="text-xs text-muted-foreground">{new Date(s.updatedAt).toLocaleString("ko-KR")}</p>
                </div>
                <ChevronRight size={16} className="text-muted-foreground" />
              </Link>
            ))}
          </div>
        </div>
      )}

      {routeGroupId !== null && (
        <StoreMapDialog
          open={routeGroupId !== null}
          onClose={() => setRouteGroupId(null)}
          groupId={routeGroupId}
          collectedIds={new Set()}
        />
      )}
    </div>
  );
}
