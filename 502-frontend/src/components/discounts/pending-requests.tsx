"use client";

import { useState } from "react";
import { CheckIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, ListLimitNotice } from "@/components/data-states";
import { ReasonDialog } from "@/components/reason-dialog";
import { AdjustmentDiff } from "@/components/discounts/adjustment-diff";
import { DISCOUNTS_CHANGED } from "@/hooks/use-pending-discounts";
import { useApiData } from "@/hooks/use-api-data";
import { useNotify } from "@/hooks/use-notify";
import { usePolling } from "@/hooks/use-polling";
import api from "@/lib/api";
import { formatTime } from "@/lib/format";
import type { DiscountRequestRow } from "@/lib/types";

// The requests waiting for this manager (the chain manager sees every
// branch); whoever acts first wins, the other gets a 409 naming who decided.
export function PendingRequests() {
  const notify = useNotify();
  const { data, total, loading, reload } = useApiData<DiscountRequestRow[] | null>(
    "/discount-requests/pending",
    {},
    null,
    "Không thể tải yêu cầu chờ duyệt",
  );
  const [rejecting, setRejecting] = useState<DiscountRequestRow | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  usePolling(reload, 15_000);

  // Reload the queue and tell the sidebar badge to refresh at once.
  const done = () => {
    reload();
    window.dispatchEvent(new Event(DISCOUNTS_CHANGED));
  };
  const approve = async (r: DiscountRequestRow) => {
    setBusyId(r.id);
    try {
      await api.post(`/discount-requests/${r.id}/approve`, {});
      notify.success(`Đã duyệt giảm giá phòng ${r.order.room?.name ?? ""}`);
    } catch (error) {
      notify.error(error, "Không thể duyệt");
    } finally {
      setBusyId(null);
      done();
    }
  };
  const reject = async (note: string) => {
    if (!rejecting) return false;
    try {
      await api.post(`/discount-requests/${rejecting.id}/reject`, { note });
      notify.success("Đã từ chối");
    } catch (error) {
      notify.error(error, "Không thể từ chối");
      return false;
    } finally {
      done();
    }
  };

  // `data` stays null until the first load lands; a poll (loading again)
  // keeps showing the current list or empty state.
  const rows = data ?? [];
  if (data === null && loading) {
    return (
      <div className="grid gap-4 @3xl/main:grid-cols-2">
        <Skeleton className="h-44 w-full" />
        <Skeleton className="hidden h-44 w-full @3xl/main:block" />
      </div>
    );
  }
  if (rows.length === 0) {
    return <EmptyState icon={CheckIcon} title="Không có yêu cầu chờ duyệt" />;
  }
  return (
    <div className="flex flex-col gap-4">
      <ListLimitNotice
        shown={rows.length}
        total={total}
        noun="yêu cầu"
        hint="Duyệt hoặc từ chối bớt để thấy các yêu cầu còn lại."
      />
      <div className="grid gap-4 @3xl/main:grid-cols-2">
        {rows.map((r) => (
          <Card key={r.id}>
            <CardHeader>
              <CardTitle>
                Phòng {r.order.room?.name ?? "—"} · {r.branch.name}
              </CardTitle>
              <CardDescription>
                {r.requestedBy?.fullName ?? "—"} gửi lúc {formatTime(r.createdAt)}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <AdjustmentDiff request={r} />
              <p className="text-sm">Lý do: {r.note}</p>
            </CardContent>
            <CardFooter className="gap-2">
              <Button disabled={busyId === r.id} onClick={() => approve(r)}>
                <CheckIcon data-icon="inline-start" />
                Duyệt
              </Button>
              <Button variant="outline" disabled={busyId === r.id} onClick={() => setRejecting(r)}>
                <XIcon data-icon="inline-start" />
                Từ chối
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>
      <ReasonDialog
        open={!!rejecting}
        onOpenChange={(open) => !open && setRejecting(null)}
        title={`Từ chối giảm giá phòng ${rejecting?.order.room?.name ?? ""}?`}
        confirmLabel="Từ chối"
        reasonLabel="Lý do từ chối"
        placeholder="Ví dụ: chưa đủ điều kiện giảm"
        requiredMessage="Vui lòng nhập lý do từ chối"
        onConfirm={reject}
      />
    </div>
  );
}
