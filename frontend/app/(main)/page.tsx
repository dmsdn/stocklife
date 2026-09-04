"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  RiNotification4Line,
  RiMapPinLine,
  RiBookmarkLine,
  RiRouteLine,
  RiQrScanLine,
} from "@remixicon/react";

import { useOpenAiChat } from "@/lib/use-open-ai-chat";
import { useAiPanel } from "@/components/layout/ai-panel-context";
import {
  addProductToCartGroup,
  createCartGroup,
  readCartGroups,
  loadCartGroups,
  type CartGroup,
} from "@/lib/cart-storage";
import {
  fetchRecentOrder,
  fetchWishlistCount,
  fetchRecommendedProducts,
  type RecommendedProduct,
  type RecentOrderSummary,
} from "@/lib/home-data";
import { readShoppingSession, type ShoppingSession } from "@/lib/shopping-session";
import { apiFetch, getAccessToken, isLoggedIn } from "@/lib/api-client";
import { getMyProfile } from "@/lib/consumer-api";
import { getClientId } from "@/lib/client-id";
import { useUnreadNotificationCount } from "@/lib/use-unread-notifications";
import { useBottomBarVisibility } from "@/components/layout/bottom-bar-visibility-context";
import { getCategoryColor } from "@/lib/category-colors";
import { CartPicker } from "@/components/home/cart-picker";
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

  const [cartPickerOpen, setCartPickerOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<RecommendedProduct | null>(null);
  const [cartGroups, setCartGroups] = useState<CartGroup[]>([]);
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
  // ✅ 신규(요청 7번) — "이번달 소비 분석" 카드가 9,999원짜리 가짜 데이터였음. 실제
  //   GET /api/purchases/spending-by-category(마이페이지 소비분석 화면과 동일 API)를
  //   30일 기준으로 불러와서 상위 3개 카테고리 + 나머지로 보여주고, 카드 전체를 눌러
  //   /mypage/spending(전체 화면)으로 이동.
  const [spending, setSpending] = useState<CategorySpending[] | null>(null);
  const [shoppingSession, setShoppingSession] = useState<ShoppingSession | null>(null);
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

  // ✅ "리브 추천" — 예전엔 이름/가격만 있는 더미 8개였는데, lib/home-data.ts에 실제
  //   데이터 기반 추천 이유(reason)/짧은 배지(badge)까지 만드는 함수가 이미 있어서(카테고리
  //   기반 "OO 카테고리 인기 상품이에요" 같은 정직한 문구 — AI가 실제로 결제내역·리스트를
  //   해석해서 만드는 진짜 개인화 이유는 아직 백엔드에 없어서 지어내지 않음) 그걸 그대로 씀.
  useEffect(() => {
    fetchRecommendedProducts()
      .then(setProducts)
      .catch(() => setProducts([]))
      .finally(() => setLoadingProducts(false));
  }, []);

  useEffect(() => {
    if (!isLoggedIn()) return;
    apiFetch<CategorySpending[]>("/api/purchases/spending-by-category?lookbackDays=30")
      .then(setSpending)
      .catch(() => setSpending([]));
  }, []);

  const goSearch = () => router.push("/search");

  const openCartPicker = async (product: RecommendedProduct) => {
    setSelectedProduct(product);
    setSaveError(null);
    try {
      setCartGroups(await loadCartGroups());
    } catch {
      setCartGroups(readCartGroups());
    }
    setCartPickerOpen(true);
  };

  const closeCartPicker = () => {
    setCartPickerOpen(false);
    setSelectedProduct(null);
  };

  const [saveError, setSaveError] = useState<string | null>(null);

  const handleAddToCart = async (groupId: number) => {
    if (!selectedProduct) return;
    try {
      const nextGroups = await addProductToCartGroup(groupId, {
        id: selectedProduct.id,
        name: selectedProduct.name,
        category: selectedProduct.category,
        price: selectedProduct.price,
        image: selectedProduct.image,
      });
      setCartGroups(nextGroups);
      closeCartPicker();
    } catch {
      setSaveError("리스트에 담지 못했어요. 다시 시도해주세요.");
    }
  };

  const handleCreateCart = async () => {
    if (!selectedProduct) return;
    try {
      const newGroup = await createCartGroup("새 장보기");
      const nextGroups = await addProductToCartGroup(newGroup.id, {
        id: selectedProduct.id,
        name: selectedProduct.name,
        category: selectedProduct.category,
        price: selectedProduct.price,
        image: selectedProduct.image,
      });
      setCartGroups(nextGroups);
      closeCartPicker();
    } catch {
      setSaveError("리스트를 만들지 못했어요. 다시 시도해주세요.");
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

          {!loggedIn ? (
            <section className="mx-[20px] my-[20px] rounded-[20px] border border-card-border bg-white p-5">
              <p className="text-md text-content-quaternary">로그인하고</p>
              <div className="mt-1 flex items-center justify-between">
                <p className="text-xl font-medium">LIV와 함께 시작해보세요</p>
                <img src="/icons/liv-line.svg" alt="LIV" className="h-7 w-7 shrink-0" />
              </div>
              <button
                type="button"
                onClick={() => router.push("/auth/login")}
                className="mt-4 rounded-full border border-[#ffcbb9] bg-[#fff0eb] px-4 py-2 text-17 font-medium text-main"
              >
                STOCKLIFE 시작하기 &gt;
              </button>
            </section>
          ) : (
            // ✅ 쇼핑 중(스캔 세션 있음)일 때만 "방문해주셔서 감사합니다" 카드,
            //   평소(세션 없음)엔 "다음 방문 날짜" 카드 — 예전엔 이 둘이 뒤바뀌어 있었음.
            <section className="mx-[20px] my-[20px] rounded-[20px] border border-card-border bg-white p-5">
              <p className="text-17 font-medium">{shoppingSession ? "STOCK LIFE 매장에 방문해주셔서 감사합니다." : "이번주 장보기"}</p>
              <p className="mt-1 text-sm text-content-tertiary">영업중 · 11:00 마감</p>
              {!shoppingSession ? (
                <>
                  <p className="mt-1 text-17 font-medium">다음 방문 날짜는 9월 9일이에요.</p>
                  <p className="mt-1 text-sm text-[#555]">9월 9일 운영시간</p>
                  <p className="text-sm text-[#555]">오전 10시 - 오후 11시</p>
                </>
              ) : null}
              <div className="mt-4 flex justify-center gap-4">
                {/* ✅ 수정(요청 3·5번) — 아이콘 24px/원형 박스 60px로 키움. 방문 중(shoppingSession)일
                    땐 동선·스캔·리브, 아닐 땐 저장·매장지도·리브로 바뀜(예전엔 항상 저장/스캔
                    고정이었고 두 번째 아이콘도 지도 모양인데 /scan으로 잘못 가고 있었음). */}
                {shoppingSession ? (
                  <>
                    <button
                      onClick={() => router.push(`/scan?group=${shoppingSession.groupId}`)}
                      className="flex h-[60px] w-[60px] items-center justify-center rounded-full bg-[#fce3d9] text-main"
                      aria-label="동선"
                    >
                      <RiRouteLine size={24} />
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
                      aria-label="저장"
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
          )}

          {/* 바로가기 — 카드 그림 3개는 실제 디자인 에셋 사용 중(/public/cards/*.png).
              왼쪽 카드는 고정 높이를 안 주고 grid의 기본 stretch로 오른쪽 두 칸 합친
              높이에 맞춰 늘어나게 함 — 오른쪽 칸 높이가 바뀌어도 항상 자동으로 맞음.
              이미지 3개 전부 카드 우측 하단에서 20px(=bottom-5 right-5) 띄워서 고정. */}
          <section className="mx-[20px] my-[20px] grid grid-cols-2 items-stretch gap-2">
            <button type="button" onClick={recentSession ? () => openSession(recentSession.sessionId) : () => openAiChat()} className="relative h-[288px] rounded-[20px] border border-card-border bg-white p-5 text-left">
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
              <button type="button" onClick={() => router.push("/store-map")} className="relative h-[180px] shrink-0 rounded-[20px] border border-card-border bg-white p-5 text-left">
                <div className="absolute left-5 top-5 text-left">
                  <p className="text-17 font-medium">매장 지도</p>
                  <p className="mt-1 text-sm text-content-quaternary">구매하려는 상품을 직접<br />찾아보세요</p>
                </div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/cards/store-map.png" alt="" className="absolute bottom-5 right-5 h-9 w-9 object-contain" />
              </button>
              <button type="button" onClick={goSearch} className="relative h-[100px] shrink-0 rounded-[20px] border border-card-border bg-white p-5 text-left">
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
            <section className="relative my-[60px] h-[105px] overflow-hidden bg-[#F7AE93] p-5">
              <p className="text-19 font-bold">앱으로 결제하면 포인트 두 배</p>
              <p className="mt-1 text-xs">포인트를 적립할수록 더 많은 혜택이 있어요!</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/banners/promo-points.png"
                alt=""
                className="absolute bottom-0 right-4 h-[75px] w-auto object-contain object-bottom"
              />
            </section>
          ) : (
            <button
              type="button"
              onClick={() => router.push("/auth/login")}
              className="relative my-[60px] block h-[125px] w-full overflow-hidden bg-[#92ECBD] p-5 text-left"
            >
              <p className="text-21 font-bold">장보기 리스트, 간편하게 만들어보세요</p>
              <p className="mt-1 text-sm text-[#2f6850]">리브에게 물어보고 3초 만에 리스트 완성!</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/banners/promo-list.png"
                alt=""
                className="absolute -bottom-2 -right-2 h-[110px] w-auto object-contain"
              />
            </button>
          )}

          {/* 분석 — ✅ 수정(요청 7번) — 가짜 9,999원 데이터 대신 실제 지출 데이터, 카드를
              누르면 전체 소비 분석 화면(/mypage/spending)으로 이동. */}
          {loggedIn && spending === null ? (
            // ✅ 신규(요청 6번) — 스크롤 걸림 원인 추가 발견: 이 카드도 데이터가 늦게
            //   도착하면 갑자기 나타나서(또는 데이터가 없으면 사라져서) 아래 내용을
            //   밀어냈음. 로딩 중엔 같은 높이의 스켈레톤을 깔아 둠.
            <div className="mx-[20px] my-[60px] h-[132px] animate-pulse rounded-[20px] border border-card-border bg-white p-5">
              <div className="h-3.5 w-24 rounded-sm bg-card-border" />
              <div className="mt-2 h-4 w-40 rounded-sm bg-card-border" />
              <div className="mt-4 h-1.5 w-full rounded-full bg-card-border" />
            </div>
          ) : loggedIn && spending && spending.length > 0 ? (
            <button
              type="button"
              onClick={() => router.push("/mypage/spending")}
              className="mx-[20px] my-[60px] block w-full rounded-[20px] border border-card-border bg-white p-5 text-left"
            >
              {(() => {
                const sorted = [...spending].sort((a, b) => b.totalSpentKrw - a.totalSpentKrw);
                const total = sorted.reduce((s, d) => s + d.totalSpentKrw, 0);
                const top = sorted.slice(0, 3);
                const restAmount = sorted.slice(3).reduce((s, d) => s + d.totalSpentKrw, 0);
                const rows: { label: string; amount: number; color: string }[] = [
                  ...top.map((d) => ({ label: d.categoryL1, amount: d.totalSpentKrw, color: getCategoryColor(d.categoryL1) })),
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
                <button
                  key={product.id}
                  type="button"
                  onClick={() => openCartPicker(product)}
                  className="min-w-0 text-left"
                >
                  <div className="relative aspect-square overflow-hidden rounded-[14px] bg-gradient-to-b from-[#d8d8d8] to-card-border">
                    {product.image && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={product.image} alt="" className="h-full w-full object-cover" />
                    )}
                    <span className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-white/80"><RiBookmarkLine size={16} /></span>
                  </div>
                  {/* ✅ "인기상품" 고정 문구 대신 실제 추천 이유(짧은 배지: 할인 중/추천 등) */}
                  <div className="mt-1 flex items-center gap-1 text-base text-[#333]">
                    <img src="/icons/liv-line.svg" alt="" className="h-4 w-4 shrink-0" />
                    {product.badge || "추천"}
                  </div>
                  <p className="text-md">{product.name}</p>
                  <p className="mt-0.5 text-lg font-medium">{product.price.toLocaleString()}원</p>
                </button>
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
            <section className="my-[60px]">
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

      <CartPicker
        open={cartPickerOpen}
        selectedProduct={selectedProduct}
        cartGroups={cartGroups}
        onClose={closeCartPicker}
        onAddToCart={handleAddToCart}
        onCreateCart={handleCreateCart}
        error={saveError}
      />
    </div>
  );
}
