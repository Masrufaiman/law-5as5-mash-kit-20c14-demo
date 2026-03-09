import { useState, useRef, useCallback } from "react";
import { X, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

interface TrackChange {
  type: "delete" | "insert";
  text: string;
  position: number;
}

interface DocumentEditorProps {
  title: string;
  content: string;
  onClose: () => void;
  changes?: TrackChange[];
}

export function DocumentEditor({ title, content, onClose, changes = [] }: DocumentEditorProps) {
  const [showAiPopup, setShowAiPopup] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [popupPosition, setPopupPosition] = useState({ x: 0, y: 0 });
  const contentRef = useRef<HTMLDivElement>(null);

  const handleTextSelection = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !contentRef.current) {
      setShowAiPopup(false);
      return;
    }

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    const containerRect = contentRef.current.getBoundingClientRect();

    setPopupPosition({
      x: rect.left - containerRect.left + rect.width / 2,
      y: rect.top - containerRect.top - 8,
    });
    setShowAiPopup(true);
  }, []);

  // Render content with track changes
  const renderContent = () => {
    if (changes.length === 0) {
      return <p className="whitespace-pre-wrap leading-relaxed text-sm text-foreground">{content}</p>;
    }

    // Sort changes by position descending to apply from end to start
    const sortedChanges = [...changes].sort((a, b) => b.position - a.position);
    let parts: { text: string; type: "normal" | "delete" | "insert" }[] = [
      { text: content, type: "normal" },
    ];

    // Simple rendering with track changes markers
    return (
      <div className="whitespace-pre-wrap leading-relaxed text-sm">
        {parts.map((part, i) => {
          if (part.type === "delete") {
            return (
              <span key={i} className="line-through text-destructive bg-destructive/10">
                {part.text}
              </span>
            );
          }
          if (part.type === "insert") {
            return (
              <span key={i} className="text-primary bg-primary/10 underline">
                {part.text}
              </span>
            );
          }
          return <span key={i} className="text-foreground">{part.text}</span>;
        })}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full border-l border-border bg-card">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h3 className="text-sm font-semibold text-foreground truncate">{title}</h3>
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        <div
          ref={contentRef}
          className="relative px-6 py-4"
          onMouseUp={handleTextSelection}
        >
          {renderContent()}

          {/* AI selection popup */}
          {showAiPopup && (
            <div
              className="absolute z-50 bg-popover border border-border rounded-lg shadow-lg p-3 w-72"
              style={{
                left: `${popupPosition.x}px`,
                top: `${popupPosition.y}px`,
                transform: "translate(-50%, -100%)",
              }}
            >
              <div className="flex items-center gap-2">
                <Sparkles className="h-3.5 w-3.5 text-primary shrink-0" />
                <Input
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  placeholder="Ask LawKit to edit..."
                  className="h-7 text-xs"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Escape") setShowAiPopup(false);
                  }}
                />
              </div>
              <div className="flex justify-end gap-1.5 mt-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-[10px]"
                  onClick={() => setShowAiPopup(false)}
                >
                  Cancel
                </Button>
                <Button size="sm" className="h-6 text-[10px]">
                  Ask LawKit
                </Button>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
