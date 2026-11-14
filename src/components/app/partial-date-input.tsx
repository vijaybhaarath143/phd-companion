"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { AppSelect } from "@/components/app/app-select";
import { monthOptions, valueOptions } from "@/lib/options";
import { Segmented } from "@/components/app/segmented";
import { monthNames, type PartialDate, type Precision } from "@/lib/dates";

/**
 * Years offered for a month-only date, newest first: far enough ahead for targets like
 * a thesis submission (this year + 8), back 15 years, and always the year already chosen.
 */
export function yearOptions(today: string, current?: string | null) {
  const thisYear = Number(today.slice(0, 4));
  const years = Array.from({ length: 24 }, (_, i) => String(thisYear + 8 - i));
  if (current && /^\d{4}$/.test(current) && !years.includes(current)) {
    years.push(current);
    years.sort((a, b) => Number(b) - Number(a));
  }
  return years;
}

/**
 * "Exact date / Month only / Not sure yet". Never invents a day: month-only
 * dates are kept as a month, and "Not sure yet" keeps the item in Needs a date.
 * Renders form fields `${name}Precision`, `${name}Date`, `${name}Month`.
 */
export function PartialDateInput({
  name,
  label,
  defaultValue,
  today,
  onChange,
  noneLabel = "Not sure yet",
  allowNone = true,
}: {
  name: string;
  label: string;
  defaultValue?: PartialDate;
  today: string;
  onChange?: (d: PartialDate) => void;
  noneLabel?: string;
  allowNone?: boolean;
}) {
  const [precision, setPrecision] = useState<Precision>(defaultValue?.precision ?? "day");
  const [day, setDay] = useState(defaultValue?.precision === "day" && defaultValue.date ? defaultValue.date : today);
  const initialMonth = defaultValue?.date ? defaultValue.date.slice(0, 7) : today.slice(0, 7);
  const [month, setMonth] = useState(initialMonth.slice(5, 7));
  const [year, setYear] = useState(initialMonth.slice(0, 4));

  const emit = (p: Precision, d = day, m = month, y = year) => {
    onChange?.(
      p === "day" ? { date: d || null, precision: d ? "day" : "none" } : p === "month" ? { date: `${y}-${m}-01`, precision: "month" } : { date: null, precision: "none" },
    );
  };

  const years = yearOptions(today, year);

  const options: { value: Precision; label: string }[] = [
    { value: "day", label: "Exact date" },
    { value: "month", label: "Month only" },
    ...(allowNone ? [{ value: "none" as Precision, label: noneLabel }] : []),
  ];

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-sm font-medium">{label}</legend>
      <Segmented
        name={`${name}Precision`}
        label={`${label}: how precisely`}
        value={precision}
        options={options}
        onChange={(p) => {
          setPrecision(p);
          emit(p);
        }}
      />
      {precision === "day" && (
        <div className="flex items-center gap-3">
          <Input
            type="date"
            name={`${name}Date`}
            aria-label="Date"
            value={day}
            onChange={(e) => {
              setDay(e.target.value);
              emit("day", e.target.value);
            }}
            className="max-w-48"
          />
          {day === today && <span className="text-sm text-muted-foreground">Today</span>}
        </div>
      )}
      {precision === "month" && (
        <>
          <input type="hidden" name={`${name}Month`} value={`${year}-${month}`} />
          <div className="grid max-w-80 grid-cols-2 gap-2">
            <AppSelect aria-label="Month" value={month} onValueChange={(m) => { setMonth(m); emit("month", day, m); }} options={monthOptions()} />
            <AppSelect aria-label="Year" value={year} onValueChange={(y) => { setYear(y); emit("month", day, month, y); }} options={valueOptions(years)} />
          </div>
          <p className="text-[13px] text-muted-foreground">
            Shown as “{monthNames[Number(month) - 1]} {year} · day not known”. We never guess the day.
          </p>
        </>
      )}
      {precision === "none" && (
        <p className="text-[13px] text-muted-foreground">It waits in “Needs a date” until you add one. It stays searchable.</p>
      )}
    </fieldset>
  );
}
