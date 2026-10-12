import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Check, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  DeckSettings,
  Grade,
  WriteSession,
  answerWrite,
  currentQuestion,
  grade,
  isFinished,
  makeQuestions,
  overrideLastMiss,
  sideName,
  startWrite,
} from "@/lib/flashcards";
import { Flashcard, useSetKnown } from "@/hooks/useFlashcards";
import { NoCards } from "./FlipMode";

interface WriteModeProps {
  deckId: string;
  cards: Flashcard[];
  settings: DeckSettings;
  onOpenOptions: () => void;
}

interface Feedback {
  cardId: string;
  given: string;
  expected: string;
  grade: Grade;
  /** "I was right" was pressed. */
  overridden: boolean;
}

export function WriteMode({ deckId, cards, settings, onOpenOptions }: WriteModeProps) {
  const options = settings.write;
  const fresh = (only?: string[]) =>
    startWrite(
      makeQuestions(only ? cards.filter((c) => only.includes(c.id)) : cards, { answerWith: options.answerWith, filter: only ? "all" : options.filter, shuffle: options.shuffle }),
      options.answerWith
    );
  const [session, setSession] = useState<WriteSession>(() => fresh());
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const setKnown = useSetKnown();
  const inputRef = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const continueRef = useRef<HTMLButtonElement>(null);

  const question = currentQuestion(session);
  // While feedback is showing, the question it is about is the one just answered.
  const shown = feedback ? null : question;
  const longAnswer = (shown?.expected.length ?? 0) > 80;

  useEffect(() => {
    if (feedback) continueRef.current?.focus();
    else inputRef.current?.focus();
  }, [feedback, question]);

  if (session.total === 0) return <NoCards filter={options.filter} onOpenOptions={onOpenOptions} />;

  const submit = (given: string) => {
    if (!question || feedback) return;
    const result = given.trim() ? grade(given, question.expected, settings.grading) : { correct: false, kind: "wrong" as const };
    setFeedback({ cardId: question.card.id, given, expected: question.expected, grade: result, overridden: false });
    setSession((s) => answerWrite(s, result.correct));
    setKnown.mutate({ [question.card.id]: result.correct });
  };

  const iWasRight = () => {
    if (!feedback) return;
    setSession((s) => overrideLastMiss(s, feedback.cardId));
    setKnown.mutate({ [feedback.cardId]: true });
    setFeedback({ ...feedback, overridden: true, grade: { correct: true, kind: "exact" } });
  };

  const next = () => {
    setFeedback(null);
    setAnswer("");
  };

  const restart = (only?: string[]) => {
    setSession(fresh(only));
    next();
  };

  if (isFinished(session) && !feedback) {
    const missed = session.everMissed;
    const firstTime = session.total - missed.length;
    return (
      <div className="glass-strong rounded-2xl p-6 sm:p-8 text-center space-y-4">
        <h2 className="text-2xl font-semibold">Done: you got all {session.total}</h2>
        <p className="text-muted-foreground">
          {firstTime} right first time
          {missed.length > 0 && `, ${missed.length} needed another go`}
          {session.round > 1 && ` (${session.round} rounds)`}.
        </p>
        {missed.length > 0 && (
          <ul className="text-left max-w-md mx-auto space-y-1 text-sm">
            {cards
              .filter((c) => missed.includes(c.id))
              .map((c) => (
                <li key={c.id} className="flex gap-2">
                  <X className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                  <span>
                    <span className="font-medium">{c.term}</span> <span className="text-muted-foreground">: {c.definition}</span>
                  </span>
                </li>
              ))}
          </ul>
        )}
        <div className="flex flex-wrap justify-center gap-2">
          {missed.length > 0 && <Button onClick={() => restart(missed)}>Practise the {missed.length} you missed</Button>}
          <Button variant="outline" className="gap-2" onClick={() => restart()}>
            <RotateCcw className="h-4 w-4" />
            Start over
          </Button>
          <Button asChild variant="outline">
            <Link to={`/flashcards/${deckId}/test`}>Take a test</Link>
          </Button>
        </div>
      </div>
    );
  }

  const done = session.done.length;
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Progress value={(done / session.total) * 100} className="h-2 flex-1" aria-label="Progress" />
        <span className="text-sm text-muted-foreground tabular-nums">
          {done} / {session.total}
          {session.round > 1 && ` · round ${session.round}`}
        </span>
      </div>

      {feedback ? (
        <FeedbackPanel feedback={feedback} onIWasRight={iWasRight} onNext={next} continueRef={continueRef} />
      ) : (
        shown && (
          <form
            className="glass-strong rounded-2xl p-6 sm:p-8 space-y-5"
            onSubmit={(event) => {
              event.preventDefault();
              submit(answer);
            }}
          >
            <div className="space-y-2">
              <span className="text-xs uppercase tracking-wider text-muted-foreground">{shown.answerSide === "term" ? "Definition" : "Term"}</span>
              <p className={cn("whitespace-pre-line break-words", shown.prompt.length > 160 ? "text-lg" : "text-2xl font-medium")}>{shown.prompt}</p>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="writeAnswer" className="text-sm text-muted-foreground">
                Type the {sideName(shown.answerSide)}
              </label>
              {longAnswer ? (
                <Textarea
                  id="writeAnswer"
                  ref={inputRef}
                  rows={3}
                  value={answer}
                  autoComplete="off"
                  onChange={(e) => setAnswer(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      submit(answer);
                    }
                  }}
                />
              ) : (
                <Input id="writeAnswer" ref={inputRef} value={answer} autoComplete="off" autoCapitalize="off" spellCheck={false} onChange={(e) => setAnswer(e.target.value)} />
              )}
            </div>
            <div className="flex flex-wrap justify-between gap-2">
              <Button type="button" variant="ghost" onClick={() => submit("")}>
                Don't know
              </Button>
              <Button type="submit" disabled={!answer.trim()}>
                Answer
              </Button>
            </div>
          </form>
        )
      )}
    </div>
  );
}

function FeedbackPanel({
  feedback,
  onIWasRight,
  onNext,
  continueRef,
}: {
  feedback: Feedback;
  onIWasRight: () => void;
  onNext: () => void;
  continueRef: React.RefObject<HTMLButtonElement>;
}) {
  const { grade: result, given, expected, overridden } = feedback;
  return (
    <div
      role="status"
      className={cn("glass-strong rounded-2xl p-6 sm:p-8 space-y-4 border-2", result.correct ? "border-success/50" : "border-destructive/50")}
    >
      <div className={cn("flex items-center gap-2 text-lg font-semibold", result.correct ? "text-success" : "text-destructive")}>
        {result.correct ? <Check className="h-5 w-5" /> : <X className="h-5 w-5" />}
        {overridden
          ? "Counted as correct"
          : result.kind === "exact"
            ? "Correct"
            : result.kind === "typo"
              ? "Correct, but check the spelling"
              : result.kind === "keywords"
                ? "Correct: you had the key words"
                : given.trim()
                  ? "Not quite"
                  : "Here's the answer"}
      </div>
      {given.trim() && (result.kind !== "exact" || overridden) && (
        <p className="text-sm">
          <span className="text-muted-foreground">You wrote: </span>
          <span className="break-words">{given}</span>
        </p>
      )}
      {(result.kind !== "exact" || overridden) && (
        <p className="text-sm">
          <span className="text-muted-foreground">{result.correct ? "The full answer: " : "The answer: "}</span>
          <span className="font-medium break-words whitespace-pre-line">{expected}</span>
        </p>
      )}
      <div className="flex flex-wrap justify-between gap-2">
        {!result.correct && given.trim() ? (
          <Button variant="ghost" onClick={onIWasRight}>
            I was right
          </Button>
        ) : (
          <span />
        )}
        <Button ref={continueRef} onClick={onNext}>
          Continue
        </Button>
      </div>
    </div>
  );
}
