"use client";

import { useState } from "react";
import { CopyIcon, SearchIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useNotify } from "@/hooks/use-notify";
import api from "@/lib/api";
import { cn } from "@/lib/utils";
import type { TaxPayer } from "@/lib/types";

export interface BuyerValue {
  buyerTaxCode: string;
  buyerName: string;
  buyerAddress: string;
  buyerEmail: string;
}

// Người mua of one small invoice (spec §10.2). Tra looks the MST up (tax
// portal, then xinvoice); it may fail, then the fields are typed by hand.
// Empty = khách lẻ. The fields are locked while a lookup runs (it may take up
// to 30 s), so its answer never overwrites what was typed meanwhile. Rendered
// inside the panel's @container/einvoice.
export function BuyerFields({
  value,
  previous,
  disabled,
  onChange,
}: {
  value: BuyerValue;
  previous: BuyerValue | null;
  disabled: boolean;
  onChange: (value: BuyerValue) => void;
}) {
  const notify = useNotify();
  const [looking, setLooking] = useState(false);
  const [found, setFound] = useState<TaxPayer | null>(null);
  const locked = disabled || looking;

  const lookup = async () => {
    const taxCode = value.buyerTaxCode.trim();
    if (!taxCode) return;
    setLooking(true);
    try {
      const res = await api.get<TaxPayer>(`/einvoice/tax-payers/${encodeURIComponent(taxCode)}`);
      setFound(res.data);
      onChange({ ...value, buyerTaxCode: res.data.taxCode, buyerName: res.data.name, buyerAddress: res.data.address });
    } catch (error) {
      setFound(null);
      notify.error(error, "Không tra được MST, hãy nhập tay tên và địa chỉ");
    } finally {
      setLooking(false);
    }
  };

  return (
    <FieldSet className="min-w-0">
      <FieldLegend variant="label">Người mua</FieldLegend>
      <FieldGroup className="gap-3">
        <div className="flex flex-wrap items-end gap-2">
          <Field className="w-full @md/einvoice:w-56">
            <FieldLabel htmlFor="buyer-tax-code">MST</FieldLabel>
            <Input
              id="buyer-tax-code"
              inputMode="numeric"
              maxLength={14}
              value={value.buyerTaxCode}
              disabled={locked}
              onChange={(e) => {
                setFound(null);
                onChange({ ...value, buyerTaxCode: e.target.value });
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void lookup();
                }
              }}
            />
          </Field>
          <Button type="button" variant="outline" onClick={lookup} disabled={locked || !value.buyerTaxCode.trim()}>
            {looking ? <Spinner data-icon="inline-start" /> : <SearchIcon data-icon="inline-start" />}
            Tra
          </Button>
          {previous && (
            <Button
              type="button"
              variant="ghost"
              disabled={locked}
              onClick={() => {
                setFound(null);
                onChange(previous);
              }}
            >
              <CopyIcon data-icon="inline-start" />
              Chép từ HĐ trước
            </Button>
          )}
        </div>
        {found && (
          <p className={cn("text-xs", found.active ? "text-muted-foreground" : "text-warning")}>
            {found.active
              ? `Đã tra (${found.source === "gdt" ? "cổng thuế" : "xinvoice"}): ${found.status}`
              : `Cảnh báo: ${found.status}`}
          </p>
        )}
        <Field>
          <FieldLabel htmlFor="buyer-name">Tên đơn vị</FieldLabel>
          <Input
            id="buyer-name"
            placeholder="Bỏ trống: khách lẻ"
            maxLength={400}
            value={value.buyerName}
            disabled={locked}
            onChange={(e) => onChange({ ...value, buyerName: e.target.value })}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="buyer-address">Địa chỉ</FieldLabel>
          <Input
            id="buyer-address"
            maxLength={400}
            value={value.buyerAddress}
            disabled={locked}
            onChange={(e) => onChange({ ...value, buyerAddress: e.target.value })}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="buyer-email">Email</FieldLabel>
          <Input
            id="buyer-email"
            type="email"
            maxLength={200}
            value={value.buyerEmail}
            disabled={locked}
            onChange={(e) => onChange({ ...value, buyerEmail: e.target.value })}
          />
        </Field>
      </FieldGroup>
    </FieldSet>
  );
}
