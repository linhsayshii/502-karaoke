-- Load-test data: 2 years of a busy chain on top of `SEED_DEMO=1 npx prisma db seed`
-- (5 branches × 44 rooms, 60 products, 2 cashiers, 40 floor staff, 150 bills a day each: ~550k bills,
-- 2.5M bill lines, 2M stock movements, ~0.9 GB). Never run it against real data.
-- See docs/resource-rules.md §6.
\timing on
-- Catalogue and people so each of the 5 branches looks like cs5: 44 rooms, 60 products, 2 cashiers
insert into "Room"("branchId", name, type, "pricePerHour", "updatedAt")
select b.id, 'L' || g, 'VIP', 150000 + (g % 6) * 50000, now()
from "Branch" b, generate_series(1, 44) g where b.id <> 5;
insert into "Category"("branchId", name, "updatedAt")
select b.id, 'Nhóm ' || g, now() from "Branch" b, generate_series(1, 5) g;
insert into "Product"("branchId", name, "categoryId", price, "costPrice", "stockQuantity", unit, "trackStock", "updatedAt")
select b.id, 'SP ' || g,
  (select id from "Category" c where c."branchId" = b.id and c.name = 'Nhóm ' || (1 + g % 5)),
  (10 + (g * 37) % 490) * 1000, (5 + (g * 37) % 245) * 1000, 1000000, 'lon', g <= 50, now()
from "Branch" b, generate_series(1, 60) g;
insert into "User"(username, password, "fullName", role, "branchId", position, "updatedAt")
select 'load_tn' || k || '_cs' || b.id, (select password from "User" where username = 'admin'),
  'Thu ngân ' || k, 'CASHIER', b.id, null, now()
from "Branch" b, generate_series(1, 2) k;
insert into "User"(username, password, "fullName", role, "branchId", position, "updatedAt")
select 'load_ql_cs' || b.id, (select password from "User" where username = 'admin'),
  'Quản lý', 'BRANCH_MANAGER', b.id, null, now() from "Branch" b;
-- 40 floor staff per branch (15 CSKH, 25 phục vụ), all able to log in on their phones
insert into "User"(username, password, "fullName", role, "branchId", position, "updatedAt")
select 'load_nv' || k || '_cs' || b.id, (select password from "User" where username = 'admin'),
  'NV ' || k, 'STAFF', b.id,
  (case when k <= 15 then 'CSKH' else 'SERVER' end)::"StaffPosition", now()
from "Branch" b, generate_series(1, 40) k;

-- 2 years of bills: 150 per branch per business day
create temp table pick as
select b.id as branch,
  (select array_agg(id order by id) from "Room" r where r."branchId" = b.id and r.name like 'L%' or r."branchId" = b.id and b.id = 5) rooms,
  (select array_agg(id) from "User" u where u."branchId" = b.id and u.position = 'CSKH') cskh,
  (select array_agg(id) from "User" u where u."branchId" = b.id and u.position = 'SERVER') srv,
  (select array_agg(id) from "User" u where u."branchId" = b.id and u.role = 'CASHIER') cashiers,
  (select array_agg(id) from "Product" p where p."branchId" = b.id and p.name like 'SP %') products
from "Branch" b;

insert into "Order"("branchId", status, "roomId", "cskhId", "serverId", "createdById", "checkedOutById",
  "startTime", "endTime", "pricePerHour", "hourlyFee", "paymentMethod", "businessDate", "billSeq", "billNumber", "updatedAt")
select p.branch, 'COMPLETED', p.rooms[1 + floor(random() * array_length(p.rooms, 1))::int],
  p.cskh[1 + floor(random() * array_length(p.cskh, 1))::int], p.srv[1 + floor(random() * array_length(p.srv, 1))::int],
  p.cashiers[1 + (n % 2)], p.cashiers[1 + (n % 2)],
  t.s, t.s + t.dur, 250000, round(250000 * extract(epoch from t.dur) / 3600),
  (case when random() < 0.6 then 'CASH' else 'TRANSFER' end)::"PaymentMethod",
  d::date, n, to_char(d, 'DDMM') || '4010' || lpad(n::text, 3, '0'), now()
from generate_series(date '2024-09-30', date '2026-09-28', interval '1 day') d
cross join pick p
cross join generate_series(1, 150) n
cross join lateral (select d + interval '4 hours 30 minutes' + random() * interval '17 hours' as s,
                           (60 + floor(random() * 180)) * interval '1 minute' as dur) t;

insert into "OrderItem"("orderId", "productId", quantity, price, "unitCost")
select x.id, pr.id, x.q, pr.price, pr."costPrice"
from (select o.id, p.products[1 + floor(random() * 60)::int] as pid, 1 + floor(random() * 10)::int as q
      from "Order" o join pick p on p.branch = o."branchId", generate_series(1, 1 + o.id % 8)) x
join "Product" pr on pr.id = x.pid;

update "Order" o set "totalProductPrice" = s.t,
  "taxAmount" = ceil((s.t + o."hourlyFee") * 0.1), "finalAmount" = s.t + o."hourlyFee" + ceil((s.t + o."hourlyFee") * 0.1)
from (select "orderId", sum(price * quantity) t from "OrderItem" group by 1) s where s."orderId" = o.id;

insert into "StockMovement"("branchId", "productId", type, quantity, "balanceAfter", "unitCost", "costAfter", "orderId", "createdAt")
select o."branchId", i."productId", 'SALE', -i.quantity, 1000, i."unitCost", i."unitCost", o.id, o."endTime"
from "OrderItem" i join "Order" o on o.id = i."orderId" join "Product" p on p.id = i."productId" where p."trackStock";

insert into "FundTransaction"("branchId", type, method, amount, category, "occurredAt", "orderId", "createdById", "createdAt")
select "branchId", 'INCOME', "paymentMethod", "finalAmount", 'Bán hàng', "endTime", id, "checkedOutById", "endTime" from "Order";

-- weekly phiếu nhập (50 lines) and monthly manual expenses
insert into "StockDocument"("branchId", type, code, "totalAmount", "createdById", "createdAt")
select b.id, 'IMPORT', 'PN-LOAD-' || b.id || '-' || to_char(w, 'YYYYMMDD'), 0, 1, w + interval '3 hours'
from "Branch" b, generate_series(timestamp '2024-09-30', timestamp '2026-09-28', interval '7 days') w;
insert into "StockDocumentLine"("documentId", "productId", quantity, "unitCost")
select d.id, p.id, 500, p."costPrice" from "StockDocument" d join "Product" p on p."branchId" = d."branchId" and p."trackStock" and p.name like 'SP %';
insert into "StockMovement"("branchId", "productId", type, quantity, "balanceAfter", "unitCost", "costAfter", "documentId", "createdAt")
select d."branchId", l."productId", 'IMPORT', l.quantity, 1000, l."unitCost", l."unitCost", d.id, d."createdAt"
from "StockDocumentLine" l join "StockDocument" d on d.id = l."documentId";
insert into "FundTransaction"("branchId", type, method, amount, category, "occurredAt", "createdById")
select b.id, 'EXPENSE', 'TRANSFER', 20000000, c, m + interval '5 hours', 1
from "Branch" b, generate_series(timestamp '2024-10-01', timestamp '2026-09-01', interval '1 month') m,
     unnest(array['Lương', 'Mặt bằng', 'Điện nước']) c;
update "Room" set status = 'AVAILABLE';
vacuum analyze;
select 'orders', count(*) from "Order" union all select 'items', count(*) from "OrderItem"
union all select 'movements', count(*) from "StockMovement" union all select 'fund', count(*) from "FundTransaction";
select pg_size_pretty(pg_database_size(current_database()));
