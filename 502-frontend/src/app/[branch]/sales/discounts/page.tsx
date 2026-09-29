"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/components/auth-provider";
import { PageHeader } from "@/components/layout/page-header";
import { DiscountLog } from "@/components/discounts/discount-log";
import { PendingRequests } from "@/components/discounts/pending-requests";
import { can } from "@/lib/permissions";

export default function DiscountsPage() {
  const { user } = useAuth();
  const approver = can(user, "discounts.approve");
  return (
    <>
      <PageHeader
        title="Duyệt giảm giá"
        description="Yêu cầu giảm giá, hạ VAT của thu ngân và nhật ký mọi thay đổi giảm giá."
      />
      <Tabs defaultValue={approver ? "pending" : "log"} className="gap-4">
        <TabsList>
          {approver && <TabsTrigger value="pending">Chờ duyệt</TabsTrigger>}
          <TabsTrigger value="log">Nhật ký</TabsTrigger>
        </TabsList>
        {approver && (
          <TabsContent value="pending">
            <PendingRequests />
          </TabsContent>
        )}
        <TabsContent value="log">
          <DiscountLog />
        </TabsContent>
      </Tabs>
    </>
  );
}
