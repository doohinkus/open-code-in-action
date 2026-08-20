"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { FileSystemProvider } from "@/lib/contexts/file-system-context";
import { ChatProvider } from "@/lib/contexts/chat-context";
import { InspectionProvider } from "@/lib/contexts/inspection-context";
import { ChatInterface } from "@/components/chat/ChatInterface";
import { FileTree } from "@/components/editor/FileTree";
import { CodeEditor } from "@/components/editor/CodeEditor";
import { PreviewFrame } from "@/components/preview/PreviewFrame";
import { ShareBar } from "@/components/share/ShareBar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HeaderActions } from "@/components/HeaderActions";
import { BrandMark } from "@/components/BrandMark";
import { authClient } from "@/lib/auth/client";
import { getAnonWorkData, clearAnonWork } from "@/lib/anon-work-tracker";
import { createProject } from "@/actions/create-project";
import { useChat } from "@/lib/contexts/chat-context";
import { useFileSystem } from "@/lib/contexts/file-system-context";
import { logger } from "@/lib/observability/logger";
import { LoadingScreen } from "@/components/LoadingScreen";

function HeaderActionsWrapper({ user, projectId }: { user?: { id: string; email: string } | null; projectId?: string }) {
  const { messages } = useChat();
  const { getAllFiles } = useFileSystem();
  return <HeaderActions user={user} projectId={projectId} messages={messages} getAllFiles={getAllFiles} />;
}

interface MainContentProps {
  user?: {
    id: string;
    email: string;
  } | null;
  project?: {
    id: string;
    name: string;
    messages: any[];
    data: any;
    createdAt: Date;
    updatedAt: Date;
  };
}

type MobileTab = "chat" | "preview" | "code";

function useIsMobile() {
  const [isMobile, setIsMobile] = useState<boolean | null>(null);

  useEffect(() => {
    const mql = window.matchMedia("(max-width: 1023px)");
    const onChange = () => setIsMobile(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return isMobile;
}

export function MainContent({ user, project }: MainContentProps) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!user) {
      authClient
        .getSession()
        .then(async ({ data }) => {
          if (!data?.user) return;
          const anonWork = getAnonWorkData();
          if (anonWork && anonWork.messages.length > 0) {
            try {
              const project = await createProject({
                name: `Design from ${new Date().toLocaleTimeString()}`,
                messages: anonWork.messages,
                data: anonWork.fileSystemData,
              });
              clearAnonWork();
              router.push(`/${project.id}`);
              return;
            } catch (error) {
              logger.error("anon_work.migration_failed", {
                error: error instanceof Error ? error.message : String(error),
              });
            }
          }
          router.refresh();
        })
        .catch(() => {});
    }
  }, [user, router]);

  if (!mounted) {
    return (
      <FileSystemProvider key={project?.id ?? "anon"} initialData={project?.data}>
        <ChatProvider key={project?.id ?? "anon"} projectId={project?.id} initialMessages={project?.messages}>
          <InspectionProvider>
            <LoadingScreen />
          </InspectionProvider>
        </ChatProvider>
      </FileSystemProvider>
    );
  }

  return (
    <FileSystemProvider key={project?.id ?? "anon"} initialData={project?.data}>
      <ChatProvider key={project?.id ?? "anon"} projectId={project?.id} initialMessages={project?.messages}>
        <InspectionProvider>
          <AppShell user={user} project={project} />
        </InspectionProvider>
      </ChatProvider>
    </FileSystemProvider>
  );
}

function AppShell({ user, project }: MainContentProps) {
  const isMobile = useIsMobile();
  const [activeView, setActiveView] = useState<"preview" | "code">("preview");
  const [mobileTab, setMobileTab] = useState<MobileTab>("chat");
  const { status } = useChat();
  const prevStatusRef = useRef(status);

  useEffect(() => {
    const wasGenerating =
      prevStatusRef.current === "submitted" ||
      prevStatusRef.current === "streaming";
    const isGenerating = status === "submitted" || status === "streaming";
    prevStatusRef.current = status;
    if (!wasGenerating && isGenerating) {
      setMobileTab("preview");
    }
  }, [status]);

  if (isMobile === null) {
    return <LoadingScreen />;
  }

  return (
    <main className="h-dvh w-full overflow-hidden bg-background">
      {isMobile ? (
        <MobileShell
          user={user}
          project={project}
          mobileTab={mobileTab}
          setMobileTab={setMobileTab}
        />
      ) : (
        <DesktopShell
          user={user}
          project={project}
          activeView={activeView}
          setActiveView={setActiveView}
        />
      )}
    </main>
  );
}

interface ShellProps extends MainContentProps {
  activeView?: "preview" | "code";
  setActiveView?: (view: "preview" | "code") => void;
  mobileTab?: MobileTab;
  setMobileTab?: (tab: MobileTab) => void;
}

const tabTriggerClass =
  "data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm text-muted-foreground px-4 py-1.5 text-sm font-medium transition-all";

function ProductTitle({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5 min-w-0">
      <BrandMark size={compact ? "sm" : "md"} />
      <div className="min-w-0">
        <h1
          className={
            compact
              ? "text-sm font-semibold text-foreground tracking-tight truncate"
              : "text-base font-semibold text-foreground tracking-tight truncate"
          }
        >
          UI Generator
        </h1>
        {!compact && (
          <p className="text-[11px] text-muted-foreground leading-none mt-0.5 truncate">
            Describe UI · get React
          </p>
        )}
      </div>
    </div>
  );
}

function MobileShell({
  user,
  project,
  mobileTab = "chat",
  setMobileTab,
}: ShellProps) {
  return (
    <div className="flex flex-col h-full">
      <div className="h-14 flex items-center justify-between gap-2 px-4 border-b border-border bg-card flex-shrink-0">
        <ProductTitle compact />
        <HeaderActionsWrapper user={user} projectId={project?.id} />
      </div>

      <Tabs
        value={mobileTab}
        onValueChange={(v) => setMobileTab?.(v as MobileTab)}
        className="flex flex-col flex-1 min-h-0 min-w-0 gap-0"
      >
        <div className="px-4 py-2 border-b border-border bg-card flex-shrink-0">
          <TabsList className="bg-muted border border-border p-0.5 h-9 w-full shadow-sm">
            <TabsTrigger value="chat" className={`flex-1 ${tabTriggerClass}`}>
              Chat
            </TabsTrigger>
            <TabsTrigger value="preview" className={`flex-1 ${tabTriggerClass}`}>
              Preview
            </TabsTrigger>
            <TabsTrigger value="code" className={`flex-1 ${tabTriggerClass}`}>
              Code
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent
          value="chat"
          className="flex-1 min-h-0 min-w-0 overflow-hidden bg-muted/30"
        >
          {mobileTab === "chat" && <ChatInterface />}
        </TabsContent>
        <TabsContent
          value="preview"
          forceMount
          className={`${mobileTab !== "preview" ? "hidden" : "flex-1"} min-h-0 min-w-0 overflow-hidden bg-muted/30`}
        >
          <div className="h-full bg-card">
            <div className="flex flex-col h-full">
              <ShareBar />
              <div className="flex-1 min-h-0">
                <PreviewFrame />
              </div>
            </div>
          </div>
        </TabsContent>
        <TabsContent
          value="code"
          className="flex-1 min-h-0 min-w-0 overflow-hidden bg-muted/30"
        >
          {mobileTab === "code" && (
            <ResizablePanelGroup direction="vertical" className="h-full">
              <ResizablePanel defaultSize={30} minSize={20} maxSize={50}>
                <div className="h-full bg-muted/40 border-b border-border">
                  <FileTree />
                </div>
              </ResizablePanel>
              <ResizableHandle className="h-px bg-border hover:bg-primary/40 transition-colors" />
              <ResizablePanel defaultSize={70}>
                <div className="h-full bg-card">
                  <CodeEditor />
                </div>
              </ResizablePanel>
            </ResizablePanelGroup>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function DesktopShell({
  user,
  project,
  activeView = "preview",
  setActiveView,
}: ShellProps) {
  return (
    <div className="h-full">
      <ResizablePanelGroup direction="horizontal" className="h-full">
        <ResizablePanel defaultSize={35} minSize={25} maxSize={50}>
          <div className="h-full flex flex-col bg-card border-r border-border">
            <div className="h-14 flex items-center px-5 border-b border-border">
              <ProductTitle />
            </div>
            <div className="flex-1 overflow-hidden bg-muted/20">
              <ChatInterface />
            </div>
          </div>
        </ResizablePanel>

        <ResizableHandle className="w-px bg-border hover:bg-primary/40 transition-colors data-[resize-handle-active]:bg-primary/50" />

        <ResizablePanel defaultSize={65}>
          <div className="h-full flex flex-col bg-card">
            <Tabs
              value={activeView}
              onValueChange={(v) =>
                setActiveView?.(v as "preview" | "code")
              }
              className="flex flex-col h-full min-w-0 gap-0"
            >
              <div className="h-14 border-b border-border px-5 flex items-center justify-between bg-muted/30 flex-shrink-0">
                <TabsList className="bg-background/80 border border-border p-0.5 h-9 shadow-sm">
                  <TabsTrigger value="preview" className={tabTriggerClass}>
                    Preview
                  </TabsTrigger>
                  <TabsTrigger value="code" className={tabTriggerClass}>
                    Code
                  </TabsTrigger>
                </TabsList>
                <HeaderActionsWrapper user={user} projectId={project?.id} />
              </div>

              <TabsContent
                value="preview"
                forceMount
                className={`${activeView !== "preview" ? "hidden" : "flex-1"} min-h-0 min-w-0 overflow-hidden bg-muted/20`}
              >
                <div className="h-full bg-card">
                  <div className="flex flex-col h-full">
                    <ShareBar />
                    <div className="flex-1 min-h-0">
                      <PreviewFrame />
                    </div>
                  </div>
                </div>
              </TabsContent>
              <TabsContent
                value="code"
                className="flex-1 min-h-0 min-w-0 overflow-hidden bg-muted/20"
              >
                {activeView === "code" && (
                  <ResizablePanelGroup
                    direction="horizontal"
                    className="h-full"
                  >
                    <ResizablePanel
                      defaultSize={30}
                      minSize={20}
                      maxSize={50}
                    >
                      <div className="h-full bg-muted/40 border-r border-border">
                        <FileTree />
                      </div>
                    </ResizablePanel>

                    <ResizableHandle className="w-px bg-border hover:bg-primary/40 transition-colors" />

                    <ResizablePanel defaultSize={70}>
                      <div className="h-full bg-card">
                        <CodeEditor />
                      </div>
                    </ResizablePanel>
                  </ResizablePanelGroup>
                )}
              </TabsContent>
            </Tabs>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
