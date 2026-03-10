import { useState, useEffect, useMemo } from "react";
import { X, Eye, EyeOff, Save, Clock, ChevronDown, ChevronsLeft, ChevronsRight, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import ReactQuill, { Quill } from "react-quill-new";
import "react-quill-new/dist/quill.snow.css";

// Register custom fonts — use app fonts
const Font = Quill.import("formats/font") as any;
Font.whitelist = [
  false, // default (Instrument Sans)
  "serif",
  "monospace",
  "playfair-display",
  "ibm-plex-mono",
  "georgia",
  "times-new-roman",
];
Quill.register(Font, true);

interface DocumentEditorProps {
  title: string;
  content: string;
  onClose: () => void;
}

const modules = {
  toolbar: [
    [{ header: [1, 2, 3, false] }],
    [{ font: [false, "serif", "monospace", "playfair-display", "ibm-plex-mono", "georgia", "times-new-roman"] }],
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
    else if (op.type === "del") result.push(`<span style="color: hsl(0, 84%, 60%); text-decoration: line-through; background-color: hsl(0, 84%, 95%);">${op.word}</span>`);
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

  // Diff compares previous version vs current version — showing deletions (strikethrough red) + additions (green highlight)
  const diffHtml = useMemo(() => {
    if (!showEdits || currentVersion === 0) return null;
    return computeDiff(versions[currentVersion - 1], versions[currentVersion]);
  }, [showEdits, versions, currentVersion]);

  const handleExportMarkdown = () => {
    const text = editorContent.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const blob = new Blob([text], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.replace(/[^a-zA-Z0-9]/g, "_")}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportHtml = () => {
    const fullHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title><style>body{font-family:system-ui,sans-serif;max-width:800px;margin:40px auto;padding:0 20px;line-height:1.6;}</style></head><body>${editorContent}</body></html>`;
    const blob = new Blob([fullHtml], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.replace(/[^a-zA-Z0-9]/g, "_")}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col h-full bg-card">
      {/* Font face CSS for app fonts */}
      <style>{`
        .ql-editor { font-family: 'Instrument Sans', sans-serif; }
        .ql-font-playfair-display { font-family: 'Playfair Display', serif; }
        .ql-font-ibm-plex-mono { font-family: 'IBM Plex Mono', monospace; }
        .ql-font-georgia { font-family: 'Georgia', serif; }
        .ql-font-times-new-roman { font-family: 'Times New Roman', serif; }
        .ql-picker.ql-font .ql-picker-label::before,
        .ql-picker.ql-font .ql-picker-item::before { font-family: 'Instrument Sans', sans-serif; }
        .ql-picker.ql-font .ql-picker-label[data-value="playfair-display"]::before,
        .ql-picker.ql-font .ql-picker-item[data-value="playfair-display"]::before { content: 'Playfair Display'; font-family: 'Playfair Display', serif; }
        .ql-picker.ql-font .ql-picker-label[data-value="ibm-plex-mono"]::before,
        .ql-picker.ql-font .ql-picker-item[data-value="ibm-plex-mono"]::before { content: 'IBM Plex Mono'; font-family: 'IBM Plex Mono', monospace; }
        .ql-picker.ql-font .ql-picker-label[data-value="georgia"]::before,
        .ql-picker.ql-font .ql-picker-item[data-value="georgia"]::before { content: 'Georgia'; font-family: 'Georgia', serif; }
        .ql-picker.ql-font .ql-picker-label[data-value="times-new-roman"]::before,
        .ql-picker.ql-font .ql-picker-item[data-value="times-new-roman"]::before { content: 'Times New Roman'; font-family: 'Times New Roman', serif; }
      `}</style>

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

          {/* Export dropdown */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="sm" className="h-6 text-[10px] gap-1 px-2">
                <Download className="h-3 w-3" />
                Export
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-36 p-1" align="end">
              <button
                onClick={handleExportMarkdown}
                className="flex w-full items-center rounded px-2 py-1.5 text-xs hover:bg-muted/50 transition-colors"
              >
                Export as .md
              </button>
              <button
                onClick={handleExportHtml}
                className="flex w-full items-center rounded px-2 py-1.5 text-xs hover:bg-muted/50 transition-colors"
              >
                Export as .html
              </button>
            </PopoverContent>
          </Popover>

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
