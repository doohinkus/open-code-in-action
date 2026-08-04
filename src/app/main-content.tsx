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
import { ChatInterface } from "@/components/chat/ChatInterface";
import { FileTree } from "@/components/editor/FileTree";
import { CodeEditor } from "@/components/editor/CodeEditor";
import { PreviewFrame } from "@/components/preview/PreviewFrame";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HeaderActions } from "@/components/HeaderActions";
import { authClient } from "@/lib/auth/client";
import { getAnonWorkData, clearAnonWork } from "@/lib/anon-work-tracker";
import { createProject } from "@/actions/create-project";
import { useChat } from "@/lib/contexts/chat-context";
import { useFileSystem } from "@/lib/contexts/file-system-context";

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
              console.error("Failed to migrate anonymous work:", error);
            }
          }
          router.refresh();
        })
        .catch(() => {});
    }
  }, [user, router]);

  if (!mounted) {
    return (
      <FileSystemProvider initialData={project?.data}>
        <ChatProvider projectId={project?.id} initialMessages={project?.messages}>
          <div className="h-dvh w-full overflow-hidden bg-neutral-50" />
        </ChatProvider>
      </FileSystemProvider>
    );
  }

  return (
    <FileSystemProvider initialData={project?.data}>
      <ChatProvider projectId={project?.id} initialMessages={project?.messages}>
        <AppShell user={user} project={project} />
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

  // On mobile, auto-switch to the Preview tab when a new generation starts
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
    return <div className="h-dvh w-full overflow-hidden bg-neutral-50" />;
  }

  return (
    <main className="h-dvh w-full overflow-hidden bg-neutral-50">
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

function MobileShell({
  user,
  project,
  mobileTab = "chat",
  setMobileTab,
}: ShellProps) {
  return (
    <div className="flex flex-col h-full">
      {/* Top Bar */}
      <div className="h-14 flex items-center justify-between gap-2 px-4 border-b border-neutral-200/60 bg-white flex-shrink-0">
        <h1 className="text-base font-semibold text-neutral-900 tracking-tight truncate">
          React Component Generator
        </h1>
        <HeaderActionsWrapper user={user} projectId={project?.id} />
      </div>

      {/* View Tabs + Content */}
      <Tabs
        value={mobileTab}
        onValueChange={(v) => setMobileTab?.(v as MobileTab)}
        className="flex flex-col flex-1 min-h-0 min-w-0 gap-0"
      >
        <div className="px-4 py-2 border-b border-neutral-200/60 bg-white flex-shrink-0">
          <TabsList className="bg-neutral-100 border border-neutral-200/60 p-0.5 h-9 w-full shadow-sm">
            <TabsTrigger value="chat" className="flex-1 data-[state=active]:bg-white data-[state=active]:text-neutral-900 data-[state=active]:shadow-sm text-neutral-600 px-4 py-1.5 text-sm font-medium transition-all">
              Chat
            </TabsTrigger>
            <TabsTrigger value="preview" className="flex-1 data-[state=active]:bg-white data-[state=active]:text-neutral-900 data-[state=active]:shadow-sm text-neutral-600 px-4 py-1.5 text-sm font-medium transition-all">
              Preview
            </TabsTrigger>
            <TabsTrigger value="code" className="flex-1 data-[state=active]:bg-white data-[state=active]:text-neutral-900 data-[state=active]:shadow-sm text-neutral-600 px-4 py-1.5 text-sm font-medium transition-all">
              Code
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent
          value="chat"
          className="flex-1 min-h-0 min-w-0 overflow-hidden bg-neutral-50"
        >
          {mobileTab === "chat" && <ChatInterface />}
        </TabsContent>
        <TabsContent
          value="preview"
          forceMount
          className={`${mobileTab !== "preview" ? "hidden" : "flex-1"} min-h-0 min-w-0 overflow-hidden bg-neutral-50`}
        >
          <div className="h-full bg-white">
            <PreviewFrame />
          </div>
        </TabsContent>
        <TabsContent
          value="code"
          className="flex-1 min-h-0 min-w-0 overflow-hidden bg-neutral-50"
        >
          {mobileTab === "code" && (
            <ResizablePanelGroup direction="vertical" className="h-full">
              <ResizablePanel defaultSize={30} minSize={20} maxSize={50}>
                <div className="h-full bg-neutral-50 border-b border-neutral-200">
                  <FileTree />
                </div>
              </ResizablePanel>
              <ResizableHandle className="h-[1px] bg-neutral-200 hover:bg-neutral-300 transition-colors" />
              <ResizablePanel defaultSize={70}>
                <div className="h-full bg-white">
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
        {/* Left Panel - Chat */}
        <ResizablePanel defaultSize={35} minSize={25} maxSize={50}>
          <div className="h-full flex flex-col bg-white">
            {/* Chat Header */}
            <div className="h-14 flex items-center px-6 border-b border-neutral-200/60">
              <h1 className="text-lg font-semibold text-neutral-900 tracking-tight">React Component Generator</h1>
            </div>

            {/* Chat Content */}
            <div className="flex-1 overflow-hidden">
              <ChatInterface />
            </div>
          </div>
        </ResizablePanel>

        <ResizableHandle className="w-[1px] bg-neutral-200 hover:bg-neutral-300 transition-colors" />

        {/* Right Panel - Preview/Code */}
        <ResizablePanel defaultSize={65}>
          <div className="h-full flex flex-col bg-white">
            <Tabs
              value={activeView}
              onValueChange={(v) =>
                setActiveView?.(v as "preview" | "code")
              }
              className="flex flex-col h-full min-w-0 gap-0"
            >
              {/* Top Bar */}
              <div className="h-14 border-b border-neutral-200/60 px-6 flex items-center justify-between bg-neutral-50/50 flex-shrink-0">
                <TabsList className="bg-white/60 border border-neutral-200/60 p-0.5 h-9 shadow-sm">
                  <TabsTrigger value="preview" className="data-[state=active]:bg-white data-[state=active]:text-neutral-900 data-[state=active]:shadow-sm text-neutral-600 px-4 py-1.5 text-sm font-medium transition-all">Preview</TabsTrigger>
                  <TabsTrigger value="code" className="data-[state=active]:bg-white data-[state=active]:text-neutral-900 data-[state=active]:shadow-sm text-neutral-600 px-4 py-1.5 text-sm font-medium transition-all">Code</TabsTrigger>
                </TabsList>
                <HeaderActionsWrapper user={user} projectId={project?.id} />
              </div>

              {/* Content Area */}
              <TabsContent
                value="preview"
                forceMount
                className={`${activeView !== "preview" ? "hidden" : "flex-1"} min-h-0 min-w-0 overflow-hidden bg-neutral-50`}
              >
                <div className="h-full bg-white">
                  <PreviewFrame />
                </div>
              </TabsContent>
              <TabsContent
                value="code"
                className="flex-1 min-h-0 min-w-0 overflow-hidden bg-neutral-50"
              >
                {activeView === "code" && (
                  <ResizablePanelGroup
                    direction="horizontal"
                    className="h-full"
                  >
                    {/* File Tree */}
                    <ResizablePanel
                      defaultSize={30}
                      minSize={20}
                      maxSize={50}
                    >
                      <div className="h-full bg-neutral-50 border-r border-neutral-200">
                        <FileTree />
                      </div>
                    </ResizablePanel>

                    <ResizableHandle className="w-[1px] bg-neutral-200 hover:bg-neutral-300 transition-colors" />

                    {/* Code Editor */}
                    <ResizablePanel defaultSize={70}>
                      <div className="h-full bg-white">
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
