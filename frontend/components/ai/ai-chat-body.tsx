// components/ai/ai-chat-body.tsx
// ✅ 마이크 버튼 — 실제 navigator.mediaDevices.getUserMedia로 브라우저 권한 요청, 허용하면
//   MediaRecorder로 실제 녹음 시작(빨간 점+타이머), 다시 누르면 종료.
// ✅ 09-03: 별도 STT 서버 없이 브라우저 내장 Web Speech API(SpeechRecognition)로 녹음과
//   동시에 실시간 음성 인식을 돌려서, 인식된 텍스트를 입력창(message)에 그대로 채워준다.
//   지원 안 하는 브라우저(예: 구형 Firefox)에서는 recognitionRef가 null로 남고, 기존처럼
//   "음성 메모" 오디오 첨부만 되는 방식으로 자연스럽게 폴백된다.

"use client";
import { readCartGroups } from "@/lib/cart-storage";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { chatDetailHref } from "@/lib/chat-detail-links";
import { RiCloseLine, RiAddLine, RiMicLine, RiSendPlaneLine, RiCameraLine, RiImageLine, RiFileTextLine, RiBillLine, RiListCheck, RiCheckboxBlankLine, RiErrorWarningLine, RiCornerDownLeftLine, RiCornerDownRightLine } from "@remixicon/react";

// ✅ 실제 POST /api/ai/photo-search 연동 — 카메라/이미지 첨부 시 사진을 그대로 서버로 보내서
//   비슷한 상품을 찾아옵니다.
interface PhotoSearchResult {
  tier?: "confident" | "category" | "unsure";
  categoryL2?: string;
  productName?: string;
  message?: string;
  error?: string;
  results?: { skuId: number; productName: string }[];
}

// 09-04: 폰 사진은 3~8MB 다. 백엔드 multipart 기본 상한이 1MB 라 그대로 보내면 413 이고,
//   더 나쁜 것은 **그 413 이 브라우저에 안 보인다**는 점이다 — 스프링이 CORS 필터보다
//   먼저 끊어서 응답에 CORS 헤더가 없고, 브라우저는 상태 코드 없이 net::ERR_FAILED 만 준다.
//   ⇒ 보내기 전에 우리가 줄인다. 손해가 없다: 서버 인코더(SigLIP2)가 어차피 384px 로
//     잘라 쓰므로 1280px 이상은 전송량만 늘리고 정확도에 기여하지 않는다.
//     실측 3000×4000 2.67MB → 960×1280 118KB (22.6배).
const PHOTO_MAX_BYTES = 900_000;
const PHOTO_MAX_EDGE = 1280;
/** 사진 검색에 보낼 작은 파일을 만든다.
 * 원본 폰 사진은 multipart 한도를 넘기므로 긴 변과 JPEG 품질을 단계적으로 줄인다.
 * 축소 실패 때 큰 원본을 조용히 보내지 않고 원인을 전달한다. 원본 파일은 수정하지 않는다. */
async function shrinkIfNeeded(file: File): Promise<File> {
  if (file.size <= PHOTO_MAX_BYTES) return file;
  let bmp: ImageBitmap;
  try { bmp = await createImageBitmap(file); }
  catch { throw new Error("이 사진 형식을 읽을 수 없어요. JPG·PNG 사진으로 다시 선택해 주세요."); }
  try {
    for (const edge of [PHOTO_MAX_EDGE, 960, 640]) {
      const scale = Math.min(1, edge / Math.max(bmp.width, bmp.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bmp.width * scale));
      canvas.height = Math.max(1, Math.round(bmp.height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("사진을 준비하지 못했어요. 다른 사진으로 다시 선택해 주세요.");
      ctx.fillStyle = "white"; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.85, 0.65]) {
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
        if (blob && blob.size <= PHOTO_MAX_BYTES)
          return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
      }
    }
    throw new Error("사진 용량을 줄이지 못했어요. 더 작은 사진을 선택해 주세요.");
  } finally { bmp.close(); }
}

async function sendPhotoSearch(file: File): Promise<PhotoSearchResult | null> {
  const form = new FormData();
  form.append("photo", file);
  // apiFetch 가 API_BASE_URL 을 붙이고 토큰도 싣는다. FormData 면 Content-Type 을
  // 스스로 비운다(boundary 는 브라우저 몫 — api-client.ts 주석).
  return await apiFetch<PhotoSearchResult>("/api/ai/photo-search", {
    method: "POST",
    body: form,
  });
}
import { apiFetch, getAccessToken, resolveImageUrl } from "@/lib/api-client";
import {
  setActiveSessionId,
  withValidSession,
  getSessionMetadata,
} from "@/lib/session";
import { getClientId } from "@/lib/client-id";
import { saveProactiveNotification } from "@/lib/proactive-notifications";
import { PROACTIVE_EVENT } from "@/lib/realtime";
import { AttachListPickerDialog } from "@/components/domain/attach-list-picker-dialog";
import { SaveToListDialog } from "@/components/domain/save-to-list-dialog";
import { addProductToCartGroup, loadCartGroups } from "@/lib/cart-storage";
import { usePermissionStatus } from "@/lib/use-permission-status";
import { PermissionRequestDialog } from "@/components/domain/permission-request-dialog";
import { useAiPanel } from "@/components/layout/ai-panel-context";

// ✅ 실제 POST /api/chat/sessions/{sessionId}/attachments 연동(멀티파트 업로드).
//   카메라/갤러리는 백엔드 입장에서 구분 없이 둘 다 type=IMAGE로 보냅니다.
function chatAttachmentHeaders(): Record<string, string> {
  return getAccessToken() ? {} : { "X-Chat-Client-Id": getClientId() };
}

async function uploadChatAttachment(
  kind: "camera" | "image" | "document" | "receipt",
  file: File,
  boundSessionId: string | null
): Promise<number | null> {
  try {
    // ✅ 버그 수정(요청) — 화면이 아직 자기 세션을 확정 못 했으면(고정 전) 업로드 자체를
    //   막음 — 확정 전에 업로드하면 그 사이 다른 세션으로 화면이 바뀌었을 때 엉뚱한
    //   세션에 파일이 붙을 수 있음.
    if (!boundSessionId) return null;
    const type = kind === "document" ? "DOCUMENT" : kind === "receipt" ? "RECEIPT" : "IMAGE";
    const form = new FormData();
    form.append("file", file);

    const res = await withValidSession(
      undefined,
      (sessionId) =>
        apiFetch<{ attachmentId: number }>(
          `/api/chat/sessions/${sessionId}/attachments?type=${type}`,
          { method: "POST", body: form, headers: chatAttachmentHeaders() }
        ),
      boundSessionId
    );
    return res.attachmentId;
  } catch {
    return null;
  }
}

// ✅ 신규(요청) — 리브 응답에 딸려오는 actions(POST /api/chat)에서 상품 카드로
//   보여줄 skuId를 뽑아냅니다. 백엔드 ChatResponse.actions가 정해진 스키마 없는
//   Map<String,Object>라서(백엔드 주석 참고), 흔히 쓰일 법한 키 이름들을 훑어서
//   방어적으로 찾습니다 — 못 찾으면 그냥 빈 배열(상품 카드 없이 텍스트만).
const SKU_KEY_CANDIDATES = ["skuId", "sku_id", "productId", "product_id"];
function extractSkuIds(actions: Record<string, unknown>[] | undefined): number[] {
  if (!actions) return [];
  const ids = new Set<number>();
  for (const action of actions) {
    for (const key of SKU_KEY_CANDIDATES) {
      const value = action[key];
      if (typeof value === "number") ids.add(value);
      else if (Array.isArray(value)) value.forEach((v) => typeof v === "number" && ids.add(v));
    }
  }
  return Array.from(ids);
}

// ✅ 신규(요청 4번) — 리브가 "리스트"(장바구니 그룹)를 언급했을 때도 카드로 보여주기 위해
//   actions에서 그룹 id를 뽑음. skuId와 마찬가지로 실제 키 이름이 확정 안 돼있어서
//   흔히 쓰일 법한 이름들을 방어적으로 훑음.
const GROUP_KEY_CANDIDATES = ["groupId", "group_id", "cartGroupId", "cart_group_id", "listId", "list_id"];
function extractGroupIds(actions: Record<string, unknown>[] | undefined): number[] {
  if (!actions) return [];
  const ids = new Set<number>();
  for (const action of actions) {
    for (const key of GROUP_KEY_CANDIDATES) {
      const value = action[key];
      if (typeof value === "number") ids.add(value);
    }
  }
  return Array.from(ids);
}

// ✅ 신규(요청) — 리브 답변에 마크다운 지원. package.json을 확인할 수 없어서(업로드된
//   zip에 소스만 있고 package.json/node_modules가 없음) react-markdown 같은 외부
//   패키지가 실제로 설치돼 있는지 알 수 없었습니다 — 새 의존성을 추가했다가 설치가 안
//   돼있으면 빌드가 깨지니, 외부 패키지 없이 순수 React로 흔히 쓰이는 문법만(굵게,
//   글머리 기호/번호 목록, 문단)을 가볍게 지원합니다. 기존 말풍선(<p> 하나짜리) 모양은
//   그대로 두고, 안쪽 내용만 이걸로 바꿔서 말풍선 모양 자체는 안 바뀝니다.
// ✅ 수정(요청 — "채팅 리스트·상세 링크·리브 추천") — 굵게/목록에 이어서, 리브가 조회한
//   리스트·구매내역을 가리키는 Markdown 링크([주말 장보기](/saved/11))도 지원. 아무
//   경로나 링크로 만들면 위험해서(외부 URL, javascript: 등) chat-detail-links.ts의
//   허용 목록을 거친 경로만 실제 Link로 만들고, 나머지는 그냥 텍스트로 둡니다.
function renderInlineMarkdown(text: string, keyPrefix: string, onNavigate: () => void): React.ReactNode[] {
  const parts = text.split(/(\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link) {
      const href = chatDetailHref(link[2]);
      return href ? (
        <Link key={`${keyPrefix}-${i}`} href={href} onClick={onNavigate} className="font-medium underline underline-offset-2">
          {link[1]}
        </Link>
      ) : (
        <span key={`${keyPrefix}-${i}`}>{link[1]}</span>
      );
    }
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return <strong key={`${keyPrefix}-${i}`}>{part.slice(2, -2)}</strong>;
    }
    return <span key={`${keyPrefix}-${i}`}>{part}</span>;
  });
}

function MarkdownText({ text }: { text: string }) {
  // ✅ 링크를 누르면 상세 화면을 바로 보여줄 수 있게 AI 패널을 닫음.
  const { close } = useAiPanel();
  const blocks = text.split(/\n{2,}/);
  return (
    <>
      {blocks.map((block, bi) => {
        const lines = block.split("\n").filter((l) => l.trim() !== "");
        const isBulletList = lines.length > 0 && lines.every((l) => /^[-•]\s/.test(l.trim()));
        const isNumberedList = lines.length > 0 && lines.every((l) => /^\d+\.\s/.test(l.trim()));

        if (isBulletList) {
          return (
            <ul key={bi} className="list-disc space-y-0.5 pl-4">
              {lines.map((l, li) => (
                <li key={li}>{renderInlineMarkdown(l.trim().replace(/^[-•]\s/, ""), `${bi}-${li}`, close)}</li>
              ))}
            </ul>
          );
        }
        if (isNumberedList) {
          return (
            <ol key={bi} className="list-decimal space-y-0.5 pl-4">
              {lines.map((l, li) => (
                <li key={li}>{renderInlineMarkdown(l.trim().replace(/^\d+\.\s/, ""), `${bi}-${li}`, close)}</li>
              ))}
            </ol>
          );
        }
        return (
          <p key={bi} className={bi > 0 ? "mt-2" : undefined}>
            {lines.map((l, li) => (
              <span key={li}>
                {li > 0 && <br />}
                {renderInlineMarkdown(l, `${bi}-${li}`, close)}
              </span>
            ))}
          </p>
        );
      })}
    </>
  );
}

interface MentionedProduct {
  skuId: number;
  name: string;
  priceKrw: number;
  imageUrl: string | null;
  categoryL1?: string | null;
}

// ✅ 신규(요청) — 리브가 언급한 상품을 목록으로 보여주는 미니 카드. skuId 배열을 받아서
//   배치 조회(/api/products/by-skus) 한 번으로 채웁니다.
// ✅ 수정(요청 4번) — 카드를 보기만 하고 끝나지 않고, 카드에서 바로 "담기"까지 할 수
//   있어야 함. 이 대화가 특정 리스트에 연결돼 있으면(groupId) 그 리스트에 바로 담고,
//   아니면 기존에 쓰던 SaveToListDialog(리스트 선택 모달)를 띄웁니다.
function MentionedProducts({ skuIds, groupId }: { skuIds: number[]; groupId?: number | null }) {
  const [products, setProducts] = useState<MentionedProduct[]>([]);
  const [addedIds, setAddedIds] = useState<Set<number>>(new Set());
  const [saveTarget, setSaveTarget] = useState<MentionedProduct | null>(null);

  useEffect(() => {
    if (skuIds.length === 0) return;
    apiFetch<{ skuId: number; name: string; priceKrw: number; imageUrl: string | null; categoryL1?: string | null }[]>(
      `/api/products/by-skus?skuIds=${skuIds.join(",")}`,
      { auth: false }
    )
      .then((list) =>
        setProducts(list.map((p) => ({ ...p, imageUrl: resolveImageUrl(p.imageUrl) ?? null })))
      )
      .catch(() => setProducts([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skuIds.join(",")]);

  if (products.length === 0) return null;

  const addToGroup = async (p: MentionedProduct, targetGroupId: number) => {
    await addProductToCartGroup(targetGroupId, {
      id: p.skuId,
      name: p.name,
      price: p.priceKrw,
      category: p.categoryL1 ?? undefined,
      image: p.imageUrl ?? undefined,
    });
    setAddedIds((prev) => new Set(prev).add(p.skuId));
  };

  const handleAddClick = (p: MentionedProduct) => {
    if (groupId) {
      void addToGroup(p, groupId);
    } else {
      setSaveTarget(p);
    }
  };

  return (
    <>
      <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
        {products.map((p) => {
          const added = addedIds.has(p.skuId);
          return (
            <div key={p.skuId} className="flex w-32 shrink-0 flex-col rounded-md border border-[#F4F4F4] p-2">
              <a href={`/product/${p.skuId}`} className="block">
                <div className="aspect-square w-full overflow-hidden rounded-sm bg-muted">
                  {p.imageUrl && <img src={p.imageUrl} alt="" className="h-full w-full object-cover" />}
                </div>
                <p className="mt-1.5 truncate text-xs">{p.name}</p>
                <p className="text-xs font-semibold">{p.priceKrw.toLocaleString()}원</p>
              </a>
              {/* ✅ 신규(요청 4번) — 카드에서 바로 담기 */}
              <button
                type="button"
                onClick={() => handleAddClick(p)}
                disabled={added}
                className={`mt-1.5 flex h-7 items-center justify-center gap-1 rounded-full text-[11px] font-medium ${
                  added ? "bg-muted text-muted-foreground" : "bg-brand text-white"
                }`}
              >
                {added ? (
                  "담았어요"
                ) : (
                  <>
                    <RiAddLine size={12} />
                    담기
                  </>
                )}
              </button>
            </div>
          );
        })}
      </div>

      <SaveToListDialog
        open={!!saveTarget}
        onClose={() => setSaveTarget(null)}
        onSelect={(groupIds) => {
          if (saveTarget) {
            const target = saveTarget;
            Promise.all(groupIds.map((gid) => addToGroup(target, gid))).catch(() => {});
          }
          setSaveTarget(null);
        }}
      />
    </>
  );
}

interface MentionedList {
  id: number;
  title: string;
  count: number;
}

// ✅ 신규(요청 4번) — 리브가 리스트(장바구니 그룹)를 언급했을 때도 카드로. 이미 갖고
//   있는 lib/cart-storage.ts의 목록 조회(loadCartGroups)에서 해당 id만 골라서 보여줌 —
//   별도 API 호출 없음.
function MentionedLists({ groupIds }: { groupIds: number[] }) {
  const [lists, setLists] = useState<MentionedList[]>([]);

  useEffect(() => {
    if (groupIds.length === 0) return;
    loadCartGroups()
      .then((groups) =>
        setLists(
          groups
            .filter((g) => groupIds.includes(g.id))
            .map((g) => ({ id: g.id, title: g.title, count: g.products.length }))
        )
      )
      .catch(() => setLists([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupIds.join(",")]);

  if (lists.length === 0) return null;

  return (
    <div className="mt-2 flex flex-col gap-1.5">
      {lists.map((l) => (
        <a
          key={l.id}
          href={`/saved/${l.id}`}
          className="flex items-center justify-between gap-2 rounded-md border border-[#F4F4F4] px-3 py-2"
        >
          <span className="min-w-0 truncate text-xs font-medium">{l.title}</span>
          <span className="shrink-0 text-[11px] text-muted-foreground">{l.count}개</span>
        </a>
      ))}
    </div>
  );
}

// ✅ 신규(요청) — 대화 하나하나 누르면/호버하면 뜨는 보낸 시각. 오늘이면 시:분만,
//   아니면 날짜도 같이.
function formatMessageTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  const time = date.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
  if (isToday) return time;
  return `${date.toLocaleDateString("ko-KR", { month: "long", day: "numeric" })} ${time}`;
}

interface ChatTurn {
  role: "user" | "assistant";
  content: string;
  /** ✅ 대화 검색(기록 > 리브)에서 특정 메시지로 스크롤 이동하기 위한 식별자.
   *  백엔드가 안 주는 옛 메시지/스트리밍 중인 임시 turn은 없을 수 있음. */
  messageId?: number;
  /** ✅ 신규 — 이 유저 메시지에 대한 응답을 못 받아왔을 때(네트워크/백엔드 에러) true.
   *  "다시 보내기" 버튼을 보여주는 용도 — 답변 실패는 별도 assistant 말풍선 대신
   *  이 플래그로 표시해서, 나중에 같은 메시지를 재전송할 수 있게 함. */
  failed?: boolean;
  /** ✅ 신규(요청) — 보낸/받은 시각. 눌렀을 때(또는 호버) 표시용. 백엔드가 이미
   *  ChatMessageResponse.createdAt으로 내려주는데 그동안 안 쓰고 버려지고 있었음. */
  createdAt?: string;
  /** ✅ 신규(요청) — 이 응답에서 언급된 상품(skuId) 목록. POST /api/chat의 actions가
   *  실제로 어떤 모양인지 계약이 확정 안 돼있어서(백엔드 주석 참고), 흔한 키 이름들
   *  (skuId/sku_id/productId 등)을 방어적으로 훑어서 뽑아냄 — 없으면 그냥 빈 배열. */
  mentionedSkuIds?: number[];
  /** ✅ 신규(요청 4번) — 이 응답에서 언급된 리스트(장바구니 그룹) id 목록. */
  mentionedGroupIds?: number[];
  /** ✅ 신규(09-03 요청 ③) — 에이전트가 먼저 건넨 말(sender=AI_PROACTIVE). 같은 회색
   *  말풍선이면 "묻지 않았는데 먼저 말을 걸었다"가 안 보여서, 표식을 달아 구분함(호박색
   *  카드 + "먼저 알려드려요" 라벨) — 이력을 불러올 때도, 지금 막 도착했을 때도 둘 다. */
  proactive?: boolean;
}

interface Attachment {
  /** 배열 위치는 삭제하면 바뀐다. 업로드 완료는 이 파일 고유 ID로 찾아 반영한다. */
  localId?: string;
  label: string;
  kind:
    | "camera"
    | "image"
    | "document"
    | "receipt"
    | "list"
    | "voice";
  /** ✅ 실제 업로드된 첨부파일 id — 메시지 전송 시 attachmentIds에 실어 보냄.
   *  camera/image/document/receipt만 실제 업로드 대상(list/voice는 백엔드에 해당 타입이 없음). */
  attachmentId?: number;
  uploading?: boolean;
  uploadFailed?: boolean;
}

export interface AiChatBodyProps {
  sessionIdOverride?: string;
  greeting?: string;
  suggestedPrompts?: string[];
  /** ✅ 열릴 때 입력창에 미리 채워둘 텍스트(전송은 안 함, 사용자가 수정/전송) */
  initialMessage?: string;
  /** ✅ 기록(리브) > 대화 검색에서 넘어온 경우, 이 메시지로 스크롤 이동 + 잠깐 하이라이트.
   *  이 컴포넌트는 사이드패널 등 Suspense 경계가 보장 안 되는 곳에서도 쓰이므로
   *  useSearchParams()를 여기서 직접 읽지 않고, 이미 Suspense 안에 있는 /ai 페이지가
   *  prop으로 내려줍니다. */
  highlightMessageId?: number;
  /** ✅ 신규 — 이 컴포넌트가 실제로 활성화한(또는 새로 만든) sessionId를 부모에게 알려줌.
   *  부모(AiMobileSheet/AiPanel)가 헤더에 대화 이름을 보여주거나 이름 수정 기능을
   *  붙이려면 실제 sessionId가 있어야 하는데, sessionIdOverride가 없는 "새 대화" 상태에서는
   *  이 컴포넌트가 세션을 만들기 전까지 부모가 sessionId를 알 방법이 없었음. */
  onSessionReady?: (sessionId: string) => void;
}

const DEFAULT_PROMPTS = [
  "이번주에 장보러 가야해",
  "집에 세제가 없어",
  "다이어트 식단 추천해줘",
];

function chatHeaders(): Record<string, string> {
  return getAccessToken()
    ? {}
    : { "X-Chat-Client-Id": getClientId() };
}

export function AiChatBody({
  sessionIdOverride,
  greeting = "안녕하세요, 무엇을 도와드릴까요?",
  suggestedPrompts = DEFAULT_PROMPTS,
  initialMessage,
  highlightMessageId: highlightMessageIdProp,
  onSessionReady,
}: AiChatBodyProps) {
  const { groupId } = useAiPanel();
  // ✅ 버그 수정(요청 — "다른 창에서 활성 채팅 ID가 바뀌면 메시지가 다른 채팅으로 감") —
  //   이 컴포넌트 인스턴스(=지금 열려있는 이 AI 패널/시트 하나)가 로드 시 확정한 세션
  //   id를 여기 "고정"해둡니다. 이후 메시지 전송·첨부 업로드는 항상 이 값을 쓰고,
  //   lib/session.ts의 전역 활성 세션(다른 탭/패널이 바꿀 수 있음)을 다시 안 읽습니다.
  const boundSession = useRef<string | null>(null);
  const [boundGroupId, setBoundGroupId] = useState<number | null>(null);
  // 화면이 바뀔 때마다(다른 세션으로 다시 로드) 늘어나는 값. 오래된 비동기 응답이
  // 그 사이 바뀐 화면에 반영되는 걸 막는 데 씀(revision이 다르면 무시).
  const viewRevision = useRef(0);
  const [highlightedMessageId, setHighlightedMessageId] = useState<number | null>(
    highlightMessageIdProp ?? null
  );
  const [message, setMessage] = useState(initialMessage ?? "");
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  // ✅ 신규(요청) — 대화 하나하나 누르면(모바일) / 마우스 올리면(데스크톱) 보낸 시각 표시.
  const [shownTimeIndex, setShownTimeIndex] = useState<number | null>(null);
  const [attachOpen, setAttachOpen] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [listPickerOpen, setListPickerOpen] = useState(false);

  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [micError, setMicError] = useState<string | null>(null);
  const micPermission = usePermissionStatus("microphone");
  const [showMicModal, setShowMicModal] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(
    null
  );
  // ✅ Web Speech API 인식기 — SpeechRecognition은 표준 타입 정의가 없어 any로 다룬다.
  const recognitionRef = useRef<any>(null);
  // ✅ 신규 — 녹음 중 실제 마이크 소리 크기(0~1)를 재서 파형 애니메이션에 씀.
  //   Web Audio API의 AnalyserNode로 실시간 볼륨을 읽어옴(별도 라이브러리 불필요).
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const levelAnimationRef = useRef<number | null>(null);
  const [audioLevels, setAudioLevels] = useState<number[]>([0.2, 0.2, 0.2, 0.2, 0.2]);

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);
  const receiptInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    // ✅ 화면이 다른 세션으로 다시 로드되는 시점 — revision을 올려서 그 이전 revision으로
    //   진행 중이던 전송·업로드의 응답이 지금 화면에 반영되지 않게 하고, 고정 세션과
    //   지금까지 쌓인 대화 내용도 전부 리셋해서 이전 대화가 잠깐이라도 섞여 보이지 않게 함.
    viewRevision.current += 1;
    boundSession.current = null;
    setBoundGroupId(null);
    setTurns([]);
    setAttachments([]);
    setSending(false);
    const owner = getAccessToken();
    const current = () => !cancelled && owner === getAccessToken();

    (async () => {
      setLoading(true);

      try {
        if (sessionIdOverride) {
          setActiveSessionId(sessionIdOverride);
        }

        // ✅ 수정(2026-09) — 리브가 계속 답을 못 받아오던 원인: localStorage에 남아있던
        //   세션 id가 백엔드에서 이미 없어졌는데(개발 DB 리셋 등), 그걸 확인 없이 계속
        //   재사용해서 이 조회가 매번 404였음(화면은 그냥 빈 대화창으로만 보임). 404면
        //   그 세션을 버리고 새 세션으로 한 번 더 시도.
        const messages = await withValidSession(
          groupId,
          async (sessionId) => {
            // ✅ 이 화면이 실제로 쓸 세션의 groupId를 먼저 확인해서 boundGroupId로 고정.
            const metadata = await getSessionMetadata(sessionId);
            if (!current()) throw new Error("대화가 변경되었습니다.");
            boundSession.current = sessionId;
            setBoundGroupId(owner ? (metadata.groupId ?? null) : (groupId ?? null));
            onSessionReady?.(sessionId);
            return apiFetch<{ messageId: number; sender: string; content: string; createdAt?: string }[]>(
              `/api/chat/sessions/${sessionId}/messages`,
              { headers: chatHeaders() }
            );
          },
          sessionIdOverride
        );

        if (!current()) return;
        setTurns(
          messages.map((m) => ({
            role: m.sender === "USER" ? "user" : "assistant",
            content: m.content,
            messageId: m.messageId,
            createdAt: m.createdAt,
            proactive: m.sender === "AI_PROACTIVE",
          }))
        );
      } catch {
        if (current()) setTurns([]);
      } finally {
        if (current()) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      viewRevision.current += 1;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionIdOverride, groupId]);

  // 버튼 클릭만으로 읽음 처리하지 않는다. 대화를 불러와 화면에 표시한 뒤에만 처리한다.
  useEffect(() => {
    const markDisplayed = () => {
      if (loading || document.visibilityState !== "visible" || !boundSession.current) return;
      turns.filter(t => t.proactive).slice(-50).forEach(t => saveProactiveNotification({
        sessionId: boundSession.current!, messageId: t.messageId, sender: "AI_PROACTIVE",
        content: t.content, createdAt: t.createdAt,
      }, true));
    };
    markDisplayed();
    document.addEventListener("visibilitychange", markDisplayed);
    return () => document.removeEventListener("visibilitychange", markDisplayed);
  }, [loading, turns]);

  // ✅ 메시지가 다 로드된 뒤 하이라이트 대상으로 스크롤 이동 + 2초 후 하이라이트 해제
  useEffect(() => {
    if (loading || highlightedMessageId == null) return;
    const el = document.getElementById(`chat-msg-${highlightedMessageId}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    const timer = setTimeout(() => setHighlightedMessageId(null), 2000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, turns]);

  // ✅ 신규(09-03 요청 ③) — 패널이 열려 있는 동안 도착한 자발형 말풍선을 새로고침 없이
  //   바로 붙임(lib/realtime.ts가 window 커스텀 이벤트로 흘려줌). 이 컴포넌트 자체가
  //   패널이 열려 있을 때만 마운트되니, 리스너가 붙어있다는 것 자체가 "지금 보고 있다"는
  //   뜻이라 패널 열림 여부를 따로 체크할 필요가 없음.
  useEffect(() => {
    const onProactive = (e: Event) => {
      const data = (e as CustomEvent<{ sessionId?: string; messageId?: number; content: string; createdAt?: string }>).detail;
      // ✅ 버그 수정(요청) — 다른 세션 구독에서 온 이벤트가 이 화면에 섞여 들어오지 않게,
      //   이 화면이 고정한 세션과 일치할 때만 반영.
      if (!data?.content || data.sessionId !== boundSession.current) return;
      setTurns((prev) => data.messageId != null && prev.some(t => t.messageId === data.messageId) ? prev : [
        ...prev,
        { role: "assistant", content: data.content, messageId: data.messageId, createdAt: data.createdAt ?? new Date().toISOString(), proactive: true },
      ]);
    };
    window.addEventListener(PROACTIVE_EVENT, onProactive);
    return () => window.removeEventListener(PROACTIVE_EVENT, onProactive);
  }, []);

  useEffect(() => {
    return () => {
      if (recordTimerRef.current) {
        clearInterval(recordTimerRef.current);
      }
    };
  }, []);

  // ✅ 실제로 백엔드에 보내는 부분만 분리 — 처음 보낼 때도, 실패 후 "다시 보내기"할 때도
  //   이 함수 하나만 씀(유저 말풍선을 새로 추가하느냐만 다름).
  // ✅ 수정(2026-09) — 여기도 위와 같은 이유로 withValidSession으로 감쌈. 안 그러면
  //   무효한 세션 id로 계속 보내다가 매번 실패해서 "리브가 답을 안 준다"로 보였음.
  // ✅ 버그 수정(요청 — "다른 창에서 세션이 바뀌면 메시지가 다른 채팅으로 감") — groupId
  //   (다른 창이 바꿀 수 있는 전역 컨텍스트) 대신 boundGroupId(이 화면이 로드 시 확정한
  //   값), 그리고 boundSession.current를 destination으로 고정해서 씀. 아직 세션이
  //   확정 전이면(destination이 null) 아무 데도 안 보냄.
  const sendToBackend = async (content: string, attachmentIds: number[], turnIndex: number) => {
    const owner = getAccessToken();
    const revision = viewRevision.current;
    const current = () => owner === getAccessToken() && revision === viewRevision.current;
    const destination = boundSession.current;
    if (!destination) return;
    setSending(true);
    try {
      const res = await withValidSession(
        boundGroupId,
        (sessionId) =>
          apiFetch<{
            reply: string;
            actions: Record<string, unknown>[];
          }>("/api/chat", {
            method: "POST",
            headers: chatHeaders(),
            body: JSON.stringify({
              sessionId,
              message: content,
              guestCart: owner ? undefined : {groupId: boundGroupId, groups: readCartGroups().map(g => ({cartGroupId:g.id,title:g.title,items:g.products.map(p => ({skuId:p.id,quantity:p.quantity}))}))},
              attachmentIds: attachmentIds.length > 0 ? attachmentIds : undefined,
            }),
          }),
        destination
      );

      if (!current()) return;

      if (res.actions?.length) {
        console.log("agent actions", res.actions);
      }

      setTurns((prev) => [
        ...prev.map((t, i) => (i === turnIndex ? { ...t, failed: false } : t)),
        {
          role: "assistant",
          content: res.reply,
          createdAt: new Date().toISOString(),
          mentionedSkuIds: extractSkuIds(res.actions),
          mentionedGroupIds: extractGroupIds(res.actions),
        },
      ]);
    } catch {
      if (!current()) return;
      // ✅ 실패해도 별도 assistant 말풍선을 안 붙이고, 이 유저 메시지 자체를 실패
      //   상태로 표시만 함 — "다시 보내기" 버튼으로 나중에 같은 내용을 재전송할 수 있게.
      setTurns((prev) => prev.map((t, i) => (i === turnIndex ? { ...t, failed: true } : t)));
    } finally {
      if (current()) setSending(false);
    }
  };

  const handleSend = async (text?: string) => {
    const content = (text ?? message).trim();

    // ✅ 버그 수정(요청) — 아직 세션이 확정되기 전(loading)이거나 boundSession이 없으면
    //   전송 자체를 막음. 확정 전에 보내면 그 사이 화면이 바뀔 때 엉뚱한 세션으로 갈 수 있음.
    if (!content || sending || loading || !boundSession.current) return;

    // ✅ 답장 대상이 걸려있으면 인용구를 붙여서 같은 세션에 그대로 보냄(백엔드에 별도
    //   "답장" 개념은 없어서, 리브가 문맥을 알아볼 수 있게 텍스트로 인용해서 보냄).
    //   화면엔 사용자가 실제로 타이핑한 content만 말풍선으로 남기고, 인용구는 전송값에만 붙임.
    const contentToSend = replyTarget ? `"${summarize(replyTarget)}"에 대해 다시 물어볼게: ${content}` : content;

    // ✅ 업로드된 첨부(camera/image/document/receipt)의 attachmentId만 모아서 같이 보냄.
    //   아직 업로드 중이거나 실패한 건 제외 — list/voice는 애초에 attachmentId가 없음.
    const attachmentIds = attachments
      .map((a) => a.attachmentId)
      .filter((id): id is number => id != null);

    const turnIndex = turns.length;
    setTurns((prev) => [
      ...prev,
      {
        role: "user",
        content,
        createdAt: new Date().toISOString(),
      },
    ]);

    setMessage("");
    setAttachments([]);
    setReplyTarget(null);

    await sendToBackend(contentToSend, attachmentIds, turnIndex);
  };

  // ✅ 신규 — 실패한 유저 메시지 다시 보내기. 말풍선을 새로 안 만들고 같은 자리에서 재시도.
  const handleResend = (turnIndex: number) => {
    if (sending) return;
    const turn = turns[turnIndex];
    if (!turn || turn.role !== "user") return;
    setTurns((prev) => prev.map((t, i) => (i === turnIndex ? { ...t, failed: false } : t)));
    void sendToBackend(turn.content, [], turnIndex);
  };

  // ✅ 수정(요청 — "새 대화 시작 말고 같은 세션에서 다시 물을 수 있게, 디코 답장처럼") —
  //   새 세션을 만들지 않고, 그 답변을 "답장 대상"으로 걸어둔 채 같은 대화에서 계속
  //   이어갑니다. 입력창 위에 "↩ [요약]" 배너가 뜨고, 그 상태로 보내면 인용구를 붙여서
  //   같은 세션에 전송(전송 후 배너는 사라짐 — 한 번만 답장 표시).
  const [replyTarget, setReplyTarget] = useState<string | null>(null);
  const composerInputRef = useRef<HTMLInputElement>(null);

  const summarize = (content: string) => (content.length > 24 ? `${content.slice(0, 24)}...` : content);

  const handleReplyToMessage = (content: string) => {
    setReplyTarget(content);
    composerInputRef.current?.focus();
  };

  const handleFileSelected =
    (kind: Attachment["kind"]) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];

      if (!file) return;

      const localId = `file-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      // 사진은 검색 API에만 보낸다. 첨부 저장 컨트롤러는 현재 백엔드에서 비활성이다.
      const prepared = file.type.startsWith("image/") ? shrinkIfNeeded(file) : Promise.resolve(file);
      setAttachments((prev) => [
        ...prev,
        {
          label: file.name,
          localId,
          kind,
          uploading: kind === "camera" || kind === "image" || kind === "document" || kind === "receipt",
        },
      ]);

      // ✅ 실제 POST /api/chat/sessions/{sessionId}/attachments 업로드 — camera/image/document/
      //   receipt만 백엔드에 대응 타입(IMAGE/DOCUMENT/RECEIPT)이 있어서 업로드 대상.
      //   list/voice는 업로드하지 않음(list는 참조일 뿐이고, voice는 이 API가 지원 안 함).
      if (kind === "document" || kind === "receipt") {
        const uploadSession = boundSession.current;
        prepared.then((ready) => uploadChatAttachment(kind, ready, uploadSession)).catch(() => null).then((attachmentId) => {
          setAttachments((prev) =>
            prev.map((a, i) =>
              a.localId === localId
                ? attachmentId != null
                  ? { ...a, attachmentId, uploading: false }
                  : { ...a, uploading: false, uploadFailed: true }
                : a
            )
          );
        });
      }

      // 검색이 끝나면 임시 사진 칩을 지운다. 저장되지 않은 attachmentId를 만들지 않는다.
      if (kind === "camera" || kind === "image") {
        const say = (content: string) =>
          setTurns((prev) => [...prev, { role: "assistant", content }]);
        prepared.then(sendPhotoSearch)
          .then((result) => {
            // ⚠ 09-04: tier 를 버리면 안 된다. 예전 코드는
            //   `productName ?? results[0].productName` 로 **확신 등급을 무시하고**
            //   1등 이름을 단정해 말했다. 서버는 confident 일 때만 productName 을
            //   내려 주는데(photo_ship.txt 의 「잠금」), 그 설계를 마지막 한 뼘에서
            //   되돌리는 셈이었다. 사진 자산은 CSLS 허브 보정으로 소분류 정확도를
            //   59.0%→75.5% 로 끌어올린 물건이다 — 그 사다리를 화면 한 줄이 무너뜨렸다.
            if (result?.error || (result?.message && !result.results?.length)) {
              say(result.message || "사진 검색을 사용할 수 없어요. 잠시 뒤 다시 시도해 주세요.");
              return;
            }
            const names = (result?.results ?? []).map((r) => r.productName).filter(Boolean);
            if (result?.tier === "confident" && result.productName) {
              say(`사진 속 상품은 「${result.productName}」 같아요.\n\n` + names.slice(0, 3).map((n) => `- ${n}`).join("\n"));
            } else if (result?.tier === "category" && names.length) {
              const where = result.categoryL2 ? `${result.categoryL2} 쪽` : "비슷한 종류";
              say(
                `정확히 어떤 상품인지는 확신하기 어려운데, ${where}으로 보여요.\n\n` +
                  names.slice(0, 3).map((n) => `- ${n}`).join("\n") +
                  `\n\n이 중에 있나요? 이름 일부를 알려주시면 더 정확히 찾아드릴게요.`
              );
            } else {
              // unsure — "매장에 없습니다"라고 말하지 않는다(photo_ship.txt).
              //   못 알아본 것과 안 파는 것은 다른 말이고, 후자는 거짓이 될 수 있다.
              say("사진만으로는 어떤 상품인지 알아보기 어려웠어요. 상품 이름이나 브랜드를 알려주시면 찾아드릴게요.");
            }
          })
          .catch((err) => {
            // ⚠ 예전 코드는 실패를 통째로 삼켰다. 손님 화면에는 첨부 칩만 뜨고
            //   **아무 일도 안 일어난 것처럼** 보였다 — 404 가 세 판의 점검을 통과한 이유다.
            const tooBig = (err as { status?: number })?.status === 413;
            say(
              tooBig
                ? "사진 용량이 너무 커서 보내지 못했어요. 조금 작은 사진으로 다시 시도해 주세요."
                : err instanceof Error && !((err as { status?: number }).status) && /사진|JPG/.test(err.message) ? err.message : "사진을 확인하는 중 문제가 생겼어요. 잠시 뒤에 다시 시도해 주세요."
            );
          }).finally(() => setAttachments((prev) => prev.filter((a) => a.localId !== localId)));
      }

      e.target.value = "";
      setAttachOpen(false);
    };

  const handleAttachList = (id: number, title: string, kind: "list" | "receipt") => {
    setAttachments((prev) => [
      ...prev,
      {
        label: kind === "receipt" ? `영수증: ${title}` : `리스트: ${title}`,
        kind: "list",
      },
    ]);
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) =>
      prev.filter((_, i) => i !== index)
    );
  };

  // ---- 마이크: 실제 권한 요청 + 녹음 ----
  const handleMicClick = async () => {
    setMicError(null);

    if (recording) {
      mediaRecorderRef.current?.stop();
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      // ✅ 수정(요청) — "마이크를 사용할 수 없어요"만 뜨면 브라우저 자체 지원 문제처럼
      //   보이지만, 실제로는 대부분 이 경우예요: getUserMedia는 "보안 컨텍스트"(https 또는
      //   localhost)에서만 존재합니다. http://IP주소:3000 같은 주소로 접속하면(배포 전
      //   같은 와이파이에서 테스트할 때 흔함) 모바일 크롬은 사이트 설정에서 마이크를
      //   "허용"으로 보여줘도 이 API 자체가 아예 없어서 이 메시지가 뜹니다 — 배포해서
      //   https 도메인으로 열면 사라집니다(카메라 때와 동일한 원인).
      setMicError(
        window.isSecureContext
          ? "이 브라우저에서는 마이크를 사용할 수 없어요."
          : "이 주소는 보안 연결(https)이 아니라서 마이크를 쓸 수 없어요."
      );
      return;
    }

    // ✅ 이미 허용돼있으면 바로 녹음 시작, 아직 안 물어봤으면 설명 모달부터
    if (micPermission === "prompt") {
      setShowMicModal(true);
      return;
    }

    await startRecording();
  };

  const startRecording = async () => {
    try {
      const stream =
        await navigator.mediaDevices.getUserMedia({
          audio: true,
        });

      const recorder = new MediaRecorder(stream);
      const chunks: BlobPart[] = [];

      // ✅ 신규 — 실시간 파형 애니메이션용 볼륨 분석. AnalyserNode로 짧은 주기마다
      //   실제 마이크 입력 크기를 읽어서 막대 5개 높이에 반영한다.
      try {
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        const source = audioContext.createMediaStreamSource(stream);
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 32;
        source.connect(analyser);
        audioContextRef.current = audioContext;
        analyserRef.current = analyser;

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        const tick = () => {
          analyser.getByteFrequencyData(dataArray);
          // 5개 막대 — 주파수 대역을 5구간으로 나눠 평균내서 각 막대 높이로 사용
          const bucketSize = Math.floor(dataArray.length / 5) || 1;
          const levels = Array.from({ length: 5 }, (_, i) => {
            const slice = dataArray.slice(i * bucketSize, (i + 1) * bucketSize);
            const avg = slice.reduce((s, v) => s + v, 0) / (slice.length || 1);
            return Math.min(1, Math.max(0.15, avg / 160));
          });
          setAudioLevels(levels);
          levelAnimationRef.current = requestAnimationFrame(tick);
        };
        tick();
      } catch {
        // 분석 실패해도 녹음/인식 자체엔 지장 없음 — 파형만 안 움직임
      }

      recorder.ondataavailable = (e) => {
        chunks.push(e.data);
      };

      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());

        // ✅ 녹음이 끝나면 파형 분석도 같이 정리.
        if (levelAnimationRef.current) {
          cancelAnimationFrame(levelAnimationRef.current);
          levelAnimationRef.current = null;
        }
        audioContextRef.current?.close().catch(() => {});
        audioContextRef.current = null;
        analyserRef.current = null;
        setAudioLevels([0.2, 0.2, 0.2, 0.2, 0.2]);

        // ✅ 녹음이 끝나면 음성 인식기도 같이 멈춘다.
        if (recognitionRef.current) {
          recognitionRef.current.onend = null;
          recognitionRef.current.stop();
          recognitionRef.current = null;
        }

        if (recordTimerRef.current) {
          clearInterval(recordTimerRef.current);
        }

        setRecording(false);

        const blob = new Blob(chunks, {
          type: "audio/webm",
        });

        void blob;

        setAttachments((prev) => [
          ...prev,
          {
            label: `음성 메모 ${recordSeconds}초`,
            kind: "voice",
          },
        ]);

        setRecordSeconds(0);
      };

      mediaRecorderRef.current = recorder;

      recorder.start();

      setRecording(true);
      setRecordSeconds(0);

      recordTimerRef.current = setInterval(
        () => setRecordSeconds((s) => s + 1),
        1000
      );

      // ✅ Web Speech API로 실시간 음성 인식 — 지원하는 브라우저(Chrome/Edge/삼성인터넷 등)면
      //   녹음과 동시에 돌려서 인식된 문장을 입력창에 채운다. 서버/API 키 불필요.
      const SpeechRecognitionCtor =
        (window as any).SpeechRecognition ||
        (window as any).webkitSpeechRecognition;
      if (SpeechRecognitionCtor) {
        try {
          const recognition = new SpeechRecognitionCtor();
          recognition.lang = "ko-KR";
          recognition.continuous = true;
          recognition.interimResults = true;

          recognition.onresult = (event: any) => {
            let transcript = "";
            for (let i = 0; i < event.results.length; i++) {
              transcript += event.results[i][0].transcript;
            }
            setMessage(transcript);
          };

          // ✅ 인식기가 (녹음은 계속 켜져 있는데) 무음 등으로 스스로 멈추는 경우가 있어,
          //   아직 녹음 중이면 재시작해서 계속 듣게 한다.
          recognition.onend = () => {
            if (mediaRecorderRef.current?.state === "recording") {
              try {
                recognition.start();
              } catch {
                // 이미 시작된 상태 등 — 무시
              }
            }
          };

          recognition.onerror = () => {
            // 음성 인식 실패는 조용히 무시 — 녹음(음성 메모)은 별개로 계속 진행됨
          };

          recognition.start();
          recognitionRef.current = recognition;
        } catch {
          recognitionRef.current = null;
        }
      }
    } catch {
      setMicError(
        "마이크 권한이 거부됐어요. 브라우저 설정에서 허용해주세요."
      );
    }
  };

  const attachOptions: {
    icon: typeof RiCameraLine;
    label: string;
    onClick: () => void;
  }[] = [
    {
      icon: RiBillLine,
      label: "전자 영수증",
      onClick: () => { setAttachOpen(false); setTurns((prev) => [...prev, { role: "assistant", content: "전자 영수증 파일 첨부는 아직 지원하지 않아요. 사진 메뉴에서는 상품 사진으로 비슷한 상품을 찾을 수 있어요." }]); },
    },
    {
      icon: RiCameraLine,
      label: "카메라",
      onClick: () => cameraInputRef.current?.click(),
    },
    {
      icon: RiImageLine,
      label: "사진",
      onClick: () => imageInputRef.current?.click(),
    },
    {
      icon: RiFileTextLine,
      label: "파일",
      onClick: () => { setAttachOpen(false); setTurns((prev) => [...prev, { role: "assistant", content: "일반 파일 첨부는 아직 지원하지 않아요. 상품 이름을 입력하거나 사진 메뉴로 상품을 찾아 주세요." }]); },
    },
    {
      icon: RiListCheck,
      label: "리스트",
      onClick: () => {
        setAttachOpen(false);
        setListPickerOpen(true);
      },
    },
  ];

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFileSelected("camera")}
      />

      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileSelected("image")}
      />

      <input
        ref={documentInputRef}
        type="file"
        accept=".pdf,.doc,.docx,.txt,image/*"
        className="hidden"
        onChange={handleFileSelected("document")}
      />

      <input
        ref={receiptInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFileSelected("receipt")}
      />

      {/* 메시지 영역
          - 이 영역만 세로 스크롤
          - 가로 스크롤은 허용하지 않음
          - 부모 flex 영역보다 커지지 않도록 min-w-0/min-h-0 적용 */}
      <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto p-4">
        <div className="space-y-4">
          {loading ? (
            <p className="text-sm text-muted-foreground">
              불러오는 중...
            </p>
          ) : turns.length === 0 ? (
            <>
              <p className="whitespace-pre-line text-2xl font-bold leading-8">
                {greeting}
              </p>

              <div className="mt-7 space-y-2">
                {suggestedPrompts.map((prompt, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => handleSend(prompt)}
                    className="block w-full rounded-md border border-[#F4F4F4] px-4 py-3 text-left text-sm"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </>
          ) : (
            turns.map((turn, i) => {
              const isUser = turn.role === "user";
              const showTime = shownTimeIndex === i;
              const toggleTime = () => setShownTimeIndex((prev) => (prev === i ? null : i));
              return (
                <div
                  key={i}
                  id={turn.messageId ? `chat-msg-${turn.messageId}` : undefined}
                  className={`group ${isUser ? "text-right" : "text-left"}`}
                >
                  <div className={`flex items-start gap-2 ${isUser ? "flex-row-reverse" : ""}`}>
                    {/* ✅ 신규(요청) — 리브 메시지 옆에 liv-full 아이콘 */}
                    {!isUser && (
                      <img src="/icons/liv-full.svg" alt="" className="mt-0.5 h-6 w-6 shrink-0" />
                    )}

                    <div className="min-w-0 flex-1">
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={toggleTime}
                        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && toggleTime()}
                        className={
                          isUser
                            ? `inline-block max-w-full cursor-pointer rounded-md px-4 py-2.5 text-sm break-words transition-colors duration-500 ${
                                turn.messageId === highlightedMessageId ? "bg-foreground/20" : "bg-muted"
                              }`
                            : turn.proactive
                            ? // ✅ 신규(09-03 요청 ③) — 같은 회색 말풍선이면 "묻지 않았는데
                              //   먼저 말을 걸었다"가 안 보여서, 호박색 카드로 구분.
                              `inline-block max-w-full cursor-pointer rounded-md border px-3 py-2.5 text-sm break-words transition-colors duration-500 ${
                                turn.messageId === highlightedMessageId
                                  ? "border-amber-400 bg-amber-100"
                                  : "border-amber-300 bg-amber-50"
                              }`
                            : `inline-block max-w-full cursor-pointer text-sm break-words rounded-md transition-colors duration-500 ${
                                turn.messageId === highlightedMessageId ? "bg-foreground/10 px-2 py-1 -mx-2" : ""
                              }`
                        }
                      >
                        {/* ✅ 신규(09-03 요청 ③) — 자발형 말풍선 라벨. 이력을 불러올 때도,
                            지금 막 도착했을 때도 둘 다 뜸(turn.proactive가 두 경로 다 채움). */}
                        {!isUser && turn.proactive && (
                          <p className="mb-1 text-xs font-semibold text-amber-700">먼저 알려드려요</p>
                        )}
                        {/* ✅ 신규(요청) — 말풍선 모양(위 컨테이너의 배경/모서리)은 그대로 두고,
                            안쪽 내용만 유저는 그대로, 리브는 마크다운으로 */}
                        {isUser ? turn.content : <MarkdownText text={turn.content} />}
                      </div>

                      {/* ✅ 신규(요청) — 리브가 언급한 상품 목록 카드 */}
                      {!isUser && turn.mentionedSkuIds && turn.mentionedSkuIds.length > 0 && (
                        <MentionedProducts skuIds={turn.mentionedSkuIds} groupId={boundGroupId} />
                      )}

                      {/* ✅ 신규(요청 4번) — 리브가 언급한 리스트 카드 */}
                      {!isUser && turn.mentionedGroupIds && turn.mentionedGroupIds.length > 0 && (
                        <MentionedLists groupIds={turn.mentionedGroupIds} />
                      )}

                      {/* ✅ 수정(요청 — "새 대화 시작 말고 같은 세션에서 다시 물을 수
                          있게") — 새 세션을 만드는 대신, 이 답변을 답장 대상으로 걸어둠
                          (디코 답장처럼). 호버 시에만 보여서 평소엔 답변만 깔끔하게 보임
                          (모바일은 늘 보임). */}
                      {!isUser && (
                        <button
                          type="button"
                          onClick={() => handleReplyToMessage(turn.content)}
                          className="mt-1 flex items-center gap-1 text-xs text-muted-foreground opacity-100 md:opacity-0 md:transition-opacity md:group-hover:opacity-100"
                        >
                          <RiCornerDownRightLine size={13} />
                          {summarize(turn.content)}에 대해 다시 묻기
                        </button>
                      )}

                      {/* ✅ 신규 — 실패한 유저 메시지엔 "다시 보내기" 버튼 */}
                      {isUser && turn.failed && (
                        <button
                          type="button"
                          onClick={() => handleResend(i)}
                          disabled={sending}
                          className="mt-1 flex items-center gap-1 text-xs text-danger disabled:opacity-50"
                        >
                          <RiErrorWarningLine size={14} />
                          답변을 가져오지 못했어요 · 다시 보내기
                        </button>
                      )}
                    </div>
                  </div>

                  {/* ✅ 신규(요청) — 말풍선을 누르거나(모바일) 마우스를 올리면(데스크톱)
                      보낸/받은 시각 표시 */}
                  {turn.createdAt && (
                    <p
                      className={`mt-1 text-[11px] text-muted-foreground transition-opacity ${
                        showTime ? "opacity-100" : "opacity-0 md:group-hover:opacity-100"
                      } ${isUser ? "text-right" : "pl-8 text-left"}`}
                    >
                      {formatMessageTime(turn.createdAt)}
                    </p>
                  )}
                </div>
              );
            })
          )}

          {sending && (
            <p className="text-sm text-muted-foreground">
              답변을 준비하고 있어요...
            </p>
          )}
        </div>
      </div>

      {/* 입력 영역 — 항상 하단에 고정 */}
      <div className="shrink-0 min-w-0 space-y-2 p-3">
        {micError && (
          <p className="text-xs text-danger">
            {micError}
          </p>
        )}

        {attachments.length > 0 && (
          <div className="flex min-w-0 flex-wrap gap-2">
            {attachments.map((a, i) => (
              <div
                key={i}
                className={`flex min-w-0 max-w-full items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs ${
                  a.uploadFailed ? "border-danger text-danger" : "border-border"
                }`}
              >
                <span className="min-w-0 truncate">
                  {a.uploading ? `업로드 중... ${a.label}` : a.uploadFailed ? `업로드 실패: ${a.label}` : a.label}
                </span>

                <button
                  type="button"
                  onClick={() => removeAttachment(i)}
                  aria-label="첨부 제거"
                  className="shrink-0"
                >
                  <RiCloseLine size={24} />
                </button>
              </div>
            ))}
          </div>
        )}

        {attachOpen && (
          <div className="mb-2 divide-y divide-border overflow-hidden rounded-lg border border-border bg-card shadow-lg">
            {attachOptions.map(
              ({ icon: Icon, label, onClick }) => (
                <button
                  key={label}
                  type="button"
                  onClick={onClick}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm"
                >
                  <Icon size={20} className="shrink-0 text-muted-foreground" />
                  {label}
                </button>
              )
            )}
          </div>
        )}

        {/* ✅ 수정(요청) — 높이 60, 뒤에 옅은 그림자를 줘서 살짝 떠 있는 느낌으로.
            ✅ 수정(요청 2번) — 녹음 중엔 "녹음 중... N초" 고정 문구로 텍스트 입력칸
            자체를 가려버려서, 실시간으로 인식되고 있는 자막(message, Web Speech API가
            채워줌)이 안 보였음. 이제 녹음 중에도 이 자리에 실제 인식된 텍스트를 그대로
            보여줌(아직 아무 말도 안 했으면 안내 문구). 빨간 점 대신 실제 마이크 소리
            크기에 반응하는 막대 5개(파형)로 "듣고 있다"는 걸 보여줌. */}
        {/* ✅ 신규(요청 — "디코에서 답장하는 것처럼") — 답장 대상이 걸려있을 때 입력창
            바로 위에 뜨는 배너. corner-down-left 화살표 + 짧은 요약, X로 취소 가능. */}
        {replyTarget && (
          <div className="mb-1.5 flex items-center gap-1.5 rounded-full border border-[#F4F4F4] bg-white px-3 py-1.5 text-xs text-muted-foreground shadow-[0_2px_10px_rgba(0,0,0,0.06)]">
            <RiCornerDownLeftLine size={14} className="shrink-0" />
            <span className="min-w-0 flex-1 truncate">{summarize(replyTarget)}에 대해 다시 묻기</span>
            <button type="button" onClick={() => setReplyTarget(null)} aria-label="답장 취소" className="shrink-0">
              <RiCloseLine size={14} />
            </button>
          </div>
        )}

        <div className="flex h-[60px] min-w-0 items-center gap-2 rounded-full border border-[#F4F4F4] bg-white p-2 shadow-[0_4px_20px_rgba(0,0,0,0.08)]">
          <button
            type="button"
            onClick={() => setAttachOpen((v) => !v)}
            aria-label="첨부"
            className="flex h-8 w-8 shrink-0 items-center justify-center text-foreground"
          >
            <RiAddLine size={22} />
          </button>

          {recording ? (
            <span className="flex min-w-0 flex-1 items-center gap-2 text-sm">
              {/* ✅ 신규 — 파형 애니메이션. audioLevels(0~1) 5개 값을 막대 높이로 매핑,
                  requestAnimationFrame으로 매 프레임 갱신되니 실제 목소리 크기에 따라
                  실시간으로 들쭉날쭉 움직임. */}
              <span className="flex h-4 shrink-0 items-end gap-[3px]" aria-hidden="true">
                {audioLevels.map((level, i) => (
                  <span
                    key={i}
                    className="w-[3px] rounded-full bg-danger transition-[height] duration-75"
                    style={{ height: `${Math.round(level * 100)}%` }}
                  />
                ))}
              </span>
              <span className="min-w-0 flex-1 truncate text-foreground">
                {message.trim() ? message : "듣고 있어요..."}
              </span>
            </span>
          ) : (
            <input
              ref={composerInputRef}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) =>
                e.key === "Enter" && handleSend()
              }
              placeholder="오늘은 어떤 장을 볼까요?"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          )}

          {/* ✅ 참고 이미지(Frame 128) — 입력 전엔 마이크만 보이고, 뭔가 입력하면
              전송 버튼으로 바뀜(전송 기능 자체는 그대로, Enter로도 항상 보냄) */}
          {message.trim().length === 0 && !recording ? (
            <button
              type="button"
              aria-label="음성 입력"
              onClick={handleMicClick}
              className="flex h-8 w-8 shrink-0 items-center justify-center text-foreground"
            >
              <RiMicLine size={22} />
            </button>
          ) : recording ? (
            <button
              type="button"
              aria-label="녹음 종료"
              onClick={handleMicClick}
              className="flex h-8 w-8 shrink-0 items-center justify-center text-danger"
            >
              <RiCheckboxBlankLine size={22} />
            </button>
          ) : (
            <button
              type="button"
              aria-label="전송"
              disabled={loading || sending || !boundSession.current || attachments.some((a) => a.uploading)}
              onClick={() => handleSend()}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand text-brand-foreground disabled:opacity-40"
            >
              <RiSendPlaneLine size={18} />
            </button>
          )}
        </div>
      </div>

      <AttachListPickerDialog
        open={listPickerOpen}
        onClose={() => setListPickerOpen(false)}
        onSelect={handleAttachList}
      />
      <PermissionRequestDialog
        open={showMicModal}
        kind="microphone"
        onConfirm={() => {
          setShowMicModal(false);
          startRecording();
        }}
        onClose={() => setShowMicModal(false)}
      />
    </div>
  );
}
