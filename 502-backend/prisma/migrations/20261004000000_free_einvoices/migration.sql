-- Hóa đơn điện tử không theo bill (spec 2026-10-01-hddt-bo-cuc-va-hd-tu-do §3).
ALTER TABLE "Einvoice" ALTER COLUMN "orderId" DROP NOT NULL;
