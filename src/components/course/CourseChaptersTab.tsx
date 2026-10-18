import { BookOpen } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CourseDocument } from "@/hooks/useCourseDocuments";
import { TextbookChapters } from "./TextbookChapters";

interface CourseChaptersTabProps {
  textbooks: CourseDocument[];
}

/** Every chapter of the course's textbooks, ready to download one at a time. */
export function CourseChaptersTab({ textbooks }: CourseChaptersTabProps) {
  return (
    <div className="space-y-4">
      {textbooks.map((doc) => (
        <Card key={doc.id}>
          <CardHeader className="p-4 sm:p-6 pb-2 sm:pb-2">
            <CardTitle className="text-lg flex items-center gap-2 min-w-0">
              <BookOpen className="h-5 w-5 shrink-0" />
              <span className="truncate">{doc.filename}</span>
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              {doc.page_count} page{doc.page_count === 1 ? "" : "s"}
            </p>
          </CardHeader>
          <CardContent className="p-4 sm:p-6 pt-2 sm:pt-2">
            <TextbookChapters doc={doc} alwaysOpen />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
