import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export type ChapterSource = "outline" | "toc" | "manual";

export interface DocumentChapter {
  id: string;
  document_id: string;
  number: number | null;
  title: string;
  /** PDF page numbers (1 = the first page of the file). */
  start_page: number;
  end_page: number;
  source: ChapterSource;
}

export interface ChapterInput {
  number: number | null;
  title: string;
  start_page: number;
  end_page: number;
}

export const chapterKeys = {
  all: (userId: string) => ["document-chapters", userId] as const,
  document: (userId: string, documentId: string) => ["document-chapters", userId, documentId] as const,
};

export function useDocumentChapters(documentId: string, enabled = true) {
  const { user } = useAuth();

  return useQuery({
    queryKey: chapterKeys.document(user?.id ?? "", documentId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("document_chapters")
        .select("id, document_id, number, title, start_page, end_page, source")
        .eq("document_id", documentId)
        .order("start_page", { ascending: true });
      if (error) throw error;
      return (data ?? []) as DocumentChapter[];
    },
    enabled: !!user && enabled,
  });
}

/** Add a chapter (no `id`) or change one (with `id`). The database records it as the user's own. */
export function useSaveChapter(documentId: string) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...input }: ChapterInput & { id?: string }) => {
      const row = { ...input, title: input.title.trim() };
      const { error } = id
        ? await supabase.from("document_chapters").update(row).eq("id", id)
        : await supabase.from("document_chapters").insert({ ...row, document_id: documentId, user_id: user!.id });
      if (error) throw error;
    },
    onSuccess: () => {
      if (user) queryClient.invalidateQueries({ queryKey: chapterKeys.all(user.id) });
    },
  });
}

export function useDeleteChapter() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (chapterId: string) => {
      const { error } = await supabase.from("document_chapters").delete().eq("id", chapterId);
      if (error) throw error;
    },
    onSuccess: () => {
      if (user) queryClient.invalidateQueries({ queryKey: chapterKeys.all(user.id) });
    },
  });
}
