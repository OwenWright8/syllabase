import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { CourseDocument, useCourseDocuments } from "@/hooks/useCourseDocuments";
import type { Book } from "@/lib/syllabus";

/** The text the worker read from a syllabus, all pages joined (pages are separated by a form feed). */
export function useSyllabusText(documentId: string, enabled: boolean) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["document-text", user?.id ?? "", documentId],
    queryFn: async () => {
      const { data, error } = await supabase.from("document_pages").select("page, text").eq("document_id", documentId).order("page", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((row) => row.text).join("\f");
    },
    enabled: !!user && enabled,
    staleTime: 60_000,
  });
}

/** The course's finished textbooks with their chapters: what a syllabus's readings can be matched against. */
export function useCourseBooks(courseId: string, enabled: boolean) {
  const { user } = useAuth();
  const { data: documents = [] } = useCourseDocuments(courseId);
  const textbooks = useMemo(
    () => documents.filter((doc): doc is CourseDocument & { page_count: number } => doc.kind === "textbook" && doc.status === "ready" && !!doc.page_count),
    [documents]
  );
  const ids = textbooks.map((doc) => doc.id);

  const chapters = useQuery({
    queryKey: ["document-chapters", user?.id ?? "", "course", courseId, ids.join(",")],
    queryFn: async () => {
      if (ids.length === 0) return [];
      const { data, error } = await supabase
        .from("document_chapters")
        .select("document_id, number, title, start_page, end_page")
        .in("document_id", ids)
        .order("start_page", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user && enabled,
  });

  const books: Book[] = useMemo(
    () =>
      textbooks.map((doc) => ({
        id: doc.id,
        filename: doc.filename,
        pageCount: doc.page_count,
        pageOffset: doc.page_offset,
        chapters: (chapters.data ?? []).filter((c) => c.document_id === doc.id),
      })),
    [textbooks, chapters.data]
  );

  return { books, loading: chapters.isLoading };
}
