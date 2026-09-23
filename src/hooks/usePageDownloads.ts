import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PIECE_BYTES, decodeBase64 } from "@/lib/documentPages";

const EXTRACT_COLUMNS = "id, status, error, size_bytes";
const POLL_MS = 1000;
const GIVE_UP_MS = 15 * 60 * 1000;

interface ExtractRow {
  id: string;
  status: "pending" | "processing" | "ready" | "failed";
  error: string | null;
  size_bytes: number | null;
}

export interface PageRange {
  documentId: string;
  start: number;
  end: number;
  /** The name to save the file under. */
  filename: string;
}

const wait = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(new DOMException("Cancelled", "AbortError"));
    });
  });

async function findExtract(range: PageRange): Promise<ExtractRow | null> {
  const { data, error } = await supabase
    .from("document_extracts")
    .select(EXTRACT_COLUMNS)
    .eq("document_id", range.documentId)
    .eq("start_page", range.start)
    .eq("end_page", range.end)
    .maybeSingle();
  if (error) throw error;
  return (data as ExtractRow | null) ?? null;
}

/**
 * Ask the server for just these pages of a book and return them as a PDF.
 *
 * The server cuts the pages out (a background job), the browser waits for it and
 * reads the result back a piece at a time, then removes the server's copy: it is
 * only ever a hand-over, not storage.
 */
export async function fetchPages(userId: string, range: PageRange, signal?: AbortSignal): Promise<Blob> {
  let extract = await findExtract(range);
  if (extract?.status === "failed") {
    await supabase.from("document_extracts").delete().eq("id", extract.id);
    extract = null;
  }

  if (!extract) {
    const { data, error } = await supabase
      .from("document_extracts")
      .insert({ document_id: range.documentId, user_id: userId, start_page: range.start, end_page: range.end })
      .select(EXTRACT_COLUMNS)
      .single();
    if (error) {
      if (error.code !== "23505") throw error;
      extract = await findExtract(range); // someone (another tab) asked for the same pages a moment ago
    } else {
      extract = data as ExtractRow;
    }
  }
  if (!extract) throw new Error("Couldn't ask for those pages.");

  const id = extract.id;
  try {
    const started = Date.now();
    while (extract.status !== "ready") {
      if (extract.status === "failed") throw new Error(extract.error || "Those pages couldn't be prepared.");
      if (Date.now() - started > GIVE_UP_MS) throw new Error("Preparing those pages is taking too long. Try again later.");
      await wait(POLL_MS, signal);
      const { data, error } = await supabase.from("document_extracts").select(EXTRACT_COLUMNS).eq("id", id).maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Those pages are no longer available. Try again.");
      extract = data as ExtractRow;
    }

    const size = extract.size_bytes ?? 0;
    const pieces: Uint8Array[] = [];
    let received = 0;
    for (let piece = 0; received < size; piece++) {
      if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
      const { data, error } = await supabase.rpc("extract_piece", { p_extract: id, p_piece: piece });
      if (error) throw error;
      const bytes = decodeBase64(data ?? "");
      if (bytes.length === 0) break;
      pieces.push(bytes);
      received += bytes.length;
    }
    if (received !== size || size === 0) throw new Error("The download was cut short. Try again.");
    return new Blob(pieces as BlobPart[], { type: "application/pdf" });
  } finally {
    // Best effort: the server also sweeps these up, so a failure here costs nothing.
    await supabase.from("document_extracts").delete().eq("id", id);
  }
}

export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

const keyOf = (range: Pick<PageRange, "documentId" | "start" | "end">) => `${range.documentId}:${range.start}-${range.end}`;

/** Downloading page ranges: which are in progress, and a function to start one. */
export function usePageDownloads() {
  const { user } = useAuth();
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const inFlight = useRef<Set<string>>(new Set());

  const download = useCallback(
    async (range: PageRange) => {
      if (!user) return;
      const key = keyOf(range);
      if (inFlight.current.has(key)) return;
      inFlight.current.add(key);
      setBusy(new Set(inFlight.current));
      const toastId = toast.loading("Preparing those pages…");
      try {
        const blob = await fetchPages(user.id, range);
        saveBlob(blob, range.filename);
        toast.success("Downloaded", { id: toastId });
      } catch (error) {
        const message = error instanceof Error && error.message ? error.message : (error as { message?: string })?.message;
        toast.error(message || "Couldn't download those pages.", { id: toastId });
      } finally {
        inFlight.current.delete(key);
        setBusy(new Set(inFlight.current));
      }
    },
    [user]
  );

  return { download, isBusy: (range: Pick<PageRange, "documentId" | "start" | "end">) => busy.has(keyOf(range)) };
}
