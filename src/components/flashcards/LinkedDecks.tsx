import { Link } from "react-router-dom";
import { Layers, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDecks } from "@/hooks/useFlashcards";
import { plural } from "@/lib/flashcards";

/** The flashcard decks for an exam or a quiz, with a way to make one. */
export function LinkedDecks({ examId, quizId, courseId, onNavigate }: { examId?: string; quizId?: string; courseId?: string; onNavigate?: () => void }) {
  const { data: decks = [] } = useDecks();
  const linked = decks.filter((deck) => (examId && deck.exam_id === examId) || (quizId && deck.quiz_id === quizId));
  const params = new URLSearchParams({ ...(examId ? { exam: examId } : {}), ...(quizId ? { quiz: quizId } : {}), ...(courseId ? { course: courseId } : {}) });

  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium flex items-center gap-1.5">
        <Layers className="h-4 w-4" />
        Flashcards
      </h4>
      {linked.length > 0 && (
        <ul className="space-y-1">
          {linked.map((deck) => (
            <li key={deck.id}>
              <Link
                to={`/flashcards/${deck.id}`}
                onClick={onNavigate}
                className="flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm bg-muted/50 hover:bg-muted transition-colors"
              >
                <span className="font-medium truncate">{deck.title}</span>
                <span className="text-xs text-muted-foreground shrink-0">
                  {deck.knownCount}/{plural(deck.cardCount, "card")} known
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Button asChild variant="outline" size="sm" className="gap-1.5">
        <Link to={`/flashcards/new?${params}`} onClick={onNavigate}>
          <Plus className="h-3.5 w-3.5" />
          {linked.length ? "Another deck" : `Make flashcards for this ${examId ? "exam" : "quiz"}`}
        </Link>
      </Button>
    </div>
  );
}
