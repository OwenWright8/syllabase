import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { ArrowLeft, Check, Pencil, RotateCcw, Star, X } from "lucide-react";
import { toast } from "sonner";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { CourseChip } from "@/components/CourseChip";
import { cn } from "@/lib/utils";
import { deckLinkText, plural } from "@/lib/flashcards";
import { STUDY_MODES } from "@/components/flashcards/studyModes";
import { TestResult, useDeck, useSetKnown, useTestResults, useToggleStar } from "@/hooks/useFlashcards";

export default function FlashcardDeck() {
  const { deckId } = useParams();
  const { data, isLoading } = useDeck(deckId);
  const { data: results = [] } = useTestResults(deckId);
  const toggleStar = useToggleStar();
  const setKnown = useSetKnown();

  if (isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-primary border-t-transparent" />
        </div>
      </Layout>
    );
  }
  const deck = data?.deck;
  if (!deck) {
    return (
      <Layout>
        <div className="max-w-3xl mx-auto text-center space-y-3 py-16">
          <p className="text-lg">That deck doesn't exist.</p>
          <Button asChild variant="outline">
            <Link to="/flashcards">Back to flashcards</Link>
          </Button>
        </div>
      </Layout>
    );
  }

  const cards = data.cards;
  const known = cards.filter((c) => c.known).length;
  const starred = cards.filter((c) => c.starred).length;
  const link = deckLinkText(deck);

  return (
    <Layout>
      <div className="max-w-4xl mx-auto space-y-6">
        <Button asChild variant="ghost" className="gap-2 -ml-2">
          <Link to="/flashcards">
            <ArrowLeft className="h-4 w-4" />
            Flashcards
          </Link>
        </Button>

        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="space-y-1.5 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight break-words">{deck.title}</h1>
              {deck.course && <CourseChip shortCode={deck.course.short_code} color={deck.course.color} />}
            </div>
            {link && <p className="text-sm text-muted-foreground">{link}</p>}
            {deck.description && <p className="text-muted-foreground whitespace-pre-line">{deck.description}</p>}
          </div>
          <Button asChild variant="outline" className="gap-2 rounded-xl shrink-0">
            <Link to={`/flashcards/${deck.id}/edit`}>
              <Pencil className="h-4 w-4" />
              Edit
            </Link>
          </Button>
        </div>

        {cards.length === 0 ? (
          <div className="glass-strong rounded-2xl p-8 text-center space-y-3">
            <p className="text-lg">This deck has no cards yet.</p>
            <Button asChild className="rounded-xl">
              <Link to={`/flashcards/${deck.id}/edit`}>Add cards</Link>
            </Button>
          </div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              {STUDY_MODES.map(({ mode, label, icon: Icon, blurb }) => (
                <Link
                  key={mode}
                  to={`/flashcards/${deck.id}/${mode}`}
                  className="glass-strong rounded-2xl p-4 space-y-2 border border-transparent transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-xl bg-primary/10">
                      <Icon className="h-5 w-5 text-primary" />
                    </div>
                    <span className="font-semibold">{label}</span>
                  </div>
                  <p className="text-sm text-muted-foreground">{blurb}</p>
                </Link>
              ))}
            </div>

            <div className="glass-strong rounded-2xl p-4 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span>
                  <span className="font-medium">{known}</span> of {plural(cards.length, "card")} known
                  {starred > 0 && <span className="text-muted-foreground"> · {starred} starred</span>}
                </span>
                {known > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1.5 h-8"
                    onClick={async () => {
                      try {
                        await setKnown.mutateAsync(Object.fromEntries(cards.map((c) => [c.id, false])));
                        toast.success("Progress reset");
                      } catch {
                        // Shown by the global mutation error handler.
                      }
                    }}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Reset progress
                  </Button>
                )}
              </div>
              <Progress value={(known / cards.length) * 100} className="h-2" aria-label={`${known} of ${cards.length} known`} />
            </div>

            <section className="space-y-2">
              <h2 className="text-lg font-semibold">Cards</h2>
              <ul className="space-y-2">
                {cards.map((card, index) => (
                  <li key={card.id} className="glass-strong rounded-xl p-3 flex items-start gap-3">
                    <div className="grid flex-1 min-w-0 gap-1 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] sm:gap-4">
                      <p className="font-medium break-words whitespace-pre-line">{card.term}</p>
                      <p className="text-muted-foreground break-words whitespace-pre-line">{card.definition}</p>
                    </div>
                    <span
                      className={cn("text-xs shrink-0 mt-1", card.known ? "text-success" : "text-muted-foreground")}
                      title={card.known ? "You knew this last time" : "Still learning"}
                    >
                      {card.known ? "Known" : "Learning"}
                    </span>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 shrink-0"
                      aria-label={card.starred ? `Unstar card ${index + 1}` : `Star card ${index + 1}`}
                      aria-pressed={card.starred}
                      onClick={() => toggleStar.mutate({ cardId: card.id, starred: !card.starred })}
                    >
                      <Star className={cn("h-4 w-4", card.starred && "fill-warning text-warning")} />
                    </Button>
                  </li>
                ))}
              </ul>
            </section>

            {results.length > 0 && <TestHistory results={results} />}
          </>
        )}
      </div>
    </Layout>
  );
}

function TestHistory({ results }: { results: TestResult[] }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold">Past tests</h2>
      <ul className="space-y-2">
        {results.map((result) => {
          const percent = Math.round((result.correct / result.total) * 100);
          const expanded = open === result.id;
          return (
            <li key={result.id} className="glass-strong rounded-xl">
              <button
                type="button"
                className="w-full flex items-center justify-between gap-3 p-3 text-left"
                aria-expanded={expanded}
                onClick={() => setOpen(expanded ? null : result.id)}
              >
                <span className="text-sm">{format(parseISO(result.created_at), "MMM d, h:mm a")}</span>
                <span className={cn("text-sm font-medium", percent >= 80 ? "text-success" : percent >= 60 ? "text-warning" : "text-destructive")}>
                  {result.correct}/{result.total} · {percent}%
                </span>
              </button>
              {expanded && (
                <ol className="border-t border-border divide-y divide-border">
                  {result.answers.map((answer, i) => (
                    <li key={i} className="p-3 text-sm flex gap-2">
                      {answer.correct ? <Check className="h-4 w-4 text-success shrink-0 mt-0.5" /> : <X className="h-4 w-4 text-destructive shrink-0 mt-0.5" />}
                      <div className="min-w-0 space-y-0.5">
                        <p className="break-words">{answer.prompt}</p>
                        <p className="text-muted-foreground break-words">
                          You wrote: {answer.given ? `“${answer.given}”` : <em>nothing</em>}
                          {!answer.correct && <> · Answer: “{answer.expected}”</>}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
