"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, PlayCircle, StopCircle, CreditCard, Eye, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/components/auth-provider";
import { CheckoutDialog } from "@/components/sales/checkout-dialog";
import api, { apiErrorMessage } from "@/lib/api";
import { useBranchCode } from "@/lib/branch";
import { formatTime } from "@/lib/format";
import { can } from "@/lib/permissions";
import type { FloorStaff, Room } from "@/lib/types";

// Rooms grouped by floor = first digit of the room name.
function groupByFloor(rooms: Room[]) {
  const floors: Record<string, Room[]> = {};
  for (const room of rooms) {
    const floor = room.name.match(/(\d)/)?.[1] ?? "Khác";
    (floors[floor] ??= []).push(room);
  }
  return floors;
}

export default function RoomsPage() {
  const router = useRouter();
  const branch = useBranchCode();
  const { user } = useAuth();
  const { toast } = useToast();
  const canOperate = can(user, "sales.operate");

  const [rooms, setRooms] = useState<Room[]>([]);
  const [staff, setStaff] = useState<FloorStaff[]>([]);
  const [loading, setLoading] = useState(true);

  const [openDialogRoom, setOpenDialogRoom] = useState<Room | null>(null);
  const [selectedCskh, setSelectedCskh] = useState("");
  const [selectedServer, setSelectedServer] = useState("");
  const [opening, setOpening] = useState(false);

  const [checkoutRoom, setCheckoutRoom] = useState<Room | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  const fetchData = useCallback(async () => {
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
      toast({
        title: "Lỗi",
        description: apiErrorMessage(error, "Không tải được sơ đồ phòng"),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [branch, canOperate, toast]);

  useEffect(() => {
    fetchData();
    // Keep the map fresh when several cashiers work at the same time.
    const timer = setInterval(fetchData, 30_000);
    return () => clearInterval(timer);
  }, [fetchData]);

  const cskhStaff = staff.filter((s) => s.position === "CSKH");
  const serverStaff = staff.filter((s) => s.position === "SERVER");
  const floors = groupByFloor(rooms);
  const detailPath = (room: Room) => `/${branch}/sales/rooms/${room.id}`;

  const startOpenRoom = (room: Room) => {
    setOpenDialogRoom(room);
    setSelectedCskh("");
    setSelectedServer("");
  };

  const confirmOpenRoom = async () => {
    if (!openDialogRoom) return;
    setOpening(true);
    try {
      await api.post("/orders", {
        roomId: openDialogRoom.id,
        cskhId: selectedCskh ? Number(selectedCskh) : undefined,
        serverId: selectedServer ? Number(selectedServer) : undefined,
      });
      toast({ title: "Đã mở phòng", description: `Phòng ${openDialogRoom.name} bắt đầu tính giờ.` });
      setOpenDialogRoom(null);
      fetchData();
    } catch (error) {
      toast({
        title: "Lỗi",
        description: apiErrorMessage(error, "Có lỗi xảy ra khi mở phòng"),
        variant: "destructive",
      });
    } finally {
      setOpening(false);
    }
  };

  const startCheckout = (room: Room) => {
    setCheckoutRoom(room);
    setCheckoutOpen(true);
  };

  return (
    <div className="space-y-8 p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-3xl font-bold tracking-tight text-slate-800">
          {canOperate ? "Sơ đồ phòng" : "Phòng bạn đang phục vụ"}
        </h2>
        <div className="flex items-center gap-4">
          <div className="flex gap-4 rounded-lg bg-white p-2 shadow-sm">
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-green-500"></div>
              <span className="text-sm font-medium text-slate-600">Trống</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 animate-pulse rounded-full bg-red-500"></div>
              <span className="text-sm font-medium text-slate-600">Đang hát</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-gray-300"></div>
              <span className="text-sm font-medium text-slate-600">Bảo trì</span>
            </div>
          </div>
          <Button variant="outline" size="icon" onClick={fetchData} title="Tải lại">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {!loading && rooms.length === 0 && (
        <p className="py-12 text-center text-muted-foreground">
          {canOperate
            ? "Cơ sở này chưa có phòng nào. Quản lý có thể thêm phòng trong mục Cài đặt."
            : "Hiện bạn chưa được phân công phục vụ phòng nào."}
        </p>
      )}

      {Object.keys(floors)
        .sort()
        .map((floor) => (
          <div key={floor} className="space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-800 font-bold text-white">
                {floor}
              </div>
              <h3 className="text-xl font-semibold text-slate-700">Tầng {floor}</h3>
            </div>
            <div className="grid gap-6 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {floors[floor].map((room) => (
                <Card
                  key={room.id}
                  onClick={() => room.status === "ACTIVE" && router.push(detailPath(room))}
                  className={`group cursor-pointer overflow-hidden border-t-4 transition-all duration-200 hover:shadow-xl ${
                    room.status === "ACTIVE"
                      ? "border-t-red-500 shadow-red-100"
                      : room.status === "MAINTENANCE"
                        ? "border-t-gray-400 bg-gray-50"
                        : "border-t-green-500 shadow-green-50"
                  }`}
                >
                  <CardHeader className="bg-slate-50/50 pb-2">
                    <div className="flex items-start justify-between">
                      <CardTitle className="text-xl font-bold text-slate-800">{room.name}</CardTitle>
                      <Badge
                        variant={room.type === "VIP" ? "default" : "secondary"}
                        className="font-semibold"
                      >
                        {room.type}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-4">
                    <div className="space-y-4">
                      {room.status === "ACTIVE" ? (
                        <>
                          <div className="space-y-1 rounded-md bg-red-50 p-2 text-sm text-slate-600">
                            <div className="flex items-center">
                              <Clock className="mr-2 h-4 w-4 text-red-500" />
                              <span className="font-medium">{formatTime(room.startTime)}</span>
                            </div>
                            {room.activeOrder?.server && (
                              <div className="truncate text-xs">
                                Phục vụ: {room.activeOrder.server.fullName}
                              </div>
                            )}
                          </div>
                          <div className={`grid gap-2 ${canOperate ? "grid-cols-2" : "grid-cols-1"}`}>
                            <Button
                              className="w-full"
                              variant="outline"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                router.push(detailPath(room));
                              }}
                            >
                              <Eye className="mr-2 h-4 w-4" /> Chi tiết
                            </Button>
                            {canOperate && (
                              <Button
                                className="w-full bg-red-600 text-white hover:bg-red-700"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  startCheckout(room);
                                }}
                              >
                                <CreditCard className="mr-2 h-4 w-4" /> Thanh toán
                              </Button>
                            )}
                          </div>
                        </>
                      ) : room.status === "MAINTENANCE" ? (
                        <div className="flex h-[88px] flex-col items-center justify-center text-muted-foreground">
                          <StopCircle className="mb-2 h-8 w-8 opacity-50" />
                          <span className="italic">Đang bảo trì</span>
                        </div>
                      ) : (
                        <>
                          <div className="flex h-[52px] items-center justify-center rounded-md border border-green-100 bg-green-50 font-medium text-green-600">
                            Sẵn sàng đón khách
                          </div>
                          {canOperate && (
                            <Button
                              className="mt-2 w-full bg-green-600 hover:bg-green-700"
                              onClick={(e) => {
                                e.stopPropagation();
                                startOpenRoom(room);
                              }}
                            >
                              <PlayCircle className="mr-2 h-4 w-4" /> Mở phòng
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ))}

      <Dialog open={!!openDialogRoom} onOpenChange={(open) => !open && setOpenDialogRoom(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mở phòng {openDialogRoom?.name}</DialogTitle>
            <DialogDescription>
              Chọn nhân viên phụ trách (có thể đổi sau trong chi tiết phòng).
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">CSKH</Label>
              <Select value={selectedCskh} onValueChange={setSelectedCskh}>
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder="Chọn nhân viên CSKH" />
                </SelectTrigger>
                <SelectContent>
                  {cskhStaff.map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      {s.fullName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">Phục vụ</Label>
              <Select value={selectedServer} onValueChange={setSelectedServer}>
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder="Chọn nhân viên phục vụ" />
                </SelectTrigger>
                <SelectContent>
                  {serverStaff.map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      {s.fullName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {staff.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Cơ sở chưa có nhân viên CSKH/phục vụ. Quản lý có thể thêm trong mục Quản trị.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenDialogRoom(null)}>
              Hủy
            </Button>
            <Button onClick={confirmOpenRoom} disabled={opening}>
              {opening ? "Đang mở..." : "Xác nhận mở phòng"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CheckoutDialog
        orderId={checkoutRoom?.activeOrderId ?? null}
        roomName={checkoutRoom?.name}
        open={checkoutOpen}
        onOpenChange={setCheckoutOpen}
        onCheckedOut={fetchData}
      />
    </div>
  );
}
