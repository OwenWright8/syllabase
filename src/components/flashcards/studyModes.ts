import { ClipboardCheck, Keyboard, Layers } from "lucide-react";

export type StudyMode = "cards" | "write" | "test";

export const STUDY_MODES = [
  { mode: "cards", label: "Flashcards", icon: Layers, blurb: "Flip through the cards and sort them into “know it” and “still learning”." },
  { mode: "write", label: "Write", icon: Keyboard, blurb: "See one side, type the other. Missed cards come back until you get them all." },
  { mode: "test", label: "Test", icon: ClipboardCheck, blurb: "Answer a set of questions, then get a graded score you can review." },
] as const;
