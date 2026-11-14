"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Segmented } from "@/components/app/segmented";
import { monthNames, type PartialDate, type Precision } from "@/lib/dates";

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

  const thisYear = Number(today.slice(0, 4));
  const years = Array.from({ length: 12 }, (_, i) => String(thisYear + 2 - i));

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
            <NativeSelect aria-label="Month" value={month} onChange={(e) => { setMonth(e.target.value); emit("month", day, e.target.value); }}>
              {monthNames.map((m, i) => (
                <option key={m} value={String(i + 1).padStart(2, "0")}>{m}</option>
              ))}
            </NativeSelect>
            <NativeSelect aria-label="Year" value={year} onChange={(e) => { setYear(e.target.value); emit("month", day, month, e.target.value); }}>
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </NativeSelect>
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
