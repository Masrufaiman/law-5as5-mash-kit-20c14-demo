import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import ReactQuill from "react-quill-new";
import "react-quill-new/dist/quill.snow.css";

interface DocumentEditorProps {
  title: string;
  content: string;
  onClose: () => void;
}

const modules = {
  toolbar: [
    [{ header: [1, 2, 3, false] }],
    [{ font: [] }],
    [{ size: ["small", false, "large", "huge"] }],
    ["bold", "italic", "underline", "strike"],
    [{ color: [] }, { background: [] }],
    [{ script: "sub" }, { script: "super" }],
    [{ list: "ordered" }, { list: "bullet" }],
    [{ indent: "-1" }, { indent: "+1" }],
    [{ align: [] }],
    ["blockquote", "code-block"],
    ["link", "image"],
    ["clean"],
  ],
};

/** Strip trailing references/citations blocks and horizontal rules from content */
function stripDocArtifacts(content: string): string {
  return content
    .replace(/\n{0,3}---+\s*\n{0,3}(?:(?:Citations|Sources|References)\s*:?\s*\n(?:\[\d+\][^\n]*\n?)*)?$/i, "")
    .replace(/\n{1,2}(?:Citations|Sources|References)\s*:?\s*\n(?:\[\d+\][^\n]*\n?)+$/i, "")
    .replace(/\n---+\s*$/gm, "")
    .trim();
}

export function DocumentEditor({ title, content, onClose }: DocumentEditorProps) {
  const [editorContent, setEditorContent] = useState(content);

  useEffect(() => {
    const cleaned = stripDocArtifacts(content);
    let html = cleaned
      .replace(/^### (.+)$/gm, "<h3>$1</h3>")
      .replace(/^## (.+)$/gm, "<h2>$1</h2>")
      .replace(/^# (.+)$/gm, "<h1>$1</h1>")
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g, "<em>$1</em>")
      .replace(/^- (.+)$/gm, "<li>$1</li>")
      .replace(/\n{2,}/g, "<br><br>")
      .replace(/\n/g, "<br>");
    setEditorContent(html);
  }, [content]);

  return (
    <div className="flex flex-col h-full bg-card">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <h3 className="text-sm font-semibold text-foreground truncate">{title}</h3>
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-hidden [&_.ql-container]:border-0 [&_.ql-toolbar]:border-x-0 [&_.ql-toolbar]:border-t-0 [&_.ql-toolbar]:bg-muted/30 [&_.ql-editor]:min-h-full [&_.ql-editor]:text-sm [&_.ql-editor]:text-foreground [&_.ql-editor]:leading-relaxed">
        <ReactQuill
          theme="snow"
          value={editorContent}
          onChange={setEditorContent}
          modules={modules}
          className="h-full flex flex-col"
        />
      </div>
    </div>
  );
}
