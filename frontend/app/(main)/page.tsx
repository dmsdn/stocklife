"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  RiNotification4Line,
  RiMapPinLine,
  RiBookmarkLine,
  RiRoadMapLine,
  RiQrScanLine,
} from "@remixicon/react";

import { useOpenAiChat } from "@/lib/use-open-ai-chat";
import { useAiPanel } from "@/components/layout/ai-panel-context";
import {
  addProductToCartGroup,
  readCartGroups,
  loadCartGroups,
  type CartGroup,
} from "@/lib/cart-storage";
import {
  fetchRecentOrder,
  fetchWishlistCount,
  fetchLivRecommendations,
  type RecommendedProduct,
  type RecentOrderSummary,
} from "@/lib/home-data";
import { readShoppingSession, type ShoppingSession } from "@/lib/shopping-session";
import { apiFetch, getAccessToken, isLoggedIn, AUTH_CHANGED_EVENT } from "@/lib/api-client";
import { getMyProfile } from "@/lib/consumer-api";
import { getStoreDayInfo } from "@/lib/store-hours";
import { getClientId } from "@/lib/client-id";
import { useUnreadNotificationCount } from "@/lib/use-unread-notifications";
import { useBottomBarVisibility } from "@/components/layout/bottom-bar-visibility-context";
import { getCategoryColor, buildCategoryPalette } from "@/lib/category-colors";
import { SaveToListDialog } from "@/components/domain/save-to-list-dialog";
import { getMostRecentCompletedAt, isGroupCompleted } from "@/lib/completed-groups";
import { Footer } from "@/components/layout/footer";
import type { DashboardChatSession } from "@/components/home/home-dashboard";

function chatHeaders(): Record<string, string> {
  return getAccessToken() ? {} : { "X-Chat-Client-Id": getClientId() };
}

interface CategorySpending {
  categoryL1: string;
  totalSpentKrw: number;
}

// ✅ 신규(2026-09) — "은우님, 좋은 아침이에요" 고정 문구 대신 실제 이름 + 시간대/매장
//   방문여부에 따른 인사말. 매장에서 쇼핑 중(shoppingSession 있음)이면 시간대 인사 대신
//   방문 인사를 우선 보여줌 — 새벽 3시에 장보고 있는데 "좋은 아침이에요"만 뜨는 것보다
//   지금 상황(매장 방문 중)이 더 와닿는 정보라서.
function getTimeGreeting(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 11) return "좋은 아침이에요";
  if (hour >= 11 && hour < 14) return "맛있는 점심 되세요";
  if (hour >= 14 && hour < 18) return "좋은 오후예요";
  if (hour >= 18 && hour < 22) return "좋은 저녁이에요";
  return "편안한 밤 되세요";
}

export default function HomePage() {
  const router = useRouter();
  const openAiChat = useOpenAiChat();
  const { openSession } = useAiPanel();

  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<RecommendedProduct | null>(null);
  const [cartGroups, setCartGroups] = useState<CartGroup[]>([]);

  // ✅ 재적용(이전 세션 요청 4번) — "다음 방문 날짜"를 실제 리스트 중 가장 가까운 미래
  //   장보기 예정일로. 완료(결제 완료)된 리스트는 이미 다녀온 거라 제외.
  const nextVisitDate = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const upcoming = cartGroups
      .filter((g) => g.shoppingDate && !isGroupCompleted(g.id))
      .map((g) => new Date(`${g.shoppingDate}T00:00:00`))
      .filter((d) => !Number.isNaN(d.getTime()) && d.getTime() >= today.getTime())
      .sort((a, b) => a.getTime() - b.getTime());
    return upcoming[0] ?? null;
  }, [cartGroups]);
  const [recentSession, setRecentSession] = useState<DashboardChatSession | null>(null);
  const [recentOrder, setRecentOrder] = useState<RecentOrderSummary | null>(null);
  const [wishlistCount, setWishlistCount] = useState<number | null>(null);
  const [products, setProducts] = useState<RecommendedProduct[]>([]);
  // ✅ 신규(2026-09) — 스크롤 중 한 번씩 "걸리는" 느낌의 원인: 이 섹션이 처음엔 빈
  //   배열(높이 0)로 렌더되다가 fetchRecommendedProducts()가 응답하면 갑자기 카드 여러 줄이
  //   생기면서 그 아래(운영시간/Footer)가 통째로 밀려남 — 마침 그 순간 스크롤 중이면
  //   레이아웃이 훅 밀리는 게 "걸림"으로 느껴짐. loadingProducts로 로딩 중과 "추천 결과
  //   없음"을 구분해서, 로딩 중엔 카드와 높이가 같은 스켈레톤을 미리 깔아 둠(=최종 데이터가
  //   와도 그 자리에서 내용만 바뀌지 섹션 높이 자체는 안 바뀜).
  const [loadingProducts, setLoadingProducts] = useState(true);
  // ✅ 신규(요청 — "채팅 리스트·상세 링크·리브 추천") — 추천이 빈 상태일 때(비로그인/
  //   실패) 왜 비어있는지 알려주는 문구.
  const [recommendationMessage, setRecommendationMessage] = useState("");
  // ✅ 신규(요청 7번) — "이번달 소비 분석" 카드가 9,999원짜리 가짜 데이터였음. 실제
  //   GET /api/purchases/spending-by-category(마이페이지 소비분석 화면과 동일 API)를
  //   30일 기준으로 불러와서 상위 3개 카테고리 + 나머지로 보여주고, 카드 전체를 눌러
  //   /mypage/spending(전체 화면)으로 이동.
  const [spending, setSpending] = useState<CategorySpending[] | null>(null);
  const [shoppingSession, setShoppingSession] = useState<ShoppingSession | null>(null);

  // 방문 중 카드에 표시할 현재 리스트와 결제 직후 감사 상태.
  const shoppingGroup = useMemo(
    () =>
      shoppingSession
        ? cartGroups.find((g) => g.id === shoppingSession.groupId) ?? null
        : null,
    [cartGroups, shoppingSession]
  );

  // 결제 완료 후에는 shoppingSession이 사라져도 1시간 동안 감사 문구를 유지한다.
  const recentCompletedAt = getMostRecentCompletedAt();
  const recentlyCompleted = Boolean(
    recentCompletedAt &&
      Date.now() - new Date(recentCompletedAt).getTime() < 60 * 60 * 1000
  );
  const [loggedIn, setLoggedIn] = useState(false);
  const [profileName, setProfileName] = useState<string | null>(null);
  const unreadCount = useUnreadNotificationCount();
  // ✅ 신규 — 이 페이지는 Footer가 있어서 Footer 스스로 하단탭바 여백을 확보함(자기 배경색
  //   그대로). main이 똑같은 여백을 또 예약하면 이중으로 잡혀서(그것도 다른 색으로) "이상한
  //   패딩"처럼 보였던 진짜 원인 — main의 예약을 꺼서 이 문제 자체를 없앰.
  const { setNoReserve } = useBottomBarVisibility();
  useEffect(() => {
    setNoReserve(true);
    return () => setNoReserve(false);
  }, [setNoReserve]);

  useEffect(() => {
    setShoppingSession(readShoppingSession());
    setLoggedIn(isLoggedIn());
    loadCartGroups().then(setCartGroups).catch(() => setCartGroups(readCartGroups()));
  }, []);

  useEffect(() => {
    if (!isLoggedIn()) return;
    getMyProfile()
      .then((p) => setProfileName(p.name))
      .catch(() => setProfileName(null));
  }, []);

  useEffect(() => {
    apiFetch<DashboardChatSession[]>("/api/chat/sessions", { headers: chatHeaders() })
      .then((list) => setRecentSession(list[0] ?? null))
      .catch(() => setRecentSession(null));
  }, []);

  useEffect(() => {
    fetchRecentOrder().then(setRecentOrder).catch(() => setRecentOrder(null));
    fetchWishlistCount().then(setWishlistCount).catch(() => setWishlistCount(null));
  }, []);

  // ✅ 수정(요청 — "채팅 리스트·상세 링크·리브 추천") — 예전엔 그냥 인기 상품 검색이었고
  //   실패하면 조용히 목업으로 바뀌었음. 이제 실제 Agent 추천(fetchLivRecommendations)을
  //   쓰고, 로그인 계정이 바뀌면(로그아웃 후 다른 계정 로그인 등) 다시 불러오면서 그
  //   사이 오던 이전 계정 응답은 버립니다(revision으로 판단).
  useEffect(() => {
    let revision = 0;
    const reload = async () => {
      const current = ++revision;
      setProducts([]);
      setLoadingProducts(true);
      const result = await fetchLivRecommendations();
      if (current !== revision) return; // 그 사이 계정이 또 바뀌었으면 이 응답은 버림
      setProducts(result.items);
      setRecommendationMessage(result.message);
      setLoadingProducts(false);
    };
    void reload();
    window.addEventListener(AUTH_CHANGED_EVENT, reload);
    return () => {
      revision++;
      window.removeEventListener(AUTH_CHANGED_EVENT, reload);
    };
  }, []);

  useEffect(() => {
    if (!isLoggedIn()) return;
    apiFetch<CategorySpending[]>("/api/purchases/spending-by-category?lookbackDays=30")
      .then(setSpending)
      .catch(() => setSpending([]));
  }, []);

  const goSearch = () => router.push("/search");

  const openSaveDialog = (product: RecommendedProduct) => {
    setSelectedProduct(product);
    setSaveError(null);
    setSaveDialogOpen(true);
  };

  const closeSaveDialog = () => {
    setSaveDialogOpen(false);
    setSelectedProduct(null);
  };

  const [saveError, setSaveError] = useState<string | null>(null);

  // ✅ 수정(요청 4번) — 리브 추천 카드의 저장 아이콘이 기존 CartPicker(자체 UI)를 써서
  //   나머지 화면(상품 상세·검색·채팅)에서 쓰는 SaveToListDialog와 다르게 보였음.
  //   같은 컴포넌트로 통일 — 여러 리스트에 동시 저장 가능, 새 리스트 만들기도 그 안에서.
  const handleSaveToLists = async (groupIds: number[]) => {
    if (!selectedProduct) return;
    try {
      let nextGroups: CartGroup[] = cartGroups;
      for (const groupId of groupIds) {
        nextGroups = await addProductToCartGroup(groupId, {
          id: selectedProduct.id,
          name: selectedProduct.name,
          category: selectedProduct.category,
          price: selectedProduct.price,
          image: selectedProduct.image,
        });
      }
      setCartGroups(nextGroups);
    } catch {
      setSaveError("리스트에 담지 못했어요. 다시 시도해주세요.");
    } finally {
      closeSaveDialog();
    }
  };

  return (
    <div className="min-h-full w-full overflow-x-hidden bg-surface-subtle text-[#171717]">
      <div className="mx-auto w-full bg-surface-subtle md:max-w-2xl">
        {/* Header */}
        <header className="flex h-[55px] items-center justify-between px-4">
          <Link href="/" aria-label="홈">
            <img src="/icons/logo-shopping.svg" alt="STOCK LIFE" className="h-[24px] w-auto" />
          </Link>
          <Link href="/notifications" aria-label="알림" className="relative flex h-8 w-8 items-center justify-center">
            <RiNotification4Line size={24} />
            {unreadCount > 0 && (
              <span className="absolute right-0 top-0 flex h-4 min-w-4 animate-[badge-float_2s_ease-in-out_infinite] items-center justify-center rounded-full bg-main px-0.5 text-xs font-semibold leading-none text-white">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </Link>
        </header>

        <main>
          {/* ✅ 수정(요청) — main의 공통 px-3를 없애고, 섹션마다 필요한 만큼만 좌우 여백을
              직접 줌(카드류는 mx-3, 텍스트는 px-3). 이렇게 해야 배너/운영시간 이미지처럼
              화면 끝까지 붙어야 하는 요소들이 main의 여백에 딸려오지 않고 자연스럽게
              풀블리드가 됨(-mx-3로 상쇄하던 예전 방식 대신, 애초에 안 물려받게).
              ✅ 수정(요청 2번) — 상단 검색바 제거(바로가기 카드의 "상품 검색"으로 충분).
              대신 그 자리를 인사말 위쪽 여백으로 돌려서 인사말을 더 여유있게 보이게 함.
              인사말을 누르면 마이페이지로 이동. */}
          {loggedIn ? (
            <button
              type="button"
              onClick={() => router.push("/mypage")}
              className="block w-full px-[20px] py-[20px] text-left"
            >
              <p className="text-19 font-medium">
                {profileName ? `${profileName}님, ` : ""}
                {shoppingSession ? "매장에서 즐거운 쇼핑 되세요" : getTimeGreeting()}
              </p>
              <p className="mt-1 text-sm text-content-tertiary">3일 뒤에 STOCKLIFE에 방문하실 예정이에요</p>
            </button>
          ) : (
            <div className="pt-[20px]" />
          )}

          {
            <section className="mx-[20px] my-[20px] rounded-[20px] border border-card-border bg-card shadow-[0px_1px_10px_0px_rgba(126,126,126,0.05)] p-5">
              {recentlyCompleted ? (
                <div>
                  <p className="text-17 font-medium">결제해주셔서 감사합니다.</p>
                  <p className="mt-1 text-sm text-content-quaternary">오늘도 STOCK LIFE와 함께해요.</p>
                </div>
              ) : shoppingSession ? (
                <div>
                  <p className="text-17 font-medium">지금 STOCK LIFE에서 쇼핑 중이에요.</p>
                  {shoppingGroup && shoppingGroup.status !== "COMPLETED" && (() => {
                    const info = getStoreDayInfo(new Date());
                    return !info.closed ? (
                      <p className="mt-1 text-sm text-content-quaternary">
                        오늘은 {info.hours.close}까지 영업해요.
                      </p>
                    ) : (
                      <p className="mt-1 text-sm text-content-quaternary">{info.closedReason}이에요.</p>
                    );
                  })()}
                </div>
              ) : nextVisitDate ? (
                <p className="text-17 font-medium">
                  다음 방문 날짜는 {nextVisitDate.toLocaleDateString("ko-KR", { month: "long", day: "numeric" })}이에요.
                </p>
              ) : (
                <p className="text-17 font-medium">아직 예정된 장보기가 없어요.</p>
              )}

              <div className="mt-[40px] flex justify-center gap-4">
                {shoppingSession ? (
                  <>
                    <button
                      onClick={() => router.push(`/scan?group=${shoppingSession.groupId}`)}
                      className="flex h-[60px] w-[60px] items-center justify-center rounded-full bg-[#fce3d9] text-main"
                      aria-label="동선"
                    >
                      <RiRoadMapLine size={24} />
                    </button>
                    <button
                      onClick={() => router.push("/scan")}
                      className="flex h-[60px] w-[60px] items-center justify-center rounded-full bg-[#fce3d9] text-main"
                      aria-label="스캔"
                    >
                      <RiQrScanLine size={24} />
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => router.push("/saved")}
                      className="flex h-[60px] w-[60px] items-center justify-center rounded-full bg-[#fce3d9] text-main"
                      aria-label="계획"
                    >
                      <RiBookmarkLine size={24} />
                    </button>
                    <button
                      onClick={() => router.push("/store-map")}
                      className="flex h-[60px] w-[60px] items-center justify-center rounded-full bg-[#fce3d9] text-main"
                      aria-label="매장지도"
                    >
                      <RiMapPinLine size={24} />
                    </button>
                  </>
                )}
                <button
                  onClick={() => openAiChat()}
                  className="flex h-[60px] w-[60px] items-center justify-center rounded-full bg-[#fce3d9] text-main"
                  aria-label="리브"
                >
                  <img src="/icons/liv-line.svg" alt="" className="h-6 w-6 shrink-0" />
                </button>
              </div>
            </section>
          }

          {/* 바로가기 — 카드 그림 3개는 실제 디자인 에셋 사용 중(/public/cards/*.png).
              왼쪽 카드는 고정 높이를 안 주고 grid의 기본 stretch로 오른쪽 두 칸 합친
              높이에 맞춰 늘어나게 함 — 오른쪽 칸 높이가 바뀌어도 항상 자동으로 맞음.
              이미지 3개 전부 카드 우측 하단에서 20px(=bottom-5 right-5) 띄워서 고정. */}
          <section className="mx-[20px] my-[20px] grid grid-cols-2 items-stretch gap-2">
            <button type="button" onClick={recentSession ? () => openSession(recentSession.sessionId) : () => openAiChat()} className="relative h-[288px] rounded-[20px] border border-card-border bg-card shadow-[0px_1px_10px_0px_rgba(126,126,126,0.05)] p-5 text-left">
              <div className="absolute left-5 top-5 text-left">
                <p className="text-17 font-medium">리브와 함께</p>
                <p className="text-17 font-medium">새 계획 세우기</p>
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/cards/plan-with-liv.png"
                alt=""
                className="absolute bottom-5 right-5 h-[80px] w-[80px] object-contain"
              />
            </button>
            <div className="flex flex-col gap-2">
              <button type="button" onClick={() => router.push("/store-map")} className="relative h-[180px] shrink-0 rounded-[20px] border border-card-border bg-card shadow-[0px_1px_10px_0px_rgba(126,126,126,0.05)] p-5 text-left">
                <div className="absolute left-5 top-5 text-left">
                  <p className="text-17 font-medium">매장 지도</p>
                  <p className="mt-1 text-sm text-content-quaternary">구매하려는 상품을 직접<br />찾아보세요</p>
                </div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/cards/store-map.png" alt="" className="absolute bottom-5 right-5 h-9 w-9 object-contain" />
              </button>
              <button type="button" onClick={goSearch} className="relative h-[100px] shrink-0 rounded-[20px] border border-card-border bg-card shadow-[0px_1px_10px_0px_rgba(126,126,126,0.05)] p-5 text-left">
                <p className="absolute left-5 top-5 text-base font-medium">상품 검색</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/cards/product-search.png" alt="" className="absolute bottom-5 right-5 h-9 w-9 object-contain" />
              </button>
            </div>
          </section>

          {/* 포인트 / 장보기 배너 — ✅ 수정(2026-09) — main 자체에 좌우 padding이 없어졌기
              때문에(예전엔 px-3라 -mx-3로 상쇄해야 했음) 이제 아무 여백 없이 그냥 두면
              화면 끝까지 자연스럽게 붙음. 위아래로만 my-5(20px)를 줘서 다른 섹션과 분리. */}
          {loggedIn ? (
            <section className="relative my-[60px] h-[120px] overflow-hidden bg-[#F7AE93] p-5">
              <p className="text-19 font-bold">앱으로 결제하면 포인트 두 배</p>
              <p className="mt-1 text-xs">포인트를 적립할수록 더 많은 혜택이 있어요!</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/banners/promo-points.png"
                alt=""
                className="absolute bottom-0 right-4 h-[100px] w-[100px] object-contain object-bottom"
              />
            </section>
          ) : (
            <button
              type="button"
              onClick={() => router.push("/auth/login")}
              className="relative my-[60px] block h-[120px] w-full overflow-hidden bg-[#92ECBD] p-5 text-left"
            >
              <p className="text-21 font-bold">장보기 리스트, 간편하게 만들어보세요</p>
              <p className="mt-1 text-sm text-[#2f6850]">리브에게 물어보고 3초 만에 리스트 완성!</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/banners/promo-list.png"
                alt=""
                className="absolute -bottom-2 -right-2 h-[100px] w-[100px] object-contain"
              />
            </button>
          )}

          {/* 분석 — ✅ 수정(요청 7번) — 가짜 9,999원 데이터 대신 실제 지출 데이터, 카드를
              누르면 전체 소비 분석 화면(/mypage/spending)으로 이동. */}
          {loggedIn && spending === null ? (
            // ✅ 신규(요청 6번) — 스크롤 걸림 원인 추가 발견: 이 카드도 데이터가 늦게
            //   도착하면 갑자기 나타나서(또는 데이터가 없으면 사라져서) 아래 내용을
            //   밀어냈음. 로딩 중엔 같은 높이의 스켈레톤을 깔아 둠.
            <div className="mx-[20px] my-[60px] h-[132px] animate-pulse rounded-[20px] border border-card-border bg-card shadow-[0px_1px_10px_0px_rgba(126,126,126,0.05)] p-5">
              <div className="h-3.5 w-24 rounded-sm bg-card-border" />
              <div className="mt-2 h-4 w-40 rounded-sm bg-card-border" />
              <div className="mt-4 h-1.5 w-full rounded-full bg-card-border" />
            </div>
          ) : loggedIn && spending && spending.length > 0 ? (
            /* ✅ 수정 — "카드가 오른쪽으로 빠져나감" 원인: block w-full(=100%)에
                mx-[20px]를 함께 준 게 문제였음. w-full은 부모 폭 100%를 먼저 잡고 나서
                margin이 그 위에 "더해지는" 방식이라, 카드 우측이 다른 카드들의 우측
                여백(20px)보다 더 오른쪽으로 밀려나 있었음(왼쪽도 마찬가지로 어긋남,
                다만 오른쪽 끝이 화면 밖으로 밀려서 더 눈에 띔). w-full을 빼면 block
                요소 기본값(width:auto)이 부모 폭에서 margin만큼을 자동으로 뺀 폭으로
                계산돼서, 다른 mx-[20px] 카드들과 동일한 좌우 여백으로 맞춰짐. */
            <button
              type="button"
              onClick={() => router.push("/mypage/spending")}
              className="mx-[20px] my-[60px] block w-[calc(100%-40px)] rounded-[20px] border border-card-border bg-card shadow-[0px_1px_10px_0px_rgba(126,126,126,0.05)] p-5 text-left"
            >
              {(() => {
                const sorted = [...spending].sort((a, b) => b.totalSpentKrw - a.totalSpentKrw);
                const total = sorted.reduce((s, d) => s + d.totalSpentKrw, 0);
                const top = sorted.slice(0, 3);
                const restAmount = sorted.slice(3).reduce((s, d) => s + d.totalSpentKrw, 0);
                // ✅ 수정(2026-09) — 해시 기반 색상이 카테고리끼리 너무 비슷하게 나오던
                //   문제 수정: 지금 화면에 나온 카테고리들만 균등 분산 팔레트로.
                const palette = buildCategoryPalette(top.map((d) => d.categoryL1));
                const rows: { label: string; amount: number; color: string }[] = [
                  ...top.map((d) => ({ label: d.categoryL1, amount: d.totalSpentKrw, color: getCategoryColor(d.categoryL1, 45, palette) })),
                  ...(restAmount > 0 ? [{ label: "그 외", amount: restAmount, color: "#ddd" }] : []),
                ];
                return (
                  <>
                    <p className="text-sm text-content-quaternary">이번달 소비 분석</p>
                    <p className="mt-1 text-md font-medium">
                      {sorted[0]?.categoryL1 ?? ""} 상품을 가장 많이 샀어요
                    </p>
                    <div className="mt-3 flex h-1.5 overflow-hidden rounded-full bg-card-border">
                      {rows.map((r) => (
                        <span
                          key={r.label}
                          style={{ width: `${total > 0 ? (r.amount / total) * 100 : 0}%`, backgroundColor: r.color }}
                        />
                      ))}
                    </div>
                    <div className="mt-2 space-y-1 text-xs">
                      {rows.map((r) => (
                        <div key={r.label} className="flex items-center justify-between">
                          <span className="flex items-center gap-2">
                            <i className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: r.color }} />
                            {r.label}
                          </span>
                          <span>{r.amount.toLocaleString()}원</span>
                        </div>
                      ))}
                    </div>
                  </>
                );
              })()}
            </button>
          ) : null}

          {/* 추천 상품 */}
          <section className="my-[60px] px-[20px]">
            <div className="mb-2 flex items-center gap-1 px-1 text-md font-semibold">
              <img src="/icons/liv-line.svg" alt="" className="h-4 w-4 shrink-0" />
              리브 추천
            </div>
            {/* ✅ 신규(요청) — 로그인 전이거나 추천을 못 불러왔을 때, 빈 그리드만 덩그러니
                두지 않고 왜 비어있는지 알려줌. */}
            {!loadingProducts && products.length === 0 && (
              <p role="status" className="px-1 text-sm text-muted-foreground">{recommendationMessage}</p>
            )}
            <div className="grid grid-cols-2 gap-x-2 gap-y-5">
              {loadingProducts
                ? Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="min-w-0 animate-pulse">
                      <div className="aspect-square rounded-[14px] bg-card-border" />
                      <div className="mt-2 h-4 w-2/3 rounded-sm bg-card-border" />
                      <div className="mt-1.5 h-4 w-1/2 rounded-sm bg-card-border" />
                    </div>
                  ))
                : products.map((product) => (
                <div key={product.id} className="relative min-w-0 text-left">
                  {/* ✅ 수정(요청 — "리브 추천 그냥 누르면 저장임 > 저장 아이콘만 저장으로,
                      그냥 누르면 상세 페이지로") — 예전엔 카드 전체가 버튼 하나라 어디를
                      눌러도 저장(openSaveDialog)됐음. 이제 카드 본문은 상세 페이지 이동,
                      저장은 우상단 북마크 아이콘(별도 버튼)에서만. 바깥 div가 relative라
                      북마크 버튼은 이미지 우상단에 그대로 겹쳐 보임. */}
                  <button
                    type="button"
                    onClick={() => router.push(`/product/${product.id}`)}
                    className="block w-full min-w-0 text-left"
                  >
                    <div className="relative aspect-square overflow-hidden rounded-[14px] bg-gradient-to-b from-[#d8d8d8] to-card-border">
                      {product.image && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={product.image} alt="" className="h-full w-full object-cover" />
                      )}
                    </div>
                    {/* ✅ "인기상품" 고정 문구 대신 실제 추천 이유(짧은 배지: 할인 중/추천 등) */}
                    <div className="mt-1 flex items-center gap-1 text-base text-[#333]">
                      <img src="/icons/liv-line.svg" alt="" className="h-4 w-4 shrink-0" />
                      {product.badge || "추천"}
                    </div>
                    <p className="text-md">{product.name}</p>
                    {/* ✅ 신규(요청) — Agent가 준 추천 사유(재구매 간격/구매 분야 근거)를 그대로 표시 */}
                    {product.reason && <p className="mt-1 text-xs text-muted-foreground">{product.reason}</p>}
                    <p className="mt-0.5 text-lg font-medium">{product.price.toLocaleString()}원</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => openSaveDialog(product)}
                    aria-label={`${product.name} 저장`}
                    className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-white/80"
                  >
                    <RiBookmarkLine size={16} />
                  </button>
                </div>
              ))}
            </div>
          </section>

          {/* 운영시간 — ✅ 수정(2026-09) — 텍스트 블록 대신 이미지 배너로 교체, 누르면
              전체 운영시간 안내 페이지(/store-hours)로 이동. "영업중 · N시 마감"처럼
              실시간으로 바뀌는 상태 문구만 이미지 위 캡션으로 따로 남겨둠(이미지는 정적
              이라 그 부분은 이미지에 못 담음). 이미지 파일은 /public/store-hours/hours.png
              경로에 넣으면 됩니다.
              ✅ 수정 — main에 좌우 padding이 없어져서 이미지는 그냥 두면 화면 끝까지
              자연스럽게 붙음(-mx-3 필요 없음). 제목/캡션 텍스트에만 px-3. 라운드 제거(요청
              4·5번)도 유지. */}
            <section className="mt-[60px]">
              <button
                type="button"
                onClick={() => router.push("/store-hours")}
                className="mt-3 block w-full overflow-hidden"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/store-hours/hours.png" alt="매장 운영 시간 안내" className="w-full object-cover" />
              </button>
            </section>
        </main>

        <Footer paddingClassName="px-3 md:px-8" />
      </div>

      <SaveToListDialog open={saveDialogOpen} onClose={closeSaveDialog} onSelect={handleSaveToLists} />
      {saveError && (
        <p className="fixed inset-x-0 bottom-24 z-[130] mx-auto w-fit rounded-full bg-foreground px-4 py-2 text-sm text-background">
          {saveError}
        </p>
      )}
    </div>
  );
}
