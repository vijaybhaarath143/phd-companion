/**
 * The "Guide me" tour: one idea per step, in plain words.
 * Each step opens a page and highlights the part of the screen marked with
 * `data-guide="<target>"`. If that part isn't on screen (for example, nothing
 * has been recorded yet), the explanation simply shows in the middle.
 */

export type GuideChapterId = "basics" | "journal" | "research" | "files" | "planner" | "academics" | "safety";

export type GuideStep = {
  id: string;
  chapter: GuideChapterId;
  /** Page to open. */
  path: string;
  /** Matching `data-guide` value on the page, if any. */
  target?: string;
  title: string;
  body: string;
  /** Replaces `body` on phones, where the layout differs. */
  phoneBody?: string;
};

export const GUIDE_CHAPTERS: { id: GuideChapterId; title: string; summary: string }[] = [
  { id: "basics", title: "The basics", summary: "Quick Add, Home, Timeline and finding your way around" },
  { id: "journal", title: "Journal and dates", summary: "Your record of what happened — even when you don't know the exact date" },
  { id: "research", title: "Research", summary: "Publications and experiments" },
  { id: "files", title: "Files and proof", summary: "Certificates, figures and drafts, kept private" },
  { id: "planner", title: "Planner", summary: "Tasks, things you're waiting on, and goals" },
  { id: "academics", title: "Academics", summary: "Coursework credits, milestones and office questions" },
  { id: "safety", title: "Keeping your work safe", summary: "Your weekly copy, Archive and Trash" },
];

export const GUIDE_STEPS: GuideStep[] = [
  // The basics
  {
    id: "welcome", chapter: "basics", path: "/",
    title: "Welcome to PhD Companion",
    body: "One private place for your whole PhD: what happened, what's next, and the proof. This guide shows one idea at a time. You can stop whenever you like and carry on later from Guide me.",
  },
  {
    id: "quick-add", chapter: "basics", path: "/", target: "quick-add",
    title: "Quick Add — record anything",
    body: "The quickest way to add something. Choose Journal for something that happened (a meeting, a reading, an experiment) or Task for something to do. The Journal page has its own New entry button too. A title is enough; everything else is optional.",
  },
  {
    id: "nav", chapter: "basics", path: "/", target: "nav",
    title: "Finding your way",
    body: "Home is your summary. Timeline is the whole story in date order. Journal holds your entries. Research holds your publications and benchwork. Planner holds tasks and goals. Academics tracks credits, deadlines and admin info. Events lists conferences and training; Notes holds scribbles and checklists.",
    phoneBody: "Home is your summary and Timeline is the whole story in date order. Planner holds tasks and goals. Journal, Research, Academics, Events, Notes and Settings are under More.",
  },
  {
    id: "reminders", chapter: "basics", path: "/", target: "reminders",
    title: "Reminders",
    body: "Every open task, course deadline and coming event, in date order: overdue (in red) first, then today, the next 7 days, later, and things with no date yet. Tick a task off right here.",
  },
  {
    id: "home-calendar", chapter: "basics", path: "/", target: "home-calendar",
    title: "This month",
    body: "Days with something on them have a dot. Days in red have a task or deadline that's still open after its date. Tap a day to open the full calendar.",
  },
  {
    id: "attention", chapter: "basics", path: "/", target: "attention",
    title: "Needs attention",
    body: "Anything else that needs you shows here when there is something: guide feedback to address, things you're waiting on, entries missing a date, courses with no credits filled in.",
  },
  {
    id: "areas", chapter: "basics", path: "/", target: "areas",
    title: "Your areas",
    body: "Benchwork, coursework, publications, guide meetings, events and admin info — each opens straight to its records. Whatever you add with Quick Add lands in the right one.",
  },
  {
    id: "working-on", chapter: "basics", path: "/", target: "working-on",
    title: "What you're working on",
    body: "Your publications in progress and your benchwork at a glance. Below this you'll find what you recorded recently and what's coming up.",
  },
  {
    id: "search", chapter: "basics", path: "/", target: "search",
    title: "Search everything",
    body: "Finds words in titles, notes, people, observations and journal names — across everything you've recorded.",
  },
  {
    id: "timeline", chapter: "basics", path: "/timeline", target: "timeline",
    title: "Your timeline",
    body: "Everything in one line, newest first: entries, experiments, tasks, papers, courses, milestones and files. Tap a title to open it. Files open right here and links open in a new tab. Planned things are marked; things without a date wait at the bottom.",
  },
  {
    id: "timeline-filters", chapter: "basics", path: "/timeline", target: "timeline-filters",
    title: "Narrow it down, or add",
    body: "Show one kind of thing, or just this month or year. Add records something new — it appears on the timeline as soon as you save it.",
  },

  // Journal and dates
  {
    id: "journal", chapter: "journal", path: "/journal", target: "journal-timeline",
    title: "Your journal",
    body: "Every entry, newest first, grouped by month. Open one to add notes, people, files or a follow-up task. Changes save by themselves — there's no Save button to forget.",
  },
  {
    id: "dates", chapter: "journal", path: "/journal", target: "journal-timeline",
    title: "Dates don't have to be exact",
    body: "When you add an entry, choose Exact date, Month only, or Not sure yet. Month-only entries appear under “Day not known”. Dates in the future are marked Planned until they happen.",
  },
  {
    id: "undated", chapter: "journal", path: "/journal", target: "journal-undated",
    title: "Needs a date",
    body: "Entries without a date wait here, below the timeline. They're still searchable and included in your export. Add a day or a month whenever you remember it.",
  },
  {
    id: "filters", chapter: "journal", path: "/journal", target: "journal-search",
    title: "Find and filter",
    body: "Search, or narrow the journal by category, status or a range of months.",
  },

  // Research
  {
    id: "research-views", chapter: "research", path: "/research", target: "research-views",
    title: "Publications and benchwork",
    body: "Your whole PhD is the one project. Publications lists your review and original articles with how far along each is; open one to track its phases, guide feedback, submissions and — for a review — its steps and PRISMA numbers. Benchwork lists every experiment with its trials.",
  },
  {
    id: "experiments", chapter: "research", path: "/research", target: "research-views",
    title: "Experiments",
    body: "Note what you tried, what you observed and anything blocking you, like equipment or supplies. Each run is a trial with its own date, result and files. Each time you change an experiment, the earlier version is kept.",
  },

  // Files and proof
  {
    id: "evidence", chapter: "files", path: "/research", target: "evidence",
    title: "Files and links",
    body: "Attach certificates, figures, drafts or photos to an entry, a publication or an experiment — or add a link to a shared folder. Up to 20 MB each. Only you can open your files.",
  },
  {
    id: "attach", chapter: "files", path: "/research", target: "quick-add",
    title: "Attach while you record",
    body: "In Quick Add, choose Attach files and they're added as soon as you save the entry. Each file is checked to make sure it really is what its name says.",
  },

  // Planner
  {
    id: "add-task", chapter: "planner", path: "/planner", target: "planner-add",
    title: "Add a task",
    body: "New task opens Quick Add on Task: type what needs doing; a due date, priority (High, Normal, Low) and a publication are optional. Tick \"Keep reminding me until it's done\" and it stays at the top of every page until it's done.",
  },
  {
    id: "waiting", chapter: "planner", path: "/planner", target: "planner-show",
    title: "Open, Waiting and Done",
    body: "Mark a task Waiting when it depends on someone else — like your guide's feedback — and note what you're waiting for. Waiting tasks stay on Home, so nothing is forgotten.",
  },
  {
    id: "planner-views", chapter: "planner", path: "/planner", target: "planner-views",
    title: "Calendar and Goals",
    body: "Calendar shows your tasks and entries by date. Goals are bigger aims for a week, month, semester or year — mark each one achieved or dropped when the time comes.",
  },
  {
    id: "notes", chapter: "planner", path: "/notes", target: "notes-list",
    title: "Notes and checklists",
    body: "A note is a blank page for scribbles. A checklist is for things to tick off, like the journals you've shortlisted. Both save as you type and show up in search.",
  },

  // Academics
  {
    id: "credits", chapter: "academics", path: "/academics", target: "credits",
    title: "Coursework credits",
    body: "Set how many credits you need. Courses count as planned, enrolled or completed. If a course has no credit value yet, the total says it's incomplete — an unknown is never counted as zero.",
  },
  {
    id: "courses", chapter: "academics", path: "/academics", target: "courses",
    title: "Courses",
    body: "Add each course and where it's from (for example SWAYAM). After you finish one, record when the university officially recognises it — even if only part of it counts.",
  },
  {
    id: "milestones", chapter: "academics", path: "/academics", target: "milestones",
    title: "Milestones",
    body: "The big steps of your PhD — coursework, committee review, synopsis, thesis, viva. Add the ones your university uses, with your own dates.",
  },
  {
    id: "enquiries", chapter: "academics", path: "/academics", target: "enquiries",
    title: "Office enquiries",
    body: "Asked an office something? Note who you asked, their reply, and when to follow up. It stays open until you close it.",
  },
  {
    id: "admin-info", chapter: "academics", path: "/academics", target: "admin-info",
    title: "Admin info",
    body: "Keep the details you keep looking up — enrolment number, office contacts — in one place. Only you can see them.",
  },
  {
    id: "events", chapter: "academics", path: "/events", target: "events-tabs",
    title: "Events",
    body: "Conferences, workshops, training and competitions: what's coming up, and under Past what you attended — with all its details and certificates — and anything you haven't said whether you went to.",
  },

  // Keeping your work safe
  {
    id: "export", chapter: "safety", path: "/settings", target: "export",
    title: "Download a copy every week",
    body: "Download export gives you everything — your records, their history and your files — in one download you can open in Excel. Do it once a week and keep it somewhere safe. It's your backup.",
  },
  {
    id: "trash", chapter: "safety", path: "/settings", target: "trash",
    title: "Nothing is lost by accident",
    body: "Deleted things go to Trash and can be restored. Archived entries are hidden from the Journal but kept.",
  },
  {
    id: "done", chapter: "safety", path: "/",
    title: "You're ready",
    body: "A good first step: record one thing that happened this week. You can open Guide me again any time.",
    phoneBody: "A good first step: record one thing that happened this week. Guide me is under More whenever you need it.",
  },
];

export const stepsFor = (chapter: GuideChapterId | null) =>
  chapter ? GUIDE_STEPS.filter((s) => s.chapter === chapter) : GUIDE_STEPS;

/** A step on "/research" also counts on its sub-pages; "/" must match exactly. */
export function onStepPage(step: GuideStep, pathname: string) {
  if (step.path === "/") return pathname === "/";
  return pathname === step.path || pathname.startsWith(step.path + "/");
}
