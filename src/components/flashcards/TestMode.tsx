import { useState } from "react";
import { Check, RotateCcw, Settings2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { DeckSettings, Grade, Question, filterCards, grade, makeQuestions, plural, sideName, type StudyCard } from "@/lib/flashcards";
import { Flashcard, TestAnswer, useSaveTestResult, useSetKnown } from "@/hooks/useFlashcards";
import { NoCards } from "./FlipMode";

interface TestModeProps {
  deckId: string;
  cards: Flashcard[];
  settings: DeckSettings;
  onOpenOptions: () => void;
}

interface Graded {
  question: Question;
  given: string;
  grade: Grade;
  /** Changed by hand after grading. */
  overridden: boolean;
}

type Stage = { name: "start" } | { name: "taking"; questions: Question[] } | { name: "results"; graded: Graded[]; resultId: string | null };

const isCorrect = (g: Graded) => (g.overridden ? !g.grade.correct : g.grade.correct);
const ANSWER_WITH_TEXT = { term: "type the term", definition: "type the definition", both: "type the term or the definition (mixed)" } as const;

export function TestMode({ deckId, cards, settings, onOpenOptions }: TestModeProps) {
  const options = settings.test;
  const [stage, setStage] = useState<Stage>({ name: "start" });
  const save = useSaveTestResult();
  const setKnown = useSetKnown();

  const available = filterCards(cards, options.filter);
  const count = options.questionCount ? Math.min(options.questionCount, available.length) : available.length;

  const begin = (only?: StudyCard[]) =>
    setStage({
      name: "taking",
      questions: makeQuestions(only ?? cards, {
        answerWith: options.answerWith,
        filter: only ? "all" : options.filter,
        shuffle: options.shuffle,
        limit: only ? null : options.questionCount,
      }),
    });

  const toAnswers = (graded: Graded[]): TestAnswer[] =>
    graded.map((g) => ({ card_id: g.question.card.id, prompt: g.question.prompt, expected: g.question.expected, given: g.given, correct: isCorrect(g) }));

  const finish = async (questions: Question[], answers: string[]) => {
    const graded = questions.map((question, i) => ({
      question,
      given: answers[i] ?? "",
      grade: (answers[i] ?? "").trim() ? grade(answers[i], question.expected, settings.grading) : { correct: false, kind: "wrong" as const },
      overridden: false,
    }));
    setStage({ name: "results", graded, resultId: null });
    window.scrollTo({ top: 0 });
    setKnown.mutate(Object.fromEntries(graded.map((g) => [g.question.card.id, isCorrect(g)])));
    try {
      const resultId = await save.mutateAsync({ deckId, answers: toAnswers(graded) });
      setStage((s) => (s.name === "results" ? { ...s, resultId } : s));
    } catch {
      // Shown by the global mutation error handler; the results are still on screen.
    }
  };

  const toggleOverride = (index: number) => {
    if (stage.name !== "results") return;
    const graded = stage.graded.map((g, i) => (i === index ? { ...g, overridden: !g.overridden } : g));
    setStage({ ...stage, graded });
    const changed = graded[index];
    setKnown.mutate({ [changed.question.card.id]: isCorrect(changed) });
    if (stage.resultId) save.mutate({ id: stage.resultId, deckId, answers: toAnswers(graded) });
  };

  if (available.length === 0) return <NoCards filter={options.filter} onOpenOptions={onOpenOptions} />;

  if (stage.name === "start") {
    return (
      <div className="glass-strong rounded-2xl p-6 sm:p-8 space-y-5 text-center">
        <h2 className="text-2xl font-semibold">Test yourself</h2>
        <p className="text-muted-foreground">
          {plural(count, "question")}: you'll {ANSWER_WITH_TEXT[options.answerWith]}.
          <br />
          Answers are graded when you submit, and you can review every one.
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button variant="outline" className="gap-2" onClick={onOpenOptions}>
            <Settings2 className="h-4 w-4" />
            Options
          </Button>
          <Button onClick={() => begin()}>Start test</Button>
        </div>
      </div>
    );
  }

  if (stage.name === "taking") {
    return <TestForm key={stage.questions.map((q) => q.card.id).join()} questions={stage.questions} onSubmit={(answers) => finish(stage.questions, answers)} />;
  }

  const right = stage.graded.filter(isCorrect).length;
  const total = stage.graded.length;
  const percent = Math.round((right / total) * 100);
  const missed = stage.graded.filter((g) => !isCorrect(g)).map((g) => g.question.card);
  return (
    <div className="space-y-4">
      <div className="glass-strong rounded-2xl p-6 sm:p-8 text-center space-y-3">
        <p className={cn("text-5xl font-semibold tabular-nums", percent >= 80 ? "text-success" : percent >= 60 ? "text-warning" : "text-destructive")}>{percent}%</p>
        <p className="text-muted-foreground" aria-live="polite">
          {right} of {total} correct
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          {missed.length > 0 && <Button onClick={() => begin(missed)}>Retake the {missed.length} you missed</Button>}
          <Button variant="outline" className="gap-2" onClick={() => begin()}>
            <RotateCcw className="h-4 w-4" />
            New test
          </Button>
        </div>
      </div>

      <ol className="space-y-2">
        {stage.graded.map((g, index) => {
          const correct = isCorrect(g);
          return (
            <li key={index} className={cn("glass-strong rounded-xl p-4 border-l-4 space-y-2", correct ? "border-l-success" : "border-l-destructive")}>
              <div className="flex items-start gap-2">
                {correct ? <Check className="h-5 w-5 text-success shrink-0" aria-label="Correct" /> : <X className="h-5 w-5 text-destructive shrink-0" aria-label="Wrong" />}
                <p className="font-medium whitespace-pre-line break-words">
                  {index + 1}. {g.question.prompt}
                </p>
              </div>
              <div className="pl-7 space-y-1 text-sm">
                <p>
                  <span className="text-muted-foreground">You wrote: </span>
                  {g.given.trim() ? <span className="break-words">{g.given}</span> : <em className="text-muted-foreground">nothing</em>}
                </p>
                {(!correct || g.grade.kind !== "exact") && (
                  <p>
                    <span className="text-muted-foreground">Answer: </span>
                    <span className="font-medium break-words whitespace-pre-line">{g.question.expected}</span>
                  </p>
                )}
                {!g.overridden && g.grade.kind === "typo" && <p className="text-xs text-muted-foreground">Counted as correct with a small typo.</p>}
                {!g.overridden && g.grade.kind === "keywords" && <p className="text-xs text-muted-foreground">Counted as correct: you had most of the key words.</p>}
                {g.overridden && <p className="text-xs text-muted-foreground">You changed this mark.</p>}
              </div>
              <div className="pl-7">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  // Until the result is saved there's nothing to correct (a change now would be lost).
                  disabled={!stage.resultId && save.isPending}
                  onClick={() => toggleOverride(index)}
                >
                  {g.overridden ? "Undo" : correct ? "Mark wrong" : "Count as correct"}
                </Button>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function TestForm({ questions, onSubmit }: { questions: Question[]; onSubmit: (answers: string[]) => void }) {
  const [answers, setAnswers] = useState<string[]>(() => questions.map(() => ""));
  const [confirmBlank, setConfirmBlank] = useState(false);
  const blank = answers.filter((a) => !a.trim()).length;

  const submit = () => {
    if (blank > 0) setConfirmBlank(true);
    else onSubmit(answers);
  };

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <ol className="space-y-3">
        {questions.map((question, index) => {
          const id = `test-answer-${index}`;
          const long = question.expected.length > 80;
          const set = (value: string) => setAnswers((current) => current.map((a, i) => (i === index ? value : a)));
          return (
            <li key={index} className="glass-strong rounded-2xl p-4 sm:p-5 space-y-3">
              <div className="space-y-1">
                <span className="text-xs uppercase tracking-wider text-muted-foreground">
                  {index + 1} of {questions.length} · {question.answerSide === "term" ? "Definition" : "Term"}
                </span>
                <p className="text-lg whitespace-pre-line break-words">{question.prompt}</p>
              </div>
              <label htmlFor={id} className="sr-only">
                Answer {index + 1}: type the {sideName(question.answerSide)}
              </label>
              {long ? (
                <Textarea id={id} rows={3} value={answers[index]} placeholder={`Type the ${sideName(question.answerSide)}`} onChange={(e) => set(e.target.value)} />
              ) : (
                <Input
                  id={id}
                  value={answers[index]}
                  autoComplete="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  placeholder={`Type the ${sideName(question.answerSide)}`}
                  onChange={(e) => set(e.target.value)}
                  // Enter moves on to the next question rather than submitting early.
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    e.preventDefault();
                    const nextField = document.getElementById(`test-answer-${index + 1}`);
                    if (nextField) nextField.focus();
                    else submit();
                  }}
                />
              )}
            </li>
          );
        })}
      </ol>
      <div className="flex justify-end">
        <Button type="submit" size="lg">
          Submit test
        </Button>
      </div>

      <AlertDialog open={confirmBlank} onOpenChange={setConfirmBlank}>
        <AlertDialogContent className="glass-strong border-border/50">
          <AlertDialogHeader>
            <AlertDialogTitle>Submit with {plural(blank, "blank answer")}?</AlertDialogTitle>
            <AlertDialogDescription>Blank answers are marked wrong.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Keep going</AlertDialogCancel>
            <AlertDialogAction className="rounded-xl" onClick={() => onSubmit(answers)}>
              Submit
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
}
