"use client";

import { useState } from "react";
import { NativeSelect } from "@/components/ui/native-select";
import { monthNames } from "@/lib/dates";
import { yearOptions } from "@/components/app/partial-date-input";

/**
 * A month for a filter, picked as month + year (works in every browser, unlike
 * <input type="month">). Sends `name=YYYY-MM`; a year alone means its first month
 * ("from") or its last month ("to").
 */
export function MonthFilter({ name, label, defaultValue, today, edge }: { name: string; label: string; defaultValue?: string; today: string; edge: "start" | "end" }) {
  const [month, setMonth] = useState(defaultValue?.slice(5, 7) ?? "");
  const [year, setYear] = useState(defaultValue?.slice(0, 4) ?? "");
  const value = year ? `${year}-${month || (edge === "start" ? "01" : "12")}` : "";
  return (
    <span role="group" aria-label={label} className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
      {label}
      <NativeSelect aria-label={`${label}: month`} value={month} onChange={(e) => setMonth(e.target.value)} className="h-9 w-auto">
        <option value="">Month</option>
        {monthNames.map((m, i) => <option key={m} value={String(i + 1).padStart(2, "0")}>{m.slice(0, 3)}</option>)}
      </NativeSelect>
      <NativeSelect aria-label={`${label}: year`} value={year} onChange={(e) => setYear(e.target.value)} className="h-9 w-auto">
        <option value="">Year</option>
        {yearOptions(today, year).map((y) => <option key={y} value={y}>{y}</option>)}
      </NativeSelect>
      {value && <input type="hidden" name={name} value={value} />}
    </span>
  );
}
