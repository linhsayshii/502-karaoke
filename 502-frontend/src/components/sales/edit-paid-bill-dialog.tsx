"use client";

import { Fragment, useEffect, useState } from "react";
import { BanknoteIcon, LandmarkIcon, MinusIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel, FieldSet, FieldLegend } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemSeparator,
  ItemTitle,
} from "@/components/ui/item";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { BillSummary } from "@/components/sales/bill-summary";
import { useNotify } from "@/hooks/use-notify";
import api from "@/lib/api";
import { computeBill } from "@/lib/billing";
import { useBranchCode } from "@/lib/branch";
import { billLabel, formatMoney, formatNumber, toDateTimeInput } from "@/lib/format";
import { PAYMENT_METHOD_LABELS } from "@/lib/labels";
import type { FloorStaff, Order, PaymentMethod, Product } from "@/lib/types";
import { cn } from "@/lib/utils";

type EditLine = { productId: number; quantity: number; price: number; name: string; unit: string };

interface Adjustments {
  discountPercent: number;
  discountAmount: number;
  hourlyDiscountPercent: number;
  hourlyDiscountAmount: number;
  taxPercent: number;
}
type PercentKey = "discountPercent" | "hourlyDiscountPercent";
type AmountKey = "discountAmount" | "hourlyDiscountAmount";

const NONE = "none";
const ADJUSTMENT_ROW = "grid grid-cols-[6rem_minmax(0,1fr)] items-center gap-2 sm:grid-cols-[minmax(0,1fr)_6rem_8rem]";
const ADJUSTMENT_LABEL = "col-span-2 font-normal sm:col-span-1";
const clampPercent = (value: string) => Math.min(100, Math.max(0, Number(value) || 0));
const nonNegative = (value: string) => Math.max(0, Math.floor(Number(value) || 0));

// Managers correct a paid bill. The total is recomputed live (billing.ts);
// on save the server recomputes it, moves the stock difference and updates
// the fund receipt. The room fee charged stays unless times or price change.
export function EditPaidBillDialog({
  order,
  open,
  onOpenChange,
  onSaved,
}: {
  order: Order;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (order: Order) => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  return (
    <Dialog open={open} onOpenChange={(next) => !submitting && onOpenChange(next)}>
      <DialogContent className="flex max-h-[92dvh] flex-col gap-0 p-0 sm:max-w-2xl">
        {open && (
          <EditForm
            key={order.updatedAt}
            order={order}
            submitting={submitting}
            setSubmitting={setSubmitting}
            onCancel={() => onOpenChange(false)}
            onSaved={(saved) => {
              onOpenChange(false);
              onSaved(saved);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function EditForm({
  order,
  submitting,
  setSubmitting,
  onCancel,
  onSaved,
}: {
  order: Order;
  submitting: boolean;
  setSubmitting: (value: boolean) => void;
  onCancel: () => void;
  onSaved: (order: Order) => void;
}) {
  const branch = useBranchCode();
  const notify = useNotify();
  const [products, setProducts] = useState<Product[]>([]);
  const [staff, setStaff] = useState<FloorStaff[]>([]);

  const initialLines: EditLine[] = order.items.map((i) => ({
    productId: i.productId,
    quantity: i.quantity,
    price: Number(i.price),
    name: i.product.name,
    unit: i.product.unit,
  }));
  const initialStart = toDateTimeInput(new Date(order.startTime));
  const initialEnd = toDateTimeInput(new Date(order.endTime ?? order.startTime));
  const initialPrice = Number(order.pricePerHour);

  const [lines, setLines] = useState(initialLines);
  const [adjust, setAdjust] = useState<Adjustments>({
    discountPercent: order.discountPercent,
    discountAmount: Number(order.discountAmount),
    hourlyDiscountPercent: order.hourlyDiscountPercent,
    hourlyDiscountAmount: Number(order.hourlyDiscountAmount),
    taxPercent: order.taxPercent,
  });
  const [start, setStart] = useState(initialStart);
  const [end, setEnd] = useState(initialEnd);
  const [price, setPrice] = useState(initialPrice);
  const [method, setMethod] = useState<PaymentMethod>(order.paymentMethod ?? "CASH");
  const [cskhId, setCskhId] = useState(order.cskhId ? String(order.cskhId) : NONE);
  const [serverId, setServerId] = useState(order.serverId ? String(order.serverId) : NONE);
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.get<Product[]>("/products", { params: { branch } }),
      api.get<FloorStaff[]>("/users/floor-staff", { params: { branch } }),
    ])
      .then(([productsRes, staffRes]) => {
        if (cancelled) return;
        setProducts(productsRes.data);
        setStaff(staffRes.data);
      })
      .catch((error) => !cancelled && notify.error(error, "Không thể tải thực đơn"));
    return () => {
      cancelled = true;
    };
  }, [branch, notify]);

  // Only what changed is sent: unchanged times keep their seconds, so the
  // room fee is not recomputed by accident.
  const startChanged = start !== initialStart;
  const endChanged = end !== initialEnd;
  const priceChanged = price !== initialPrice;
  const startTime = startChanged ? new Date(start) : new Date(order.startTime);
  const endTime = endChanged ? new Date(end) : new Date(order.endTime ?? order.startTime);
  const timesInvalid = !start || !end || Number.isNaN(startTime.getTime()) || endTime <= startTime;
  const endInFuture = endTime > new Date();

  const bill = computeBill({
    startTime,
    endTime,
    pricePerHour: price,
    items: lines,
    ...adjust,
    hourlyFee: startChanged || endChanged || priceChanged ? undefined : Number(order.hourlyFee),
  });
  const difference = bill.finalAmount - Number(order.finalAmount);
  const reasonInvalid = touched && !reason.trim();

  const addProduct = (id: string) => {
    const product = products.find((p) => p.id === Number(id));
    if (!product) return;
    setLines((current) =>
      current.some((l) => l.productId === product.id)
        ? current.map((l) => (l.productId === product.id ? { ...l, quantity: l.quantity + 1 } : l))
        : [
            ...current,
            {
              productId: product.id,
              quantity: 1,
              price: Number(product.price),
              name: product.name,
              unit: product.unit,
            },
          ],
    );
  };
  const setQuantity = (productId: number, quantity: number) =>
    setLines((current) =>
      current
        .map((l) => (l.productId === productId ? { ...l, quantity } : l))
        .filter((l) => l.quantity > 0),
    );

  const save = async () => {
    setTouched(true);
    if (!reason.trim() || timesInvalid || endInFuture) return;
    const itemsChanged =
      lines.length !== initialLines.length ||
      lines.some((l, i) => l.productId !== initialLines[i].productId || l.quantity !== initialLines[i].quantity);
    const staffValue = (value: string) => (value === NONE ? null : Number(value));

    const body: Record<string, unknown> = { ...adjust, paymentMethod: method, reason: reason.trim() };
    if (itemsChanged) body.items = lines.map(({ productId, quantity }) => ({ productId, quantity }));
    if (startChanged) body.startTime = startTime.toISOString();
    if (endChanged) body.endTime = endTime.toISOString();
    if (priceChanged) body.pricePerHour = price;
    if (staffValue(cskhId) !== order.cskhId) body.cskhId = staffValue(cskhId);
    if (staffValue(serverId) !== order.serverId) body.serverId = staffValue(serverId);

    setSubmitting(true);
    try {
      const res = await api.patch<Order>(`/orders/${order.id}/paid`, body);
      notify.success(`Đã sửa hóa đơn ${billLabel(order)}: kho, phiếu thu và doanh thu đã cập nhật`);
      onSaved(res.data);
    } catch (error) {
      notify.error(error, "Không thể sửa hóa đơn");
    } finally {
      setSubmitting(false);
    }
  };

  const adjustmentRow = (id: string, label: string, percentKey: PercentKey, amountKey: AmountKey) => (
    <Field className={ADJUSTMENT_ROW}>
      <FieldLabel htmlFor={`edit-${id}-percent`} className={ADJUSTMENT_LABEL}>
        {label}
      </FieldLabel>
      <InputGroup>
        <InputGroupInput
          id={`edit-${id}-percent`}
          type="number"
          inputMode="decimal"
          min={0}
          max={100}
          className="text-right tabular-nums"
          value={adjust[percentKey]}
          onChange={(e) => setAdjust({ ...adjust, [percentKey]: clampPercent(e.target.value) })}
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
        />
        <InputGroupAddon align="inline-end">
          <InputGroupText>đ</InputGroupText>
        </InputGroupAddon>
      </InputGroup>
    </Field>
  );

  const staffSelect = (id: string, label: string, value: string, onChange: (v: string) => void, people: FloorStaff[]) => {
    const current = id === "cskh" ? order.cskh : order.server;
    // The staff member on the bill may have left since; keep them selectable.
    const options = current && !people.some((p) => p.id === current.id) ? [current, ...people] : people;
    return (
      <Field>
        <FieldLabel htmlFor={`edit-${id}`}>{label}</FieldLabel>
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger id={`edit-${id}`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value={NONE}>Chưa chọn</SelectItem>
              {options.map((s) => (
                <SelectItem key={s.id} value={String(s.id)}>
                  {s.fullName}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>
    );
  };

  const addable = products.filter((p) => p.active && !lines.some((l) => l.productId === p.id));

  return (
    <>
      <DialogHeader className="border-b p-4 sm:p-6">
        <DialogTitle>Sửa hóa đơn #{order.id}</DialogTitle>
        <DialogDescription>
          Phòng {order.room?.name ?? "—"} · đã thu {formatMoney(order.finalAmount)}. Kho, phiếu thu quỹ và doanh thu
          được cập nhật theo số tiền mới.
        </DialogDescription>
      </DialogHeader>

      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-4 sm:p-6">
        <FieldSet>
          <FieldLegend variant="label">Món</FieldLegend>
          {lines.length > 0 && (
            <ItemGroup className="rounded-lg border">
              {lines.map((line, index) => (
                <Fragment key={line.productId}>
                  {index > 0 && <ItemSeparator />}
                  <Item size="sm" className="flex-nowrap rounded-none px-3">
                    <ItemContent className="min-w-0">
                      <ItemTitle className="line-clamp-1">{line.name}</ItemTitle>
                      <ItemDescription className="tabular-nums">
                        {formatNumber(line.price)} / {line.unit}
                      </ItemDescription>
                    </ItemContent>
                    <ItemActions className="ml-auto">
                      <InputGroup className="h-8 w-26">
                        <InputGroupAddon>
                          <InputGroupButton
                            size="icon-xs"
                            aria-label="Bớt 1"
                            onClick={() => setQuantity(line.productId, line.quantity - 1)}
                          >
                            <MinusIcon />
                          </InputGroupButton>
                        </InputGroupAddon>
                        <InputGroupInput
                          key={`${line.productId}-${line.quantity}`}
                          inputMode="numeric"
                          aria-label={`Số lượng ${line.name}`}
                          className="text-center tabular-nums"
                          defaultValue={line.quantity}
                          onBlur={(e) => {
                            const quantity = nonNegative(e.target.value);
                            if (quantity !== line.quantity) setQuantity(line.productId, quantity);
                          }}
                          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                        />
                        <InputGroupAddon align="inline-end">
                          <InputGroupButton
                            size="icon-xs"
                            aria-label="Thêm 1"
                            onClick={() => setQuantity(line.productId, line.quantity + 1)}
                          >
                            <PlusIcon />
                          </InputGroupButton>
                        </InputGroupAddon>
                      </InputGroup>
                      <span className="hidden w-20 text-right font-medium tabular-nums sm:inline">
                        {formatNumber(line.price * line.quantity)}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Xóa ${line.name}`}
                        onClick={() => setQuantity(line.productId, 0)}
                      >
                        <Trash2Icon />
                      </Button>
                    </ItemActions>
                  </Item>
                </Fragment>
              ))}
            </ItemGroup>
          )}
          <Select value="" onValueChange={addProduct} disabled={addable.length === 0}>
            <SelectTrigger className="w-full" aria-label="Thêm món">
              <SelectValue placeholder={lines.length === 0 ? "Chưa có món — chọn để thêm" : "Thêm món..."} />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {addable.map((p) => (
                  <SelectItem key={p.id} value={String(p.id)}>
                    {p.name} · {formatNumber(p.price)}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </FieldSet>

        <FieldSet>
          <FieldLegend variant="label">Giờ hát</FieldLegend>
          <FieldGroup className="grid gap-3 sm:grid-cols-3">
            <Field data-invalid={timesInvalid || undefined}>
              <FieldLabel htmlFor="edit-start">Giờ vào</FieldLabel>
              <Input id="edit-start" type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
            </Field>
            <Field data-invalid={timesInvalid || endInFuture || undefined}>
              <FieldLabel htmlFor="edit-end">Giờ ra</FieldLabel>
              <Input id="edit-end" type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} />
            </Field>
            <Field>
              <FieldLabel htmlFor="edit-price">Giá giờ</FieldLabel>
              <InputGroup>
                <InputGroupInput
                  id="edit-price"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  className="text-right tabular-nums"
                  value={price}
                  onChange={(e) => setPrice(nonNegative(e.target.value))}
                />
                <InputGroupAddon align="inline-end">
                  <InputGroupText>đ</InputGroupText>
                </InputGroupAddon>
              </InputGroup>
            </Field>
          </FieldGroup>
          {timesInvalid && <FieldError>Giờ ra phải sau giờ vào</FieldError>}
          {!timesInvalid && endInFuture && <FieldError>Giờ ra không được ở tương lai</FieldError>}
        </FieldSet>

        <FieldSet>
          <FieldLegend variant="label">Giảm giá & thuế</FieldLegend>
          <FieldGroup className="gap-3">
            {adjustmentRow("discount", "Giảm giá món", "discountPercent", "discountAmount")}
            {adjustmentRow("hourly-discount", "Giảm giá giờ", "hourlyDiscountPercent", "hourlyDiscountAmount")}
            <Field className={ADJUSTMENT_ROW}>
              <FieldLabel htmlFor="edit-tax" className={ADJUSTMENT_LABEL}>
                Thuế VAT
              </FieldLabel>
              <InputGroup>
                <InputGroupInput
                  id="edit-tax"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={100}
                  className="text-right tabular-nums"
                  value={adjust.taxPercent}
                  onChange={(e) => setAdjust({ ...adjust, taxPercent: clampPercent(e.target.value) })}
                />
                <InputGroupAddon align="inline-end">
                  <InputGroupText>%</InputGroupText>
                </InputGroupAddon>
              </InputGroup>
              <span className="pr-3 text-right text-sm tabular-nums">{formatNumber(bill.taxAmount)} đ</span>
            </Field>
          </FieldGroup>
        </FieldSet>

        <FieldGroup className="grid gap-3 sm:grid-cols-2">
          {staffSelect(
            "cskh",
            "CSKH",
            cskhId,
            setCskhId,
            staff.filter((s) => s.position === "CSKH"),
          )}
          {staffSelect(
            "server",
            "Phục vụ",
            serverId,
            setServerId,
            staff.filter((s) => s.position === "SERVER"),
          )}
          <Field className="sm:col-span-2">
            <FieldLabel>Hình thức thanh toán</FieldLabel>
            <ToggleGroup
              type="single"
              variant="outline"
              value={method}
              onValueChange={(value) => value && setMethod(value as PaymentMethod)}
              aria-label="Hình thức thanh toán"
            >
              <ToggleGroupItem value="CASH">
                <BanknoteIcon />
                {PAYMENT_METHOD_LABELS.CASH}
              </ToggleGroupItem>
              <ToggleGroupItem value="TRANSFER">
                <LandmarkIcon />
                {PAYMENT_METHOD_LABELS.TRANSFER}
              </ToggleGroupItem>
            </ToggleGroup>
          </Field>
        </FieldGroup>

        <Separator />
        <BillSummary bill={bill} percents={adjust} pricePerHour={price} totalLabel="Thành tiền mới" />
        {difference !== 0 && (
          <p className={cn("-mt-4 text-right text-sm", difference > 0 ? "text-success" : "text-destructive")}>
            {difference > 0 ? "Thu thêm " : "Giảm "}
            {formatMoney(Math.abs(difference))} so với đã thu
          </p>
        )}

        <Field data-invalid={reasonInvalid || undefined}>
          <FieldLabel htmlFor="edit-reason">Lý do sửa</FieldLabel>
          <Textarea
            id="edit-reason"
            placeholder="Ví dụ: khách gọi thêm 2 bia, thu ngân quên nhập"
            value={reason}
            maxLength={500}
            onChange={(e) => setReason(e.target.value)}
          />
          {reasonInvalid && <FieldError>Vui lòng nhập lý do sửa</FieldError>}
        </Field>
      </div>

      <DialogFooter className="border-t p-4 sm:p-6">
        <Button variant="outline" onClick={onCancel} disabled={submitting}>
          Đóng
        </Button>
        <Button onClick={save} disabled={submitting || timesInvalid || endInFuture}>
          {submitting && <Spinner data-icon="inline-start" />}
          Lưu · {formatMoney(bill.finalAmount)}
        </Button>
      </DialogFooter>
    </>
  );
}
