import type { Transition, Variants } from "framer-motion";

/**
 * Shared motion language for the app. Pull durations/easings/variants from
 * here instead of hand-rolling transition objects per component, so
 * animations feel like one consistent system rather than a grab-bag of
 * durations and easing curves.
 */

// A soft "ease-out" curve — quick to start, gentle to settle. Used for most
// enter/exit fades and slides.
export const EASE_OUT: Transition["ease"] = [0.16, 1, 0.3, 1];

// Standard spring for anything that should feel physically pressed/released
// (buttons, selection pills, drag handles).
export const SPRING: Transition = { type: "spring", stiffness: 400, damping: 32, mass: 0.8 };

// A slightly snappier spring for small, frequent interactions (checkboxes,
// icon toggles) where a heavier spring would feel sluggish.
export const SPRING_SNAPPY: Transition = { type: "spring", stiffness: 500, damping: 30, mass: 0.6 };

export const DURATION = {
  fast: 0.15,
  base: 0.22,
  slow: 0.35,
} as const;

export const fadeUp: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: { duration: DURATION.base, ease: EASE_OUT } },
  exit: { opacity: 0, y: -8, transition: { duration: DURATION.fast, ease: EASE_OUT } },
};

export const fadeIn: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: DURATION.base, ease: EASE_OUT } },
  exit: { opacity: 0, transition: { duration: DURATION.fast, ease: EASE_OUT } },
};

export const scaleIn: Variants = {
  initial: { opacity: 0, scale: 0.96 },
  animate: { opacity: 1, scale: 1, transition: SPRING },
  exit: { opacity: 0, scale: 0.96, transition: { duration: DURATION.fast, ease: EASE_OUT } },
};

/** Wrap a list container with this + `staggerItem` on each child for a fluid cascade-in. */
export const staggerContainer: Variants = {
  initial: {},
  animate: { transition: { staggerChildren: 0.045, delayChildren: 0.02 } },
};

export const staggerItem: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: { duration: DURATION.base, ease: EASE_OUT } },
};

/** Per-index delay for lists that aren't using staggerContainer (e.g. mixed with AnimatePresence). */
export function staggerDelay(index: number, step = 0.04): number {
  return index * step;
}
