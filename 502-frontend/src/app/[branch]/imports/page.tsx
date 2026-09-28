"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeftIcon, ChevronRightIcon, DownloadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Item, ItemActions, ItemContent, ItemDescription, ItemMedia, ItemTitle } from "@/components/ui/item";
import { useAuth } from "@/components/auth-provider";
import { ImportWizard } from "@/components/excel-import/import-wizard";
import { PageHeader } from "@/components/layout/page-header";
import { usePageTitle } from "@/components/layout/page-title";
import { useBranchCode } from "@/lib/branch";
import { IMPORT_DEFINITIONS, importDefinition } from "@/lib/excel-import/definitions";
import { downloadTemplate } from "@/lib/excel-import/workbook";
import { can } from "@/lib/permissions";

// /[branch]/imports?type=products: pick what to import, then the wizard.
function ImportsContent() {
  const branch = useBranchCode();
  const { user } = useAuth();
  const type = useSearchParams().get("type");
  const available = IMPORT_DEFINITIONS.filter((d) => can(user, d.permission));
  const definition = available.find((d) => d === importDefinition(type));
  usePageTitle(definition?.title);

  if (!definition) {
    return (
      <>
        <PageHeader
          title="Nhập từ Excel"
          info="Đưa dữ liệu có sẵn trong file Excel vào cơ sở này: chọn file, ghép cột trong file với trường dữ liệu, kiểm tra rồi nhập."
        />
        <div className="grid gap-3 @3xl/main:grid-cols-2">
          {available.map((d) => (
            <Item key={d.type} variant="outline" asChild>
              <Link href={`/${branch}/imports?type=${d.type}`}>
                <ItemMedia variant="icon">
                  <d.icon />
                </ItemMedia>
                <ItemContent>
                  <ItemTitle>{d.title}</ItemTitle>
                  <ItemDescription>{d.description}</ItemDescription>
                </ItemContent>
                <ItemActions>
                  <ChevronRightIcon className="size-4 text-muted-foreground" />
                </ItemActions>
              </Link>
            </Item>
          ))}
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={`Nhập ${definition.title.toLowerCase()} từ Excel`}
        info={definition.description}
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href={`/${branch}/imports`}>
                <ArrowLeftIcon data-icon="inline-start" />
                Loại dữ liệu khác
              </Link>
            </Button>
            <Button variant="outline" onClick={() => downloadTemplate(definition)}>
              <DownloadIcon data-icon="inline-start" />
              Tải file mẫu
            </Button>
          </>
        }
      />
      <ImportWizard key={`${branch}:${definition.type}`} definition={definition} />
    </>
  );
}

export default function ImportsPage() {
  return (
    <Suspense>
      <ImportsContent />
    </Suspense>
  );
}
