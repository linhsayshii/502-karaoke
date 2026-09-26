"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArrowLeft, Search, Trash2, ChevronDown, ChevronUp, XCircle } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/components/auth-provider";
import { CheckoutDialog } from "@/components/sales/checkout-dialog";
import api, { apiErrorMessage } from "@/lib/api";
import { computeBill, roundUpToThousand } from "@/lib/billing";
import { useBranchCode } from "@/lib/branch";
import { formatNumber, formatTime } from "@/lib/format";
import { can } from "@/lib/permissions";
import type { FloorStaff, Order, Product, Room } from "@/lib/types";

type Line = { productId: number; quantity: number };

interface Adjustments {
  discountPercent: number;
  discountAmount: number;
  hourlyDiscountPercent: number;
  hourlyDiscountAmount: number;
  serviceFeePercent: number;
  serviceFeeAmount: number;
  taxPercent: number;
}

const adjustmentsOf = (order: Order): Adjustments => ({
  discountPercent: order.discountPercent,
  discountAmount: Number(order.discountAmount),
  hourlyDiscountPercent: order.hourlyDiscountPercent,
  hourlyDiscountAmount: Number(order.hourlyDiscountAmount),
  serviceFeePercent: order.serviceFeePercent,
  serviceFeeAmount: Number(order.serviceFeeAmount),
  taxPercent: order.taxPercent,
});

const NONE = "none";

function formatDuration(minutes: number) {
  return `${Math.floor(minutes / 60)} giờ ${minutes % 60} phút`;
}

export default function RoomDetailPage() {
  const params = useParams<{ id: string }>();
  const roomId = Number(params.id);
  const branch = useBranchCode();
  const router = useRouter();
  const { user } = useAuth();
  const { toast } = useToast();
  const canOperate = can(user, "sales.operate");
  const canCancel = can(user, "sales.cancel");
  const roomsPath = `/${branch}/sales/rooms`;

  const [room, setRoom] = useState<Room | null>(null);
  const [order, setOrder] = useState<Order | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [staff, setStaff] = useState<FloorStaff[]>([]);
  const [adjust, setAdjust] = useState<Adjustments | null>(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => new Date());
  const [searchTerm, setSearchTerm] = useState("");
  const [footerExpanded, setFooterExpanded] = useState(true);
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  // Item edits are sent one after another, each built on the latest saved
  // order, so quick clicks never overwrite each other.
  const orderRef = useRef<Order | null>(null);
  const queueRef = useRef<Promise<void>>(Promise.resolve());

  const applyOrder = useCallback((next: Order) => {
    orderRef.current = next;
    setOrder(next);
  }, []);

  const showError = useCallback(
    (error: unknown, fallback: string) =>
      toast({ title: "Lỗi", description: apiErrorMessage(error, fallback), variant: "destructive" }),
    [toast],
  );

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
        applyOrder(orderRes.data);
        setAdjust(adjustmentsOf(orderRes.data));
        setProducts(productsRes.data);
        setStaff(staffRes.data);
      } catch (error) {
        showError(error, "Không thể tải dữ liệu phòng");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [roomId, branch, canOperate, applyOrder, showError]);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const saveOrder = useCallback(
    (buildPatch: (current: Order) => Record<string, unknown>) => {
      queueRef.current = queueRef.current.then(async () => {
        const current = orderRef.current;
        if (!current) return;
        try {
          const res = await api.patch<Order>(`/orders/${current.id}`, buildPatch(current));
          applyOrder(res.data);
        } catch (error) {
          showError(error, "Không thể lưu thay đổi");
        }
      });
      return queueRef.current;
    },
    [applyOrder, showError],
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

  const cancelOrder = async () => {
    if (!order || !window.confirm(`Hủy phiên hát phòng ${room?.name}? Hóa đơn sẽ không được tính tiền.`)) {
      return;
    }
    try {
      await api.post(`/orders/${order.id}/cancel`);
      toast({ title: "Đã hủy phiên", description: `Phòng ${room?.name} đã trống.` });
      router.push(roomsPath);
    } catch (error) {
      showError(error, "Không thể hủy phiên hát");
    }
  };

  if (loading) return <div className="p-8">Đang tải...</div>;
  if (!order || !adjust) {
    return (
      <div className="space-y-4 p-8">
        <p>Phòng {room?.name ?? roomId} hiện không có phiên hát nào đang mở.</p>
        <Button variant="outline" onClick={() => router.push(roomsPath)}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Về sơ đồ phòng
        </Button>
      </div>
    );
  }

  const bill = computeBill({
    startTime: new Date(order.startTime),
    endTime: now,
    pricePerHour: Number(room?.pricePerHour ?? 0),
    items: order.items.map((i) => ({ price: Number(i.price), quantity: i.quantity })),
    discountAmount: adjust.discountAmount,
    hourlyDiscountAmount: adjust.hourlyDiscountAmount,
    serviceFeeAmount: adjust.serviceFeeAmount,
    taxPercent: adjust.taxPercent,
  });

  const keyword = searchTerm.trim().toLowerCase();
  const filteredProducts = products.filter((p) => p.name.toLowerCase().includes(keyword));
  const cskhStaff = staff.filter((s) => s.position === "CSKH");
  const serverStaff = staff.filter((s) => s.position === "SERVER");

  // A percent field also fills its amount (rounded up to 1,000 VND).
  const percentRow = (
    label: string,
    percentKey: keyof Adjustments,
    amountKey: keyof Adjustments,
    base: number,
  ) => (
    <>
      <div className="text-right">{label}</div>
      <div className="flex items-center gap-1">
        <Input
          type="number"
          min={0}
          max={100}
          className="h-7 text-right"
          value={adjust[percentKey]}
          disabled={!canOperate}
          onChange={(e) => {
            const percent = Number(e.target.value);
            setAdjust({
              ...adjust,
              [percentKey]: percent,
              [amountKey]: roundUpToThousand((base * percent) / 100),
            });
          }}
          onBlur={() => saveAdjustments([percentKey, amountKey])}
        />
        <span>%</span>
      </div>
      <Input
        type="number"
        min={0}
        className="h-7 text-right"
        value={adjust[amountKey]}
        disabled={!canOperate}
        onChange={(e) => setAdjust({ ...adjust, [amountKey]: Number(e.target.value) })}
        onBlur={() => saveAdjustments([amountKey])}
      />
    </>
  );

  return (
    <div className="flex h-[calc(100vh-6rem)] gap-4">
      {canOperate && (
        <div className="flex w-1/2 flex-col gap-4">
          <Card className="flex flex-1 flex-col overflow-hidden">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="icon" onClick={() => router.push(roomsPath)}>
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                  <CardTitle>Thực đơn</CardTitle>
                </div>
                <div className="relative w-64">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Tìm món..."
                    className="pl-8"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex-1 overflow-auto">
              <div className="grid grid-cols-3 gap-4">
                {filteredProducts.map((product) => (
                  <button
                    type="button"
                    key={product.id}
                    className="flex flex-col items-center justify-center rounded-lg border p-4 transition-colors hover:bg-accent"
                    onClick={() => addProduct(product)}
                  >
                    <div className="text-center font-bold">{product.name}</div>
                    <div className="text-sm text-muted-foreground">{product.unit}</div>
                    <div className="font-medium text-primary">{formatNumber(product.price)}</div>
                    {product.trackStock && product.stockQuantity <= 0 && (
                      <div className="text-xs text-orange-600">Hết hàng trong kho</div>
                    )}
                  </button>
                ))}
                {filteredProducts.length === 0 && (
                  <p className="col-span-3 py-8 text-center text-muted-foreground">
                    Không có mặt hàng nào.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <div className={`flex flex-col gap-4 ${canOperate ? "w-1/2" : "w-full"}`}>
        <Card className="flex h-full flex-1 flex-col overflow-hidden">
          <CardHeader className="space-y-2 border-b bg-slate-100 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {!canOperate && (
                  <Button variant="ghost" size="icon" onClick={() => router.push(roomsPath)}>
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                )}
                <CardTitle className="text-lg">Phòng {room?.name ?? roomId}</CardTitle>
              </div>
              <div className="text-sm text-muted-foreground">
                Giờ vào: {formatTime(order.startTime)} – Thời lượng: {formatDuration(bill.durationMinutes)}
              </div>
            </div>
            {canOperate ? (
              <div className="grid grid-cols-2 gap-2">
                <Select
                  value={order.cskhId ? String(order.cskhId) : NONE}
                  onValueChange={(v) => setStaffMember("cskhId", v)}
                >
                  <SelectTrigger className="h-8 bg-white">
                    <SelectValue placeholder="CSKH" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>CSKH: chưa chọn</SelectItem>
                    {cskhStaff.map((s) => (
                      <SelectItem key={s.id} value={String(s.id)}>
                        CSKH: {s.fullName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={order.serverId ? String(order.serverId) : NONE}
                  onValueChange={(v) => setStaffMember("serverId", v)}
                >
                  <SelectTrigger className="h-8 bg-white">
                    <SelectValue placeholder="Phục vụ" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Phục vụ: chưa chọn</SelectItem>
                    {serverStaff.map((s) => (
                      <SelectItem key={s.id} value={String(s.id)}>
                        Phục vụ: {s.fullName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">
                CSKH: {order.cskh?.fullName ?? "—"} · Phục vụ: {order.server?.fullName ?? "—"}
              </div>
            )}
          </CardHeader>

          <div className="flex-1 overflow-auto">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-white">
                <TableRow>
                  <TableHead className="w-[50px]">STT</TableHead>
                  <TableHead>Tên hàng</TableHead>
                  <TableHead className="w-[80px]">SL</TableHead>
                  <TableHead className="w-[60px]">ĐVT</TableHead>
                  <TableHead className="text-right">Đơn giá</TableHead>
                  <TableHead className="text-right">Thành tiền</TableHead>
                  {canOperate && <TableHead className="w-[40px]"></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {order.items.map((item, index) => (
                  <TableRow key={item.id}>
                    <TableCell>{index + 1}</TableCell>
                    <TableCell className="font-medium">{item.product.name}</TableCell>
                    <TableCell>
                      {canOperate ? (
                        <Input
                          // Remount when the saved quantity changes.
                          key={`${item.id}-${item.quantity}`}
                          type="number"
                          min={0}
                          className="h-8 w-16 px-1 text-center"
                          defaultValue={item.quantity}
                          onBlur={(e) => {
                            const quantity = Math.max(0, Math.floor(Number(e.target.value) || 0));
                            if (quantity !== item.quantity) setQuantity(item.productId, quantity);
                          }}
                          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                        />
                      ) : (
                        item.quantity
                      )}
                    </TableCell>
                    <TableCell>{item.product.unit}</TableCell>
                    <TableCell className="text-right">{formatNumber(item.price)}</TableCell>
                    <TableCell className="text-right font-bold">
                      {formatNumber(Number(item.price) * item.quantity)}
                    </TableCell>
                    {canOperate && (
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-red-500"
                          onClick={() => setQuantity(item.productId, 0)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
                {order.items.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                      Chưa gọi món nào
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          <div className="space-y-3 border-t bg-slate-50 p-4">
            <div
              className="flex cursor-pointer select-none items-center justify-between text-lg font-bold text-blue-600 transition-colors hover:text-blue-700"
              onClick={() => setFooterExpanded(!footerExpanded)}
            >
              <div className="flex items-center gap-4">
                <span>SL: {order.items.reduce((sum, i) => sum + i.quantity, 0)}</span>
                {!footerExpanded && <span className="text-red-600">{formatNumber(bill.finalAmount)}</span>}
              </div>
              {footerExpanded ? <ChevronDown className="h-5 w-5" /> : <ChevronUp className="h-5 w-5" />}
            </div>

            {footerExpanded && (
              <>
                <Separator />
                <div className="grid grid-cols-[1fr_120px_1fr] items-center gap-x-4 gap-y-2 text-sm">
                  <div className="text-right font-medium">Tiền hàng</div>
                  <div className="col-span-2 text-right font-bold">{formatNumber(bill.totalProductPrice)}</div>

                  <div className="text-right font-medium text-blue-600">Tiền giờ</div>
                  <div className="col-span-2 text-right font-bold text-blue-600">
                    {formatNumber(bill.hourlyFee)}
                  </div>

                  {percentRow("Tiền giảm giá", "discountPercent", "discountAmount", bill.totalProductPrice)}
                  {percentRow(
                    "Tiền giảm giá giờ",
                    "hourlyDiscountPercent",
                    "hourlyDiscountAmount",
                    bill.hourlyFee,
                  )}
                  {percentRow(
                    "Phí dịch vụ",
                    "serviceFeePercent",
                    "serviceFeeAmount",
                    bill.totalProductPrice - adjust.discountAmount + bill.hourlyFee - adjust.hourlyDiscountAmount,
                  )}

                  <div className="text-right">Tiền thuế</div>
                  <div className="flex items-center gap-1">
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      className="h-7 text-right"
                      value={adjust.taxPercent}
                      disabled={!canOperate}
                      onChange={(e) => setAdjust({ ...adjust, taxPercent: Number(e.target.value) })}
                      onBlur={() => saveAdjustments(["taxPercent"])}
                    />
                    <span>%</span>
                  </div>
                  <div className="text-right font-bold">{formatNumber(bill.taxAmount)}</div>

                  <Separator className="col-span-3 my-2" />

                  <div className="text-right text-lg font-bold">Tổng cộng</div>
                  <div className="col-span-2 text-right text-xl font-bold text-red-600">
                    {formatNumber(bill.finalAmount)}
                  </div>
                </div>
              </>
            )}

            {canOperate && (
              <div className="mt-4 flex gap-2">
                <Button
                  className="flex-1 bg-green-600 hover:bg-green-700"
                  onClick={async () => {
                    // Let pending edits land before the server computes the bill.
                    await queueRef.current;
                    setCheckoutOpen(true);
                  }}
                >
                  Thanh toán
                </Button>
                {canCancel && (
                  <Button variant="outline" className="text-red-600" onClick={cancelOrder}>
                    <XCircle className="mr-2 h-4 w-4" /> Hủy phiên
                  </Button>
                )}
              </div>
            )}
          </div>
        </Card>
      </div>

      <CheckoutDialog
        orderId={order.id}
        roomName={room?.name}
        open={checkoutOpen}
        onOpenChange={setCheckoutOpen}
        onCheckedOut={() => router.push(roomsPath)}
      />
    </div>
  );
}
