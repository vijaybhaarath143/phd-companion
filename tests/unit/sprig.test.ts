import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Sprig, type SprigMood, type SprigStage } from "@/components/app/sprig";
import { CHEERS, DONE_LINES, OOPS_LINES, TAP_LINES, TRICK_LINES, areaOf, pageLine } from "@/components/app/sprig-lines";
import { cueSprig, sprigIsHere } from "@/components/app/sprig-bus";

const MOODS: SprigMood[] = ["happy", "hello", "proud", "curious", "cosy", "oops", "love", "dizzy", "yawn"];
const STAGES: SprigStage[] = ["seed", "sprout", "sapling", "bloom", "graduate"];
const draw = (props: Parameters<typeof Sprig>[0]) => renderToStaticMarkup(createElement(Sprig, props));

describe("Sprig's drawing", () => {
  it("draws every mood at every stage, hidden from screen readers", () => {
    for (const mood of MOODS) {
      for (const stage of STAGES) {
        const svg = draw({ mood, stage });
        expect(svg).toMatch(/^<svg[^>]*aria-hidden="true"/);
        expect(svg).not.toMatch(/NaN|undefined/);
      }
    }
  });

  it("moves only when asked to be lively", () => {
    expect(draw({})).not.toContain("sprig-lively");
    expect(draw({ lively: true })).toContain("sprig-lively");
  });

  it("wears the graduation cap only once it has graduated", () => {
    expect(draw({ stage: "graduate" })).toContain("var(--grape)");
    for (const stage of STAGES.filter((s) => s !== "graduate")) expect(draw({ stage })).not.toContain("var(--grape)");
  });

  it("keeps its moving parts out of the way of reduced motion", () => {
    // every idle or looping movement is under a motion-safe variant or the .sprig-lively rules
    for (const mood of MOODS) {
      for (const match of draw({ mood }).matchAll(/class="([^"]*animate-[^"]*)"/g)) expect(match[1]).toMatch(/motion-safe:/);
    }
  });
});

describe("what Sprig says", () => {
  const at = (hour: number) => new Date(2026, 10, 16, hour, 15);

  it("knows the area from the address", () => {
    expect(areaOf("/")).toBe("");
    expect(areaOf("/journal")).toBe("journal");
    expect(areaOf("/research/manuscripts/123")).toBe("research");
  });

  it("suggests rest late at night, on any page", () => {
    for (const hour of [23, 0, 2, 4]) {
      expect(pageLine("/planner", at(hour))).toMatch(/late/);
      expect(pageLine("/", at(hour))).toMatch(/late/);
    }
  });

  it("notices an early start on Home only", () => {
    expect(pageLine("/", at(7))).toBe("Early start! Go gently.");
    expect(pageLine("/journal", at(7))).not.toBe("Early start! Go gently.");
  });

  it("has a line for every area, and a Home line for anywhere new", () => {
    for (const path of ["/", "/timeline", "/journal/1", "/research", "/planner", "/academics", "/events", "/notes", "/settings", "/more", "/admin", "/somewhere-new"]) {
      expect(pageLine(path, at(12)).length).toBeGreaterThan(5);
    }
  });

  it("greets a brand-new scholar as warmly as a returning one", () => {
    // Home's first greeting can be someone's very first visit, so it can't say "again" or "back"
    for (let i = 0; i < 50; i++) expect(pageLine("/", at(12))).not.toMatch(/\bagain\b|\bback\b|left it/i);
  });

  it("doesn't praise an empty timeline", () => {
    // Timeline can be empty on day one
    for (let i = 0; i < 30; i++) expect(pageLine("/timeline", at(12))).not.toMatch(/how far|you took|you've come/i);
  });

  it("is kind about errors without promising a fix or playing them down", () => {
    // these sit beside error toasts like "Your latest changes haven't saved yet — copy your text"
    for (const line of OOPS_LINES) expect(line).not.toMatch(/we'll|sort it|fixed|don't worry|nothing (is )?lost|didn't save/i);
  });

  it("never nags or scolds", () => {
    const all = [...CHEERS, ...DONE_LINES, ...OOPS_LINES, ...TAP_LINES, ...TRICK_LINES];
    for (const line of all) expect(line).not.toMatch(/\b(should|must|overdue|behind|hurry|lazy|forgot)\b/i);
  });
});

describe("cues to Sprig", () => {
  it("are harmless where there's no browser", () => {
    expect(sprigIsHere()).toBe(false);
    expect(() => cueSprig({ kind: "done" })).not.toThrow();
  });
});
