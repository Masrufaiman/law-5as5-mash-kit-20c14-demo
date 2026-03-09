import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { FileText } from "lucide-react";
import type { Citation } from "@/hooks/useStreamChat";

interface CitationPopoverProps {
  citation: Citation;
}

export function CitationPopover({ citation }: CitationPopoverProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="inline-flex items-center justify-center h-5 min-w-5 px-1 rounded bg-primary/10 text-primary text-[10px] font-bold hover:bg-primary/20 transition-colors">
          {citation.index}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3" align="start">
        <div className="flex items-start gap-2">
          <FileText className="h-4 w-4 text-primary shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-xs font-medium text-foreground truncate">
              {citation.source}
            </p>
            {citation.excerpt && (
              <p className="text-[11px] text-muted-foreground mt-1 line-clamp-4 leading-relaxed">
                {citation.excerpt}
              </p>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
