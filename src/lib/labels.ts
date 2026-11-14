/** Plain-language labels shown to the scholar. Keys match the database values. */

export const categories = {
  research_writing: "Research writing",
  literature_review: "Literature review",
  experiment: "Laboratory experiment",
  guide_meeting: "Guide meeting",
  coursework: "Coursework",
  conference: "Conference / workshop",
  training: "Training programme",
  administrative: "Administrative",
  competition: "Competition / hackathon",
  achievement: "Achievement",
  decision: "Research decision",
  reflection: "Reflection",
} as const;
export type Category = keyof typeof categories;

export const entryStatuses = {
  planned: "Planned",
  done: "Done",
  postponed: "Postponed",
  cancelled: "Cancelled",
} as const;

export const participation = {
  unknown: "Not recorded",
  attended: "Attended",
  presented: "Presented",
  did_not_attend: "Did not attend",
  cancelled: "Cancelled",
} as const;

export const registration = {
  interested: "Interested",
  registered: "Registered",
  not_registered: "Not registered",
} as const;

export const projectTypes = {
  systematic_review: "Systematic literature review",
  narrative_review: "Narrative review",
  experimental: "Experimental research",
  method_development: "Method development",
  instrument_development: "Instrument or sensor development",
  collaboration: "Research collaboration",
  other: "Other",
} as const;

export const projectStatuses = {
  proposed: "Proposed",
  planning: "Planning",
  in_progress: "In progress",
  paused: "Paused",
  completed: "Completed",
} as const;

export const phases = {
  planning: "Planning and scope",
  research: "Research and analysis",
  writing: "Writing",
  review: "Review before submission",
  choosing_journal: "Choosing a journal",
  under_review: "Submitted / under review",
  revising: "Revising for journal",
  accepted: "Accepted",
  published: "Published",
  stopped: "Stopped",
} as const;
export type Phase = keyof typeof phases;

export const submissionStatuses = {
  planned: "Planned",
  submitted: "Submitted",
  under_review: "Under review",
  revise: "Revise and resubmit",
  rejected: "Rejected",
  accepted: "Accepted",
  withdrawn: "Withdrawn",
} as const;

export const experimentStatuses = {
  planned: "Planned",
  in_progress: "In progress",
  completed: "Completed",
  inconclusive: "Inconclusive",
  unsuccessful: "Unsuccessful",
  paused: "Paused",
} as const;

export const blockerCategories = {
  equipment: "Equipment",
  procurement: "Procurement",
  protocol: "Protocol didn't work",
  sample_preparation: "Sample preparation",
  inconsistency: "Inconsistent results",
  other: "Other",
} as const;

export const taskStatuses = {
  todo: "To do",
  doing: "Doing",
  waiting: "Waiting",
  done: "Done",
  cancelled: "Cancelled",
} as const;

export const courseStatuses = {
  planned: "Planned",
  enrolled: "Enrolled",
  completed: "Completed",
  dropped: "Dropped",
} as const;

export const goalHorizons = {
  week: "This week",
  month: "This month",
  semester: "This semester",
  year: "This academic year",
} as const;

export const goalOutcomes = { open: "Open", achieved: "Achieved", dropped: "Dropped" } as const;

export const enquiryStatuses = { open: "Open", waiting: "Waiting for reply", closed: "Closed" } as const;

export const milestoneStatuses = { not_started: "Not done yet", done: "Done", skipped: "Skipped" } as const;

export const suggestedMilestones = [
  "Coursework completion",
  "Doctoral committee review",
  "Synopsis submission",
  "Thesis submission",
  "Viva",
];

/** Where a record came from: the app itself, or a connected assistant (see docs/mcp.md). */
export function viaLabel(source: string | null | undefined): string | null {
  if (!source || source === "app") return null;
  if (source === "chatgpt") return "ChatGPT";
  if (source === "codex") return "Codex";
  return "an assistant";
}
