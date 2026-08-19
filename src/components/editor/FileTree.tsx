"use client";

import React, { useState, useMemo } from "react";
import { FileNode } from "@/lib/file-system";
import { useFileSystem } from "@/lib/contexts/file-system-context";
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  FileCode,
  FileJson,
  FileType,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";

interface FileTreeNodeProps {
  node: FileNode;
  level: number;
}

function FileIcon({ name }: { name: string }) {
  const ext = name.split(".").pop()?.toLowerCase();
  if (ext === "json") {
    return <FileJson className="h-4 w-4 shrink-0 text-warning" />;
  }
  if (ext === "css") {
    return <FileType className="h-4 w-4 shrink-0 text-primary" />;
  }
  if (ext === "ts" || ext === "tsx") {
    return <FileCode className="h-4 w-4 shrink-0 text-primary" />;
  }
  if (ext === "js" || ext === "jsx") {
    return <FileCode className="h-4 w-4 shrink-0 text-success" />;
  }
  return <FileCode className="h-4 w-4 shrink-0 text-muted-foreground" />;
}

const FileTreeNode = React.memo(function FileTreeNode({ node, level }: FileTreeNodeProps) {
  const { selectedFile, setSelectedFile } = useFileSystem();
  const [isExpanded, setIsExpanded] = useState(true);

  const children = useMemo(() => {
    if (node.type !== "directory" || !node.children) return [];
    return Array.from(node.children.values()).sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === "directory" ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
  }, [node]);

  const handleClick = () => {
    if (node.type === "directory") {
      setIsExpanded(!isExpanded);
    } else {
      setSelectedFile(node.path);
    }
  };

  const selected = selectedFile === node.path;

  return (
    <div>
      <div
        className={cn(
          "flex items-center gap-2 px-2 py-1.5 hover:bg-accent/70 cursor-pointer text-sm transition-colors relative",
          selected && "bg-primary/10 text-primary"
        )}
        style={{ paddingLeft: `${level * 12 + 8}px` }}
        onClick={handleClick}
      >
        {selected && (
          <span className="absolute left-0 top-1 bottom-1 w-0.5 rounded-full bg-primary" />
        )}
        {node.type === "directory" ? (
          <>
            {isExpanded ? (
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            )}
            {isExpanded ? (
              <FolderOpen className="h-4 w-4 shrink-0 text-primary" />
            ) : (
              <Folder className="h-4 w-4 shrink-0 text-primary" />
            )}
          </>
        ) : (
          <>
            <div className="w-3.5" />
            <FileIcon name={node.name} />
          </>
        )}
        <span className={cn("truncate", selected ? "text-primary font-medium" : "text-foreground/80")}>
          {node.name}
        </span>
      </div>
      {node.type === "directory" && isExpanded && children.length > 0 && (
        <div>
          {children.map((child) => (
            <FileTreeNode key={child.path} node={child} level={level + 1} />
          ))}
        </div>
      )}
    </div>
  );
});

export function FileTree() {
  const { fileSystem, refreshTrigger } = useFileSystem();
  const rootNode = fileSystem.getNode("/");

  const rootChildren = useMemo(() => {
    if (!rootNode || !rootNode.children || rootNode.children.size === 0) return [];
    return Array.from(rootNode.children.values()).sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === "directory" ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
  }, [rootNode]);

  if (!rootNode || !rootNode.children || rootNode.children.size === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-4 text-center">
        <Folder className="h-12 w-12 text-muted-foreground/40 mb-3" />
        <p className="text-sm text-muted-foreground">No files yet</p>
        <p className="text-xs text-muted-foreground/80 mt-1">Files will appear here as you generate</p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="py-2" key={refreshTrigger}>
        {rootChildren.map((child) => (
          <FileTreeNode key={child.path} node={child} level={0} />
        ))}
      </div>
    </ScrollArea>
  );
}
