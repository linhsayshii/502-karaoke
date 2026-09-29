import { InfoIcon, type LucideIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { TableCell, TableRow } from "@/components/ui/table";
import { formatNumber } from "@/lib/format";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}

// "Nothing here yet" for a page section.
export function EmptyState({ icon: Icon, title, description, children, className }: EmptyStateProps) {
  return (
    <Empty className={className}>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Icon />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        {description && <EmptyDescription>{description}</EmptyDescription>}
      </EmptyHeader>
      {children && <EmptyContent>{children}</EmptyContent>}
    </Empty>
  );
}

// The same inside a table body.
export function TableEmpty({ colSpan, ...props }: EmptyStateProps & { colSpan: number }) {
  return (
    <TableRow className="hover:bg-transparent">
      <TableCell colSpan={colSpan} className="whitespace-normal">
        <EmptyState className="py-8 md:py-10" {...props} />
      </TableCell>
    </TableRow>
  );
}

// Placeholder rows while a table loads. `columns` is the column count, or
// the class of each column when some are hidden on narrow screens.
export function TableSkeleton({ rows = 5, columns }: { rows?: number; columns: number | string[] }) {
  const cells = typeof columns === "number" ? Array.from({ length: columns }, () => "") : columns;
  return (
    <>
      {Array.from({ length: rows }, (_, row) => (
        <TableRow key={row} className="hover:bg-transparent">
          {cells.map((className, col) => (
            <TableCell key={col} className={className}>
              <Skeleton className="h-5 w-full max-w-32" />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}

// Said above a capped list when the server matched more rows than it sent
// (`totalCountOf`): the list holds only the newest `shown` of `total`.
export function ListLimitNotice({
  shown,
  total,
  noun,
  hint,
  className,
}: {
  shown: number;
  total: number | null;
  noun: string;
  hint: React.ReactNode;
  className?: string;
}) {
  if (total === null || total <= shown) return null;
  return (
    <Alert className={className}>
      <InfoIcon />
      <AlertTitle>
        Chỉ hiển thị {formatNumber(shown)} {noun} mới nhất trong tổng số {formatNumber(total)}
      </AlertTitle>
      <AlertDescription>{hint}</AlertDescription>
    </Alert>
  );
}
