import { useState, useEffect, useMemo } from "react";
import { X, Eye, EyeOff, Save, Clock, ChevronDown, ChevronsLeft, ChevronsRight, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
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

function stripDocArtifacts(content: string): string {
  return content
    .replace(/\n{0,3}---+\s*\n{0,3}(?:(?:Citations|Sources|References)\s*:?\s*\n(?:\[\d+\][^\n]*\n?)*)?$/i, "")
    .replace(/\n{1,2}(?:Citations|Sources|References)\s*:?\s*\n(?:\[\d+\][^\n]*\n?)+$/i, "")
    .replace(/\n---+\s*$/gm, "")
    .trim();
}

function markdownToHtml(content: string): string {
  const cleaned = stripDocArtifacts(content);
  return cleaned
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/^- (.+)$/gm, "<li>$1</li>")
    .replace(/\n{2,}/g, "<br><br>")
    .replace(/\n/g, "<br>");
}

function computeDiff(oldText: string, newText: string): string {
  const oldWords = oldText.replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean);
  const newWords = newText.replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean);
  const m = oldWords.length;
  const n = newWords.length;
  if (m > 500 || n > 500) return newText;

  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldWords[i - 1] === newWords[j - 1]) dp[i][j] = dp[i - 1][j - 1] + 1;
      else dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  const result: string[] = [];
  let i = m, j = n;
  const ops: { type: "keep" | "del" | "add"; word: string }[] = [];
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldWords[i - 1] === newWords[j - 1]) {
      ops.unshift({ type: "keep", word: oldWords[i - 1] }); i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      ops.unshift({ type: "add", word: newWords[j - 1] }); j--;
    } else {
      ops.unshift({ type: "del", word: oldWords[i - 1] }); i--;
    }
  }

  for (const op of ops) {
    if (op.type === "keep") result.push(op.word);
    else if (op.type === "del") result.push(`<span style="color: hsl(0, 84%, 60%); text-decoration: line-through;">${op.word}</span>`);
    else result.push(`<span style="background-color: hsl(142, 76%, 90%); color: hsl(142, 76%, 25%);">${op.word}</span>`);
  }
  return result.join(" ");
}

export function DocumentEditor({ title, content, onClose }: DocumentEditorProps) {
  const [editorContent, setEditorContent] = useState("");
  const [versions, setVersions] = useState<string[]>([]);
  const [currentVersion, setCurrentVersion] = useState(0);
  const [showEdits, setShowEdits] = useState(false);
  const [toolbarCollapsed, setToolbarCollapsed] = useState(false);

  useEffect(() => {
    const html = markdownToHtml(content);
    setEditorContent(html);
    setVersions([html]);
    setCurrentVersion(0);
  }, [content]);

  const isViewingOldVersion = currentVersion < versions.length - 1;

  const handleSaveVersion = () => {
    if (editorContent !== versions[versions.length - 1]) {
      const newVersions = [...versions, editorContent];
      setVersions(newVersions);
      setCurrentVersion(newVersions.length - 1);
    }
  };

  const switchVersion = (idx: number) => {
    setCurrentVersion(idx);
    setEditorContent(versions[idx]);
    setShowEdits(false);
  };

  const diffHtml = useMemo(() => {
    if (!showEdits || currentVersion === 0) return null;
    return computeDiff(versions[currentVersion - 1], versions[currentVersion]);
  }, [showEdits, versions, currentVersion]);

  return (
    <div className="flex flex-col h-full bg-card">
      {/* Compact header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground shrink-0"
            onClick={() => setToolbarCollapsed(!toolbarCollapsed)}
            title={toolbarCollapsed ? "Show toolbar" : "Hide toolbar"}
          >
            {toolbarCollapsed ? <ChevronsRight className="h-3.5 w-3.5" /> : <ChevronsLeft className="h-3.5 w-3.5" />}
          </Button>
          <h3 className="text-sm font-semibold text-foreground truncate">{title}</h3>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {/* Version selector */}
          <Popover>
            <PopoverTrigger asChild>
              <button className="flex items-center gap-0.5">
                <Badge variant="outline" className="text-[9px] py-0 px-1.5 shrink-0 cursor-pointer hover:bg-muted">
                  <Clock className="h-2.5 w-2.5 mr-0.5" />
                  v{currentVersion + 1}
                  <ChevronDown className="h-2 w-2 ml-0.5" />
                </Badge>
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-36 p-1" align="end">
              {versions.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => switchVersion(idx)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs transition-colors",
                    idx === currentVersion ? "bg-muted font-medium" : "hover:bg-muted/50"
                  )}
                >
                  Version {idx + 1}
                  {idx === versions.length - 1 && <span className="text-muted-foreground">(latest)</span>}
                </button>
              ))}
            </PopoverContent>
          </Popover>

          {/* Show edits */}
          {versions.length >= 2 && (
            <Button
              variant={showEdits ? "secondary" : "ghost"}
              size="sm"
              className="h-6 text-[10px] gap-1 px-2"
              onClick={() => setShowEdits(!showEdits)}
              disabled={currentVersion === 0}
            >
              {showEdits ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
              {showEdits ? "Hide" : "Edits"}
            </Button>
          )}

          <Button variant="ghost" size="sm" className="h-6 text-[10px] gap-1 px-2" onClick={handleSaveVersion}>
            <Save className="h-3 w-3" />
            Save
          </Button>
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={onClose}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {isViewingOldVersion && (
        <div className="px-3 py-1.5 bg-muted/50 border-b border-border text-xs text-muted-foreground flex items-center gap-2">
          Viewing version {currentVersion + 1} (read-only)
          <Button variant="outline" size="sm" className="h-5 text-[10px] px-2" onClick={() => switchVersion(versions.length - 1)}>
            Go to latest
          </Button>
        </div>
      )}

      {showEdits && diffHtml ? (
        <div className="flex-1 overflow-auto p-4">
          <div
            className="text-sm text-foreground leading-relaxed prose prose-sm max-w-none"
            dangerouslySetInnerHTML={{ __html: diffHtml }}
          />
        </div>
      ) : (
        <div className={cn(
          "flex-1 overflow-hidden [&_.ql-container]:border-0 [&_.ql-toolbar]:border-x-0 [&_.ql-toolbar]:border-t-0 [&_.ql-toolbar]:bg-muted/30 [&_.ql-editor]:min-h-full [&_.ql-editor]:text-sm [&_.ql-editor]:text-foreground [&_.ql-editor]:leading-relaxed",
          toolbarCollapsed && "[&_.ql-toolbar]:hidden"
        )}>
          <ReactQuill
            theme="snow"
            value={editorContent}
            onChange={setEditorContent}
            modules={modules}
            className="h-full flex flex-col"
            readOnly={isViewingOldVersion}
          />
        </div>
      )}
    </div>
  );
}
