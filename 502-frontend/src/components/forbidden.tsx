import { ShieldAlertIcon } from "lucide-react";
import { EmptyState } from "@/components/data-states";

export function Forbidden({ message }: { message?: string }) {
  return (
    <EmptyState
      icon={ShieldAlertIcon}
      title="Bạn không có quyền truy cập"
      description={
        message ?? "Tài khoản của bạn không được phép sử dụng chức năng này. Liên hệ quản lý nếu cần cấp quyền."
      }
    />
  );
}
