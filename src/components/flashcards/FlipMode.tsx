import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, ArrowRight, Check, RotateCcw, Star, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { DeckSettings, filterCards, shuffled } from "@/lib/flashcards";
import { Flashcard, useSetKnown, useToggleStar } from "@/hooks/useFlashcards";

interface FlipModeProps {
  cards: Flashcard[];
  settings: DeckSettings;
  onOpenOptions: () => void;
}

/** Whether a page-wide shortcut should leave this key press alone. */
const leaveAlone = (event: KeyboardEvent) => {
  const target = event.target as HTMLElement | null;
  if (target?.closest("input, textarea, select, [role=dialog], [contenteditable=true]")) return true;
  // A focused button or link does its own thing on Space/Enter; other keys are fine.
  return (event.key === " " || event.key === "Enter") && !!target?.closest("button, a");
};

export function FlipMode({ cards, settings, onOpenOptions }: FlipModeProps) {
  const options = settings.flashcards;
  // Only cards chosen at the start of a pass; restarting picks again.
  const [pass, setPass] = useState(0);
  const [onlyIds, setOnlyIds] = useState<string[] | null>(null);
  const order = useMemo(() => {
    const pool = onlyIds ? cards.filter((c) => onlyIds.includes(c.id)) : filterCards(cards, options.filter);
    return options.shuffle ? shuffled(pool) : pool;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a new pass is what reshuffles; star/known edits mustn't.
  }, [pass, onlyIds, options.filter, options.shuffle]);

  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  /** This pass's verdicts: card id -> knew it. */
  const [verdicts, setVerdicts] = useState<Record<string, boolean>>({});
  const setKnown = useSetKnown();
  const toggleStar = useToggleStar();
  const reduceMotion = useReducedMotion();
  const cardRef = useRef<HTMLButtonElement>(null);

  // Keep focus on the card as you move through them, so Space flips it rather
  // than pressing whichever button was clicked last ("Know it" twice).
  useEffect(() => {
    cardRef.current?.focus({ preventScroll: true });
  }, [index, pass]);

  const finished = index >= order.length;
  const card = finished ? null : order[index];
  // Starring updates live from the deck's cards (order holds the pass's copies).
  const starred = card ? cards.find((c) => c.id === card.id)?.starred ?? card.starred : false;

  const go = useCallback((to: number) => {
    setIndex(Math.max(0, to));
    setFlipped(false);
  }, []);

  const record = useCallback(
    (knew: boolean) => {
      if (!card) return;
      setVerdicts((v) => ({ ...v, [card.id]: knew }));
      setKnown.mutate({ [card.id]: knew });
      go(index + 1);
    },
    [card, go, index, setKnown]
  );

  const restart = (ids: string[] | null) => {
    setOnlyIds(ids);
    setPass((p) => p + 1);
    setVerdicts({});
    go(0);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || leaveAlone(event) || event.metaKey || event.ctrlKey || event.altKey) return;
      if (finished) return;
      if (event.key === " " || event.key === "Enter" || event.key === "ArrowUp" || event.key === "ArrowDown") {
        event.preventDefault();
        setFlipped((f) => !f);
      } else if (event.key === "ArrowRight") go(index + 1);
      else if (event.key === "ArrowLeft") go(index - 1);
      else if (event.key === "1") record(false);
      else if (event.key === "2") record(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [finished, go, index, record]);

  if (order.length === 0) {
    return <NoCards filter={options.filter} onOpenOptions={onOpenOptions} />;
  }

  if (finished) {
    const learning = Object.keys(verdicts).filter((id) => !verdicts[id]);
    const knew = Object.values(verdicts).filter(Boolean).length;
    return (
      <div className="glass-strong rounded-2xl p-6 sm:p-8 text-center space-y-4">
        <h2 className="text-2xl font-semibold">You went through all {order.length}</h2>
        <p className="text-muted-foreground">
          {Object.keys(verdicts).length === 0
            ? "You didn't sort any of them. Use “Know it” and “Still learning” to keep track."
            : `You know ${knew}, and you're still learning ${learning.length}.`}
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          {learning.length > 0 && <Button onClick={() => restart(learning)}>Study the {learning.length} you're still learning</Button>}
          <Button variant="outline" className="gap-2" onClick={() => restart(null)}>
            <RotateCcw className="h-4 w-4" />
            Start over
          </Button>
        </div>
      </div>
    );
  }

  const front = options.front === "term" ? card!.term : card!.definition;
  const back = options.front === "term" ? card!.definition : card!.term;
  const frontLabel = options.front === "term" ? "Term" : "Definition";
  const backLabel = options.front === "term" ? "Definition" : "Term";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Progress value={(index / order.length) * 100} className="h-2 flex-1" aria-label="Progress" />
        <span className="text-sm text-muted-foreground tabular-nums">
          {index + 1} / {order.length}
        </span>
      </div>

      <div className="relative [perspective:1600px]">
        <motion.button
          ref={cardRef}
          type="button"
          onClick={() => setFlipped((f) => !f)}
          aria-label={flipped ? `${backLabel}: ${back}. Click to show the ${frontLabel.toLowerCase()}` : `${frontLabel}: ${front}. Click to flip`}
          className="relative w-full min-h-[18rem] sm:min-h-[22rem] rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [transform-style:preserve-3d]"
          animate={{ rotateY: flipped ? 180 : 0 }}
          transition={reduceMotion ? { duration: 0 } : { duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        >
          {[
            { side: "front", label: frontLabel, text: front },
            { side: "back", label: backLabel, text: back },
          ].map(({ side, label, text }) => (
            <div
              key={side}
              aria-hidden
              className={cn(
                "absolute inset-0 glass-strong rounded-2xl p-6 sm:p-10 flex flex-col [backface-visibility:hidden]",
                side === "back" && "[transform:rotateY(180deg)]"
              )}
            >
              <span className="text-xs uppercase tracking-wider text-muted-foreground text-left">{label}</span>
              <span className={cn("flex-1 flex items-center justify-center text-center whitespace-pre-line break-words", text.length > 160 ? "text-lg" : "text-2xl sm:text-3xl font-medium")}>
                {text}
              </span>
            </div>
          ))}
        </motion.button>
        <Button
          size="icon"
          variant="ghost"
          className="absolute top-3 right-3 h-9 w-9"
          aria-label={starred ? "Unstar this card" : "Star this card"}
          aria-pressed={starred}
          onClick={() => card && toggleStar.mutate({ cardId: card.id, starred: !starred })}
        >
          <Star className={cn("h-5 w-5", starred && "fill-warning text-warning")} />
        </Button>
      </div>

      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" size="icon" aria-label="Previous card" disabled={index === 0} onClick={() => go(index - 1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2 rounded-xl border-destructive/40 text-destructive hover:text-destructive" onClick={() => record(false)}>
            <X className="h-4 w-4" />
            Still learning
          </Button>
          <Button variant="outline" className="gap-2 rounded-xl border-success/40 text-success hover:text-success" onClick={() => record(true)}>
            <Check className="h-4 w-4" />
            Know it
          </Button>
        </div>
        <Button variant="ghost" size="icon" aria-label="Next card" onClick={() => go(index + 1)}>
          <ArrowRight className="h-5 w-5" />
        </Button>
      </div>
      <p className="text-xs text-muted-foreground text-center hidden sm:block">Space flips · ← → move · 1 still learning · 2 know it</p>
    </div>
  );
}

export function NoCards({ filter, onOpenOptions }: { filter: string; onOpenOptions: () => void }) {
  return (
    <div className="glass-strong rounded-2xl p-8 text-center space-y-3">
      <p className="text-lg">No cards to study.</p>
      <p className="text-muted-foreground">
        {filter === "starred"
          ? "You've chosen starred cards only, and none are starred."
          : filter === "unknown"
            ? "You've chosen cards you're still learning, and you know them all. Nice."
            : "This deck has no cards."}
      </p>
      <Button variant="outline" onClick={onOpenOptions}>
        Change options
      </Button>
    </div>
  );
}
