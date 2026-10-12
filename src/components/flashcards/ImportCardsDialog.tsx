import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CardSeparator, DEFAULT_IMPORT, ImportOptions, TermSeparator, parseImport } from "@/lib/flashcards";

interface ImportCardsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (cards: Array<{ term: string; definition: string }>, replace: boolean) => void;
}

const PREVIEW = 5;

export function ImportCardsDialog({ open, onOpenChange, onImport }: ImportCardsDialogProps) {
  const [text, setText] = useState("");
  const [options, setOptions] = useState<ImportOptions>(DEFAULT_IMPORT);
  const [replace, setReplace] = useState(false);
  const result = parseImport(text, options);

  const close = () => {
    onOpenChange(false);
    setText("");
    setReplace(false);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent className="glass-strong border-border/50 max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import cards</DialogTitle>
          <DialogDescription>
            Paste a list of terms and definitions. Quizlet's export (Export → copy text) works as it is: a tab between term and definition, one card per line.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Textarea
            aria-label="Cards to import"
            rows={8}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={"mitochondria\tpowerhouse of the cell\nribosome\tmakes proteins"}
            className="font-mono text-sm"
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="importBetween">Between term and definition</Label>
              <Select value={options.between} onValueChange={(between) => setOptions({ ...options, between: between as TermSeparator })}>
                <SelectTrigger id="importBetween">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="tab">Tab</SelectItem>
                  <SelectItem value="comma">Comma</SelectItem>
                  <SelectItem value="dash">Dash ( - )</SelectItem>
                  <SelectItem value="custom">Something else…</SelectItem>
                </SelectContent>
              </Select>
              {options.between === "custom" && (
                <Input
                  aria-label="Custom separator between term and definition"
                  placeholder="e.g. ::"
                  value={options.betweenCustom ?? ""}
                  onChange={(e) => setOptions({ ...options, betweenCustom: e.target.value })}
                />
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="importCards">Between cards</Label>
              <Select value={options.cards} onValueChange={(cards) => setOptions({ ...options, cards: cards as CardSeparator })}>
                <SelectTrigger id="importCards">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="newline">New line</SelectItem>
                  <SelectItem value="semicolon">Semicolon</SelectItem>
                  <SelectItem value="blank-line">Blank line</SelectItem>
                  <SelectItem value="custom">Something else…</SelectItem>
                </SelectContent>
              </Select>
              {options.cards === "custom" && (
                <Input
                  aria-label="Custom separator between cards"
                  placeholder="e.g. ||"
                  value={options.cardsCustom ?? ""}
                  onChange={(e) => setOptions({ ...options, cardsCustom: e.target.value })}
                />
              )}
            </div>
          </div>

          {text.trim() && (
            <div className="space-y-2" aria-live="polite">
              <p className="text-sm font-medium">
                {result.cards.length} card{result.cards.length === 1 ? "" : "s"} found
                {result.skipped.length > 0 && (
                  <span className="text-warning font-normal">
                    {" "}
                    · {result.skipped.length} line{result.skipped.length === 1 ? "" : "s"} skipped (no separator, or a side is empty)
                  </span>
                )}
              </p>
              {result.cards.length > 0 && (
                <ul className="rounded-xl border border-border divide-y divide-border text-sm">
                  {result.cards.slice(0, PREVIEW).map((card, i) => (
                    <li key={i} className="grid grid-cols-2 gap-3 px-3 py-2">
                      <span className="font-medium break-words">{card.term}</span>
                      <span className="text-muted-foreground break-words">{card.definition}</span>
                    </li>
                  ))}
                  {result.cards.length > PREVIEW && <li className="px-3 py-2 text-muted-foreground">…and {result.cards.length - PREVIEW} more</li>}
                </ul>
              )}
            </div>
          )}

          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={replace} onCheckedChange={(checked) => setReplace(checked === true)} />
            Replace the cards already in the deck
          </label>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button
            disabled={result.cards.length === 0}
            onClick={() => {
              onImport(result.cards, replace);
              close();
            }}
          >
            {result.cards.length ? `Add ${result.cards.length} card${result.cards.length === 1 ? "" : "s"}` : "Add cards"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
