import { ShieldAlert } from "lucide-react";

export function Forbidden({ message }: { message?: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-12 text-center text-slate-600">
      <ShieldAlert className="h-12 w-12 text-slate-400" />
      <h2 className="text-xl font-semibold text-slate-800">Bạn không có quyền truy cập</h2>
      <p className="max-w-md text-sm">
        {message ?? "Tài khoản của bạn không được phép sử dụng chức năng này. Liên hệ quản lý nếu cần cấp quyền."}
      </p>
    </div>
  );
}
