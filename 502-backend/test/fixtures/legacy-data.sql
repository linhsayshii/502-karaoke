-- Legacy-shaped sample data (schema of migration 0_init) used to rehearse the
-- foundation data migration. Load into a DB that only has 0_init applied.
INSERT INTO "User" (username, password, role, "updatedAt") VALUES
  ('admin', '$2b$10$abcdefghijklmnopqrstuuWn1a0rS6bU4y5o7h2Yxg0Vb1W1fG2Hy', 'ADMIN', now()),
  ('thungan', '$2b$10$abcdefghijklmnopqrstuuWn1a0rS6bU4y5o7h2Yxg0Vb1W1fG2Hy', 'STAFF', now());

INSERT INTO "Employee" (name, role, phone, "updatedAt") VALUES
  ('Lan', 'CSKH', '0900000001', now()),
  ('Minh', 'SERVER', NULL, now()),
  ('Hùng', 'SERVER', NULL, now());

INSERT INTO "Category" (name, "updatedAt") VALUES ('Đồ uống', now()), ('Đồ ăn', now());
INSERT INTO "Product" (name, "categoryId", price, "stockQuantity", unit, "updatedAt") VALUES
  ('Bia Tiger', 1, 25000, 120, 'lon', now()),
  ('Nước suối', 1, 10000, 0, 'chai', now()),
  ('Trái cây', 2, 150000, 5, 'dĩa', now()),
  ('Khăn lạnh', NULL, 2000, -3, 'cái', now());

INSERT INTO "Room" (name, branch, type, "pricePerHour", status, "updatedAt") VALUES
  ('P101', 'cs1', 'NORMAL', 120000, 'ACTIVE', now()),
  ('P102', 'cs1', 'VIP', 200000, 'AVAILABLE', now()),
  ('P201', 'cs2', 'NORMAL', 100000, 'MAINTENANCE', now());

INSERT INTO "Order" (branch, status, "roomId", "cskhId", "serverId", "startTime", "endTime", "totalProductPrice", "hourlyFee", "finalAmount", "updatedAt") VALUES
  ('cs1', 'COMPLETED', 2, 1, 2, now() - interval '2 day', now() - interval '2 day' + interval '2 hour', 75000, 400000, 475000, now()),
  ('cs2', 'COMPLETED', 3, 1, 3, now() - interval '1 day', now() - interval '1 day' + interval '1 hour', 160000, 100000, 260000, now()),
  ('cs2', 'COMPLETED', 3, NULL, 3, now() - interval '3 day', now() - interval '3 day' + interval '1 hour', 25000, 100000, 125000, now()),
  ('cs1', 'PENDING', 1, 1, 2, now() - interval '30 minute', NULL, 0, 0, 0, now());

INSERT INTO "OrderItem" ("orderId", "productId", quantity, price) VALUES
  (1, 1, 3, 25000),
  (2, 3, 1, 150000), (2, 2, 1, 10000),
  (3, 1, 1, 25000),
  (4, 1, 2, 25000), (4, 4, 5, 2000);

INSERT INTO "FundTransaction" (type, amount, description) VALUES ('EXPENSE', 50000, 'Mua đá');
