"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeftIcon,
  ChevronDownIcon,
  DoorClosedIcon,
  MinusIcon,
  PercentIcon,
  PlusIcon,
  ReceiptTextIcon,
  SearchIcon,
  ShoppingBasketIcon,
  Trash2Icon,
  UtensilsCrossedIcon,
  XCircleIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemSeparator,
  ItemTitle,
} from "@/components/ui/item";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useAuth } from "@/components/auth-provider";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/data-states";
import { PageHeader } from "@/components/layout/page-header";
import { usePageTitle } from "@/components/layout/page-title";
import { BillSummary } from "@/components/sales/bill-summary";
import { CheckoutDialog } from "@/components/sales/checkout-dialog";
import { useNotify } from "@/hooks/use-notify";
import { useNow } from "@/hooks/use-now";
import api from "@/lib/api";
import { computeBill } from "@/lib/billing";
import { useBranchCode } from "@/lib/branch";
import { formatDuration, formatMoney, formatNumber, formatTime } from "@/lib/format";
import { can } from "@/lib/permissions";
import type { FloorStaff, Order, Product, Room } from "@/lib/types";
import { cn } from "@/lib/utils";

type Line = { productId: number; quantity: number };

interface Adjustments {
  discountPercent: number;
  discountAmount: number;
  hourlyDiscountPercent: number;
  hourlyDiscountAmount: number;
  taxPercent: number;
}

type PercentKey = "discountPercent" | "hourlyDiscountPercent";
type AmountKey = "discountAmount" | "hourlyDiscountAmount";

const adjustmentsOf = (order: Order): Adjustments => ({
  discountPercent: order.discountPercent,
  discountAmount: Number(order.discountAmount),
  hourlyDiscountPercent: order.hourlyDiscountPercent,
  hourlyDiscountAmount: Number(order.hourlyDiscountAmount),
  taxPercent: order.taxPercent,
});

const quantitiesOf = (order: Order) => {
  const map = new Map<number, number>();
  for (const item of order.items) map.set(item.productId, (map.get(item.productId) ?? 0) + item.quantity);
  return map;
};

const NONE = "none";
const ALL = "ALL";
const OTHER = "OTHER";
// Label, percent and amount on one line; the label goes on top when the card is narrow.
const ADJUSTMENT_ROW =
  "grid grid-cols-[6rem_minmax(0,1fr)] items-center gap-2 @sm/field-group:grid-cols-[minmax(0,1fr)_6rem_8rem]";
const ADJUSTMENT_LABEL = "col-span-2 font-normal @sm/field-group:col-span-1";
const clampPercent = (value: string) => Math.min(100, Math.max(0, Number(value) || 0));
const nonNegative = (value: string) => Math.max(0, Math.floor(Number(value) || 0));

export default function RoomDetailPage() {
  const params = useParams<{ id: string }>();
  const roomId = Number(params.id);
  const branch = useBranchCode();
  const router = useRouter();
  const { user } = useAuth();
  const notify = useNotify();
  const now = useNow();
  const canOperate = can(user, "sales.operate");
  const canCancel = can(user, "sales.cancel");
  const roomsPath = `/${branch}/sales/rooms`;

  const [room, setRoom] = useState<Room | null>(null);
  const [order, setOrder] = useState<Order | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  // Quantities other open sessions have ordered (stock is deducted at checkout).
  const [otherPending, setOtherPending] = useState<Map<number, number>>(new Map());
  const [staff, setStaff] = useState<FloorStaff[]>([]);
  const [adjust, setAdjust] = useState<Adjustments | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState(ALL);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

  usePageTitle(room ? `Phòng ${room.name}` : null);

  // Item edits are sent one after another, each built on the latest saved
  // order, so quick taps never overwrite each other.
  const orderRef = useRef<Order | null>(null);
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const pendingRef = useRef(0);

  const applyOrder = useCallback((next: Order) => {
    orderRef.current = next;
    setOrder(next);
  }, []);

  useEffect(() => {
    const load = async () => {
      try {
        const roomRes = await api.get<Room>(`/rooms/${roomId}`);
        setRoom(roomRes.data);
        if (!roomRes.data.activeOrderId) return;

        const [orderRes, productsRes, staffRes] = await Promise.all([
          api.get<Order>(`/orders/${roomRes.data.activeOrderId}`),
          canOperate
            ? api.get<Product[]>("/products", { params: { branch } })
            : Promise.resolve({ data: [] as Product[] }),
          canOperate
            ? api.get<FloorStaff[]>("/users/floor-staff", { params: { branch } })
            : Promise.resolve({ data: [] as FloorStaff[] }),
        ]);
        const mine = quantitiesOf(orderRes.data);
        setOtherPending(new Map(productsRes.data.map((p) => [p.id, (p.pendingQuantity ?? 0) - (mine.get(p.id) ?? 0)])));
        applyOrder(orderRes.data);
        setAdjust(adjustmentsOf(orderRes.data));
        setProducts(productsRes.data);
        setStaff(staffRes.data);
      } catch (error) {
        notify.error(error, "Không thể tải dữ liệu phòng");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [roomId, branch, canOperate, applyOrder, notify]);

  // Pick up changes made on another device (and notice a closed session).
  useEffect(() => {
    if (!order) return;
    const orderId = order.id;
    const timer = setInterval(async () => {
      if (pendingRef.current > 0) return;
      try {
        const res = await api.get<Order>(`/orders/${orderId}`);
        if (pendingRef.current > 0) return;
        if (res.data.status !== "PENDING") {
          notify.success(`Phòng ${room?.name ?? ""} đã được đóng trên máy khác`);
          router.push(roomsPath);
          return;
        }
        if (res.data.updatedAt !== orderRef.current?.updatedAt) {
          applyOrder(res.data);
          setAdjust(adjustmentsOf(res.data));
        }
      } catch {
        // Next tick retries; errors of user actions are reported where they happen.
      }
    }, 15_000);
    return () => clearInterval(timer);
  }, [order?.id, room?.name, applyOrder, notify, router, roomsPath]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveOrder = useCallback(
    (buildPatch: (current: Order) => Record<string, unknown>) => {
      pendingRef.current += 1;
      queueRef.current = queueRef.current.then(async () => {
        const current = orderRef.current;
        try {
          if (!current) return;
          const res = await api.patch<Order>(`/orders/${current.id}`, buildPatch(current));
          applyOrder(res.data);
        } catch (error) {
          notify.error(error, "Không thể lưu thay đổi");
        } finally {
          pendingRef.current -= 1;
        }
      });
      return queueRef.current;
    },
    [applyOrder, notify],
  );

  const changeItems = (change: (lines: Line[]) => Line[]) =>
    saveOrder((current) => ({
      items: change(current.items.map(({ productId, quantity }) => ({ productId, quantity }))).filter(
        (l) => l.quantity > 0,
      ),
    }));

  const addProduct = (product: Product) =>
    changeItems((lines) =>
      lines.some((l) => l.productId === product.id)
        ? lines.map((l) => (l.productId === product.id ? { ...l, quantity: l.quantity + 1 } : l))
        : [...lines, { productId: product.id, quantity: 1 }],
    );

  const setQuantity = (productId: number, quantity: number) =>
    changeItems((lines) => lines.map((l) => (l.productId === productId ? { ...l, quantity } : l)));

  const saveAdjustments = async (fields: (keyof Adjustments)[]) => {
    if (!adjust) return;
    const patch = Object.fromEntries(fields.map((f) => [f, adjust[f]]));
    await saveOrder(() => patch);
    if (orderRef.current) setAdjust(adjustmentsOf(orderRef.current));
  };

  const setStaffMember = (field: "cskhId" | "serverId", value: string) =>
    saveOrder(() => ({ [field]: value === NONE ? null : Number(value) }));

  const cancelSession = async () => {
    if (!order) return;
    try {
      await queueRef.current;
      await api.post(`/orders/${order.id}/cancel`);
      notify.success(`Đã hủy phiên, phòng ${room?.name ?? ""} đã trống`);
      router.push(roomsPath);
    } catch (error) {
      notify.error(error, "Không thể hủy phiên hát");
      return false;
    }
  };

  const ordered = useMemo(() => (order ? quantitiesOf(order) : new Map<number, number>()), [order]);
  const categories = useMemo(() => {
    const names = new Map<string, string>();
    for (const p of products) names.set(p.categoryId ? String(p.categoryId) : OTHER, p.category?.name ?? "Khác");
    return [...names].sort(([, a], [, b]) => a.localeCompare(b, "vi"));
  }, [products]);

  if (loading) {
    return (
      <>
        <Skeleton className="h-12 w-72" />
        <div className="grid gap-4 @4xl/main:grid-cols-[minmax(0,1fr)_26rem]">
          <Skeleton className="h-[28rem] rounded-xl" />
          <Skeleton className="h-[28rem] rounded-xl" />
        </div>
      </>
    );
  }

  if (!order || !adjust) {
    return (
      <EmptyState
        icon={DoorClosedIcon}
        title={`Phòng ${room?.name ?? roomId} không có phiên hát đang mở`}
        description="Phiên có thể vừa được thanh toán hoặc hủy trên máy khác."
      >
        <Button asChild variant="outline">
          <Link href={roomsPath}>
            <ArrowLeftIcon data-icon="inline-start" />
            {canOperate ? "Về sơ đồ phòng" : "Về danh sách phòng"}
          </Link>
        </Button>
      </EmptyState>
    );
  }

  // Room price fixed when the session opened (Order.pricePerHour).
  const bill = computeBill({
    startTime: new Date(order.startTime),
    endTime: now,
    pricePerHour: Number(order.pricePerHour),
    items: order.items.map((i) => ({ price: Number(i.price), quantity: i.quantity })),
    ...adjust,
  });

  const keyword = search.trim().toLowerCase();
  const menu = products.filter(
    (p) =>
      p.name.toLowerCase().includes(keyword) &&
      (category === ALL || (p.categoryId ? String(p.categoryId) : OTHER) === category),
  );
  const available = (p: Product) => p.stockQuantity - (otherPending.get(p.id) ?? 0) - (ordered.get(p.id) ?? 0);
  const cskhStaff = staff.filter((s) => s.position === "CSKH");
  const serverStaff = staff.filter((s) => s.position === "SERVER");
  const itemCount = order.items.reduce((sum, i) => sum + i.quantity, 0);
  const activeAdjustments = [
    adjust.discountPercent || adjust.discountAmount,
    adjust.hourlyDiscountPercent || adjust.hourlyDiscountAmount,
    adjust.taxPercent,
  ].filter(Boolean).length;

  // Percent follows the live bill (the server applies it at checkout);
  // typing an amount makes it a fixed sum.
  const adjustmentRow = (id: string, label: string, percentKey: PercentKey, amountKey: AmountKey) => (
    <Field className={ADJUSTMENT_ROW}>
      <FieldLabel htmlFor={`${id}-percent`} className={ADJUSTMENT_LABEL}>
        {label}
      </FieldLabel>
      <InputGroup>
        <InputGroupInput
          id={`${id}-percent`}
          type="number"
          inputMode="decimal"
          min={0}
          max={100}
          className="text-right tabular-nums"
          value={adjust[percentKey]}
          onChange={(e) => setAdjust({ ...adjust, [percentKey]: clampPercent(e.target.value) })}
          onBlur={() => saveAdjustments([percentKey, amountKey])}
        />
        <InputGroupAddon align="inline-end">
          <InputGroupText>%</InputGroupText>
        </InputGroupAddon>
      </InputGroup>
      <InputGroup>
        <InputGroupInput
          type="number"
          inputMode="numeric"
          min={0}
          aria-label={`${label} (số tiền)`}
          className="text-right tabular-nums"
          value={adjust[percentKey] > 0 ? bill[amountKey] : adjust[amountKey]}
          onChange={(e) => setAdjust({ ...adjust, [percentKey]: 0, [amountKey]: nonNegative(e.target.value) })}
          onBlur={() => saveAdjustments([percentKey, amountKey])}
        />
        <InputGroupAddon align="inline-end">
          <InputGroupText>đ</InputGroupText>
        </InputGroupAddon>
      </InputGroup>
    </Field>
  );

  const staffSelect = (field: "cskhId" | "serverId", label: string, people: FloorStaff[]) => (
    <Field>
      <FieldLabel htmlFor={`staff-${field}`}>{label}</FieldLabel>
      <Select value={order[field] ? String(order[field]) : NONE} onValueChange={(v) => setStaffMember(field, v)}>
        <SelectTrigger id={`staff-${field}`} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value={NONE}>Chưa chọn</SelectItem>
            {people.map((s) => (
              <SelectItem key={s.id} value={String(s.id)}>
                {s.fullName}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </Field>
  );

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            Phòng {room?.name ?? roomId}
            <Badge variant="outline">{room?.type === "VIP" ? "VIP" : "Thường"}</Badge>
          </span>
        }
        description={`Vào lúc ${formatTime(order.startTime)} · đã hát ${formatDuration(bill.durationMinutes)} · ${formatMoney(order.pricePerHour)}/giờ`}
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href={roomsPath}>
                <ArrowLeftIcon data-icon="inline-start" />
                {canOperate ? "Sơ đồ phòng" : "Phòng đang phục vụ"}
              </Link>
            </Button>
            {canCancel && (
              <Button variant="outline" onClick={() => setCancelOpen(true)}>
                <XCircleIcon data-icon="inline-start" />
                Hủy phiên
              </Button>
            )}
          </>
        }
      />

      <div
        className={cn(
          "grid items-start gap-4 md:gap-6",
          canOperate && "@4xl/main:grid-cols-[minmax(0,1fr)_24rem] @6xl/main:grid-cols-[minmax(0,1fr)_28rem]",
        )}
      >
        {canOperate && (
          <Card className="@container/menu min-w-0">
            <CardHeader>
              <CardTitle>Thực đơn</CardTitle>
              <CardDescription>Chạm vào món để thêm 1 phần vào hóa đơn.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <InputGroup>
                <InputGroupAddon>
                  <SearchIcon />
                </InputGroupAddon>
                <InputGroupInput
                  placeholder="Tìm món..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  aria-label="Tìm món"
                />
              </InputGroup>
              {categories.length > 1 && (
                <ToggleGroup
                  type="single"
                  variant="outline"
                  size="sm"
                  spacing={2}
                  value={category}
                  onValueChange={(value) => value && setCategory(value)}
                  className="w-full flex-wrap"
                  aria-label="Danh mục"
                >
                  <ToggleGroupItem value={ALL}>Tất cả</ToggleGroupItem>
                  {categories.map(([id, name]) => (
                    <ToggleGroupItem key={id} value={id}>
                      {name}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              )}
              {menu.length === 0 ? (
                <EmptyState
                  icon={UtensilsCrossedIcon}
                  title={products.length === 0 ? "Chưa có mặt hàng" : "Không tìm thấy món"}
                  description={
                    products.length === 0
                      ? "Quản lý thêm mặt hàng trong Cài đặt bán hàng."
                      : "Thử từ khóa khác hoặc chọn danh mục khác."
                  }
                />
              ) : (
                <div className="grid grid-cols-2 gap-2 @lg/menu:grid-cols-3 @3xl/menu:grid-cols-4">
                  {menu.map((product) => {
                    const left = available(product);
                    const inBill = ordered.get(product.id);
                    return (
                      <Button
                        key={product.id}
                        variant="outline"
                        className="relative h-auto min-h-24 flex-col items-start justify-between gap-2 p-3 text-left whitespace-normal"
                        onClick={() => addProduct(product)}
                      >
                        {inBill && <Badge className="absolute top-2 right-2 tabular-nums">×{inBill}</Badge>}
                        <span className="line-clamp-2 pr-8 font-medium">{product.name}</span>
                        <span className="flex w-full flex-col gap-0.5">
                          <span className="font-semibold tabular-nums">{formatNumber(product.price)}</span>
                          {product.trackStock && (
                            <span
                              className={cn(
                                "text-xs font-normal",
                                left <= 0 ? "text-destructive" : "text-muted-foreground",
                              )}
                            >
                              {left <= 0 ? "Hết hàng trong kho" : `Còn ${formatNumber(left)} ${product.unit}`}
                            </span>
                          )}
                        </span>
                      </Button>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <Card
          className={cn("min-w-0", canOperate && "order-first @4xl/main:order-none @4xl/main:sticky @4xl/main:top-4")}
        >
          <CardHeader>
            <CardTitle>Hóa đơn #{order.id}</CardTitle>
            <CardDescription>
              {itemCount} món · mở bởi {order.createdBy?.fullName ?? "—"}
            </CardDescription>
            <CardAction>
              <Badge variant="destructive">Đang hát</Badge>
            </CardAction>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {canOperate ? (
              <FieldGroup className="grid grid-cols-2 gap-3">
                {staffSelect("cskhId", "CSKH", cskhStaff)}
                {staffSelect("serverId", "Phục vụ", serverStaff)}
              </FieldGroup>
            ) : (
              <p className="text-sm text-muted-foreground">
                CSKH: {order.cskh?.fullName ?? "—"} · Phục vụ: {order.server?.fullName ?? "—"}
              </p>
            )}

            {order.items.length === 0 ? (
              <EmptyState
                className="border p-6 md:p-8"
                icon={ShoppingBasketIcon}
                title="Chưa gọi món nào"
                description={canOperate ? "Chọn món ở thực đơn để thêm vào hóa đơn." : undefined}
              />
            ) : (
              <ItemGroup className="rounded-lg border">
                {order.items.map((item, index) => (
                  <Fragment key={item.id}>
                    {index > 0 && <ItemSeparator />}
                    <Item size="sm" className="rounded-none px-3">
                      <ItemContent className="min-w-32">
                        <ItemTitle>{item.product.name}</ItemTitle>
                        <ItemDescription className="tabular-nums">
                          {formatNumber(item.price)} / {item.product.unit}
                        </ItemDescription>
                      </ItemContent>
                      <ItemActions className="ml-auto">
                        {canOperate ? (
                          <InputGroup className="h-8 w-26">
                            <InputGroupAddon>
                              <InputGroupButton
                                size="icon-xs"
                                aria-label="Bớt 1"
                                onClick={() => setQuantity(item.productId, item.quantity - 1)}
                              >
                                <MinusIcon />
                              </InputGroupButton>
                            </InputGroupAddon>
                            <InputGroupInput
                              // Remount when the saved quantity changes.
                              key={`${item.id}-${item.quantity}`}
                              inputMode="numeric"
                              aria-label={`Số lượng ${item.product.name}`}
                              className="text-center tabular-nums"
                              defaultValue={item.quantity}
                              onBlur={(e) => {
                                const quantity = nonNegative(e.target.value);
                                if (quantity !== item.quantity) setQuantity(item.productId, quantity);
                              }}
                              onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                            />
                            <InputGroupAddon align="inline-end">
                              <InputGroupButton
                                size="icon-xs"
                                aria-label="Thêm 1"
                                onClick={() => setQuantity(item.productId, item.quantity + 1)}
                              >
                                <PlusIcon />
                              </InputGroupButton>
                            </InputGroupAddon>
                          </InputGroup>
                        ) : (
                          <span className="text-muted-foreground tabular-nums">×{item.quantity}</span>
                        )}
                        <span className="w-20 text-right font-medium tabular-nums">
                          {formatNumber(Number(item.price) * item.quantity)}
                        </span>
                        {canOperate && (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Xóa ${item.product.name}`}
                            onClick={() => setQuantity(item.productId, 0)}
                          >
                            <Trash2Icon />
                          </Button>
                        )}
                      </ItemActions>
                    </Item>
                  </Fragment>
                ))}
              </ItemGroup>
            )}

            {canOperate && (
              <Collapsible defaultOpen={activeAdjustments > 0}>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="group w-full justify-between">
                    <span className="flex items-center gap-2">
                      <PercentIcon />
                      Giảm giá & thuế
                      {activeAdjustments > 0 && <Badge variant="secondary">{activeAdjustments}</Badge>}
                    </span>
                    <ChevronDownIcon className="transition-transform group-data-[state=open]:rotate-180" />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-3">
                  <FieldGroup className="gap-3">
                    {adjustmentRow("discount", "Giảm giá món", "discountPercent", "discountAmount")}
                    {adjustmentRow("hourly-discount", "Giảm giá giờ", "hourlyDiscountPercent", "hourlyDiscountAmount")}
                            <Field className={ADJUSTMENT_ROW}>
                      <FieldLabel htmlFor="tax-percent" className={ADJUSTMENT_LABEL}>
                        Thuế VAT
                      </FieldLabel>
                      <InputGroup>
                        <InputGroupInput
                          id="tax-percent"
                          type="number"
                          inputMode="decimal"
                          min={0}
                          max={100}
                          className="text-right tabular-nums"
                          value={adjust.taxPercent}
                          onChange={(e) => setAdjust({ ...adjust, taxPercent: clampPercent(e.target.value) })}
                          onBlur={() => saveAdjustments(["taxPercent"])}
                        />
                        <InputGroupAddon align="inline-end">
                          <InputGroupText>%</InputGroupText>
                        </InputGroupAddon>
                      </InputGroup>
                      <span className="pr-3 text-right text-sm tabular-nums">{formatNumber(bill.taxAmount)} đ</span>
                    </Field>
                  </FieldGroup>
                </CollapsibleContent>
              </Collapsible>
            )}

            <Separator />
            <BillSummary
              bill={bill}
              percents={adjust}
              pricePerHour={Number(order.pricePerHour)}
              totalLabel="Tạm tính"
            />
          </CardContent>
          {canOperate && (
            <CardFooter>
              <Button
                size="lg"
                className="w-full"
                onClick={async () => {
                  // Let pending edits land before the server computes the bill.
                  await queueRef.current;
                  setCheckoutOpen(true);
                }}
              >
                <ReceiptTextIcon data-icon="inline-start" />
                Thanh toán · {formatMoney(bill.finalAmount)}
              </Button>
            </CardFooter>
          )}
        </Card>
      </div>

      <CheckoutDialog
        orderId={order.id}
        roomName={room?.name}
        open={checkoutOpen}
        onOpenChange={setCheckoutOpen}
        onCheckedOut={() => router.push(roomsPath)}
      />
      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title={`Hủy phiên hát phòng ${room?.name ?? ""}?`}
        description="Hóa đơn sẽ không được tính tiền, không trừ kho và phòng trở về trạng thái trống."
        confirmLabel="Hủy phiên"
        destructive
        onConfirm={cancelSession}
      />
    </>
  );
}
