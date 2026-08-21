// app/(main)/saved/page.tsx
// ✅ 리스트를 누르면 상세 화면(/saved/[groupId])으로 이동합니다.
// ✅ "새 리스트 만들기"를 목록 위(상단)로 옮겼습니다.
// ✅ 리스트 박스를 가로로 긴 줄 형태 대신 3:2 비율 카드로, 화면이 커질수록 2열→3열로 늘어납니다.
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MessageSquare, ChevronRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch, getAccessToken } from "@/lib/api-client";
import { getOrCreateSessionId, startNewSession } from "@/lib/session";
import { getClientId } from "@/lib/client-id";
import { readCartGroups, createCartGroup, type CartGroup } from "@/lib/cart-storage";

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
  const [showNewGroupInput, setShowNewGroupInput] = useState(false);
  const [newGroupTitle, setNewGroupTitle] = useState("");

  useEffect(() => {
    setGroups(readCartGroups());
  }, []);

  const groupTotal = (group: CartGroup) =>
    group.products.reduce((sum, p) => sum + p.price * p.quantity, 0);

  const handleCreateGroup = () => {
    if (!newGroupTitle.trim()) return;
    const group = createCartGroup(newGroupTitle.trim());
    setNewGroupTitle("");
    setShowNewGroupInput(false);
    router.push(`/saved/${group.id}`);
  };

  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);

  const loadSessions = async () => {
    setLoadingSessions(true);
    try {
      setSessions(await apiFetch<ChatSession[]>("/api/chat/sessions", { headers: chatHeaders() }));
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
    <div className="mx-auto max-w-lg p-4 pb-24 sm:max-w-xl md:max-w-4xl md:p-8">
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
        <div className="space-y-4">
          {showNewGroupInput ? (
            <div className="flex gap-2">
              <Input
                placeholder="리스트 이름 (예: 이번 주 장보기)"
                value={newGroupTitle}
                onChange={(e) => setNewGroupTitle(e.target.value)}
                autoFocus
              />
              <Button onClick={handleCreateGroup}>추가</Button>
              <Button variant="outline" onClick={() => setShowNewGroupInput(false)}>취소</Button>
            </div>
          ) : (
            <Button
              variant="outline"
              className="flex w-full items-center gap-1.5"
              onClick={() => setShowNewGroupInput(true)}
            >
              <Plus size={16} />
              새 리스트 만들기
            </Button>
          )}

          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {groups.map((group) => (
              <Link
                key={group.id}
                href={`/saved/${group.id}`}
                className="flex aspect-[3/2] flex-col justify-between rounded-lg border border-border p-4 hover:bg-muted"
              >
                <p className="text-sm font-medium">{group.title}</p>
                <div>
                  <p className="text-xs text-muted-foreground">{group.products.length}개</p>
                  <p className="text-sm font-semibold">{groupTotal(group).toLocaleString()}원</p>
                </div>
              </Link>
            ))}
          </div>
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
    </div>
  );
}
