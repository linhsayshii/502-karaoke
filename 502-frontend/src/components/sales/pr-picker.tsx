"use client";

import { useMemo, useState } from "react";
import { ContactIcon, SearchIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ListLimitNotice } from "@/components/data-states";
import { useApiData } from "@/hooks/use-api-data";
import type { AvailablePr, PrSession } from "@/lib/types";

const TILES = "grid grid-cols-2 gap-2 @lg/menu:grid-cols-3 @3xl/menu:grid-cols-4";

// PR/KTV tiles of the room page: tap one to put them into this room from now.
// Someone sitting in another room is shown there and cannot be tapped.
export function PrPicker({
  branch,
  orderId,
  sessions,
  onAdd,
}: {
  branch: string;
  orderId: number;
  sessions: PrSession[];
  // Resolves once the request ended (saved or not).
  onAdd: (prStaffId: number) => Promise<unknown>;
}) {
  // Reload when this room's visits change (added, ended, removed): the tiles
  // remount with a new key and fetch again, while the search text stays here.
  const signature = sessions.map((s) => `${s.id}:${s.endAt ?? ""}`).join(",");
  const [search, setSearch] = useState("");
  // Tiles stay disabled while an add is in flight, so a double tap cannot
  // queue a second request for the same PR.
  const [pending, setPending] = useState(false);
  const add = (prStaffId: number) => {
    setPending(true);
    onAdd(prStaffId).finally(() => setPending(false));
  };

  return (
    <div className="flex flex-col gap-4">
      <InputGroup>
        <InputGroupAddon>
          <SearchIcon />
        </InputGroupAddon>
        <InputGroupInput
          placeholder="Tìm tên hoặc mã PR..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Tìm PR/KTV"
        />
      </InputGroup>
      <PrTiles key={signature} branch={branch} orderId={orderId} keyword={search.trim().toLowerCase()} pending={pending} onAdd={add} />
    </div>
  );
}

function PrTiles({
  branch,
  orderId,
  keyword,
  pending,
  onAdd,
}: {
  branch: string;
  orderId: number;
  keyword: string;
  pending: boolean;
  onAdd: (prStaffId: number) => void;
}) {
  const { data, total, loading } = useApiData<AvailablePr[]>(
    "/pr/available",
    { branch },
    [],
    "Không thể tải danh sách PR/KTV",
  );

  const shown = useMemo(
    () =>
      data.filter((p) => !keyword || p.name.toLowerCase().includes(keyword) || p.code?.toLowerCase().includes(keyword)),
    [data, keyword],
  );

  return (
    <>
      <ListLimitNotice shown={data.length} total={total} noun="người" hint="Tìm theo tên hoặc mã." />
      {loading ? (
        <div className={TILES}>
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-20 rounded-md" />
          ))}
        </div>
      ) : shown.length === 0 ? (
        <EmptyState
          icon={ContactIcon}
          title={data.length === 0 ? "Chưa có PR/KTV đang làm" : "Không tìm thấy PR/KTV"}
          description={data.length === 0 ? "Thêm PR/KTV ở trang Thống kê PR." : "Thử từ khóa khác."}
        />
      ) : (
        <div className={TILES}>
          {shown.map((pr) => {
            const here = pr.currentRoom?.orderId === orderId;
            const elsewhere = pr.currentRoom && !here;
            return (
              <Button
                key={pr.id}
                variant="outline"
                disabled={pending || !!pr.currentRoom}
                className="relative h-auto min-h-20 flex-col items-start justify-between gap-2 p-3 text-left whitespace-normal"
                onClick={() => onAdd(pr.id)}
              >
                {here && <Badge className="absolute top-2 right-2">Trong phòng</Badge>}
                <span className="line-clamp-2 pr-8 font-medium">{pr.name}</span>
                <span className="flex w-full flex-wrap items-center gap-1 text-xs font-normal text-muted-foreground">
                  {pr.code && <span>{pr.code}</span>}
                  {pr.checkedIn && <Badge variant="success">Đã điểm danh</Badge>}
                  {elsewhere && <span>Đang ở phòng {pr.currentRoom?.roomName ?? "khác"}</span>}
                </span>
              </Button>
            );
          })}
        </div>
      )}
    </>
  );
}
