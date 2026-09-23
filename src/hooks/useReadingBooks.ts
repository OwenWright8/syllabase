import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { Book } from "@/lib/syllabus";

/**
 * Every course's finished textbooks (read by the server, so their pages and
 * chapters are known), grouped by course. One shared query for all the readings
 * on a page, so a list of readings costs two requests, not two per reading.
 */
export function useReadingBooks() {
  const { user } = useAuth();

  const documents = useQuery({
    // under the documents and chapters key prefixes, so uploading/deleting/correcting refreshes it
    queryKey: ["documents", user?.id ?? "", "reading-books"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("course_documents")
        .select("id, course_id, filename, page_count, page_offset")
        .eq("kind", "textbook")
        .eq("status", "ready");
      if (error) throw error;
      return (data ?? []).filter((doc) => !!doc.page_count);
    },
    enabled: !!user,
    staleTime: 60_000,
  });

  const ids = (documents.data ?? []).map((doc) => doc.id);
  const chapters = useQuery({
    queryKey: ["document-chapters", user?.id ?? "", "reading-books", ids.join(",")],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("document_chapters")
        .select("document_id, number, title, start_page, end_page")
        .in("document_id", ids)
        .order("start_page", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user && ids.length > 0,
    staleTime: 60_000,
  });

  const booksByCourse = useMemo(() => {
    const byCourse = new Map<string, Book[]>();
    for (const doc of documents.data ?? []) {
      const book: Book = {
        id: doc.id,
        filename: doc.filename,
        pageCount: doc.page_count as number,
        pageOffset: doc.page_offset,
        chapters: (chapters.data ?? []).filter((chapter) => chapter.document_id === doc.id),
      };
      byCourse.set(doc.course_id, [...(byCourse.get(doc.course_id) ?? []), book]);
    }
    return byCourse;
  }, [documents.data, chapters.data]);

  return { booksByCourse };
}
