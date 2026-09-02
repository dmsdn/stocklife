"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  RiNotification4Line,
  RiSearchLine,
  RiMapPinLine,
  RiBookmarkLine,
  RiBookmarkFill,
  RiUserLine,
  RiHome5Line,
  RiQrScanLine,
  RiSparkling2Line,
  RiArrowRightSLine,
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
  type RecommendedProduct,
  type RecentOrderSummary,
} from "@/lib/home-data";
import { readShoppingSession, type ShoppingSession } from "@/lib/shopping-session";
import { apiFetch, getAccessToken, isLoggedIn } from "@/lib/api-client";
import { getClientId } from "@/lib/client-id";
import { CartPicker } from "@/components/home/cart-picker";
import type { DashboardChatSession } from "@/components/home/home-dashboard";

function chatHeaders(): Record<string, string> {
  return getAccessToken() ? {} : { "X-Chat-Client-Id": getClientId() };
}

const products = [
  { id: 1, name: "상품 이름", price: 6666 },
  { id: 2, name: "상품 이름", price: 6666 },
  { id: 3, name: "상품 이름", price: 6666 },
  { id: 4, name: "상품 이름", price: 6666 },
  { id: 5, name: "상품 이름", price: 6666 },
  { id: 6, name: "상품 이름", price: 6666 },
  { id: 7, name: "상품 이름", price: 6666 },
  { id: 8, name: "상품 이름", price: 6666 },
];

export default function HomePage() {
  const router = useRouter();
  const openAiChat = useOpenAiChat();

  const [cartPickerOpen, setCartPickerOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<RecommendedProduct | null>(null);
  const [cartGroups, setCartGroups] = useState<CartGroup[]>([]);
  const [recentSession, setRecentSession] = useState<DashboardChatSession | null>(null);
  const [recentOrder, setRecentOrder] = useState<RecentOrderSummary | null>(null);
  const [wishlistCount, setWishlistCount] = useState<number | null>(null);
  const [shoppingSession, setShoppingSession] = useState<ShoppingSession | null>(null);
  const [loggedIn, setLoggedIn] = useState(false);

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

  const goSearch = () => router.push("/search");

  const openCartPicker = async (product: RecommendedProduct) => {
    setSelectedProduct(product);
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

  const handleAddToCart = async (groupId: number) => {
    if (!selectedProduct) return;
    const nextGroups = await addProductToCartGroup(groupId, {
      id: selectedProduct.id,
      name: selectedProduct.name,
      category: selectedProduct.category,
      price: selectedProduct.price,
      image: selectedProduct.image,
    });
    setCartGroups(nextGroups);
    closeCartPicker();
  };

  const handleCreateCart = async () => {
    if (!selectedProduct) return;
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
  };

  return (
    <div className="min-h-screen w-full overflow-x-hidden bg-[#f8f8f8] text-[#171717]">
      <div className="mx-auto min-h-screen w-full max-w-[390px] bg-[#f8f8f8]">
        {/* Header */}
        <header className="flex h-[55px] items-center justify-between px-4">
          <Link href="/" aria-label="홈">
            <img src="/icons/logo-shopping.svg" alt="STOCK LIFE" className="h-[17px] w-auto" />
          </Link>
          <Link href="/notifications" aria-label="알림" className="relative flex h-8 w-8 items-center justify-center">
            <RiNotification4Line size={20} />
            <span className="absolute right-[2px] top-[2px] h-1.5 w-1.5 rounded-full bg-[#EE4908]" />
          </Link>
        </header>

        <main className="px-3 pb-28">
          {/* 로그인 / 개인화 영역 */}
          {loggedIn ? (
            <section className="px-0 pb-3 pt-2">
              <p className="text-[14px] font-medium">은우님, 좋은 아침이에요</p>
              <p className="mt-1 text-[9px] text-[#999]">3일 뒤에 STOCKLIFE에 방문하실 예정이에요</p>
            </section>
          ) : null}

          {!loggedIn ? (
            <section className="rounded-[20px] border border-[#F4F4F4] bg-white p-5 shadow-[0_0_20px_rgba(0,0,0,0.05)]">
              <p className="text-[11px] text-[#aaa]">로그인하고</p>
              <div className="mt-1 flex items-center justify-between">
                <p className="text-[15px] font-medium">LIV와 함께 시작해보세요</p>
                <img src="/icons/liv-line.svg" alt="LIV" className="h-7 w-7" />
              </div>
              <button
                type="button"
                onClick={() => router.push("/auth/login")}
                className="mt-4 rounded-full border border-[#ffcbb9] bg-[#fff0eb] px-4 py-2 text-[12px] font-medium text-[#EE4908]"
              >
                STOCKLIFE 시작하기 &gt;
              </button>
            </section>
          ) : (
            <section className="rounded-[20px] border border-[#F4F4F4] bg-white p-5 shadow-[0_0_20px_rgba(0,0,0,0.05)]">
              <p className="text-[12px] font-medium">{shoppingSession ? "이번주 장보기" : "STOCK LIFE 매장에 방문해주셔서 감사합니다."}</p>
              <p className="mt-1 text-[9px] text-[#999]">영업중 · 11:00 마감</p>
              {shoppingSession ? (
                <>
                  <p className="mt-1 text-[12px] font-medium">다음 방문 날짜는 9월 9일이에요.</p>
                  <p className="mt-1 text-[9px] text-[#555]">9월 9일 운영시간</p>
                  <p className="text-[9px] text-[#555]">오전 10시 - 오후 11시</p>
                </>
              ) : null}
              <div className="mt-4 flex justify-center gap-4">
                <button onClick={() => router.push("/saved")} className="flex h-10 w-10 items-center justify-center rounded-full bg-[#fce3d9] text-[#EE4908]"><RiBookmarkLine size={19} /></button>
                <button onClick={() => router.push("/scan")} className="flex h-10 w-10 items-center justify-center rounded-full bg-[#fce3d9] text-[#EE4908]"><RiMapPinLine size={19} /></button>
                <button onClick={() => openAiChat()} className="flex h-10 w-10 items-center justify-center rounded-full bg-[#fce3d9] text-[#EE4908]"><img src="/icons/liv-line.svg" alt="LIV" className="h-5 w-5" /></button>
              </div>
            </section>
          )}

          {/* 검색 */}
          <button
            type="button"
            onClick={goSearch}
            className="mt-2 flex h-9 w-full items-center gap-2 rounded-[7px] border border-[#e5e5e5] bg-[#f2f2f2] px-3 text-left text-[10px] text-[#777]"
          >
            <RiSearchLine size={16} />
            찾고싶은 상품을 검색해보세요
          </button>

          {/* 바로가기 — ✅ 카드 그림 3개는 실제 디자인 에셋으로 교체 예정.
              /public/cards/plan-with-liv.png · product-search.png · store-map.png
              파일만 그 이름으로 넣으면 바로 반영됩니다(코드 수정 불필요). */}
          <section className="mt-2 grid grid-cols-2 gap-2">
            <button type="button" onClick={recentSession ? () => router.push(`/ai?session=${recentSession.sessionId}`) : () => openAiChat()} className="relative h-[118px] rounded-[20px] border border-[#F4F4F4] bg-white p-5 text-left shadow-[0_0_20px_rgba(0,0,0,0.05)]">
              <p className="text-[12px] font-medium">리브와 함께</p>
              <p className="text-[12px] font-medium">새 계획 세우기</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/cards/plan-with-liv.png"
                alt=""
                className="absolute bottom-2 left-1/2 h-[52px] w-auto -translate-x-1/2 object-contain"
              />
            </button>
            <div className="grid grid-rows-2 gap-2">
              <button type="button" onClick={goSearch} className="relative rounded-[20px] border border-[#F4F4F4] bg-white p-5 text-left shadow-[0_0_20px_rgba(0,0,0,0.05)]">
                <p className="text-[12px] font-medium">상품 검색</p>
                <p className="mt-1 text-[9px] leading-3 text-[#aaa]">구매하려는 상품을 직접<br />찾아보세요</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/cards/product-search.png" alt="" className="absolute bottom-3 right-3 h-7 w-7 object-contain" />
              </button>
              <button type="button" onClick={() => router.push("/scan")} className="relative rounded-[20px] border border-[#F4F4F4] bg-white p-5 text-left shadow-[0_0_20px_rgba(0,0,0,0.05)]">
                <p className="text-[10px] font-medium">매장 지도</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/cards/store-map.png" alt="" className="absolute bottom-2 right-2 h-7 w-7 object-contain" />
              </button>
            </div>
          </section>

          {/* 포인트 / 장보기 배너 */}
          {loggedIn ? (
            <section className="relative mt-2 h-[90px] overflow-hidden bg-[#F7AE93] p-5">
              <p className="text-[14px] font-bold">앱으로 결제하면 포인트 두 배</p>
              <p className="mt-1 text-[8px]">포인트를 적립할수록 더 많은 혜택이 있어요!</p>
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
              <p className="text-[16px] font-bold">장보기 리스트, 간편하게 만들어보세요</p>
              <p className="mt-1 text-[9px] text-[#2f6850]">리브에게 물어보고 3초 만에 리스트 완성!</p>
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
            <section className="mt-2 rounded-[20px] border border-[#F4F4F4] bg-white p-5 shadow-[0_0_20px_rgba(0,0,0,0.05)]">
              <p className="text-[9px] text-[#aaa]">이번달 소비 분석</p>
              <p className="mt-1 text-[11px] font-medium">카테고리 상품을 가장 많이 샀어요</p>
              <div className="mt-3 flex h-1.5 overflow-hidden rounded-full bg-[#eee]">
                <span className="w-[40%] bg-[#ffb7c8]" /><span className="w-[25%] bg-[#b8c9ff]" /><span className="w-[20%] bg-[#8cdda0]" /><span className="flex-1 bg-[#eee]" />
              </div>
              <div className="mt-2 space-y-1 text-[8px]">
                {[['정육','#ffb7c8'],['냉동','#b8c9ff'],['신선','#8cdda0'],['그 외','#ddd']].map(([label,dot]) => (
                  <div key={label} className="flex items-center justify-between"><span className="flex items-center gap-2"><i className="h-1.5 w-1.5 rounded-full" style={{backgroundColor: dot}} />{label}</span><span>9,999 원</span></div>
                ))}
              </div>
            </section>
          ) : null}

          {/* 추천 상품 */}
          <section className="mt-5">
            <div className="mb-2 flex items-center gap-1 px-1 text-[11px] font-semibold">
              <img src="/icons/liv-line.svg" alt="" className="h-4 w-4" />
              리브 추천
            </div>
            <div className="grid grid-cols-2 gap-x-2 gap-y-5">
              {products.map((product) => (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => openCartPicker({ ...product, category: "", image: "", reason: "", badge: "" })}
                  className="min-w-0 text-left"
                >
                  <div className="relative aspect-square rounded-[14px] bg-gradient-to-b from-[#d8d8d8] to-[#eeeeee]">
                    <span className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-white/80"><RiBookmarkLine size={16} /></span>
                  </div>
                  <div className="mt-1 flex items-center gap-1 text-[10px] text-[#333]"><img src="/icons/liv-line.svg" alt="" className="h-4 w-4" /> 인기상품</div>
                  <p className="text-[11px]">{product.name}</p>
                  <p className="mt-0.5 text-[13px] font-medium">{product.price.toLocaleString()}원</p>
                </button>
              ))}
            </div>
          </section>

          {/* 운영시간 — 로그인 상태에서만 참고 이미지처럼 표시 */}
          {loggedIn ? (
            <section className="mt-12 border-t border-[#eee] pt-5 pb-16">
              <h2 className="text-[13px] font-semibold">매장 운영 시간</h2>
              <p className="mt-1 text-[9px] text-[#999]">영업중 · 11:00 마감</p>
              <p className="mt-6 text-[8px] text-[#999]">· 정규 영업시간</p>
              <p className="mt-2 text-[9px]">평　　일　오전 10시 ~ 오후 11시</p>
              <p className="text-[9px]">주말, 공휴일　오전 9시 ~ 오후 11시</p>
              <p className="mt-3 text-[9px] text-[#999]">· 9월 휴일　 <span className="font-semibold text-[#EE4908]">7일, 21일</span></p>
              <p className="mt-3 text-[9px] text-[#EE4908]">* 추석 연휴 정상 운영됩니다.</p>
            </section>
          ) : null}
        </main>

        {/* 모바일 플로팅 하단바 */}
        <nav className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-w-[390px] items-center justify-center gap-2 px-4 pb-4" aria-label="하단 메뉴">
          <div className="flex h-14 items-center gap-1 rounded-full border border-white/70 bg-white/70 px-1 shadow-lg backdrop-blur-md">
            {(
              [
                ["/", "홈", RiHome5Line],
                ["/scan", "스캔", RiQrScanLine],
                ["/saved", "리스트", RiBookmarkLine],
                ["/mypage", "마이", RiUserLine],
              ] as const
            ).map(([href, label, Icon]) => (
              <Link key={String(href)} href={String(href)} className="flex h-12 w-14 flex-col items-center justify-center gap-0.5 text-[9px]">
                <Icon size={19} />
                {label}
              </Link>
            ))}
          </div>
          <Link href="/ai" className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-full border border-white/70 bg-white/70 shadow-lg backdrop-blur-md">
            <img src="/icons/liv-line.svg" alt="리브" className="h-5 w-5" />
            <span className="text-[9px]">리브</span>
          </Link>
        </nav>
      </div>

      <CartPicker
        open={cartPickerOpen}
        selectedProduct={selectedProduct}
        cartGroups={cartGroups}
        onClose={closeCartPicker}
        onAddToCart={handleAddToCart}
        onCreateCart={handleCreateCart}
      />
    </div>
  );
}
