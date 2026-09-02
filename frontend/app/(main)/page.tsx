"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  RiNotification4Line,
  RiSearchLine,
  RiMapPinLine,
  RiBookmarkLine,
} from "@remixicon/react";

import { useOpenAiChat } from "@/lib/use-open-ai-chat";
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
import { getClientId } from "@/lib/client-id";
import { useUnreadNotificationCount } from "@/lib/use-unread-notifications";
import { CartPicker } from "@/components/home/cart-picker";
import { Footer } from "@/components/layout/footer";
import type { DashboardChatSession } from "@/components/home/home-dashboard";

function chatHeaders(): Record<string, string> {
  return getAccessToken() ? {} : { "X-Chat-Client-Id": getClientId() };
}

export default function HomePage() {
  const router = useRouter();
  const openAiChat = useOpenAiChat();

  const [cartPickerOpen, setCartPickerOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<RecommendedProduct | null>(null);
  const [cartGroups, setCartGroups] = useState<CartGroup[]>([]);
  const [recentSession, setRecentSession] = useState<DashboardChatSession | null>(null);
  const [recentOrder, setRecentOrder] = useState<RecentOrderSummary | null>(null);
  const [wishlistCount, setWishlistCount] = useState<number | null>(null);
  const [products, setProducts] = useState<RecommendedProduct[]>([]);
  const [shoppingSession, setShoppingSession] = useState<ShoppingSession | null>(null);
  const [loggedIn, setLoggedIn] = useState(false);
  const unreadCount = useUnreadNotificationCount();

  useEffect(() => {
    setShoppingSession(readShoppingSession());
    setLoggedIn(isLoggedIn());
    loadCartGroups().then(setCartGroups).catch(() => setCartGroups(readCartGroups()));
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
    fetchRecommendedProducts().then(setProducts).catch(() => setProducts([]));
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
    <div className="w-full overflow-x-hidden bg-[#f8f8f8] text-[#171717]">
      <div className="mx-auto w-full max-w-[390px] bg-[#f8f8f8]">
        {/* Header */}
        <header className="flex h-[55px] items-center justify-between px-4">
          <Link href="/" aria-label="홈">
            <img src="/icons/logo-shopping.svg" alt="STOCK LIFE" className="h-[17px] w-auto" />
          </Link>
          <Link href="/notifications" aria-label="알림" className="relative flex h-8 w-8 items-center justify-center">
            <RiNotification4Line size={20} />
            {unreadCount > 0 && (
              <span className="absolute right-0 top-0 flex h-4 min-w-4 animate-[badge-float_2s_ease-in-out_infinite] items-center justify-center rounded-full bg-[#EE4908] px-0.5 text-xs font-semibold leading-none text-white">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </Link>
        </header>

        <main className="px-3">
          {/* 검색 — 인사말보다 위에 */}
          <button
            type="button"
            onClick={goSearch}
            className="mt-2 flex h-9 w-full items-center gap-2 rounded-[7px] border border-[#e5e5e5] bg-[#f2f2f2] px-3 text-left text-base text-[#777]"
          >
            <RiSearchLine size={16} />
            찾고싶은 상품을 검색해보세요
          </button>

          {/* 로그인 / 개인화 영역 */}
          {loggedIn ? (
            <section className="px-0 pb-3 pt-2">
              <p className="text-19 font-medium">은우님, 좋은 아침이에요</p>
              <p className="mt-1 text-sm text-[#999]">3일 뒤에 STOCKLIFE에 방문하실 예정이에요</p>
            </section>
          ) : null}

          {!loggedIn ? (
            <section className="rounded-[20px] border border-[#F4F4F4] bg-white p-5">
              <p className="text-md text-[#aaa]">로그인하고</p>
              <div className="mt-1 flex items-center justify-between">
                <p className="text-xl font-medium">LIV와 함께 시작해보세요</p>
                <img src="/icons/liv-line.svg" alt="LIV" className="h-7 w-7" />
              </div>
              <button
                type="button"
                onClick={() => router.push("/auth/login")}
                className="mt-4 rounded-full border border-[#ffcbb9] bg-[#fff0eb] px-4 py-2 text-17 font-medium text-[#EE4908]"
              >
                STOCKLIFE 시작하기 &gt;
              </button>
            </section>
          ) : (
            // ✅ 쇼핑 중(스캔 세션 있음)일 때만 "방문해주셔서 감사합니다" 카드,
            //   평소(세션 없음)엔 "다음 방문 날짜" 카드 — 예전엔 이 둘이 뒤바뀌어 있었음.
            <section className="rounded-[20px] border border-[#F4F4F4] bg-white p-5">
              <p className="text-17 font-medium">{shoppingSession ? "STOCK LIFE 매장에 방문해주셔서 감사합니다." : "이번주 장보기"}</p>
              <p className="mt-1 text-sm text-[#999]">영업중 · 11:00 마감</p>
              {!shoppingSession ? (
                <>
                  <p className="mt-1 text-17 font-medium">다음 방문 날짜는 9월 9일이에요.</p>
                  <p className="mt-1 text-sm text-[#555]">9월 9일 운영시간</p>
                  <p className="text-sm text-[#555]">오전 10시 - 오후 11시</p>
                </>
              ) : null}
              <div className="mt-4 flex justify-center gap-4">
                <button onClick={() => router.push("/saved")} className="flex h-10 w-10 items-center justify-center rounded-full bg-[#fce3d9] text-[#EE4908]"><RiBookmarkLine size={19} /></button>
                <button onClick={() => router.push("/scan")} className="flex h-10 w-10 items-center justify-center rounded-full bg-[#fce3d9] text-[#EE4908]"><RiMapPinLine size={19} /></button>
                <button onClick={() => openAiChat()} className="flex h-10 w-10 items-center justify-center rounded-full bg-[#fce3d9] text-[#EE4908]"><img src="/icons/liv-line.svg" alt="LIV" className="h-5 w-5" /></button>
              </div>
            </section>
          )}

          {/* 바로가기 — 카드 그림 3개는 실제 디자인 에셋 사용 중(/public/cards/*.png).
              왼쪽 카드는 고정 높이를 안 주고 grid의 기본 stretch로 오른쪽 두 칸 합친
              높이에 맞춰 늘어나게 함 — 오른쪽 칸 높이가 바뀌어도 항상 자동으로 맞음.
              이미지 3개 전부 카드 우측 하단에서 20px(=bottom-5 right-5) 띄워서 고정. */}
          <section className="mt-2 grid grid-cols-2 items-stretch gap-2">
            <button type="button" onClick={recentSession ? () => router.push(`/ai?session=${recentSession.sessionId}`) : () => openAiChat()} className="relative h-[288px] rounded-[20px] border border-[#F4F4F4] bg-white p-5 text-left">
              <div className="absolute left-5 top-5 text-left">
                <p className="text-17 font-medium">리브와 함께</p>
                <p className="text-17 font-medium">새 계획 세우기</p>
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/cards/plan-with-liv.png"
                alt=""
                className="absolute bottom-5 right-5 h-[52px] w-auto object-contain"
              />
            </button>
            <div className="flex flex-col gap-2">
              <button type="button" onClick={() => router.push("/store-map")} className="relative h-[180px] shrink-0 rounded-[20px] border border-[#F4F4F4] bg-white p-5 text-left">
                <div className="absolute left-5 top-5 text-left">
                  <p className="text-17 font-medium">매장 지도</p>
                  <p className="mt-1 text-sm text-[#aaa]">구매하려는 상품을 직접<br />찾아보세요</p>
                </div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/cards/store-map.png" alt="" className="absolute bottom-5 right-5 h-7 w-7 object-contain" />
              </button>
              <button type="button" onClick={goSearch} className="relative h-[100px] shrink-0 rounded-[20px] border border-[#F4F4F4] bg-white p-5 text-left">
                <p className="absolute left-5 top-5 text-base font-medium">상품 검색</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/cards/product-search.png" alt="" className="absolute bottom-5 right-5 h-7 w-7 object-contain" />
              </button>
            </div>
          </section>

          {/* 포인트 / 장보기 배너 */}
          {loggedIn ? (
            <section className="relative mt-2 h-[105px] overflow-hidden bg-[#F7AE93] p-5">
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
              className="relative mt-2 block h-[125px] w-full overflow-hidden bg-[#92ECBD] p-5 text-left"
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

          {/* 분석 */}
          {loggedIn ? (
            <section className="mt-2 rounded-[20px] border border-[#F4F4F4] bg-white p-5">
              <p className="text-sm text-[#aaa]">이번달 소비 분석</p>
              <p className="mt-1 text-md font-medium">카테고리 상품을 가장 많이 샀어요</p>
              <div className="mt-3 flex h-1.5 overflow-hidden rounded-full bg-[#eee]">
                <span className="w-[40%] bg-[#ffb7c8]" /><span className="w-[25%] bg-[#b8c9ff]" /><span className="w-[20%] bg-[#8cdda0]" /><span className="flex-1 bg-[#eee]" />
              </div>
              <div className="mt-2 space-y-1 text-xs">
                {[['정육','#ffb7c8'],['냉동','#b8c9ff'],['신선','#8cdda0'],['그 외','#ddd']].map(([label,dot]) => (
                  <div key={label} className="flex items-center justify-between"><span className="flex items-center gap-2"><i className="h-1.5 w-1.5 rounded-full" style={{backgroundColor: dot}} />{label}</span><span>9,999 원</span></div>
                ))}
              </div>
            </section>
          ) : null}

          {/* 추천 상품 */}
          <section className="mt-5">
            <div className="mb-2 flex items-center gap-1 px-1 text-md font-semibold">
              <img src="/icons/liv-line.svg" alt="" className="h-4 w-4" />
              리브 추천
            </div>
            <div className="grid grid-cols-2 gap-x-2 gap-y-5">
              {products.map((product) => (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => openCartPicker(product)}
                  className="min-w-0 text-left"
                >
                  <div className="relative aspect-square overflow-hidden rounded-[14px] bg-gradient-to-b from-[#d8d8d8] to-[#eeeeee]">
                    {product.image && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={product.image} alt="" className="h-full w-full object-cover" />
                    )}
                    <span className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-white/80"><RiBookmarkLine size={16} /></span>
                  </div>
                  {/* ✅ "인기상품" 고정 문구 대신 실제 추천 이유(짧은 배지: 할인 중/추천 등) */}
                  <div className="mt-1 flex items-center gap-1 text-base text-[#333]">
                    <img src="/icons/liv-line.svg" alt="" className="h-4 w-4" />
                    {product.badge || "추천"}
                  </div>
                  <p className="text-md">{product.name}</p>
                  <p className="mt-0.5 text-lg font-medium">{product.price.toLocaleString()}원</p>
                </button>
              ))}
            </div>
          </section>

          {/* 운영시간 — 로그인 상태에서만 참고 이미지처럼 표시 */}
          {loggedIn ? (
            <section className="mt-12 border-t border-[#eee] pt-5">
              <h2 className="text-lg font-semibold">매장 운영 시간</h2>
              <p className="mt-1 text-sm text-[#999]">영업중 · 11:00 마감</p>
              <p className="mt-6 text-xs text-[#999]">· 정규 영업시간</p>
              <p className="mt-2 text-sm">평　　일　오전 10시 ~ 오후 11시</p>
              <p className="text-sm">주말, 공휴일　오전 9시 ~ 오후 11시</p>
              <p className="mt-3 text-sm text-[#999]">· 9월 휴일　 <span className="font-semibold text-[#EE4908]">7일, 21일</span></p>
              <p className="mt-3 text-sm text-[#EE4908]">* 추석 연휴 정상 운영됩니다.</p>
            </section>
          ) : null}
        </main>

        <Footer />
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
