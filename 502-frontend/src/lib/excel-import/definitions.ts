import { DoorOpenIcon, PackageIcon, PackagePlusIcon, TagsIcon, UsersIcon, type LucideIcon } from "lucide-react";
import { POSITION_LABELS, ROLE_LABELS, type Permission } from "@/lib/permissions";
import type { ImportAction } from "@/lib/types";

// What each kind of Excel import needs: the fields a column can be mapped
// to, how cells are read, and which API endpoint checks and writes the rows.

export type ImportType = "products" | "categories" | "stock-import" | "rooms" | "users";

export type FieldKind = "text" | "number" | "int" | "bool" | "enum";

export interface ImportField {
  key: string;
  label: string;
  kind: FieldKind;
  // always: every row needs it; create: only rows that create a new record.
  required?: "always" | "create";
  // enum: API value → accepted spellings (compared without diacritics).
  options?: Record<string, string[]>;
  // Column headers that usually mean this field (without diacritics too).
  aliases: string[];
  hint?: string;
  example: string | number;
  // Cleans a text value (e.g. a phone number Excel stored as a number).
  normalize?: (value: string) => string;
}

export interface ImportDefinition {
  type: ImportType;
  title: string;
  description: string;
  icon: LucideIcon;
  permission: Permission;
  endpoint: string;
  fields: ImportField[];
  // Offer "skip / update" for rows matching an existing record.
  duplicates: boolean;
  // A switch sent with the rows, e.g. create missing categories.
  createOption?: { key: "createCategories" | "createProducts"; label: string; description: string };
  // Where the imported data can be seen afterwards (after /[branch]).
  resultPath: string;
  resultLabel: string;
  actionLabels?: Partial<Record<ImportAction, string>>;
}

const productName: ImportField = {
  key: "name",
  label: "Tên mặt hàng",
  kind: "text",
  required: "always",
  aliases: ["tên mặt hàng", "mặt hàng", "tên sản phẩm", "tên sp", "sản phẩm", "tên hàng", "hàng hóa", "tên", "product", "item"],
  example: "Bia Tiger",
};
const unit: ImportField = {
  key: "unit",
  label: "Đơn vị tính",
  kind: "text",
  required: "create",
  aliases: ["đơn vị tính", "đvt", "đơn vị", "unit"],
  example: "lon",
};
const price: ImportField = {
  key: "price",
  label: "Giá bán",
  kind: "number",
  required: "create",
  aliases: ["giá bán", "giá bán lẻ", "giá niêm yết", "price"],
  example: 25000,
};
const categoryName: ImportField = {
  key: "categoryName",
  label: "Danh mục",
  kind: "text",
  aliases: ["danh mục", "nhóm", "nhóm hàng", "loại hàng", "category"],
  hint: "Theo tên danh mục của cơ sở",
  example: "Đồ uống",
};

export const IMPORT_DEFINITIONS: ImportDefinition[] = [
  {
    type: "products",
    title: "Mặt hàng",
    description: "Tạo mới hoặc cập nhật tên, đơn vị tính, giá bán, danh mục.",
    icon: PackageIcon,
    permission: "sales.settings",
    endpoint: "/imports/products",
    duplicates: true,
    createOption: {
      key: "createCategories",
      label: "Tạo danh mục chưa có",
      description: "Tên danh mục trong file chưa có ở cơ sở sẽ được tạo mới.",
    },
    fields: [
      productName,
      unit,
      price,
      categoryName,
      {
        key: "trackStock",
        label: "Quản lý tồn kho",
        kind: "bool",
        aliases: ["quản lý tồn kho", "theo dõi tồn kho", "quản lý kho", "track stock"],
        hint: "Có/Không; bỏ trống là Có. Phụ thu, dịch vụ chọn Không",
        example: "Có",
      },
    ],
    resultPath: "/sales/settings",
    resultLabel: "Xem mặt hàng",
  },
  {
    type: "categories",
    title: "Danh mục",
    description: "Tạo các danh mục mặt hàng còn thiếu.",
    icon: TagsIcon,
    permission: "sales.settings",
    endpoint: "/imports/categories",
    duplicates: false,
    fields: [
      {
        key: "name",
        label: "Tên danh mục",
        kind: "text",
        required: "always",
        aliases: ["tên danh mục", "danh mục", "nhóm", "nhóm hàng", "loại hàng", "category", "tên"],
        example: "Đồ uống",
      },
    ],
    resultPath: "/sales/settings",
    resultLabel: "Xem danh mục",
  },
  {
    type: "stock-import",
    title: "Phiếu nhập kho",
    description: "Cả file thành một phiếu nhập: mặt hàng, số lượng, đơn giá nhập.",
    icon: PackagePlusIcon,
    permission: "inventory",
    endpoint: "/imports/stock-import",
    duplicates: false,
    createOption: {
      key: "createProducts",
      label: "Tạo mặt hàng chưa có",
      description: "Mặt hàng mới cần có đơn vị tính và giá bán trong file; danh mục chưa có cũng được tạo.",
    },
    fields: [
      { ...productName, key: "productName" },
      {
        key: "quantity",
        label: "Số lượng",
        kind: "int",
        required: "always",
        aliases: ["số lượng", "số lượng nhập", "sl", "qty", "quantity"],
        example: 24,
      },
      {
        key: "unitCost",
        label: "Đơn giá nhập",
        kind: "number",
        aliases: ["đơn giá nhập", "giá nhập", "đơn giá", "giá vốn", "cost"],
        hint: "Bỏ trống: lấy giá vốn hiện tại",
        example: 15000,
      },
      { ...unit, hint: "Chỉ dùng khi tạo mặt hàng mới" },
      { ...price, hint: "Chỉ dùng khi tạo mặt hàng mới" },
      { ...categoryName, hint: "Chỉ dùng khi tạo mặt hàng mới" },
    ],
    resultPath: "/inventory/documents",
    resultLabel: "Xem phiếu kho",
    actionLabels: { CREATE: "Mặt hàng mới", UPDATE: "Nhập kho" },
  },
  {
    type: "rooms",
    title: "Phòng hát",
    description: "Tạo mới hoặc cập nhật loại phòng và giá theo giờ.",
    icon: DoorOpenIcon,
    permission: "sales.settings",
    endpoint: "/imports/rooms",
    duplicates: true,
    fields: [
      {
        key: "name",
        label: "Tên phòng",
        kind: "text",
        required: "always",
        aliases: ["tên phòng", "phòng", "số phòng", "room", "tên"],
        example: "P101",
      },
      {
        key: "type",
        label: "Loại phòng",
        kind: "enum",
        options: { NORMAL: ["thường", "normal", "bình thường", "thuong"], VIP: ["vip"] },
        aliases: ["loại phòng", "loại", "type"],
        hint: "Thường hoặc VIP; bỏ trống là Thường",
        example: "VIP",
      },
      {
        key: "pricePerHour",
        label: "Giá theo giờ",
        kind: "number",
        required: "create",
        aliases: ["giá theo giờ", "giá giờ", "giá phòng", "giá", "đơn giá", "price"],
        example: 150000,
      },
    ],
    resultPath: "/sales/settings",
    resultLabel: "Xem phòng",
  },
  {
    type: "users",
    title: "Nhân viên",
    description: "Tạo tài khoản nhân viên (chưa có mật khẩu) hoặc cập nhật thông tin.",
    icon: UsersIcon,
    permission: "users",
    endpoint: "/imports/users",
    duplicates: true,
    fields: [
      {
        key: "fullName",
        label: "Họ tên",
        kind: "text",
        required: "always",
        aliases: ["họ tên", "họ và tên", "tên nhân viên", "nhân viên", "tên", "full name", "name"],
        example: "Nguyễn Văn An",
      },
      {
        key: "username",
        label: "Tên đăng nhập",
        kind: "text",
        aliases: ["tên đăng nhập", "tài khoản", "username", "user"],
        hint: "Bỏ trống: tự tạo từ họ tên (nguyen.van.an)",
        example: "nguyen.van.an",
      },
      {
        key: "phone",
        label: "Số điện thoại",
        kind: "text",
        aliases: ["số điện thoại", "điện thoại", "sđt", "đt", "phone", "mobile"],
        example: "0909123456",
        // Excel drops the leading 0 of a phone number stored as a number.
        normalize: (value) => (/^[1-9]\d{8}$/.test(value) ? `0${value}` : value),
      },
      {
        key: "position",
        label: "Chức vụ",
        kind: "enum",
        options: {
          CSKH: [POSITION_LABELS.CSKH, "chăm sóc khách hàng"],
          SERVER: [POSITION_LABELS.SERVER, "server", "pv"],
        },
        aliases: ["chức vụ", "vị trí", "bộ phận", "position"],
        hint: "CSKH hoặc Phục vụ",
        example: POSITION_LABELS.SERVER,
      },
      {
        key: "role",
        label: "Vai trò",
        kind: "enum",
        options: {
          STAFF: [ROLE_LABELS.STAFF, "nv", "staff"],
          CASHIER: [ROLE_LABELS.CASHIER, "cashier"],
          BRANCH_MANAGER: [ROLE_LABELS.BRANCH_MANAGER, "quản lý", "branch manager"],
        },
        aliases: ["vai trò", "quyền", "role"],
        hint: "Bỏ trống là Nhân viên",
        example: ROLE_LABELS.STAFF,
      },
    ],
    resultPath: "/admin/users",
    resultLabel: "Xem tài khoản",
  },
];

export function importDefinition(type: string | null) {
  return IMPORT_DEFINITIONS.find((d) => d.type === type);
}

export const ACTION_LABELS: Record<ImportAction, string> = {
  CREATE: "Tạo mới",
  UPDATE: "Cập nhật",
  SKIP: "Bỏ qua",
  ERROR: "Lỗi",
};

export const MAX_IMPORT_ROWS = 1000;
