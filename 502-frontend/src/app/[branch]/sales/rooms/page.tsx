"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ClockIcon,
  DoorOpenIcon,
  EyeIcon,
  PlayIcon,
  ReceiptTextIcon,
  RefreshCwIcon,
  UserRoundIcon,
  WrenchIcon,
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
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useAuth } from "@/components/auth-provider";
import { EmptyState } from "@/components/data-states";
import { PageHeader } from "@/components/layout/page-header";
import { CheckoutDialog } from "@/components/sales/checkout-dialog";
import { OpenRoomDialog } from "@/components/sales/open-room-dialog";
import { useNotify } from "@/hooks/use-notify";
import { useNow } from "@/hooks/use-now";
import api from "@/lib/api";
import { useBranchCode } from "@/lib/branch";
import { formatDuration, formatMoney, formatTime, minutesBetween } from "@/lib/format";
import { can } from "@/lib/permissions";
import type { FloorStaff, Room, RoomStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const ALL = "ALL";
type Filter = RoomStatus | typeof ALL;

// Columns only when each card stays wide enough (~19rem) for its two buttons.
const ROOM_GRID =
  "grid gap-4 @2xl/main:grid-cols-2 @[62rem]/main:grid-cols-3 @[82rem]/main:grid-cols-4 @[102rem]/main:grid-cols-5";

const STATUS: Record<RoomStatus, { label: string; badge: "success" | "destructive" | "secondary" }> = {
  AVAILABLE: { label: "Trống", badge: "success" },
  ACTIVE: { label: "Đang hát", badge: "destructive" },
  MAINTENANCE: { label: "Bảo trì", badge: "secondary" },
};

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

  const [rooms, setRooms] = useState<Room[]>([]);
  const [staff, setStaff] = useState<FloorStaff[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<Filter>(ALL);
  const [openingRoom, setOpeningRoom] = useState<Room | null>(null);
  const [checkoutRoom, setCheckoutRoom] = useState<Room | null>(null);

  const fetchData = useCallback(async () => {
    setRefreshing(true);
    try {
      const [roomsRes, staffRes] = await Promise.all([
        api.get<Room[]>("/rooms", { params: { branch } }),
        canOperate
          ? api.get<FloorStaff[]>("/users/floor-staff", { params: { branch } })
          : Promise.resolve({ data: [] as FloorStaff[] }),
      ]);
      setRooms(roomsRes.data);
      setStaff(staffRes.data);
    } catch (error) {
      notify.error(error, "Không tải được sơ đồ phòng");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [branch, canOperate, notify]);

  useEffect(() => {
    fetchData();
    // Keep the map fresh when several cashiers work at the same time.
    const timer = setInterval(fetchData, 30_000);
    return () => clearInterval(timer);
  }, [fetchData]);

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
        title={canOperate ? "Sơ đồ phòng" : "Phòng đang phục vụ"}
        description={
          canOperate
            ? "Mở phòng, gọi món và thanh toán. Sơ đồ tự cập nhật mỗi 30 giây."
            : "Các phòng bạn đang được phân công phục vụ (chỉ xem)."
        }
        actions={
          <Button variant="outline" onClick={fetchData} disabled={refreshing}>
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
              {STATUS[status].label} · {counts[status]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      )}

      {loading ? (
        <div className={ROOM_GRID}>
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-48 rounded-xl" />
          ))}
        </div>
      ) : rooms.length === 0 ? (
        <EmptyState
          icon={DoorOpenIcon}
          title={canOperate ? "Cơ sở chưa có phòng nào" : "Bạn chưa được phân công phòng nào"}
          description={
            canOperate
              ? "Thêm phòng trong Cài đặt bán hàng để bắt đầu nhận khách."
              : "Khi thu ngân mở phòng và chọn bạn phục vụ, phòng sẽ hiện ở đây."
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
                return (
                  <Card
                    key={room.id}
                    data-status={room.status}
                    className={cn(
                      "gap-4 border-t-4 transition-shadow hover:shadow-md",
                      room.status === "AVAILABLE" && "border-t-success",
                      active && "border-t-destructive",
                      room.status === "MAINTENANCE" && "border-t-muted-foreground/30 opacity-75",
                    )}
                  >
                    <CardHeader>
                      <CardTitle className="text-xl">{room.name}</CardTitle>
                      <CardDescription>
                        {room.type === "VIP" ? "VIP" : "Thường"} · {formatMoney(room.pricePerHour)}/giờ
                      </CardDescription>
                      <CardAction>
                        <Badge variant={status.badge}>{status.label}</Badge>
                      </CardAction>
                    </CardHeader>
                    <CardContent className="flex-1 text-sm">
                      {active && room.startTime ? (
                        <div className="flex flex-col gap-1.5">
                          <div className="flex items-center gap-2">
                            <ClockIcon className="size-4 text-muted-foreground" />
                            <span className="font-medium tabular-nums">
                              {formatDuration(minutesBetween(room.startTime, now))}
                            </span>
                            <span className="text-muted-foreground">từ {formatTime(room.startTime)}</span>
                          </div>
                          {(room.activeOrder?.server || room.activeOrder?.cskh) && (
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <UserRoundIcon className="size-4" />
                              <span className="truncate">
                                {[room.activeOrder?.server?.fullName, room.activeOrder?.cskh?.fullName]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </span>
                            </div>
                          )}
                        </div>
                      ) : room.status === "MAINTENANCE" ? (
                        <p className="flex items-center gap-2 text-muted-foreground">
                          <WrenchIcon className="size-4" /> Đang bảo trì
                        </p>
                      ) : (
                        <p className="text-muted-foreground">Sẵn sàng đón khách</p>
                      )}
                    </CardContent>
                    {(active || (canOperate && room.status === "AVAILABLE")) && (
                      <CardFooter className="grid grid-cols-2 gap-2">
                        {active ? (
                          <>
                            <Button
                              variant="outline"
                              className={cn("min-w-0", !canOperate && "col-span-2")}
                              onClick={() => router.push(detailPath(room))}
                            >
                              <EyeIcon data-icon="inline-start" />
                              {canOperate ? "Gọi món" : "Chi tiết"}
                            </Button>
                            {canOperate && (
                              <Button className="min-w-0" onClick={() => setCheckoutRoom(room)}>
                                <ReceiptTextIcon data-icon="inline-start" />
                                Thanh toán
                              </Button>
                            )}
                          </>
                        ) : (
                          <Button variant="secondary" className="col-span-2" onClick={() => setOpeningRoom(room)}>
                            <PlayIcon data-icon="inline-start" />
                            Mở phòng
                          </Button>
                        )}
                      </CardFooter>
                    )}
                  </Card>
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

      <CheckoutDialog
        orderId={checkoutRoom?.activeOrderId ?? null}
        roomName={checkoutRoom?.name}
        open={!!checkoutRoom}
        onOpenChange={(open) => !open && setCheckoutRoom(null)}
        onCheckedOut={fetchData}
      />
    </>
  );
}
