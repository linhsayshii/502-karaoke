"use client";

import { useState } from "react";
import {
  endOfMonth,
  endOfQuarter,
  endOfYear,
  format,
  parseISO,
  startOfMonth,
  startOfQuarter,
  startOfYear,
  subDays,
  subMonths,
  subQuarters,
  subYears,
} from "date-fns";
import { vi } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
import type { DateRange } from "react-day-picker";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { useIsMobile } from "@/hooks/use-mobile";
import { businessDate } from "@/lib/format";
import { cn } from "@/lib/utils";

// Business days, as YYYY-MM-DD (both ends included).
export interface DateRangeValue {
  from: string;
  to: string;
}

const ymd = (date: Date) => format(date, "yyyy-MM-dd");
const dmy = (value: string) => format(parseISO(value), "dd/MM/yyyy");

function presets(): { label: string; range: DateRangeValue }[] {
  const today = parseISO(businessDate());
  const lastMonth = subMonths(today, 1);
  const lastQuarter = subQuarters(today, 1);
  const lastYear = subYears(today, 1);
  return [
    { label: "Hôm nay", range: { from: ymd(today), to: ymd(today) } },
    { label: "Hôm qua", range: { from: ymd(subDays(today, 1)), to: ymd(subDays(today, 1)) } },
    { label: "7 ngày qua", range: { from: ymd(subDays(today, 6)), to: ymd(today) } },
    { label: "Tháng này", range: { from: ymd(startOfMonth(today)), to: ymd(today) } },
    {
      label: "Tháng trước",
      range: { from: ymd(startOfMonth(lastMonth)), to: ymd(endOfMonth(lastMonth)) },
    },
    { label: "Quý này", range: { from: ymd(startOfQuarter(today)), to: ymd(today) } },
    {
      label: "Quý trước",
      range: { from: ymd(startOfQuarter(lastQuarter)), to: ymd(endOfQuarter(lastQuarter)) },
    },
    { label: "Năm nay", range: { from: ymd(startOfYear(today)), to: ymd(today) } },
    {
      label: "Năm trước",
      range: { from: ymd(startOfYear(lastYear)), to: ymd(endOfYear(lastYear)) },
    },
  ];
}

export function formatDateRange({ from, to }: DateRangeValue) {
  return from === to ? dmy(from) : `${dmy(from)} – ${dmy(to)}`;
}

// Date range filter of the reports: presets + a calendar (Vietnamese).
export function DateRangePicker({
  value,
  onChange,
  align = "start",
  className,
}: {
  value: DateRangeValue;
  onChange: (value: DateRangeValue) => void;
  // "end" when the button sits at the right, as in a page header.
  align?: "start" | "end";
  className?: string;
}) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DateRange | undefined>();

  const selected: DateRange = draft ?? { from: parseISO(value.from), to: parseISO(value.to) };

  const apply = (range: DateRangeValue) => {
    onChange(range);
    setDraft(undefined);
    setOpen(false);
  };

  const onOpenChange = (next: boolean) => {
    // A half-picked range becomes a single day.
    if (!next && draft?.from) {
      onChange({ from: ymd(draft.from), to: ymd(draft.to ?? draft.from) });
    }
    setDraft(undefined);
    setOpen(next);
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="outline" className={cn("justify-start font-normal", className)}>
          <CalendarIcon data-icon="inline-start" />
          {formatDateRange(value)}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align={align} collisionPadding={16}>
        <div className="flex flex-col sm:flex-row">
          {/* On a phone the presets wrap to the calendar's width (w-0 min-w-full). */}
          <div className="flex w-0 min-w-full flex-wrap gap-1 p-3 sm:w-36 sm:min-w-0 sm:flex-col">
            {presets().map((preset) => (
              <Button
                key={preset.label}
                variant="ghost"
                size="sm"
                className="justify-start"
                onClick={() => apply(preset.range)}
              >
                {preset.label}
              </Button>
            ))}
          </div>
          <Separator orientation="vertical" className="hidden h-auto sm:block" />
          <Separator className="sm:hidden" />
          <Calendar
            mode="range"
            locale={vi}
            numberOfMonths={isMobile ? 1 : 2}
            defaultMonth={selected.from}
            selected={selected}
            onSelect={(range, day) => {
              // Start a new range on the first click after a complete one.
              const next = draft ? range : { from: day, to: undefined };
              if (next?.from && next.to && draft) {
                apply({ from: ymd(next.from), to: ymd(next.to) });
              } else {
                setDraft(next);
              }
            }}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
