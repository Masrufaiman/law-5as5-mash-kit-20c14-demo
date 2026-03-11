import { NavigationSidebar } from "./NavigationSidebar";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";

interface AppLayoutProps {
  children: React.ReactNode;
  rightPanel?: React.ReactNode;
}

export function AppLayout({ children, rightPanel }: AppLayoutProps) {
  return (
    <div className="flex h-screen w-full bg-background overflow-hidden">
      <NavigationSidebar />
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {rightPanel ? (
          <ResizablePanelGroup direction="horizontal">
            <ResizablePanel defaultSize={45} minSize={25}>
              <div className="h-full overflow-auto">{children}</div>
            </ResizablePanel>
            <ResizableHandle />
            <ResizablePanel collapsible collapsedSize={0} defaultSize={55} minSize={25} maxSize={65}>
              <div className="h-full overflow-auto border-l border-border">{rightPanel}</div>
            </ResizablePanel>
          </ResizablePanelGroup>
        ) : (
          <div className="h-full overflow-auto">{children}</div>
        )}
      </div>
    </div>
  );
}
