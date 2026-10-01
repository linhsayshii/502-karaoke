# Hóa đơn điện tử: bố cục hai cột, hóa đơn tự do, ngày theo nháp — thiết kế

Ngày: 01/10/2026. Trạng thái: đã duyệt thiết kế trong chat, chờ duyệt spec.

> Hóa đơn tự do (không theo bill) đã bị bỏ, thay bằng bill thêm tay trên trang báo cáo: xem `2026-10-02-trang-bao-cao-hddt-design.md`.

Spec này sửa spec gốc `2026-10-01-hoa-don-dien-tu-design.md`. Những gì không nhắc tới ở đây vẫn giữ như spec gốc: tiền, luồng gửi, Không rõ, sửa số, Minvoice, tra MST, bảo mật. Các mục bị thay thế:
- ở §2: dòng "Nơi làm việc", "Bill và hóa đơn", "Ngày hóa đơn", và mục "hóa đơn không gắn bill" trong phần ngoài phạm vi;
- §10.1–10.3.

## 1. Mục tiêu

1. **Cột trái là danh sách bill bán hàng.** Hóa đơn nhỏ được tạo, nhập số tiền và xóa ngay trong bill ở cột trái.
2. **Cột phải chỉ để xuất** hóa đơn đang chọn: ngày hóa đơn, người mua, thêm/bớt dòng hàng, lưu nháp, xuất.
3. **Hóa đơn tự do:** một HĐĐT không thuộc bill nào, tạo bằng nút **+** cạnh ô tìm bill.
4. **Thêm và xóa nhanh:** bấm + là có ngay một nháp mới, không phải điền xong hóa đơn trước. Bấm nhiều lần thì có nhiều nháp. Nháp xóa được ngay.
5. **Ngày hóa đơn thuộc về nháp:**
   - mọi hóa đơn chưa xuất (nháp, lỗi) đều sửa được ngày;
   - ngày hóa đơn là **ngày lịch theo giờ Việt Nam (UTC+7)**, không phải ngày kinh doanh.
6. **Bỏ chọn thuế suất.** Mọi dòng mới có VAT 10%. Cột thuế suất được thay bằng **Thành tiền trước VAT**.

## 2. Quyết định đã chốt

| Câu hỏi | Quyết định |
|---|---|
| Cột trái | Tabs **Bill** \| Nháp \| Lỗi \| Không rõ \| Đã xuất là bộ lọc bill. Tab Bill liệt kê bill đã thanh toán trong khoảng ngày. Nháp, Lỗi, Không rõ liệt kê bill có hóa đơn ở trạng thái đó, mọi ngày. Đã xuất liệt kê bill có hóa đơn đã xuất, theo khoảng ngày. |
| Tạo hóa đơn nhỏ của bill | Ô vuông icon **+** ở cuối mỗi dòng bill. Bỏ nút "Tạo HĐĐT mới" và dialog chọn bill. |
| Tạo hóa đơn tự do | Ô vuông icon **+** cạnh ô tìm số bill. |
| Thêm nhanh | Bấm + là tạo ngay một nháp trên server. Số tiền là phần còn lại của bill nếu còn > 0, không thì 0; hóa đơn tự do là 0. Nháp chưa có dòng hàng, chưa có người mua. Nháp có số tiền 0 lưu được nhưng không xuất được. |
| Xóa nhanh | Thùng rác trên dòng nháp. Nháp **trống** (số tiền 0, không dòng hàng, không người mua) xóa ngay. Nháp có nội dung thì hỏi xác nhận trước. |
| Số tiền | Nhập và sửa ở cột trái, ngay trên dòng hóa đơn. Cột phải chỉ hiện số tiền. |
| Ngày hóa đơn: lưu ở đâu | Cột `Einvoice.invoiceDate` có sẵn, nay giữ cả **ngày dự kiến của nháp**. Người có quyền ghi (quản lý, thu ngân) sửa ngày trong panel phải, lưu cùng Lưu nháp. Hóa đơn `UNCERTAIN` không sửa được ngày, vì việc đối chiếu cần đúng ngày đã gửi. |
| Ngày hóa đơn: mặc định | Hóa đơn của bill: **ngày lịch (giờ server, `Asia/Ho_Chi_Minh`) lúc thanh toán bill** (`endTime`). Ví dụ bill trả lúc 00:24 ngày 30/09 thuộc ngày kinh doanh 29/09 nhưng hóa đơn mang ngày 30/09. Hóa đơn tự do: ngày lịch lúc tạo. |
| Ngày hóa đơn: kiểm tra | Như spec gốc §9.3, server kiểm tra lúc **xuất**: không trước ngày của hóa đơn mới nhất cùng ký hiệu, ngày sau hôm nay phải xác nhận (`confirmFutureDate`), năm phải khớp ký hiệu. Lúc lưu nháp chỉ kiểm tra ngày hợp lệ. Panel phải hiện các vấn đề này thành cảnh báo dưới ô ngày, **không khóa** nút Xuất. |
| Xuất | Nút Xuất không có ô chọn ngày riêng. Ngày đã lưu là hôm nay thì xuất luôn. **Khác hôm nay** (trước hay sau đều vậy) thì hỏi "Đổi ngày hóa đơn về hôm nay?" với ba nút: **Hủy bỏ**, **Giữ dd/mm/yyyy**, **Đổi về hôm nay**. Giữ một ngày sau hôm nay chính là lời xác nhận ngày tương lai (`confirmFutureDate: true`); không còn hộp xác nhận ngày tương lai riêng. Nút nào mà ngày của nó bị luật §9.3 chặn thì bị tắt, và câu hỏi ghi lý do. Đổi về hôm nay thì hôm nay được ghi vào hóa đơn (lần gửi thất bại thì nháp giữ hôm nay). |
| Hóa đơn tự do: cách lưu | `Einvoice.orderId` được để trống. Không thêm bảng, không tạo bill giả. |
| Hóa đơn tự do: ngày kinh doanh | Ngày kinh doanh lúc tạo (`businessDateOf(now)`), dùng cho bộ lọc danh sách. |
| Hóa đơn tự do: cơ sở và quyền | Cơ sở lấy theo `?branch=` qua `BranchScopeService`. Quyền như nháp của bill: tạo, sửa, xóa thuộc `EINVOICE_WRITERS`; xuất thuộc `CHAIN_ONLY`; HĐQT chỉ xem. |
| Thuế suất | Giao diện không còn ô chọn. Dòng mới luôn có VAT 10% (`EINVOICE_VAT_RATE` trong `lib/einvoice.ts`). Backend vẫn nhận 0/5/8/10 như cũ. |

**Ngoài phạm vi:**
- Gộp nhiều bill vào một hóa đơn.
- Gắn hóa đơn tự do vào bill sau khi tạo.
- Chọn thuế suất khác 10% trên giao diện.
- Đổi ngày nhiều hóa đơn cùng lúc.
- Đánh số lại HĐ n sau khi xóa (vẫn theo `id`).

## 3. Dữ liệu

- `Einvoice.orderId Int?` và `order Order?`. Khóa ngoại và index `(orderId)` giữ nguyên.
- Migration `20261004000000_free_einvoices` chỉ có một câu: `ALTER TABLE "Einvoice" ALTER COLUMN "orderId" DROP NOT NULL;`. Không đụng dữ liệu cũ.
- `businessDate` vẫn bắt buộc:
  - hóa đơn của bill chép từ `Order.businessDate`, như cũ;
  - hóa đơn tự do lấy ngày kinh doanh lúc tạo.
- **Ý nghĩa mới của `invoiceDate`** (không đổi schema):
  - Với `DRAFT`: ngày dự kiến. Nháp mới luôn có ngày. Nháp tạo trước thay đổi này có thể còn `null`; frontend lúc đó hiện ngày lịch lúc thanh toán bill, và lưu nháp sẽ ghi ngày đó vào.
  - Với `SENDING`/`UNCERTAIN`/`ISSUED`: ngày đã gửi, như cũ.
  - Một lần gửi kết thúc bằng `DRAFT`, hoặc `resolve {found: false}`, **giữ** `invoiceDate` (trước đây xóa thành `null`). Ba cột còn lại của phần đầu (`sellerTaxCode`, `symbolCode`, `registerInvoiceId`) vẫn bị xóa như cũ.
  - Các truy vấn theo ngày (`latestIssued`, index `(sellerTaxCode, symbolCode, invoiceDate)`) chỉ xét hóa đơn `ISSUED` hoặc có `sellerTaxCode`, nên ngày của nháp không ảnh hưởng tới chúng.
- **`amount` của nháp được bằng 0.** Xuất thì cần `amount ≥ 1`.
- Xóa dữ liệu (HĐQT) đã xóa `Einvoice` theo `branchId`, nên hóa đơn tự do cũng bị xóa. Không phải sửa.

## 4. API backend

| Route | Thay đổi |
|---|---|
| `POST /einvoices?branch {orderId?, amount, invoiceDate?, buyer…, lines[]}` | `amount` từ 0 trở lên. `invoiceDate` (YYYY-MM-DD) tùy chọn; bỏ trống thì lấy ngày lịch lúc thanh toán bill (`toDateString(order.endTime)`), hoặc hôm nay với hóa đơn tự do. **Có `orderId`:** như cũ (bill trong phạm vi, `COMPLETED`, chưa hủy; cơ sở lấy theo bill, `?branch` bị bỏ qua). **Không có `orderId`:** cơ sở lấy theo `resolveBranchId(user, branch)` (quản lý hệ thống không truyền `branch` thì 400 "Vui lòng chọn cơ sở"; người khác truyền mã cơ sở khác thì 403); `businessDate` là ngày kinh doanh hiện tại; tạo `DRAFT` có `orderId = null`. |
| `PATCH /einvoices/:id {amount, invoiceDate?, buyer…, lines[]}` | `amount` từ 0 trở lên. `invoiceDate` tùy chọn: có thì ghi (ngày phải hợp lệ, không thì 400), bỏ trống thì giữ nguyên. Các trường còn lại vẫn thay cả nháp như cũ. |
| `POST /einvoices/:id/issue {invoiceDate, confirmFutureDate?}` | Body giữ nguyên; frontend gửi ngày đã lưu của nháp, hoặc hôm nay khi người xuất chọn "Đổi về hôm nay". Lúc khóa để gửi, server ghi ngày gửi đi vào `invoiceDate` như cũ. Thêm kiểm tra `amount ≥ 1` ("Nhập số tiền của hóa đơn", trong `issueProblem` ở cả hai bản). Kiểm tra "bill đã hủy" chỉ chạy khi hóa đơn có bill (`row.order` khác null). Kết thúc bằng `DRAFT` thì giữ `invoiceDate`. |
| `POST /einvoices/:id/resolve {found: false}` | Giữ `invoiceDate` khi trả về `DRAFT`. |
| `GET /einvoices?…&free=1` | Thêm `free` (boolean, nhận `1`/`true`). Khi bật thì chỉ lấy `orderId = null`; luật trạng thái và ngày giữ nguyên (`DRAFT`, `ERROR`, `UNCERTAIN` lấy mọi ngày). `order` của mỗi mục có thể là `null`. Gửi cùng `billNumber` thì kết quả rỗng, vì frontend không bao giờ gửi cả hai. |
| `GET /einvoices/:id` | Không đổi. Với hóa đơn tự do, `order` là `null`. |
| `GET /einvoices/bills?branch&from&to&billNumber&status` | Bỏ `businessDate`, thay bằng `from`/`to` theo ngày kinh doanh (bỏ trống cả hai thì lấy hôm nay; `from > to` thì 400). **Không có `status`:** bill `COMPLETED` trong khoảng ngày, hoặc theo đầu số bill ở mọi ngày. **Có `status`** (`DRAFT` \| `ERROR` \| `UNCERTAIN` \| `ISSUED`, cùng nghĩa với `GET /einvoices`): bill có ít nhất một hóa đơn ở trạng thái đó (`einvoices: { some: … }`, kèm `branchId` để index `(branchId, status, createdAt)` phục vụ). Không lọc trạng thái bill, để vẫn xử lý được hóa đơn Không rõ của bill đã hủy. `ISSUED` lọc thêm `Einvoice.businessDate` theo khoảng ngày; ba trạng thái còn lại lấy mọi ngày. `billNumber` lọc thêm trong mọi trường hợp. Mỗi dòng thêm `cancelledAt`. Vẫn tối đa 500, có `X-Total-Count`, sắp theo `endTime desc`. |
| `GET /einvoices/summary` | Không đổi; các số đếm theo `branchId` nên đã gồm hóa đơn tự do. |
| `GET /einvoices/bill/:orderId`, `DELETE`, `PATCH …/number` | Không đổi. |

## 5. Frontend

### 5.1. Trang `/[branch]/sales/einvoices`

- **Bố cục:**
  - Khung Minvoice ở trên cùng, giữ nguyên.
  - Từ `@4xl/main` trở lên chia hai cột `[2fr 3fr]`: cột trái là danh sách, cột phải là panel xuất.
  - Hẹp hơn thì danh sách chiếm hết chiều ngang, panel xuất mở thành `Sheet` toàn màn hình, như hiện nay.
- **Hóa đơn đang chọn:** trạng thái của trang gồm `{orderId: number | null, einvoiceId: number | null}`, với `orderId = null` là hóa đơn tự do.
  - Bill đang mở được tải một lần qua `GET /einvoices/bill/:orderId` và dùng chung cho cả hai cột.
  - Hóa đơn tự do đang chọn được tải qua `GET /einvoices/:id`.
- **Thay đổi chưa lưu:** đổi hóa đơn hoặc đổi bill khi panel phải còn thay đổi chưa lưu thì hỏi "Bỏ thay đổi chưa lưu?". Đóng tab thì hỏi qua `beforeunload`, như hiện nay.
- **Không polling.** Sau mỗi lần ghi, tải lại bill đang mở (hoặc hóa đơn tự do), danh sách, `summary` và cấu hình (sau khi xuất).
- **File:**
  - Bỏ: `einvoice-list.tsx`, `bill-picker-dialog.tsx`, `bill-einvoices-panel.tsx`.
  - Thêm: `einvoice-bill-list.tsx` (thanh lọc, nhóm tự do, các dòng bill), `bill-split.tsx` (phần mở ra của một bill), `einvoice-row.tsx` (một dòng hóa đơn có ô số tiền và nút xóa, dùng chung cho bill và nhóm tự do), `einvoice-issue-panel.tsx` (cột phải).

### 5.2. Cột trái

**Thanh lọc**, từ trên xuống:
- Tabs Bill \| Nháp n \| Lỗi n \| Không rõ n \| Đã xuất n. Số đếm lấy từ `summary` như cũ.
- `DateRangePicker` ở tab Bill và tab Đã xuất. Ba tab còn lại hiện chữ "Mọi ngày" thay cho ô chọn ngày.
- Ô "Tìm số bill…": tìm theo đầu số ở mọi ngày, dùng được ở mọi tab.
- Ô vuông icon **+** (`aria-label` "Thêm hóa đơn không theo bill", quyền `einvoices.write`).

**Nhóm "Hóa đơn không theo bill"**, nằm đầu danh sách:
- Dữ liệu từ `GET /einvoices?free=1`, cùng tab và cùng khoảng ngày.
- Ẩn khi đang tìm theo số bill, hoặc khi trống.
- Mỗi dòng là một `einvoice-row` có nhãn "HĐ #id".
- Hóa đơn tự do vừa tạo nằm trong khoảng ngày mặc định (hôm nay), nên luôn hiện ra.

**Dòng bill**, từ `GET /einvoices/bills`:
- Số bill · phòng · giờ thanh toán (kèm ngày nếu khoảng ngày dài hơn một ngày), tổng bill.
- Dòng phụ "Đã chia X · n HĐ" (màu `text-warning` nếu vượt), hoặc "Chưa có HĐĐT".
- Badge "Đã hủy" khi bill đã hủy.
- Ô vuông icon **+** ở cuối dòng (`aria-label` "Thêm hóa đơn nhỏ"). Chỉ hiện khi có quyền `einvoices.write` và bill chưa hủy. Khi bill đang mở thì nút được tô viền.
- Bấm vào dòng thì mở hoặc đóng bill.
- `ListLimitNotice` khi bị cắt ở 500.

**Bill đang mở** (`bill-split.tsx`):
- Dòng tóm tắt: VAT, giảm giá món và giờ (nếu có), đã chia, còn lại hoặc vượt.
- Cảnh báo: tổng vượt bill, bill đã hủy, bill sửa sau khi tạo hóa đơn.
- Các dòng **HĐ n**, đánh số theo `id` trong bill.
- **Chọn sẵn một hóa đơn khi mở bill:** ưu tiên hóa đơn đầu tiên khớp tab đang chọn, rồi đến hóa đơn đầu tiên chưa xuất, rồi đến hóa đơn đầu tiên. Bill chưa có hóa đơn nào thì panel phải hiện "Bấm + để thêm hóa đơn nhỏ".
- Trên điện thoại, mở bill không tự mở Sheet. Chỉ bấm vào một dòng hóa đơn mới mở Sheet.

**Thêm nhanh** (nút + của bill hoặc + của nhóm tự do):
- Gọi ngay `POST /einvoices` với số tiền mặc định (§2), `lines: []` và không có ngày (server tự điền).
- Nút + bị tắt **chỉ trong lúc** request đang chạy, để bấm đúp không tạo hai nháp. Bấm lại sau đó là có thêm nháp nữa.
- + của bill đang đóng thì mở bill đó ra.
  - Khi panel phải có thay đổi chưa lưu, bấm + của một bill chưa mở trước hết hỏi "Bỏ thay đổi chưa lưu?", vì một bill đang mở nuôi cả hai cột. + của bill đang mở thì không bao giờ hỏi.
- Sau khi tạo:
  - dòng mới hiện ra và con trỏ được đặt vào ô số tiền của nó;
  - nếu panel phải không có thay đổi chưa lưu thì dòng mới được chọn luôn; nếu có thì panel giữ nguyên, không hỏi gì (bấm vào dòng mới thì mới hỏi như mọi lần đổi);
  - trên điện thoại không tự mở Sheet, để thêm liền nhiều nháp.

**Dòng hóa đơn** (`einvoice-row.tsx`):
- Nhãn, ô số tiền, badge trạng thái (kèm số hóa đơn khi đã xuất), tên người mua (hoặc "Khách lẻ"), nút thùng rác.
- Bấm vào dòng thì chọn hóa đơn đó cho panel phải. Dòng đang chọn có nền `bg-muted`.
- **Ô số tiền** (`MoneyInput`):
  - Sửa được khi hóa đơn là `DRAFT`, người dùng có quyền `einvoices.write`, và bill là `COMPLETED` (hóa đơn tự do thì luôn sửa được).
  - Lưu khi bấm Enter hoặc rời ô, nếu giá trị đã đổi. Ô bị xóa trống thì trả về số cũ; số 0 được chấp nhận.
  - Gửi `PATCH /einvoices/:id` với người mua, dòng hàng và ngày **đã lưu** của hóa đơn đó, kèm số tiền mới.
  - Có spinner khi đang lưu. Lỗi thì toast và trả về số cũ.
- **Nút thùng rác:** với hóa đơn `DRAFT` và quyền `einvoices.write`, kể cả nháp của bill đã hủy, như hiện nay.
  - Nháp trống xóa ngay. Nháp có nội dung thì hỏi qua `ConfirmDialog`.
  - Xóa hóa đơn đang chọn thì chọn hóa đơn kế tiếp của bill; không còn hóa đơn nào thì không chọn gì.
  - Hóa đơn đang chọn có thay đổi chưa lưu thì hộp xác nhận xóa thay luôn cho câu hỏi bỏ thay đổi (khi đó luôn hỏi, kể cả nháp trống).

### 5.3. Cột phải: panel xuất (`einvoice-issue-panel.tsx`)

- **Đầu panel:** "HĐ n · Bill <số> · <phòng>" hoặc "HĐ tự do #id", badge trạng thái, và dòng "Số tiền (đã gồm VAT): X" kèm chú thích nhỏ "sửa ở cột trái".
- **Theo trạng thái:**
  - `ISSUED`: `issued-view.tsx`. Nút **Gửi lại** (quyền `einvoices.write`, không có trên bill đã hủy) hỏi xác nhận rồi tạo một nháp mới cùng bill (hoặc HĐ tự do mới) với số tiền, MST, tên người mua của hóa đơn đã xuất và ngày hôm nay; dòng hàng, địa chỉ, email phải nhập lại vì nháp đã bị xóa khi xuất. Hóa đơn đã xuất giữ nguyên, nên phần đã chia của bill tính cả hai; nháp tự do mới thì cột trái chuyển sang tab Nháp.
  - `UNCERTAIN`: `uncertain-box.tsx`, với `billCompleted` là true khi hóa đơn không có bill.
  - `SENDING`: dòng "Đang gửi…" và nút Tải lại.
  - Còn lại: editor.
- **Editor (`einvoice-editor.tsx`):**
  - Form gồm **ngày hóa đơn**, người mua và dòng hàng. Số tiền lấy từ hóa đơn đã lưu, nên "Còn thiếu / Thừa" và dòng bù luôn theo số tiền mới nhất.
  - **Ngày hóa đơn:**
    - `DatePicker` với nhãn "Ngày hóa đơn", `today` là ngày lịch (`toDateInput()`), `min` là `config.minInvoiceDate`, không có `max`. Đặt ở đầu editor.
    - Chỉ người có quyền ghi mới sửa được.
    - Giá trị ban đầu là ngày đã lưu. Nếu chưa có thì lấy ngày lịch lúc thanh toán bill, với hóa đơn tự do thì lấy hôm nay.
  - **Cảnh báo về ngày** (`invoiceDateProblem`), chữ `text-warning` dưới ô ngày, **không** khóa Xuất:
    - ngày trước `minInvoiceDate`: "Ngày hóa đơn phải từ dd/mm/yyyy trở đi";
    - năm không khớp ký hiệu (ký tự 3–4 của `symbolCode`): "Ký hiệu … là của năm …".
  - Lưu nháp gửi số tiền, ngày, người mua và dòng hàng.
  - Bỏ ô số tiền và các nút Xóa / Bỏ. Giữ khung `lastError`, Lưu nháp và Xuất.
- **`issue-controls.tsx`:**
  - Bỏ `DatePicker`. Nhận ngày đã lưu qua prop. Chỉ còn nút **Xuất** và câu hỏi đổi về hôm nay (§2).
  - **Câu hỏi đổi về hôm nay** là một `AlertDialog` có ba nút:
    - Hủy bỏ: không gửi gì.
    - **Giữ dd/mm/yyyy**: gửi ngày đã lưu, kèm `confirmFutureDate` khi ngày đó sau hôm nay.
    - **Đổi về hôm nay**: gửi `toDateInput()`.
  - Nút nào có ngày bị `invoiceDateProblem` chặn thì tắt, và câu hỏi ghi lý do. Ví dụ: Giữ một ngày trước giới hạn; Đổi về hôm nay khi đã có hóa đơn mang ngày tương lai, hoặc khi ký hiệu là của năm khác.
  - Khi giữ một ngày sau hôm nay, câu hỏi nhắc thêm: mọi hóa đơn sau cùng ký hiệu phải mang ngày từ đó trở đi.
  - Xuất vẫn chỉ bật khi không còn thay đổi chưa lưu, nên "ngày đã lưu" đúng là ngày trong ô.
- **Key của editor:** gồm id hóa đơn và chuỗi JSON của ngày, người mua và dòng hàng **đã lưu**, không dùng `updatedAt`.
  - Sửa số tiền ở cột trái không dựng lại editor, nên không mất các thay đổi chưa lưu bên phải.
  - Lưu nháp có làm đổi nội dung thì editor dựng lại sạch.
- **Người mua:** "Chép từ HĐ trước" chỉ có với hóa đơn của bill, chép từ hóa đơn liền trước trong bill. Hóa đơn tự do không có nút này.
- **Dòng hàng:** "Lấy món từ bill" chỉ có với hóa đơn của bill.

### 5.4. Dòng hàng (`einvoice-lines.tsx`)

- **Các cột** khi rộng: Tên hàng, dịch vụ \| ĐVT \| SL \| Đơn giá trước VAT \| **Thành tiền trước VAT** \| nút xóa dòng.
  - Bỏ cột Thuế suất và ô `Select` của nó.
  - Thành tiền trước VAT chỉ để xem, bằng `lineAmountOf` (SL × đơn giá).
  - Khi hẹp, mỗi dòng là một thẻ có nhãn như hiện nay.
- **Thuế suất:** Thêm dòng, Lấy món từ bill và Thêm dòng bù đều dùng `EINVOICE_VAT_RATE` (10).
  - Bỏ `defaultVatRate` khỏi `lib/einvoice.ts` vì không còn ai dùng.
  - Một dòng đã lưu từ trước có thuế suất khác 10% thì hiện thêm chữ nhỏ "VAT x%" dưới thành tiền. Không đổi thuế suất của nó một cách âm thầm; muốn đổi thì xóa dòng và thêm lại.
- **Tổng:** Trước thuế, VAT, Tổng, Còn thiếu / Thừa, như cũ.

### 5.5. Kiểu dữ liệu (`lib/types.ts`)

- `EinvoiceRow.orderId: number | null`, `EinvoiceRow.order: {…} | null`.
- `EinvoiceBill` thêm `cancelledAt: string | null`.

## 6. Tài nguyên (`docs/resource-rules.md` §5)

- **Danh sách:** `GET /einvoices/bills` và `GET /einvoices?free=1` có `take` 500, `select` như cũ (thêm đúng một cột `cancelledAt`), `X-Total-Count` và `ListLimitNotice`.
- **Tổng:** không tổng nào cộng từ danh sách đã cắt. "Đã chia" vẫn là `groupBy` SQL; các số đếm vẫn từ `summary`.
- **Index:** điều kiện `einvoices: { some }` chạy trên `Einvoice(branchId, status, createdAt)` hoặc `(branchId, businessDate)`. Bill được lọc qua `(branchId, businessDate, billSeq)` hoặc `(branchId, billNumber)`. Kiểm tra bằng `EXPLAIN` trên DB test trước khi xong.
- **Dung lượng:** nháp trống chỉ là một dòng nhỏ. Bấm + bị chặn chỉ trong lúc request đang chạy; thêm nhiều thì cũng chỉ ghi từng dòng một.
- **Không thêm** thư viện, polling hay sự kiện WebSocket.
- **Tải trang:** cột trái chỉ tải chi tiết của **một** bill đang mở, không tải hóa đơn của mọi bill.
- **Load test:** không đụng luồng bán hàng, pool kết nối hay cấu hình database, nên không cần chạy lại (ghi lý do vào commit).

## 7. Test

**Unit:**
- `einvoice-math.spec.ts`: `issueProblem` với `amount` 0 trả "Nhập số tiền của hóa đơn".
- Spec của `einvoices.service`:
  - create không có `orderId`;
  - ngày mặc định theo `endTime` (bill trả lúc 00:24 mang ngày lịch đó, không phải ngày kinh doanh);
  - issue khi `order` null;
  - kết thúc `DRAFT` giữ `invoiceDate`.

**E2E** (`test/einvoice.e2e-spec.ts`):
- **Hóa đơn tự do:**
  - thu ngân tạo không có `orderId`: 201, `orderId` null, `businessDate` là hôm nay;
  - thu ngân truyền `?branch=` của cơ sở khác: 403;
  - quản lý hệ thống không truyền `branch`: 400;
  - sửa, xóa được; HĐQT tạo thì 403;
  - xuất qua Minvoice giả thì `ISSUED`, có số, `draft` null;
  - `GET /einvoices?free=1` chỉ trả hóa đơn tự do; `summary` có đếm nó.
- **Thêm nhanh:**
  - tạo nháp với `amount: 0` thì 201; xuất nó thì 400 "Nhập số tiền của hóa đơn";
  - hai lần POST liền nhau cho cùng bill tạo hai nháp.
- **Ngày:**
  - nháp mới có `invoiceDate` bằng ngày lịch lúc thanh toán bill;
  - `PATCH` có `invoiceDate` thì đổi; không có thì giữ; ngày không tồn tại thì 400;
  - Minvoice giả trả lỗi thứ tự ngày thì hóa đơn về `DRAFT` mà vẫn giữ ngày;
  - `PATCH` hóa đơn `UNCERTAIN` thì 409 (như cũ).
- **`/bills`:**
  - `from`/`to` lọc theo ngày; `from > to` thì 400; ngày không tồn tại thì 400 (thay cho case `businessDate` cũ);
  - `status=DRAFT` trả bill có nháp ở mọi ngày;
  - `status=ISSUED` theo khoảng ngày;
  - bill đã hủy có nháp vẫn hiện ở `status=DRAFT`, kèm `cancelledAt`.
- **Không đổi:** nháp của bill đã hủy vẫn không xuất được (400).

**Frontend:**
- `npm run lint` và `npm run build`.
- Chạy thử trên trình duyệt với backend trỏ vào `test/fake-minvoice.ts`, ở desktop và ở 375px, giao diện sáng và tối:
  - mở bill, bấm + ba lần liền (nháp đầu mang phần còn lại, hai nháp sau mang 0), xóa một nháp trống không cần xác nhận;
  - sửa số tiền ở cột trái khi panel phải đang có thay đổi chưa lưu;
  - ngày hóa đơn là hôm nay thì Xuất gửi luôn, không hỏi;
  - đổi ngày hóa đơn sang hôm qua, Lưu nháp, Xuất: hỏi "Đổi ngày hóa đơn về hôm nay?", và làm theo thứ tự sau:
    - Giữ: hóa đơn mang hôm qua;
    - nháp thứ hai mang hôm qua, Đổi về hôm nay: hóa đơn mang hôm nay;
    - nháp thứ ba mang hôm qua: nút Giữ bị tắt kèm lý do (trước giới hạn);
  - tạo HĐ tự do, điền người mua và dòng hàng, xuất;
  - các tab Nháp, Lỗi, Không rõ, Đã xuất.

## 8. Triển khai và tài liệu

- **Migration:** `20261004000000_free_einvoices`. Thêm mục `DEPLOYMENT.md` §6.19 (chỉ cần `migrate deploy` khi khởi động, không đổi biến môi trường).
- **`CLAUDE.md`:**
  - dòng migration;
  - phần E-invoices ở backend: hóa đơn thuộc một bill **hoặc không bill nào**; nháp có số tiền 0 và ngày hóa đơn riêng; một lần gửi kết thúc bằng `DRAFT` giữ ngày; `free=1`; `/bills` có `status`/`from`/`to`;
  - phần Hóa đơn điện tử ở frontend: viết lại theo §5.
- **Spec gốc:** thêm một dòng ở đầu, trỏ sang spec này cho những mục bị thay thế.
