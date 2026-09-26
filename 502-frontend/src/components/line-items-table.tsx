import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface LineItem {
  id: number;
  name: string;
  unit: string;
  quantity: number;
  price: number | string;
}

// Lines of a bill or a stock document. The unit price sits under the name so
// the table fits a phone-width dialog or sheet.
export function LineItemsTable({
  items,
  itemLabel = "Món",
  emptyText,
  total,
  className,
}: {
  items: LineItem[];
  itemLabel?: string;
  emptyText?: string;
  total?: number | string;
  className?: string;
}) {
  return (
    <div className={cn("overflow-hidden rounded-lg border", className)}>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{itemLabel}</TableHead>
            <TableHead className="text-right">SL</TableHead>
            <TableHead className="text-right">Thành tiền</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.id}>
              <TableCell className="whitespace-normal">
                <div className="font-medium">{item.name}</div>
                <div className="text-xs text-muted-foreground tabular-nums">
                  {formatNumber(item.price)} / {item.unit}
                </div>
              </TableCell>
              <TableCell className="text-right tabular-nums">{formatNumber(item.quantity)}</TableCell>
              <TableCell className="text-right tabular-nums">
                {formatNumber(Number(item.price) * item.quantity)}
              </TableCell>
            </TableRow>
          ))}
          {items.length === 0 && emptyText && (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={3} className="text-center text-muted-foreground">
                {emptyText}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
        {total !== undefined && (
          <TableFooter>
            <TableRow>
              <TableCell colSpan={2}>Tổng cộng</TableCell>
              <TableCell className="text-right tabular-nums">{formatNumber(total)}</TableCell>
            </TableRow>
          </TableFooter>
        )}
      </Table>
    </div>
  );
}
