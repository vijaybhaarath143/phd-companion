"use client";

import { useState } from "react";
import { AppSelect } from "@/components/app/app-select";
import { monthOptions, valueOptions } from "@/lib/options";
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
      <AppSelect aria-label={`${label}: month`} value={month} onValueChange={setMonth} size="sm" className="w-auto" options={monthOptions("Month", true)} />
      <AppSelect aria-label={`${label}: year`} value={year} onValueChange={setYear} size="sm" className="w-auto" options={valueOptions(yearOptions(today, year), "Year")} />
      {value && <input type="hidden" name={name} value={value} />}
    </span>
  );
}
