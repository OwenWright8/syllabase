import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { AnswerWith, CardFilter, DEFAULT_GRADING, DeckSettings, GradingOptions } from "@/lib/flashcards";
import type { Flashcard } from "@/hooks/useFlashcards";
import type { StudyMode } from "./studyModes";

interface StudyOptionsDialogProps {
  mode: StudyMode;
  settings: DeckSettings;
  cards: Flashcard[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApply: (settings: DeckSettings) => void;
}

const GRADING_LABELS: Array<{ key: keyof GradingOptions; label: string; hint: string }> = [
  { key: "ignoreCase", label: "Ignore capital letters", hint: "“dna” counts for “DNA”." },
  { key: "ignorePunctuation", label: "Ignore punctuation", hint: "Commas, dashes, full stops and the like don't matter." },
  { key: "ignoreAccents", label: "Ignore accents", hint: "“cafe” counts for “café”." },
  { key: "allowTypos", label: "Allow small typos", hint: "About one mistake per six letters is still correct (you're told the right spelling)." },
  { key: "keywordsForLongAnswers", label: "Long answers: key words are enough", hint: "For answers of six words or more, having three quarters of the key words counts." },
];

function RadioRow<T extends string>({ name, value, onChange, choices }: { name: string; value: T; onChange: (value: T) => void; choices: Array<{ value: T; label: string }> }) {
  return (
    <RadioGroup value={value} onValueChange={(v) => onChange(v as T)} className="flex flex-wrap gap-x-5 gap-y-2" aria-label={name}>
      {choices.map((choice) => (
        <div key={choice.value} className="flex items-center gap-2">
          <RadioGroupItem value={choice.value} id={`${name}-${choice.value}`} />
          <Label htmlFor={`${name}-${choice.value}`} className="font-normal">
            {choice.label}
          </Label>
        </div>
      ))}
    </RadioGroup>
  );
}

export function StudyOptionsDialog({ mode, settings, cards, open, onOpenChange, onApply }: StudyOptionsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-strong border-border/50 max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Remount on open so it always starts from the current settings. */}
        {open && <OptionsForm mode={mode} settings={settings} cards={cards} onCancel={() => onOpenChange(false)} onApply={onApply} />}
      </DialogContent>
    </Dialog>
  );
}

function OptionsForm({ mode, settings, cards, onCancel, onApply }: Omit<StudyOptionsDialogProps, "open" | "onOpenChange"> & { onCancel: () => void }) {
  const [draft, setDraft] = useState<DeckSettings>(settings);
  const starred = cards.filter((c) => c.starred).length;
  const unknown = cards.filter((c) => !c.known).length;

  const section = mode === "cards" ? draft.flashcards : mode === "write" ? draft.write : draft.test;
  const setSection = (patch: Record<string, unknown>) =>
    setDraft((d) =>
      mode === "cards" ? { ...d, flashcards: { ...d.flashcards, ...patch } } : mode === "write" ? { ...d, write: { ...d.write, ...patch } } : { ...d, test: { ...d.test, ...patch } }
    );
  const setGrading = (patch: Partial<GradingOptions>) => setDraft((d) => ({ ...d, grading: { ...d.grading, ...patch } }));
  const [countText, setCountText] = useState(draft.test.questionCount === null ? "" : String(draft.test.questionCount));

  const apply = () => {
    let next = draft;
    if (mode === "test") {
      const n = Number(countText);
      next = { ...draft, test: { ...draft.test, questionCount: countText.trim() === "" || !Number.isInteger(n) || n < 1 ? null : Math.min(n, 5000) } };
    }
    onApply(next);
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Options</DialogTitle>
        <DialogDescription>Saved with this deck, so it studies the same way next time.</DialogDescription>
      </DialogHeader>

      <div className="space-y-5">
        <div className="space-y-2">
          <Label>Which cards</Label>
          <RadioRow<CardFilter>
            name="Which cards"
            value={section.filter}
            onChange={(filter) => setSection({ filter })}
            choices={[
              { value: "all", label: `All (${cards.length})` },
              { value: "starred", label: `Starred (${starred})` },
              { value: "unknown", label: `Still learning (${unknown})` },
            ]}
          />
        </div>

        {mode === "cards" ? (
          <div className="space-y-2">
            <Label>Show first</Label>
            <RadioRow<"term" | "definition">
              name="Show first"
              value={draft.flashcards.front}
              onChange={(front) => setSection({ front })}
              choices={[
                { value: "term", label: "Term" },
                { value: "definition", label: "Definition" },
              ]}
            />
          </div>
        ) : (
          <div className="space-y-2">
            <Label>Answer with</Label>
            <RadioRow<AnswerWith>
              name="Answer with"
              value={mode === "write" ? draft.write.answerWith : draft.test.answerWith}
              onChange={(answerWith) => setSection({ answerWith })}
              choices={[
                { value: "term", label: "Term" },
                { value: "definition", label: "Definition" },
                { value: "both", label: "Both (mixed)" },
              ]}
            />
            <p className="text-xs text-muted-foreground">“Term” shows you the definition and you type the term.</p>
          </div>
        )}

        {mode === "test" && (
          <div className="space-y-1.5">
            <Label htmlFor="questionCount">Number of questions</Label>
            <Input
              id="questionCount"
              inputMode="numeric"
              className="w-32"
              placeholder="All"
              value={countText}
              onChange={(e) => setCountText(e.target.value.replace(/[^0-9]/g, ""))}
            />
            <p className="text-xs text-muted-foreground">Leave empty for every card.</p>
          </div>
        )}

        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="shuffle">Shuffle</Label>
          <Switch id="shuffle" checked={section.shuffle} onCheckedChange={(shuffle) => setSection({ shuffle })} />
        </div>

        {mode !== "cards" && (
          <div className="space-y-3 border-t border-border pt-4">
            <div className="flex items-center justify-between">
              <Label>Grading</Label>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setGrading(DEFAULT_GRADING)}>
                Reset to default
              </Button>
            </div>
            {GRADING_LABELS.map(({ key, label, hint }) => (
              <div key={key} className="flex items-start justify-between gap-4">
                <div>
                  <Label htmlFor={`grading-${key}`} className="font-normal">
                    {label}
                  </Label>
                  <p className="text-xs text-muted-foreground">{hint}</p>
                </div>
                <Switch id={`grading-${key}`} checked={draft.grading[key]} onCheckedChange={(on) => setGrading({ [key]: on })} />
              </div>
            ))}
          </div>
        )}
      </div>

      <DialogFooter>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={apply}>Apply and restart</Button>
      </DialogFooter>
    </>
  );
}
