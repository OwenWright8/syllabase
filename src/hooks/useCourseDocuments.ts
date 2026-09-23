import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export type DocumentKind = "textbook" | "syllabus";
export type DocumentStatus = "uploading" | "queued" | "processing" | "ready" | "failed";

export interface CourseDocument {
  id: string;
  course_id: string;
  kind: DocumentKind;
  filename: string;
  size_bytes: number;
  uploaded_bytes: number;
  status: DocumentStatus;
  progress: number;
  error: string | null;
  page_count: number | null;
  page_offset: number;
  created_at: string;
}

export interface DocumentLimits {
  enabled: boolean;
  maxFileBytes: number;
  maxUserBytes: number;
}

/** The server stores "unlimited" as a number too large to ever apply (1 PB); anything at or above this means no limit. */
export const UNLIMITED_BYTES = 1e15;
export const isUnlimited = (bytes: number) => bytes >= UNLIMITED_BYTES;

export const documentKeys = {
  all: (userId: string) => ["documents", userId] as const,
  course: (userId: string, courseId: string) => ["documents", userId, "course", courseId] as const,
  usage: (userId: string) => ["documents", userId, "usage"] as const,
  limits: ["document-limits"] as const,
};

// One chunk is 1 MiB: the database rejects anything larger, and it keeps each
// request (sent as hex inside JSON, so ~2.1 MB) under the gateway's 4 MB limit.
export const CHUNK_BYTES = 1024 * 1024;

const ALLOWED_EXTENSIONS: Record<DocumentKind, string[]> = {
  textbook: [".pdf"],
  syllabus: [".pdf", ".docx", ".png", ".jpg", ".jpeg"],
};

/** The <input type="file" accept> value for a kind of document. */
export const acceptFor = (kind: DocumentKind) => ALLOWED_EXTENSIONS[kind].join(",");

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/** Documents that still need something to happen: worth polling until they settle. */
const isActive = (doc: CourseDocument) => doc.status === "queued" || doc.status === "processing";

export function useDocumentLimits() {
  return useQuery({
    queryKey: documentKeys.limits,
    queryFn: async (): Promise<DocumentLimits> => {
      const { data, error } = await supabase.from("document_limits").select("*").single();
      if (error) throw error;
      return {
        enabled: data.enabled,
        maxFileBytes: data.max_file_bytes,
        maxUserBytes: data.max_user_bytes,
      };
    },
    staleTime: 5 * 60 * 1000,
  });
}

/** Bytes this user has stored across all their courses (what counts against the quota). */
export function useDocumentUsage() {
  const { user } = useAuth();
  return useQuery({
    queryKey: documentKeys.usage(user?.id ?? ""),
    queryFn: async () => {
      const { data, error } = await supabase.from("course_documents").select("size_bytes");
      if (error) throw error;
      return (data ?? []).reduce((total, row) => total + row.size_bytes, 0);
    },
    enabled: !!user,
  });
}

export function useCourseDocuments(courseId: string | undefined) {
  const { user } = useAuth();

  return useQuery({
    queryKey: documentKeys.course(user?.id ?? "", courseId ?? ""),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("course_documents")
        .select("id, course_id, kind, filename, size_bytes, uploaded_bytes, status, progress, error, page_count, page_offset, created_at")
        .eq("course_id", courseId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as CourseDocument[];
    },
    enabled: !!user && !!courseId,
    // Keep checking while the server is still working on something.
    refetchInterval: (query) => (query.state.data?.some(isActive) ? 2000 : false),
  });
}

export function useDeleteDocument() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (documentId: string) => {
      const { error } = await supabase.from("course_documents").delete().eq("id", documentId);
      if (error) throw error;
    },
    onSuccess: () => {
      if (!user) return;
      queryClient.invalidateQueries({ queryKey: documentKeys.all(user.id) });
      // readings that pointed at it lose their download link (the database clears it)
      queryClient.invalidateQueries({ queryKey: ["readings", user.id] });
    },
  });
}

/** Ask the server to process a failed document again. */
export function useRetryDocument() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (documentId: string) => {
      const { error } = await supabase.from("course_documents").update({ status: "queued" }).eq("id", documentId);
      if (error) throw error;
    },
    onSuccess: () => {
      if (user) queryClient.invalidateQueries({ queryKey: documentKeys.all(user.id) });
    },
  });
}

// --- Upload -------------------------------------------------------------------

/** Why a file can't be uploaded, judged before anything is sent; null if it can. */
export function checkUpload(
  file: { name: string; size: number },
  kind: DocumentKind,
  limits: DocumentLimits,
  usedBytes: number
): string | null {
  if (!limits.enabled) return "Uploads are switched off on this server.";
  if (file.size === 0) return "That file is empty.";
  const extension = file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".")).toLowerCase() : "";
  if (!ALLOWED_EXTENSIONS[kind].includes(extension)) {
    return kind === "textbook"
      ? "Textbooks need to be PDF files."
      : "A syllabus can be a PDF, a Word (.docx) document, or a photo (PNG or JPG).";
  }
  if (file.size > limits.maxFileBytes) {
    return `That file is ${formatBytes(file.size)}; the limit for one file is ${formatBytes(limits.maxFileBytes)}.`;
  }
  if (usedBytes + file.size > limits.maxUserBytes) {
    return `That would take you over your storage limit (${formatBytes(usedBytes)} of ${formatBytes(limits.maxUserBytes)} used). Delete something first.`;
  }
  return null;
}

const HEX = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, "0"));

/** Postgres `bytea` in its hex input form, as PostgREST accepts it inside JSON. */
export function toByteaHex(bytes: Uint8Array): string {
  const parts = new Array<string>(bytes.length);
  for (let i = 0; i < bytes.length; i++) parts[i] = HEX[bytes[i]];
  return "\\x" + parts.join("");
}

export interface UploadRequest {
  file: File;
  courseId: string;
  kind: DocumentKind;
  /** Called with 0..1 as chunks are stored. */
  onProgress?: (fraction: number) => void;
  /** Called once the document row exists (so the UI can show it while it uploads). */
  onStarted?: (documentId: string) => void;
  signal?: AbortSignal;
}

/**
 * Store a file as a document, in chunks, then queue it for processing.
 * If anything goes wrong (or the user cancels) the half-made document is
 * deleted so it doesn't hold storage quota.
 */
export async function uploadDocument(userId: string, request: UploadRequest): Promise<string> {
  const { file, courseId, kind, onProgress, onStarted, signal } = request;

  const { data: created, error: createError } = await supabase
    .from("course_documents")
    .insert({
      user_id: userId,
      course_id: courseId,
      kind,
      filename: file.name.slice(0, 255),
      mime_type: file.type ? file.type.slice(0, 127) : null,
      size_bytes: file.size,
    })
    .select("id")
    .single();

  if (createError || !created) {
    // Row level security is what enforces the limits, so a refusal here means
    // over a limit, uploads switched off, or a course that isn't yours.
    if (createError?.code === "42501") {
      throw new Error("This file can't be uploaded: it's over a storage limit, or uploads are switched off.");
    }
    throw new Error(createError?.message || "Couldn't start the upload.");
  }

  const documentId = created.id as string;
  onStarted?.(documentId);

  try {
    const chunkCount = Math.ceil(file.size / CHUNK_BYTES);
    for (let seq = 0; seq < chunkCount; seq++) {
      if (signal?.aborted) throw new DOMException("Upload cancelled", "AbortError");
      const start = seq * CHUNK_BYTES;
      const bytes = new Uint8Array(await file.slice(start, Math.min(start + CHUNK_BYTES, file.size)).arrayBuffer());
      const { error } = await supabase
        .from("course_document_chunks")
        .insert({ document_id: documentId, seq, user_id: userId, data: toByteaHex(bytes) });
      if (error) throw new Error(`The upload failed part-way (${error.message}).`);
      onProgress?.(Math.min((start + bytes.length) / file.size, 1));
    }

    const { error: queueError } = await supabase.from("course_documents").update({ status: "queued" }).eq("id", documentId);
    if (queueError) throw new Error(`The upload finished but couldn't be processed (${queueError.message}).`);
  } catch (error) {
    // Best effort: free the quota the half-uploaded file was holding.
    await supabase.from("course_documents").delete().eq("id", documentId);
    throw error;
  }

  return documentId;
}

export function useUploadDocument() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: UploadRequest) => uploadDocument(user!.id, request),
    onSettled: () => {
      if (user) queryClient.invalidateQueries({ queryKey: documentKeys.all(user.id) });
    },
  });
}
