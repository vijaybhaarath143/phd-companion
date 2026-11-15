/**
 * What Sprig says. Short, kind, a little playful — never a nag, never guilt. Sprig cheers her on and
 * reassures her; it doesn't tell her what she should have done.
 */

export function pick<T>(list: readonly T[]): T {
  return list[Math.floor(Math.random() * list.length)];
}

/** One line for each area, shown once per visit when she first opens it. */
const PAGE_LINES: Record<string, readonly string[]> = {
  // can be someone's very first visit, so nothing that assumes she's been here before
  "": ["Hello! What's one small thing for today?", "Good to see you. One small step is plenty.", "I saved you a seat."],
  // can be empty on day one, so it describes the page rather than praising what's on it
  timeline: ["Your PhD, in date order.", "Everything you record lands here, in order."],
  journal: ["Write it while it's fresh — a title and a date are enough.", "Future you will love this note."],
  research: ["Every paper starts as a messy draft.", "One step of the review at a time."],
  planner: ["Pick one thing. Just one.", "A short list is a kind list."],
  academics: ["Credits add up quietly.", "Milestones, one by one."],
  events: ["Seminars and conferences count too."],
  notes: ["Stray thought? Park it here."],
  settings: ["An export a week keeps worries away."],
  more: ["Everything else lives in here."],
  admin: ["Hello, admin! I can't see anyone's records either."],
};

/** The first part of the address: "" for Home, "journal" for /journal/…. */
export function areaOf(path: string) {
  return path.split("/")[1] ?? "";
}

export function pageLine(path: string, now: Date) {
  const hour = now.getHours();
  if (hour >= 23 || hour < 5) return "It's late. Your PhD will still be here tomorrow.";
  if (hour < 9 && areaOf(path) === "") return "Early start! Go gently.";
  return pick(PAGE_LINES[areaOf(path)] ?? PAGE_LINES[""]);
}

export const TAP_LINES = [
  "Hehe, that tickles!",
  "Boop!",
  "You found me.",
  "I'm rooting for you. Get it? Rooting.",
  "Photosynthesising… done.",
  "Still here, still green.",
  "Need a hand? I've got leaves.",
] as const;

export const CHEERS = [
  "Slow progress is still progress.",
  "You know more than you did last month.",
  "Reviewer 2 can't reach you here.",
  "Rest is part of research.",
  "Messy data, brave scientist.",
  "Small notes grow into chapters.",
  "Your guide was a confused student once too.",
  "One good paragraph counts.",
  "You don't have to finish today. Just begin.",
  "Doubt means you're thinking. Keep going.",
] as const;

export const TRICK_LINES = ["Ta-da!", "Did you see that?", "Ten out of ten, I think.", "I've been practising."] as const;
export const DONE_LINES = ["One less thing!", "Done and dusted.", "Tick! Lovely.", "That's off your plate."] as const;
// Shown beside any error toast (a failed save, a dropped connection, a copy that didn't work), so it
// can't claim what went wrong or promise a fix — the toast says what happened and what to do. Some of
// those toasts ask her to copy her text before it's lost, so nothing here may play that down.
export const OOPS_LINES = ["Oops, a hiccup. The message has the details.", "Hmm, that didn't go to plan. Have a look at the message."] as const;
export const DIZZY_LINE = "Whoa… the room is spinning.";
export const PEEKABOO_LINE = "Peekaboo! Missed me?";
export const WAKE_LINE = "Oh! I wasn't sleeping. Just… photosynthesising.";
export const TUCKED_LINE = "Sprig is tucked away. Tap the leaf to bring it back.";
