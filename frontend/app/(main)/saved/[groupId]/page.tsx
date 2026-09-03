// app/(main)/saved/[groupId]/page.tsx
// ✅ 참고 이미지(Frame 135, "이번주 장보기" 리스트 상세) 기준 전면 재작성.
//   - 상단: 뒤로가기/휴지통 아이콘 헤더 대신 타이틀+날짜 좌측, "장보러 가기"(스캔 아이콘 포함)
//     우측 — 예전엔 "동선 보기/장보기 시작" 버튼 2개 + "AI에게 물어보기" 버튼까지 세 줄이었는데,
//     "장보기 시작(스캔)"을 이 상단 링크 하나로 합쳐서 이미지처럼 한 줄에 다 들어가게 함.
//   - 리스트 삭제는 이미지에 아이콘이 안 보여서 헤더에서 빼고, 목록 하단에 텍스트 링크로 이동.
//   - 상품 행: 체크박스 + 정사각 이미지 + 이름/카테고리/위치("444 >" 자리, 실제 데이터인
//     locationId를 lib/product-location.ts 배치 조회로 받아와서 채움 — 가짜 숫자 하드코딩 안 함,
//     클릭하면 기존 ProductLocationDialog로 지도 위치를 보여줌) + 수량스테퍼/가격.
//   - 하단: "동선"(넓은 알약형) + 리브(원형, AI) — 홈 하단탭바 리브 버튼과 동일한 스타일 재사용.
"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { RiMapLine, RiQrScanLine, RiDeleteBin6Line, RiArrowRightSLine, RiCloseLine } from "@remixicon/react";

import { Checkbox } from "@/components/ui/checkbox";
import { QuantityStepper } from "@/components/domain/quantity-stepper";
import { StoreMapDialog } from "@/components/domain/store-map-dialog";
import { ProductLocationDialog } from "@/components/domain/product-location-dialog";
import { BirthDatePicker } from "@/components/domain/birth-date-picker";
import {readCartGroups, loadCartGroups,updateCartGroups, updateCartGroupInfo, deleteCartGroup, syncUpdateServerCart, syncRemoveFromServerCart, type CartGroup,} from "@/lib/cart-storage";
import { fetchInventoryBatch, pickLocation } from "@/lib/product-location";
import { useOpenAiChat } from "@/lib/use-open-ai-chat";
import { apiFetch } from "@/lib/api-client";
import { useBottomBarVisibility } from "@/components/layout/bottom-bar-visibility-context";
import { isGroupCompleted } from "@/lib/completed-groups";

export default function SavedGroupDetailPage() {
  const router = useRouter();
  const params = useParams();
  const groupId = Number(params.groupId);

  const [group, setGroup] = useState<CartGroup | null>(null);
  const [routeOpen, setRouteOpen] = useState(false);
  const openAiChat = useOpenAiChat();

  // ✅ 수정(2026-09) — 백엔드에 실제 cart_group.status(ACTIVE|COMPLETED)가 생겨서 이제
  //   그걸 우선 사용. 다만 체크아웃 성공 시 서버가 실제로 COMPLETED로 바꿔주는 호출이
  //   아직 안 붙어있어서(markCompleted()가 정의만 되고 어디서도 안 불림 — 확인 필요),
  //   로컬 플래그(lib/completed-groups.ts)도 함께 OR로 봐서 최소한 이번 결제 이후
  //   같은 브라우저에서는 확실히 잠기게 이중 안전장치를 둠.
  const completed = group?.status === "COMPLETED" || isGroupCompleted(groupId);

  // ✅ 리스트 상세(담은 목록)는 자체 하단 액션바(동선/리브)가 이미 있어서, 전역
  //   하단탭바는 숨김 — 스캔 화면과 같은 패턴.
  const { setHidden: setBottomBarHidden } = useBottomBarVisibility();
  useEffect(() => {
    setBottomBarHidden(true);
    return () => setBottomBarHidden(false);
  }, [setBottomBarHidden]);
  // ✅ 이 리스트에 이미 연결된 AI 대화가 있는지 확인 — 있으면 "이어서 물어보기"로 표시.
  //   백엔드 group_id 컬럼은 추가돼있는데, 세션 목록 응답에 groupId를 내려주는지는
  //   아직 확인 전이라 실패하면 그냥 "새로 물어보기"로 폴백합니다.
  const [linkedSessionId, setLinkedSessionId] = useState<string | null>(null);

  // ✅ 상품별 매대 위치("444 >" 자리) — 배치 조회 1번으로 화면에 보이는 skuId 전부 받아옴
  const [locationBySkuId, setLocationBySkuId] = useState<Map<number, string>>(new Map());
  const [locationDialogSkuId, setLocationDialogSkuId] = useState<number | null>(null);

  useEffect(() => {
    loadCartGroups()
      .then((groups) => setGroup(groups.find((g) => g.id === groupId) ?? null))
      .catch(() => setGroup(readCartGroups().find((g) => g.id === groupId) ?? null));

    apiFetch<{ sessionId: string; groupId?: number | null }[]>("/api/chat/sessions")
      .then((sessions) => {
        const linked = sessions.find((s) => s.groupId === groupId);
        setLinkedSessionId(linked?.sessionId ?? null);
      })
      .catch(() => setLinkedSessionId(null));
  }, [groupId]);

  useEffect(() => {
    if (!group || group.products.length === 0) return;
    fetchInventoryBatch(group.products.map((p) => p.id))
      .then((map) => {
        const next = new Map<number, string>();
        map.forEach((items, skuId) => {
          const loc = pickLocation(items);
          if (loc) next.set(skuId, loc.locationId);
        });
        setLocationBySkuId(next);
      })
      .catch(() => setLocationBySkuId(new Map()));
    // group.products 배열 참조가 수량/체크 변경마다 새로 생겨서, skuId 구성 자체가 바뀔 때만
    // 다시 부르도록 join으로 의존성을 좁혀둠
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group?.products.map((p) => p.id).join(",")]);

  const handleQuantityChange = (
    productId: number,
    quantity: number
  ) => {
    const next = updateCartGroups((gs) =>
      gs.map((g) =>
        g.id !== groupId
          ? g
          : {
              ...g,
              products: g.products.map((p) =>
                p.id === productId
                  ? { ...p, quantity }
                  : p
              ),
            }
      )
    );

    setGroup(next.find((g) => g.id === groupId) ?? null);

    // 실제 서버 장바구니 PATCH
    syncUpdateServerCart(next.find((g) => g.id === groupId)?.products.find((p) => p.id === productId)?.cartItemId, quantity);
  };

  const handleToggleChecked = (productId: number) => {
    const next = updateCartGroups((gs) =>
      gs.map((g) =>
        g.id !== groupId
          ? g
          : {
              ...g,
              products: g.products.map((p) =>
                p.id === productId
                  ? { ...p, checked: !p.checked }
                  : p
              ),
            }
      )
    );

    setGroup(next.find((g) => g.id === groupId) ?? null);
    const changed = next.find((g) => g.id === groupId)?.products.find((p) => p.id === productId);
    syncUpdateServerCart(changed?.cartItemId, undefined, changed?.checked);
  };

  const handleRemove = (productId: number) => {
    const next = updateCartGroups((gs) =>
      gs.map((g) =>
        g.id !== groupId
          ? g
          : {
              ...g,
              products: g.products.filter(
                (p) => p.id !== productId
              ),
            }
      )
    );

    setGroup(next.find((g) => g.id === groupId) ?? null);

    // 실제 서버 장바구니 DELETE
    syncRemoveFromServerCart(group?.products.find((p) => p.id === productId)?.cartItemId);
  };

  if (!group) {
    return (
      <div className="mx-auto max-w-lg p-4 sm:max-w-xl">
        <p className="py-10 text-center text-sm text-muted-foreground">
          리스트를 찾을 수 없어요.
        </p>
      </div>
    );
  }

  const locationDialogProduct = group.products.find((p) => p.id === locationDialogSkuId) ?? null;

  return (
    <div className="mx-auto w-full max-w-lg px-4 pb-28 pt-5 sm:max-w-xl md:max-w-2xl md:px-8 md:pt-8 lg:max-w-3xl">
      {/* 상단 헤더 — 타이틀+날짜(좌) / 스캔 아이콘+"장보러 가기"(우, "장보기 시작" 겸용) */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-xl font-bold">{group.title}</h1>
            {completed && (
              <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                결제 완료
              </span>
            )}
          </div>
          <div className="mt-1">
            <BirthDatePicker
              value={group.shoppingDate ?? ""}
              onChange={(value) => {
                if (completed) return;
                updateCartGroupInfo(groupId, { shoppingDate: value || null }).then((next) =>
                  setGroup(next.find((g) => g.id === groupId) ?? null)
                );
              }}
              minYear={new Date().getFullYear()}
              maxYear={new Date().getFullYear() + 1}
              placeholder="장 볼 날짜 추가하기"
              title="장 볼 날짜"
            />
          </div>
        </div>

        {!completed && (
          <button
            type="button"
            onClick={() => router.push(`/scan?group=${groupId}`)}
            className="mt-0.5 flex shrink-0 items-center gap-1 text-sm font-medium text-foreground"
          >
            <RiQrScanLine size={18} />
            장보러 가기
          </button>
        )}
      </div>

      {completed && (
        <p className="mt-2 text-xs text-muted-foreground">
          결제 완료된 리스트예요. 더 이상 수정할 수 없어요 — 전자영수증은 마이페이지에서 확인할 수 있어요.
        </p>
      )}

      {/* 상품 목록 */}
      <div className="mt-5 divide-y divide-border">
        {group.products.length === 0 && (
          <p className="py-10 text-center text-sm text-muted-foreground">
            아직 담긴 상품이 없어요. 검색이나 "장보러 가기"에서 담아보세요.
          </p>
        )}

        {group.products.map((product) => {
          const productTotal = product.price * product.quantity;
          const locationText = locationBySkuId.get(product.id);

          return (
            <div key={product.id} className="flex gap-3 py-4">
              {/* 체크 */}
              <div className="pt-1">
                <Checkbox checked={product.checked} onChange={() => !completed && handleToggleChecked(product.id)} />
              </div>

              {/* 상품 이미지 */}
              <div className="h-20 w-20 shrink-0 overflow-hidden rounded-sm border border-border bg-muted">
                {product.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={product.image} alt="" className="h-full w-full object-cover" />
                ) : null}
              </div>

              {/* 상품 정보 */}
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="line-clamp-2 text-sm leading-5">{product.name}</p>

                  {!completed && (
                    <button
                      type="button"
                      aria-label="상품 삭제"
                      onClick={() => handleRemove(product.id)}
                      className="shrink-0 text-muted-foreground hover:text-foreground"
                    >
                      <RiCloseLine size={22} />
                    </button>
                  )}
                </div>

                <p className="mt-0.5 text-xs text-muted-foreground">{product.category}</p>

                {locationText && (
                  <button
                    type="button"
                    onClick={() => setLocationDialogSkuId(product.id)}
                    className="mt-0.5 flex items-center text-sm text-muted-foreground"
                  >
                    {locationText}
                    <RiArrowRightSLine size={16} />
                  </button>
                )}

                {/* 수량 + 상품 총액 */}
                <div className="mt-2 flex items-center justify-between gap-2">
                  {completed ? (
                    <span className="text-sm text-muted-foreground">{product.quantity}개</span>
                  ) : (
                    <QuantityStepper
                      quantity={product.quantity}
                      onChange={(q) => handleQuantityChange(product.id, q)}
                      size="lg"
                    />
                  )}

                  <p className="shrink-0 text-base font-semibold">{productTotal.toLocaleString()}원</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ✅ Figma엔 삭제 아이콘이 헤더에 없어서, 목록 삭제 기능은 여기 텍스트 링크로 남겨둠
          (기능 자체는 유지, 위치만 눈에 덜 띄게 이동) */}
      {group.products.length > 0 && (
        <button
          type="button"
          onClick={() => {
            if (confirm(`"${group.title}" 리스트를 삭제할까요?`)) {
              void deleteCartGroup(group.id).then(() => router.push("/saved"));
            }
          }}
          className="mt-2 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <RiDeleteBin6Line size={14} />
          리스트 삭제
        </button>
      )}

      {/* 하단 액션 — 홈 하단탭바의 리브(원형) 버튼과 동일한 스타일(h-16, rounded-full,
          backdrop-blur) 재사용. 전역 하단탭바 위에 살짝 띄워서 겹치지 않게 함. */}
      <div className="fixed inset-x-0 bottom-4 z-40 mx-auto flex w-full max-w-lg items-center gap-2 px-4 sm:max-w-xl md:max-w-2xl md:px-8 lg:max-w-3xl">
        <button
          type="button"
          onClick={() => setRouteOpen(true)}
          className="flex h-16 flex-1 items-center justify-center gap-1.5 rounded-full border border-border bg-white/20 text-sm font-medium backdrop-blur-2xl"
        >
          <RiMapLine size={20} />
          동선
        </button>

        <button
          type="button"
          onClick={() => openAiChat(group ? `"${group.title}" 리스트 관련해서 물어볼게` : undefined, groupId)}
          className="flex h-16 w-16 shrink-0 flex-col items-center justify-center gap-0.5 rounded-full border border-border bg-white/20 text-xs backdrop-blur-2xl"
        >
          <img src="/icons/liv-line.svg" alt="" aria-hidden="true" className="h-[22px] w-[22px] shrink-0" />
          {linkedSessionId ? "이어서" : "리브"}
        </button>
      </div>

      <StoreMapDialog
        open={routeOpen}
        onClose={() => setRouteOpen(false)}
        groupId={groupId}
        collectedIds={new Set()}
      />

      {locationDialogProduct && (
        <ProductLocationDialog
          open
          onClose={() => setLocationDialogSkuId(null)}
          skuId={locationDialogProduct.id}
          name={locationDialogProduct.name}
          price={locationDialogProduct.price}
        />
      )}
    </div>
  );
}