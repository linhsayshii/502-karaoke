"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DoorOpenIcon, MicVocalIcon, RefreshCwIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useAuth } from "@/components/auth-provider";
import { EmptyState } from "@/components/data-states";
import { PageHeader } from "@/components/layout/page-header";
import { OpenRoomDialog } from "@/components/sales/open-room-dialog";
import { useNotify } from "@/hooks/use-notify";
import { useNow } from "@/hooks/use-now";
import { usePolling } from "@/hooks/use-polling";
import api from "@/lib/api";
import { useBranchCode } from "@/lib/branch";
import { formatElapsed, formatMoney, formatTime, minutesBetween } from "@/lib/format";
import { can } from "@/lib/permissions";
import type { FloorStaff, Room, RoomStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const ALL = "ALL";
type Filter = RoomStatus | typeof ALL;

// Square tiles of at least 6rem: three per row on a 360px phone, more as the page widens.
const ROOM_GRID = "grid grid-cols-[repeat(auto-fill,minmax(6rem,1fr))] gap-3";

const STATUS: Record<RoomStatus, { label: string; dot: string; tile: string; mic: string }> = {
  AVAILABLE: {
    label: "Trống",
    dot: "bg-success",
    tile: "border-success/40 hover:bg-success/5",
    mic: "text-success",
  },
  ACTIVE: {
    label: "Đang hát",
    dot: "bg-destructive",
    tile: "border-destructive/50 bg-destructive/5 hover:bg-destructive/10",
    mic: "text-destructive",
  },
  MAINTENANCE: {
    label: "Bảo trì",
    dot: "bg-muted-foreground/40",
    tile: "border-dashed opacity-60",
    mic: "text-muted-foreground",
  },
};

function StatusDot({ status }: { status: RoomStatus }) {
  return (
    <span className="relative flex size-2.5">
      {status === "ACTIVE" && (
        <span className="absolute inline-flex size-full rounded-full bg-destructive opacity-60 motion-safe:animate-ping" />
      )}
      <span className={cn("relative inline-flex size-2.5 rounded-full", STATUS[status].dot)} />
    </span>
  );
}

// Hover text with what the tile leaves out: type, price, start time, staff.
function roomSummary(room: Room) {
  const parts = [
    room.name,
    room.type === "VIP" ? "VIP" : "Thường",
    `${formatMoney(room.pricePerHour)}/giờ`,
    STATUS[room.status].label,
  ];
  if (room.status === "ACTIVE" && room.startTime) parts.push(`từ ${formatTime(room.startTime)}`);
  const staff = [room.activeOrder?.server?.fullName, room.activeOrder?.cskh?.fullName].filter(Boolean);
  if (staff.length > 0) parts.push(`Phục vụ: ${staff.join(", ")}`);
  return parts.join(" · ");
}

// Rooms grouped by floor = first digit of the room name ("P203" -> 2).
function groupByFloor(rooms: Room[]) {
  const floors = new Map<string, Room[]>();
  for (const room of rooms) {
    const floor = room.name.match(/\d/)?.[0] ?? "Khác";
    floors.set(floor, [...(floors.get(floor) ?? []), room]);
  }
  return [...floors].sort(([a], [b]) => a.localeCompare(b));
}

export default function RoomsPage() {
  const router = useRouter();
  const branch = useBranchCode();
  const { user } = useAuth();
  const notify = useNotify();
  const now = useNow();
  const canOperate = can(user, "sales.operate");
  // Staff only see the rooms they serve; HĐQT sees every room, read only.
  const staffView = user?.role === "STAFF";

  const [rooms, setRooms] = useState<Room[]>([]);
  const [staff, setStaff] = useState<FloorStaff[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<Filter>(ALL);
  const [openingRoom, setOpeningRoom] = useState<Room | null>(null);

  // The staff list changes rarely: it loads with the page, on "Làm mới", every
  // 5 minutes and when the tab comes back, not with every room refresh.
  const fetchData = useCallback(
    async (withStaff = true) => {
      setRefreshing(true);
      try {
        const [roomsRes, staffRes] = await Promise.all([
          api.get<Room[]>("/rooms", { params: { branch } }),
          withStaff && canOperate
            ? api.get<FloorStaff[]>("/users/floor-staff", { params: { branch } })
            : Promise.resolve(null),
        ]);
        setRooms(roomsRes.data);
        if (staffRes) setStaff(staffRes.data);
      } catch (error) {
        notify.error(error, "Không tải được sơ đồ phòng");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [branch, canOperate, notify],
  );

  useEffect(() => {
    fetchData();
  }, [fetchData]);
  // Keep the map fresh when several cashiers work at the same time.
  usePolling(() => fetchData(false), 30_000);
  usePolling(
    async () => {
      try {
        const res = await api.get<FloorStaff[]>("/users/floor-staff", { params: { branch } });
        setStaff(res.data);
      } catch {
        // Kept silent: the next tick retries, and the room refresh reports errors.
      }
    },
    5 * 60_000,
    canOperate,
  );

  const counts = useMemo(() => {
    const result: Record<Filter, number> = { ALL: rooms.length, AVAILABLE: 0, ACTIVE: 0, MAINTENANCE: 0 };
    for (const room of rooms) result[room.status] += 1;
    return result;
  }, [rooms]);

  const shown = filter === ALL ? rooms : rooms.filter((r) => r.status === filter);
  const detailPath = (room: Room) => `/${branch}/sales/rooms/${room.id}`;

  return (
    <>
      <PageHeader
        title={staffView ? "Phòng đang phục vụ" : "Sơ đồ phòng"}
        info={
          canOperate
            ? "Mở phòng, gọi món và thanh toán. Sơ đồ tự cập nhật mỗi 30 giây."
            : staffView
              ? "Các phòng bạn đang được phân công phục vụ (chỉ xem)."
              : "Sơ đồ phòng của cơ sở (chỉ xem). Tự cập nhật mỗi 30 giây."
        }
        actions={
          <Button variant="outline" onClick={() => fetchData()} disabled={refreshing}>
            <RefreshCwIcon data-icon="inline-start" className={cn(refreshing && "animate-spin")} />
            Tải lại
          </Button>
        }
      />

      {canOperate && rooms.length > 0 && (
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          spacing={2}
          value={filter}
          onValueChange={(value) => value && setFilter(value as Filter)}
          className="flex-wrap"
          aria-label="Lọc theo trạng thái"
        >
          <ToggleGroupItem value={ALL}>Tất cả · {counts.ALL}</ToggleGroupItem>
          {(Object.keys(STATUS) as RoomStatus[]).map((status) => (
            <ToggleGroupItem key={status} value={status}>
              <span className={cn("size-2 rounded-full", STATUS[status].dot)} />
              {STATUS[status].label} · {counts[status]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      )}

      {loading ? (
        <div className={ROOM_GRID}>
          {Array.from({ length: 12 }, (_, i) => (
            <Skeleton key={i} className="aspect-square rounded-xl" />
          ))}
        </div>
      ) : rooms.length === 0 ? (
        <EmptyState
          icon={DoorOpenIcon}
          title={staffView ? "Bạn chưa được phân công phòng nào" : "Cơ sở chưa có phòng nào"}
          description={
            staffView
              ? "Khi thu ngân mở phòng và chọn bạn phục vụ, phòng sẽ hiện ở đây."
              : "Thêm phòng trong Cài đặt bán hàng để bắt đầu nhận khách."
          }
        >
          {can(user, "sales.settings") && (
            <Button asChild>
              <Link href={`/${branch}/sales/settings`}>Thêm phòng</Link>
            </Button>
          )}
        </EmptyState>
      ) : (
        groupByFloor(shown).map(([floor, floorRooms]) => (
          <section key={floor} className="flex flex-col gap-3">
            <h2 className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              {floor === "Khác" ? "Khác" : `Tầng ${floor}`}
              <Badge variant="outline">{floorRooms.length} phòng</Badge>
            </h2>
            <div className={ROOM_GRID}>
              {floorRooms.map((room) => {
                const status = STATUS[room.status];
                const active = room.status === "ACTIVE";
                // Active: ordering and checkout are on the room page; available: open it here.
                const onClick = active
                  ? () => router.push(detailPath(room))
                  : canOperate && room.status === "AVAILABLE"
                    ? () => setOpeningRoom(room)
                    : undefined;
                return (
                  <button
                    key={room.id}
                    type="button"
                    data-status={room.status}
                    disabled={!onClick}
                    onClick={onClick}
                    title={roomSummary(room)}
                    aria-label={roomSummary(room)}
                    className={cn(
                      "relative flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border bg-card p-2 text-card-foreground shadow-xs transition-[color,background-color,box-shadow]",
                      "outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 enabled:hover:shadow-md disabled:cursor-default",
                      status.tile,
                    )}
                  >
                    <span className="absolute top-2 right-2">
                      <StatusDot status={room.status} />
                    </span>
                    {room.type === "VIP" && (
                      <span className="absolute top-1.5 left-2 text-[10px] font-semibold tracking-wide text-warning">
                        VIP
                      </span>
                    )}
                    <MicVocalIcon className={cn("size-8 shrink-0", status.mic)} strokeWidth={1.75} />
                    <span className="max-w-full truncate text-base leading-tight font-semibold">{room.name}</span>
                    <span
                      className={cn(
                        "text-xs tabular-nums",
                        active ? "font-medium text-destructive" : "text-muted-foreground",
                      )}
                    >
                      {active && room.startTime ? formatElapsed(minutesBetween(room.startTime, now)) : status.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        ))
      )}

      {!loading && rooms.length > 0 && shown.length === 0 && (
        <EmptyState icon={DoorOpenIcon} title="Không có phòng nào ở trạng thái này" />
      )}

      <OpenRoomDialog
        room={openingRoom}
        staff={staff}
        onOpenChange={(open) => !open && setOpeningRoom(null)}
        onOpened={() => {
          // Straight to ordering, as the cashier usually does next.
          if (openingRoom) router.push(detailPath(openingRoom));
          setOpeningRoom(null);
        }}
      />
    </>
  );
}
