import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { X, Eye, EyeOff, Save, Clock, ChevronDown, ChevronsLeft, ChevronsRight, Download, Reply } from "lucide-react";
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
  highlightExcerpt?: string;
  /** If true, append content as a new version instead of replacing */
  appendVersion?: boolean;
  /** Called when user selects text and clicks Reply */
  onSelectionReply?: (text: string) => void;
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
  const lines = cleaned.split("\n");
  const htmlParts: string[] = [];
  let inTable = false;
  let inOl = false;
  let inUl = false;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // Headings
    if (/^### (.+)$/.test(line)) { closeList(); htmlParts.push(`<h3>${line.replace(/^### /, "")}</h3>`); continue; }
    if (/^## (.+)$/.test(line)) { closeList(); htmlParts.push(`<h2>${line.replace(/^## /, "")}</h2>`); continue; }
    if (/^# (.+)$/.test(line)) { closeList(); htmlParts.push(`<h1>${line.replace(/^# /, "")}</h1>`); continue; }

    // Horizontal rule
    if (/^---+$/.test(line.trim())) { closeList(); htmlParts.push("<hr>"); continue; }

    // Table rows
    if (/^\|(.+)\|$/.test(line.trim())) {
      // Skip separator row
      if (/^\|[\s\-:|]+\|$/.test(line.trim())) continue;
      if (!inTable) { inTable = true; htmlParts.push('<table class="legal-table">'); }
      const cells = line.trim().slice(1, -1).split("|").map(c => c.trim());
      const tag = !htmlParts.some(p => p.includes("<tr>")) ? "th" : "td";
      htmlParts.push(`<tr>${cells.map(c => `<${tag}>${inlineFormat(c)}</${tag}>`).join("")}</tr>`);
      continue;
    } else if (inTable) {
      inTable = false;
      htmlParts.push("</table>");
    }

    // Ordered list
    if (/^\d+\.\s+(.+)$/.test(line)) {
      if (!inOl) { inOl = true; htmlParts.push("<ol>"); }
      htmlParts.push(`<li>${inlineFormat(line.replace(/^\d+\.\s+/, ""))}</li>`);
      continue;
    } else if (inOl && !/^\s+/.test(line)) {
      inOl = false;
      htmlParts.push("</ol>");
    }

    // Unordered list
    if (/^[-*]\s+(.+)$/.test(line)) {
      if (!inUl) { inUl = true; htmlParts.push("<ul>"); }
      htmlParts.push(`<li>${inlineFormat(line.replace(/^[-*]\s+/, ""))}</li>`);
      continue;
    } else if (inUl && !/^\s+/.test(line)) {
      inUl = false;
      htmlParts.push("</ul>");
    }

    // Empty line
    if (line.trim() === "") { htmlParts.push("<br>"); continue; }

    // Regular paragraph
    htmlParts.push(`<p>${inlineFormat(line)}</p>`);
  }

  closeList();
  if (inTable) htmlParts.push("</table>");
  return htmlParts.join("\n");

  function closeList() {
    if (inOl) { inOl = false; htmlParts.push("</ol>"); }
    if (inUl) { inUl = false; htmlParts.push("</ul>"); }
  }

  function inlineFormat(text: string): string {
    return text
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g, "<em>$1</em>")
      .replace(/`(.+?)`/g, "<code>$1</code>");
  }
}

function computeDiff(oldText: string, newText: string): string {
  const oldWords = oldText.replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean);
  const newWords = newText.replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean);
  const m = oldWords.length;
  const n = newWords.length;
  if (m > 3000 || n > 3000) return newText;

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

export function DocumentEditor({ title, content, onClose, highlightExcerpt, appendVersion, onSelectionReply }: DocumentEditorProps) {
  const [editorContent, setEditorContent] = useState("");
  const [versions, setVersions] = useState<string[]>([]);
  const [currentVersion, setCurrentVersion] = useState(0);
  const [showEdits, setShowEdits] = useState(false);
  const [toolbarCollapsed, setToolbarCollapsed] = useState(false);
  const [selectionTooltip, setSelectionTooltip] = useState<{ x: number; y: number; text: string } | null>(null);
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const prevTitleRef = useRef<string>("");

  useEffect(() => {
    const html = markdownToHtml(content);
    
    // If same title and appendVersion, add as new version instead of replacing
    if (appendVersion && prevTitleRef.current === title && versions.length > 0) {
      const newVersions = [...versions, html];
      setVersions(newVersions);
      setCurrentVersion(newVersions.length - 1);
      setEditorContent(html);
    } else {
      setEditorContent(html);
      setVersions([html]);
      setCurrentVersion(0);
    }
    prevTitleRef.current = title;
  }, [content, title]);

  // Highlight excerpt: scroll to matching text
  useEffect(() => {
    if (!highlightExcerpt || !editorContainerRef.current) return;
    
    const timer = setTimeout(() => {
      const container = editorContainerRef.current;
      if (!container) return;
      
      const qlEditor = container.querySelector('.ql-editor');
      if (!qlEditor) return;
      
      // Search for excerpt text in the editor
      const textContent = qlEditor.textContent || "";
      const excerptClean = highlightExcerpt.replace(/\s+/g, " ").trim().slice(0, 100);
      const idx = textContent.toLowerCase().indexOf(excerptClean.toLowerCase());
      
      if (idx >= 0) {
        // Find the DOM node containing this text and scroll to it
        const walker = document.createTreeWalker(qlEditor, NodeFilter.SHOW_TEXT);
        let charCount = 0;
        let node: Node | null;
        while ((node = walker.nextNode())) {
          const nodeLen = (node.textContent || "").length;
          if (charCount + nodeLen >= idx) {
            const el = node.parentElement;
            if (el) {
              el.scrollIntoView({ behavior: "smooth", block: "center" });
              // Add temporary highlight
              const origBg = el.style.backgroundColor;
              el.style.backgroundColor = "hsl(var(--primary) / 0.2)";
              el.style.transition = "background-color 0.3s";
              setTimeout(() => {
                el.style.backgroundColor = origBg;
              }, 3000);
            }
            break;
          }
          charCount += nodeLen;
        }
      }
    }, 500);
    
    return () => clearTimeout(timer);
  }, [highlightExcerpt]);

  // Selection-to-reply in editor
  useEffect(() => {
    const container = editorContainerRef.current;
    if (!container || !onSelectionReply) return;

    const handleMouseUp = () => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || !selection.toString().trim()) {
        setSelectionTooltip(null);
        return;
      }
      const text = selection.toString().trim();
      if (text.length < 3) { setSelectionTooltip(null); return; }
      const anchorNode = selection.anchorNode;
      if (!anchorNode || !container.contains(anchorNode)) { setSelectionTooltip(null); return; }
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      setSelectionTooltip({ x: rect.left + rect.width / 2, y: rect.top - 8, text });
    };

    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-editor-reply-tooltip]")) setSelectionTooltip(null);
    };

    container.addEventListener("mouseup", handleMouseUp);
    document.addEventListener("mousedown", handleMouseDown);
    return () => {
      container.removeEventListener("mouseup", handleMouseUp);
      document.removeEventListener("mousedown", handleMouseDown);
    };
  }, [onSelectionReply]);

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
  /** Strip AI conversational preamble before first heading */
  const stripPreamble = (html: string): string => {
    // Find first <h1> or <h2> tag — everything before it is preamble
    const headingMatch = html.match(/<h[12][^>]*>/i);
    if (headingMatch && headingMatch.index !== undefined && headingMatch.index > 0) {
      return html.substring(headingMatch.index);
    }
    return html;
  };

  const handleExportTxt = () => {
    const cleanedHtml = stripPreamble(editorContent);
    // Convert HTML to plain text
    const txt = cleanedHtml
      .replace(/<h[1-3][^>]*>(.*?)<\/h[1-3]>/gi, "$1\n\n")
      .replace(/<strong>(.*?)<\/strong>/gi, "$1")
      .replace(/<em>(.*?)<\/em>/gi, "$1")
      .replace(/<li>(.*?)<\/li>/gi, "• $1\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<hr\s*\/?>/gi, "\n---\n")
      .replace(/<\/?(p|ul|ol|div|blockquote|table|thead|tbody|tr|td|th|code|pre|span)[^>]*>/gi, "")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    const blob = new Blob([txt], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.replace(/[^a-zA-Z0-9]/g, "_")}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportDocx = () => {
    // Export as .doc (HTML-based, opens in Word)
    const cleanedDocHtml = stripPreamble(editorContent);
    const fullHtml = `<!DOCTYPE html><html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><title>${title}</title><style>body{font-family:'Calibri',sans-serif;max-width:800px;margin:40px auto;padding:0 20px;line-height:1.8;color:#1a1a1a;}h1{font-size:1.5rem;font-weight:700;border-bottom:2px solid #e5e5e5;padding-bottom:0.5rem;margin-top:2rem;}h2{font-size:1.25rem;font-weight:600;margin-top:1.75rem;}h3{font-size:1.1rem;font-weight:600;margin-top:1.25rem;}table{width:100%;border-collapse:collapse;margin:1rem 0;}th,td{border:1px solid #e5e5e5;padding:0.5rem 0.75rem;text-align:left;}th{background:#f5f5f5;font-weight:600;}</style></head><body>${cleanedDocHtml}</body></html>`;
    const blob = new Blob([fullHtml], { type: "application/msword" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.replace(/[^a-zA-Z0-9]/g, "_")}.doc`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col h-full bg-card relative" ref={editorContainerRef}>
      {/* Selection Reply tooltip */}
      {selectionTooltip && onSelectionReply && (
        <div
          data-editor-reply-tooltip
          className="fixed z-50 animate-in fade-in-0 zoom-in-95"
          style={{ left: selectionTooltip.x, top: selectionTooltip.y, transform: "translate(-50%, -100%)" }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <Button
            variant="secondary"
            size="sm"
            className="h-7 text-xs gap-1.5 shadow-md border border-border"
            onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); }}
            onClick={() => {
              onSelectionReply(selectionTooltip.text);
              setSelectionTooltip(null);
              window.getSelection()?.removeAllRanges();
            }}
          >
            <Reply className="h-3 w-3" />
            Reply
          </Button>
        </div>
      )}
      {/* Font face CSS for app fonts */}
      <style>{`
        .ql-editor { font-family: 'Instrument Sans', sans-serif; line-height: 1.8; padding: 2rem 2.5rem; max-width: 800px; margin: 0 auto; }
        .ql-editor h1 { font-size: 1.5rem; font-weight: 700; margin-top: 2rem; margin-bottom: 1rem; color: hsl(var(--foreground)); border-bottom: 2px solid hsl(var(--border)); padding-bottom: 0.5rem; letter-spacing: -0.01em; }
        .ql-editor h2 { font-size: 1.25rem; font-weight: 600; margin-top: 1.75rem; margin-bottom: 0.75rem; color: hsl(var(--foreground)); }
        .ql-editor h3 { font-size: 1.1rem; font-weight: 600; margin-top: 1.25rem; margin-bottom: 0.5rem; color: hsl(var(--foreground)); }
        .ql-editor blockquote { border-left: 3px solid hsl(var(--primary)); padding-left: 1rem; color: hsl(var(--muted-foreground)); font-style: italic; margin: 0.75rem 0; }
        .ql-editor strong { color: hsl(var(--foreground)); }
        .ql-editor ol, .ql-editor ul { padding-left: 1.5rem; margin: 0.5rem 0; }
        .ql-editor li { margin-bottom: 0.25rem; }
        .ql-editor table.legal-table { width: 100%; border-collapse: collapse; margin: 1rem 0; font-size: 0.875rem; }
        .ql-editor table.legal-table th, .ql-editor table.legal-table td { border: 1px solid hsl(var(--border)); padding: 0.5rem 0.75rem; text-align: left; }
        .ql-editor table.legal-table th { background: hsl(var(--muted)); font-weight: 600; }
        .ql-editor hr { border: none; border-top: 1px solid hsl(var(--border)); margin: 1.5rem 0; }
        .ql-editor p { margin-bottom: 0.5rem; }
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
        .ql-toolbar.ql-snow { transition: all 0.2s ease; }
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
                onClick={handleExportTxt}
                className="flex w-full items-center rounded px-2 py-1.5 text-xs hover:bg-muted/50 transition-colors"
              >
                Export as .txt
              </button>
              <button
                onClick={handleExportDocx}
                className="flex w-full items-center rounded px-2 py-1.5 text-xs hover:bg-muted/50 transition-colors"
              >
                Export as .doc
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
