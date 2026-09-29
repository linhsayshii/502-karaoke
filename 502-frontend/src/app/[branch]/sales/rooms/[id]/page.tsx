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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useAuth } from "@/components/auth-provider";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/data-states";
import { PageHeader } from "@/components/layout/page-header";
import { usePageTitle } from "@/components/layout/page-title";
import { BillSummary } from "@/components/sales/bill-summary";
import { CheckoutDialog } from "@/components/sales/checkout-dialog";
import { PrPicker } from "@/components/sales/pr-picker";
import { RoomPrList, type PrTimes } from "@/components/sales/room-pr-list";
import { useNotify } from "@/hooks/use-notify";
import { useNow } from "@/hooks/use-now";
import { usePolling } from "@/hooks/use-polling";
import api from "@/lib/api";
import { computeBill } from "@/lib/billing";
import { useBranchCode } from "@/lib/branch";
import { formatDuration, formatMoney, formatNumber, formatTime } from "@/lib/format";
import { can } from "@/lib/permissions";
import { adjustmentsOf } from "@/lib/discount-rules";
import type { Adjustments, FloorStaff, Order, Product, Room } from "@/lib/types";
import { cn } from "@/lib/utils";

type Line = { productId: number; quantity: number };

type PercentKey = "discountPercent" | "hourlyDiscountPercent";
type AmountKey = "discountAmount" | "hourlyDiscountAmount";

// A bill line as shown: saved, or tapped and not saved yet.
type ShownLine = Line & { price: number; name: string; unit: string };

const quantitiesOf = (lines: Line[]) => {
  const map = new Map<number, number>();
  for (const line of lines) map.set(line.productId, (map.get(line.productId) ?? 0) + line.quantity);
  return map;
};

const linesOf = (order: Order): Line[] => order.items.map(({ productId, quantity }) => ({ productId, quantity }));

const NONE = "none";
const ALL = "ALL";
const OTHER = "OTHER";
// Label, percent and amount on one line; the label goes on top when the card is narrow.
const ADJUSTMENT_ROW =
  "grid grid-cols-[6rem_minmax(0,1fr)] items-center gap-2 @sm/field-group:grid-cols-[minmax(0,1fr)_6rem_8rem]";
const ADJUSTMENT_LABEL = "col-span-2 font-normal @sm/field-group:col-span-1";
const clampPercent = (value: string) => Math.min(100, Math.max(0, Number(value) || 0));
const nonNegative = (value: string) => Math.max(0, Math.floor(Number(value) || 0));
// Side by side, both cards are as tall as the menu card showing 10 dishes
// (header, tabs, search and one line of categories above them), never taller
// than the screen; longer lists scroll inside the card.
const PANEL_HEIGHT = "@2xl/main:h-[min(61rem,calc(100svh-8rem))]";

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
  const canAssignPr = can(user, "pr.assign");
  // The left card: the menu for who sells, the PR/KTV tiles for who assigns them.
  const showLeft = canOperate || canAssignPr;
  const staffView = user?.role === "STAFF";
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

  // Edits are sent one after another, each built on the latest saved order,
  // so quick taps never overwrite each other.
  const orderRef = useRef<Order | null>(null);
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const pendingRef = useRef(0);
  // Item taps show at once in `draft` (the whole wanted list); taps made while
  // a save is out go together in the next one.
  const [draft, setDraftState] = useState<Line[] | null>(null);
  const draftRef = useRef<Line[] | null>(null);
  const syncQueuedRef = useRef(false);

  const applyOrder = useCallback((next: Order) => {
    orderRef.current = next;
    setOrder(next);
  }, []);

  const setDraft = useCallback((lines: Line[] | null) => {
    draftRef.current = lines;
    setDraftState(lines);
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
        const mine = quantitiesOf(orderRes.data.items);
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
  const activeOrderId = order?.id;
  usePolling(
    async () => {
      if (activeOrderId === undefined || pendingRef.current > 0) return;
      try {
        const res = await api.get<Order>(`/orders/${activeOrderId}`);
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
    },
    15_000,
    activeOrderId !== undefined,
  );

  // Every write of the order goes through one queue, each built on the latest
  // saved order, so quick taps and PR/KTV changes never overwrite each other.
  // `send` runs when the write's turn comes; returning null skips it.
  const enqueue = useCallback(
    (send: (current: Order) => Promise<Order> | null, errorMessage: string, onDone?: (saved: boolean) => void) => {
      pendingRef.current += 1;
      queueRef.current = queueRef.current.then(async () => {
        const current = orderRef.current;
        let saved = false;
        try {
          const request = current && send(current);
          if (!request) return;
          applyOrder(await request);
          saved = true;
        } catch (error) {
          notify.error(error, errorMessage);
        } finally {
          pendingRef.current -= 1;
          onDone?.(saved);
        }
      });
      return queueRef.current;
    },
    [applyOrder, notify],
  );

  // `buildPatch` runs when the edit's turn comes; returning null skips it.
  const saveOrder = useCallback(
    (buildPatch: (current: Order) => Record<string, unknown> | null, onDone?: (saved: boolean) => void) =>
      enqueue(
        (current) => {
          const patch = buildPatch(current);
          return patch && api.patch<Order>(`/orders/${current.id}`, patch).then((res) => res.data);
        },
        "Không thể lưu thay đổi",
        onDone,
      ),
    [enqueue],
  );

  // PR/KTV writes (/pr/sessions…) answer with the whole order. Resolves to
  // whether it was saved (errors are toasted here).
  const runOrderAction = useCallback(
    (send: () => Promise<Order>, errorMessage: string) =>
      new Promise<boolean>((resolve) => {
        enqueue(() => send(), errorMessage, resolve);
      }),
    [enqueue],
  );

  const syncItems = () => {
    if (syncQueuedRef.current) return;
    syncQueuedRef.current = true;
    let sent: Line[] | null = null;
    saveOrder(
      () => {
        // Taps from here on wait for the next save.
        syncQueuedRef.current = false;
        sent = draftRef.current;
        return sent && { items: sent };
      },
      // Keep the draft while newer taps are still to be sent; after an error
      // go back to what the server has.
      (saved) => {
        if (!saved || draftRef.current === sent) setDraft(null);
      },
    );
  };

  const changeItems = (change: (lines: Line[]) => Line[]) => {
    const current = orderRef.current;
    if (!current) return;
    setDraft(change(draftRef.current ?? linesOf(current)).filter((l) => l.quantity > 0));
    syncItems();
  };

  const addProduct = (product: Product) =>
    changeItems((lines) =>
      lines.some((l) => l.productId === product.id)
        ? lines.map((l) => (l.productId === product.id ? { ...l, quantity: l.quantity + 1 } : l))
        : [...lines, { productId: product.id, quantity: 1 }],
    );

  const setQuantity = (productId: number, quantity: number) =>
    changeItems((lines) => lines.map((l) => (l.productId === productId ? { ...l, quantity } : l)));

  // Relative to the latest list, so taps faster than a render still all count.
  const stepQuantity = (productId: number, step: number) =>
    changeItems((lines) => lines.map((l) => (l.productId === productId ? { ...l, quantity: l.quantity + step } : l)));

  const saveAdjustments = async (fields: (keyof Adjustments)[]) => {
    if (!adjust) return;
    const patch = Object.fromEntries(fields.map((f) => [f, adjust[f]]));
    await saveOrder(() => patch);
    if (orderRef.current) setAdjust(adjustmentsOf(orderRef.current));
  };

  const setStaffMember = (field: "cskhId" | "serverId", value: string) =>
    saveOrder(() => ({ [field]: value === NONE ? null : Number(value) }));

  const addPr = (prStaffId: number) =>
    runOrderAction(
      () => api.post<Order>("/pr/sessions", { orderId: orderRef.current!.id, prStaffId }).then((r) => r.data),
      "Không thể thêm PR/KTV",
    );
  const endPr = (id: number) =>
    runOrderAction(() => api.post<Order>(`/pr/sessions/${id}/end`).then((r) => r.data), "Không thể cho PR ra");
  const savePr = (id: number, times: Partial<PrTimes>) =>
    runOrderAction(() => api.patch<Order>(`/pr/sessions/${id}`, times).then((r) => r.data), "Không thể sửa giờ PR");
  const removePr = (id: number) =>
    runOrderAction(() => api.delete<Order>(`/pr/sessions/${id}`).then((r) => r.data), "Không thể xóa lượt PR");

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

  const shownItems = useMemo<ShownLine[]>(() => {
    if (!order) return [];
    const saved = new Map(order.items.map((i) => [i.productId, i]));
    const productById = new Map(products.map((p) => [p.id, p]));
    return (draft ?? linesOf(order)).map((line) => {
      // Saved lines keep their price; a new one takes the menu price, as the server does.
      const item = saved.get(line.productId);
      const product = item?.product ?? productById.get(line.productId);
      return {
        ...line,
        price: Number(item?.price ?? productById.get(line.productId)?.price ?? 0),
        name: product?.name ?? "",
        unit: product?.unit ?? "",
      };
    });
  }, [order, draft, products]);
  const ordered = useMemo(() => quantitiesOf(shownItems), [shownItems]);
  const categories = useMemo(() => {
    const names = new Map<string, string>();
    for (const p of products) names.set(p.categoryId ? String(p.categoryId) : OTHER, p.category?.name ?? "Khác");
    return [...names].sort(([, a], [, b]) => a.localeCompare(b, "vi"));
  }, [products]);

  if (loading) {
    return (
      <>
        <Skeleton className="h-12 w-72" />
        <div className="grid gap-4 @2xl/main:grid-cols-2">
          <Skeleton className={cn("h-[28rem] rounded-xl", PANEL_HEIGHT)} />
          <Skeleton className={cn("h-[28rem] rounded-xl", PANEL_HEIGHT)} />
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
            {staffView ? "Về danh sách phòng" : "Về sơ đồ phòng"}
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
    items: shownItems.map(({ price, quantity }) => ({ price, quantity })),
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
  const itemCount = shownItems.reduce((sum, i) => sum + i.quantity, 0);
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
                {staffView ? "Phòng đang phục vụ" : "Sơ đồ phòng"}
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
          showLeft && "@2xl/main:grid-cols-2",
        )}
      >
        {showLeft && (
          <Card className={cn("@container/menu min-w-0", PANEL_HEIGHT)}>
            <Tabs defaultValue={canOperate ? "menu" : "pr"} className="min-h-0 flex-1 gap-4">
              <CardHeader>
                <CardTitle>{canOperate ? "Thực đơn & PR/KTV" : "PR/KTV"}</CardTitle>
                <CardDescription>
                  {canOperate && canAssignPr
                    ? "Chạm vào món hoặc PR/KTV để thêm vào phòng."
                    : canOperate
                      ? "Chạm vào món để thêm 1 phần vào hóa đơn."
                      : "Chạm vào PR/KTV để đưa vào phòng."}
                </CardDescription>
              </CardHeader>
              {canOperate && canAssignPr && (
                <div className="px-6">
                  <TabsList className="w-full">
                    <TabsTrigger value="menu">Thực đơn</TabsTrigger>
                    <TabsTrigger value="pr">PR/KTV</TabsTrigger>
                  </TabsList>
                </div>
              )}
              {canOperate && (
                <TabsContent value="menu" className="flex min-h-0 flex-col">
                  <CardContent className="flex min-h-0 flex-1 flex-col gap-4">
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
                      <ItemGroup className="min-h-0 overflow-y-auto rounded-lg border">
                        {menu.map((product, index) => {
                          const left = available(product);
                          const inBill = ordered.get(product.id);
                          return (
                            <Fragment key={product.id}>
                              {index > 0 && <ItemSeparator />}
                              <Item
                                asChild
                                size="sm"
                                className="w-full flex-nowrap rounded-none px-3 text-left hover:bg-accent/50 focus-visible:ring-inset"
                              >
                                <button type="button" onClick={() => addProduct(product)}>
                                  <ItemContent className="min-w-0">
                                    <ItemTitle>{product.name}</ItemTitle>
                                    {product.trackStock && (
                                      <ItemDescription className={cn(left <= 0 && "text-destructive")}>
                                        {left <= 0 ? "Hết hàng trong kho" : `Còn ${formatNumber(left)} ${product.unit}`}
                                      </ItemDescription>
                                    )}
                                  </ItemContent>
                                  <ItemActions className="shrink-0">
                                    {inBill && <Badge className="tabular-nums">×{inBill}</Badge>}
                                    <span className="font-semibold tabular-nums">{formatNumber(product.price)}</span>
                                    <PlusIcon className="size-4 text-muted-foreground" />
                                  </ItemActions>
                                </button>
                              </Item>
                            </Fragment>
                          );
                        })}
                      </ItemGroup>
                    )}
                  </CardContent>
                </TabsContent>
              )}
              {canAssignPr && (
                <TabsContent value="pr" className="flex min-h-0 flex-col">
                  <CardContent className="flex min-h-0 flex-1 flex-col">
                    <PrPicker branch={branch} orderId={order.id} sessions={order.prSessions ?? []} onAdd={addPr} />
                  </CardContent>
                </TabsContent>
              )}
            </Tabs>
          </Card>
        )}

        <Card
          className={cn(
            "min-w-0",
            showLeft && ["order-first @2xl/main:order-none @2xl/main:sticky @2xl/main:top-4", PANEL_HEIGHT],
          )}
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
          {/* Scrolls when the bill is longer than the card; header and Thanh toán stay. */}
          <CardContent className="-my-1 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto py-1">
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

            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-medium">PR/KTV</h3>
              <RoomPrList
                sessions={order.prSessions ?? []}
                canEdit={canAssignPr}
                onEnd={endPr}
                onSave={savePr}
                onRemove={removePr}
              />
            </div>

            {shownItems.length === 0 ? (
              <EmptyState
                className="border p-6 md:p-8"
                icon={ShoppingBasketIcon}
                title="Chưa gọi món nào"
                description={canOperate ? "Chọn món ở thực đơn để thêm vào hóa đơn." : undefined}
              />
            ) : (
              <ItemGroup className="rounded-lg border">
                {shownItems.map((item, index) => (
                  <Fragment key={item.productId}>
                    {index > 0 && <ItemSeparator />}
                    <Item size="sm" className="rounded-none px-3">
                      <ItemContent className="min-w-32">
                        <ItemTitle>{item.name}</ItemTitle>
                        <ItemDescription className="tabular-nums">
                          {formatNumber(item.price)} / {item.unit}
                        </ItemDescription>
                      </ItemContent>
                      <ItemActions className="ml-auto">
                        {canOperate ? (
                          <InputGroup className="h-8 w-26">
                            <InputGroupAddon>
                              <InputGroupButton
                                size="icon-xs"
                                aria-label="Bớt 1"
                                onClick={() => stepQuantity(item.productId, -1)}
                              >
                                <MinusIcon />
                              </InputGroupButton>
                            </InputGroupAddon>
                            <InputGroupInput
                              // Remount when the saved quantity changes.
                              key={`${item.productId}-${item.quantity}`}
                              inputMode="numeric"
                              aria-label={`Số lượng ${item.name}`}
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
                                onClick={() => stepQuantity(item.productId, 1)}
                              >
                                <PlusIcon />
                              </InputGroupButton>
                            </InputGroupAddon>
                          </InputGroup>
                        ) : (
                          <span className="text-muted-foreground tabular-nums">×{item.quantity}</span>
                        )}
                        <span className="w-20 text-right font-medium tabular-nums">
                          {formatNumber(item.price * item.quantity)}
                        </span>
                        {canOperate && (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Xóa ${item.name}`}
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
