"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeftIcon,
  DoorClosedIcon,
  LockIcon,
  LockOpenIcon,
  MinusIcon,
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
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
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
import { BillAdjustments } from "@/components/sales/bill-adjustments";
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
import { can, isServerOf } from "@/lib/permissions";
import { adjustmentsOf } from "@/lib/discount-rules";
import type { Adjustments, DiscountRequestRow, FloorStaff, Order, Product, Room } from "@/lib/types";
import { cn } from "@/lib/utils";

type Line = { productId: number; quantity: number };

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
  const staffView = user?.role === "STAFF";
  const roomsPath = `/${branch}/sales/rooms`;

  const [room, setRoom] = useState<Room | null>(null);
  const [order, setOrder] = useState<Order | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  // Quantities other open sessions have ordered (stock is deducted at checkout).
  const [otherPending, setOtherPending] = useState<Map<number, number>>(new Map());
  const [staff, setStaff] = useState<FloorStaff[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState(ALL);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [lockOpen, setLockOpen] = useState(false);

  // The server assigned to this session orders, brings PR/KTV in and locks
  // the time for it; the CSKH only looks (the backend checks it again).
  const isServer = !!order && isServerOf(user, order);
  const canEditItems = canOperate || isServer;
  const canAssignPrHere = canAssignPr || isServer;
  const locked = !!order?.timeLockedAt;
  // The left card: the menu for who orders, the PR/KTV tiles for who assigns them.
  const showLeft = canEditItems || canAssignPrHere;

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

        const orderRes = await api.get<Order>(`/orders/${roomRes.data.activeOrderId}`);
        // The menu for whoever orders here: sales roles and this room's server.
        const menu = canOperate || isServerOf(user, orderRes.data);
        const [productsRes, staffRes] = await Promise.all([
          menu
            ? api.get<Product[]>("/products", { params: { branch } })
            : Promise.resolve({ data: [] as Product[] }),
          canOperate
            ? api.get<FloorStaff[]>("/users/floor-staff", { params: { branch } })
            : Promise.resolve({ data: [] as FloorStaff[] }),
        ]);
        const mine = quantitiesOf(orderRes.data.items);
        setOtherPending(new Map(productsRes.data.map((p) => [p.id, (p.pendingQuantity ?? 0) - (mine.get(p.id) ?? 0)])));
        applyOrder(orderRes.data);
        setProducts(productsRes.data);
        setStaff(staffRes.data);
      } catch (error) {
        notify.error(error, "Không thể tải dữ liệu phòng");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [roomId, branch, canOperate, user, applyOrder, notify]);

  // null: nothing waiting; the id of the request this screen last saw pending.
  const pendingIdRef = useRef<number | null>(null);

  // Tells the cashier what became of their request when it leaves the order.
  useEffect(() => {
    const current = order?.discountRequests?.[0]?.id ?? null;
    const previous = pendingIdRef.current;
    pendingIdRef.current = current;
    if (previous === null || current !== null) return;
    api
      .get<DiscountRequestRow>(`/discount-requests/${previous}`)
      .then(({ data }) => {
        if (data.status === "APPROVED") notify.success(`Quản lý ${data.decidedBy?.fullName ?? ""} đã duyệt giảm giá`);
        else if (data.status === "REJECTED") notify.warning(`Giảm giá bị từ chối: ${data.decisionNote ?? ""}`);
      })
      .catch(() => {});
  }, [order?.discountRequests, notify]);

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
        if (res.data.updatedAt !== orderRef.current?.updatedAt) applyOrder(res.data);
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

  const submitAdjustments = (adjustments: Adjustments, note?: string) =>
    runOrderAction(
      () =>
        api
          .post<Order & { branchManagers?: number }>(`/orders/${orderRef.current!.id}/adjustments`, { ...adjustments, note })
          .then((res) => {
            const sent = res.data.discountRequests?.length;
            if (sent && res.data.branchManagers === 0) {
              notify.warning("Cơ sở chưa có quản lý cơ sở, yêu cầu chỉ tới quản lý hệ thống");
            } else if (sent) {
              notify.success("Đã gửi yêu cầu, chờ quản lý duyệt");
            } else {
              notify.success("Đã áp dụng");
            }
            return res.data;
          }),
      "Không thể lưu giảm giá",
    );

  const cancelRequest = async (requestId: number) => {
    try {
      await api.post(`/discount-requests/${requestId}/cancel`);
      const res = await api.get<Order>(`/orders/${orderRef.current!.id}`);
      applyOrder(res.data);
      return true;
    } catch (error) {
      notify.error(error, "Không thể hủy yêu cầu");
      return false;
    }
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

  // Both go through the order queue, after the edits already sent.
  const lockTime = () =>
    runOrderAction(
      () => api.post<Order>(`/orders/${orderRef.current!.id}/lock-time`).then((r) => r.data),
      "Không thể chốt giờ",
    );
  const unlockTime = () =>
    runOrderAction(
      () => api.post<Order>(`/orders/${orderRef.current!.id}/unlock-time`).then((r) => r.data),
      "Không thể mở khóa giờ",
    );

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

  if (!order) {
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
    // The room fee stops at the lock.
    endTime: order.timeLockedAt ? new Date(order.timeLockedAt) : now,
    pricePerHour: Number(order.pricePerHour),
    items: shownItems.map(({ price, quantity }) => ({ price, quantity })),
    ...adjustmentsOf(order),
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
            {!locked && canEditItems && (
              <Button variant="outline" onClick={() => setLockOpen(true)}>
                <LockIcon data-icon="inline-start" />
                Chốt giờ
              </Button>
            )}
            {locked && canOperate && (
              <Button variant="outline" onClick={() => setLockOpen(true)}>
                <LockOpenIcon data-icon="inline-start" />
                Mở khóa giờ
              </Button>
            )}
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
            <Tabs defaultValue={canEditItems ? "menu" : "pr"} className="min-h-0 flex-1 gap-4">
              <CardHeader>
                <CardTitle>{canEditItems ? "Thực đơn & PR/KTV" : "PR/KTV"}</CardTitle>
                <CardDescription>
                  {canEditItems && canAssignPrHere
                    ? "Chạm vào món hoặc PR/KTV để thêm vào phòng."
                    : canEditItems
                      ? "Chạm vào món để thêm 1 phần vào hóa đơn."
                      : "Chạm vào PR/KTV để đưa vào phòng."}
                </CardDescription>
              </CardHeader>
              {canEditItems && canAssignPrHere && (
                <div className="px-6">
                  <TabsList className="w-full">
                    <TabsTrigger value="menu">Thực đơn</TabsTrigger>
                    <TabsTrigger value="pr">PR/KTV</TabsTrigger>
                  </TabsList>
                </div>
              )}
              {canEditItems && (
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
              {canAssignPrHere && (
                <TabsContent value="pr" className="flex min-h-0 flex-col">
                  <CardContent className="flex min-h-0 flex-1 flex-col">
                    {locked ? (
                      <EmptyState
                        icon={LockIcon}
                        title="Phòng đã chốt giờ"
                        description="Không thêm PR/KTV sau khi chốt giờ."
                      />
                    ) : (
                      <PrPicker branch={branch} orderId={order.id} sessions={order.prSessions ?? []} onAdd={addPr} />
                    )}
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
              {locked ? (
                <Badge variant="warning">Đã chốt {formatTime(order.timeLockedAt!)}</Badge>
              ) : (
                <Badge variant="destructive">Đang hát</Badge>
              )}
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
                canEdit={canAssignPrHere}
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
                description={canEditItems ? "Chọn món ở thực đơn để thêm vào hóa đơn." : undefined}
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
                        {canEditItems ? (
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
                        {canEditItems && (
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
              <BillAdjustments
                key={`${JSON.stringify(adjustmentsOf(order))}:${order.discountRequests?.[0]?.id ?? ""}`}
                order={order}
                billFor={(adjustments) =>
                  computeBill({
                    startTime: new Date(order.startTime),
                    endTime: order.timeLockedAt ? new Date(order.timeLockedAt) : now,
                    pricePerHour: Number(order.pricePerHour),
                    items: shownItems.map(({ price, quantity }) => ({ price, quantity })),
                    ...adjustments,
                  })
                }
                canApply={can(user, "discounts.approve")}
                onSubmit={submitAdjustments}
                onCancelRequest={cancelRequest}
              />
            )}

            <Separator />
            <BillSummary
              bill={bill}
              percents={adjustmentsOf(order)}
              pricePerHour={Number(order.pricePerHour)}
              totalLabel="Tạm tính"
            />
          </CardContent>
          {canOperate && (
            <CardFooter>
              <Button
                size="lg"
                className="w-full"
                disabled={!!order.discountRequests?.length}
                onClick={async () => {
                  // Let pending edits land before the server computes the bill.
                  await queueRef.current;
                  setCheckoutOpen(true);
                }}
              >
                <ReceiptTextIcon data-icon="inline-start" />
                {order.discountRequests?.length ? "Chờ duyệt giảm giá…" : `Thanh toán · ${formatMoney(bill.finalAmount)}`}
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
        open={lockOpen}
        onOpenChange={setLockOpen}
        title={locked ? `Mở khóa giờ phòng ${room?.name ?? ""}?` : `Chốt giờ phòng ${room?.name ?? ""}?`}
        description={
          locked
            ? "Tiền giờ tính tiếp từ giờ vào, kể cả khoảng đã khóa. Việc mở khóa được ghi lại."
            : "Tiền giờ dừng tại bây giờ, PR/KTV đang trong phòng được cho ra. Vẫn gọi thêm món được."
        }
        confirmLabel={locked ? "Mở khóa giờ" : "Chốt giờ"}
        onConfirm={async () => {
          const ok = await (locked ? unlockTime() : lockTime());
          if (!ok) return false;
        }}
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
