"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, LogOut, FolderOpen, ChevronDown, Download, MoreVertical, Save, Pencil, Trash2, Check, X } from "lucide-react";
import { AuthDialog } from "@/components/auth/AuthDialog";
import { signOut } from "@/actions";
import { getProjects } from "@/actions/get-projects";
import { createProject } from "@/actions/create-project";
import { renameProject } from "@/actions/rename-project";
import { deleteProject } from "@/actions/delete-project";
import { saveProject } from "@/actions/save-project";
import { useToast } from "@/components/ui/toast";
import { useFileSystem } from "@/lib/contexts/file-system-context";
import { useChat } from "@/lib/contexts/chat-context";
import { downloadProjectZip } from "@/lib/download-zip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface HeaderActionsProps {
  user?: {
    id: string;
    email: string;
  } | null;
  projectId?: string;
  messages?: any[];
  getAllFiles?: () => Map<string, string>;
}

interface Project {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

export function HeaderActions({ user, projectId, messages = [], getAllFiles }: HeaderActionsProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [authDialogOpen, setAuthDialogOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  // Inline editing state
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Delete confirmation state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Load projects initially
  useEffect(() => {
    if (user && projectId) {
      getProjects()
        .then(setProjects)
        .catch(console.error)
        .finally(() => setInitialLoading(false));
    }
  }, [user, projectId]);

  // Refresh projects when popover opens
  useEffect(() => {
    if (user && projectsOpen) {
      getProjects().then(setProjects).catch(console.error);
    }
  }, [projectsOpen, user]);

  const filteredProjects = projects.filter((project) =>
    project.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const currentProject = projects.find((p) => p.id === projectId);

  const handleSignInClick = () => {
    setAuthMode("signin");
    setAuthDialogOpen(true);
  };

  const handleSignUpClick = () => {
    setAuthMode("signup");
    setAuthDialogOpen(true);
  };

  const handleSignOut = async () => {
    await signOut();
  };

  const { getAllFiles: getFSFiles, refreshTrigger } = useFileSystem();
  const { status } = useChat();

  const isStreaming = status === "streaming" || status === "submitted";
  const [hasFiles, setHasFiles] = useState(false);

  useEffect(() => {
    setHasFiles(getFSFiles().size > 0);
  }, [refreshTrigger, getFSFiles]);

  const canDownload = hasFiles && !isStreaming;
  const canManageProject = user && projectId && hasFiles && !isStreaming;

  const handleDownload = () => {
    const files = getFSFiles();
    if (files.size === 0) return;
    downloadProjectZip(files, "project.zip");
  };

  const handleNewDesign = async () => {
    const project = await createProject({
      name: `Design #${~~(Math.random() * 100000)}`,
      messages: [],
      data: {},
    });
    router.push(`/${project.id}`);
  };

  // Inline rename handlers
  const startEditing = () => {
    if (currentProject) {
      setEditValue(currentProject.name);
      setIsEditing(true);
      setTimeout(() => inputRef.current?.select(), 0);
    }
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setEditValue("");
  };

  const saveEditing = async () => {
    if (!projectId || !editValue.trim()) {
      cancelEditing();
      return;
    }

    try {
      await renameProject(projectId, editValue.trim());
      setProjects((prev) =>
        prev.map((p) =>
          p.id === projectId ? { ...p, name: editValue.trim() } : p
        )
      );
      setIsEditing(false);
      toast("Project renamed successfully");
    } catch (error) {
      toast("Failed to rename project", "error");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      saveEditing();
    } else if (e.key === "Escape") {
      cancelEditing();
    }
  };

  // Save handler
  const handleSave = async () => {
    if (!projectId || !getAllFiles) return;

    try {
      const files = getAllFiles();
      const data: Record<string, string> = {};
      files.forEach((content, path) => {
        data[path] = content;
      });

      await saveProject(projectId, messages, data);
      toast("Project saved successfully");
    } catch (error) {
      toast("Failed to save project", "error");
    }
  };

  // Delete handler
  const handleDelete = async () => {
    if (!projectId) return;

    try {
      await deleteProject(projectId);
      setShowDeleteConfirm(false);
      toast("Project deleted successfully");
      router.push("/");
    } catch (error) {
      toast("Failed to delete project", "error");
    }
  };

  if (!user) {
    return (
      <>
        <div className="flex gap-2">
          <Button variant="outline" className="h-8 gap-2" onClick={handleDownload} disabled={!canDownload}>
            <Download className="h-4 w-4" />
            Download
          </Button>
          <Button variant="outline" className="h-8" onClick={handleSignInClick}>
            Sign In
          </Button>
          <Button className="h-8" onClick={handleSignUpClick}>
            Sign Up
          </Button>
        </div>
        <AuthDialog
          open={authDialogOpen}
          onOpenChange={setAuthDialogOpen}
          defaultMode={authMode}
        />
      </>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {/* Project Selector */}
      {!initialLoading && (
        <Popover open={projectsOpen} onOpenChange={setProjectsOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" className="h-8 gap-2" role="combobox">
              <FolderOpen className="h-4 w-4" />
              {currentProject ? currentProject.name : "Select Project"}
              <ChevronDown className="h-3 w-3 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[300px] p-0" align="end">
            <Command>
              <CommandInput
                placeholder="Search projects..."
                value={searchQuery}
                onValueChange={setSearchQuery}
              />
              <CommandList>
                <CommandEmpty>No projects found.</CommandEmpty>
                <CommandGroup>
                  {filteredProjects.map((project) => (
                    <CommandItem
                      key={project.id}
                      value={project.name}
                      onSelect={() => {
                        router.push(`/${project.id}`);
                        setProjectsOpen(false);
                        setSearchQuery("");
                      }}
                    >
                      <div className="flex flex-col">
                        <span className="font-medium">{project.name}</span>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      )}

      {/* Inline Editable Project Name */}
      {projectId && currentProject && (
        <div className="flex items-center gap-1">
          {isEditing ? (
            <>
              <Input
                ref={inputRef}
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={handleKeyDown}
                className="h-8 w-48"
                autoFocus
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={saveEditing}
              >
                <Check className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={cancelEditing}
              >
                <X className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <Button
              variant="ghost"
              className="h-8 gap-1 text-sm font-medium"
              onClick={startEditing}
            >
              <Pencil className="h-3 w-3" />
              Menu
            </Button>
          )}
        </div>
      )}

      {/* Kebab Menu for Project Actions */}
      {canManageProject && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={handleSave}>
              <Save className="h-4 w-4" />
              Save
            </DropdownMenuItem>
            <DropdownMenuItem onClick={startEditing}>
              <Pencil className="h-4 w-4" />
              Rename
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => setShowDeleteConfirm(true)}
              className="text-red-600 focus:text-red-600"
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {/* Delete Confirmation Inline */}
      {showDeleteConfirm && (
        <div className="flex items-center gap-2 text-sm">
          <span>Delete?</span>
          <Button
            variant="destructive"
            size="sm"
            className="h-7"
            onClick={handleDelete}
          >
            Confirm
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7"
            onClick={() => setShowDeleteConfirm(false)}
          >
            Cancel
          </Button>
        </div>
      )}

      <Button variant="outline" className="h-8 gap-2" onClick={handleDownload} disabled={!canDownload}>
        <Download className="h-4 w-4" />
        Download
      </Button>

      <Button className="flex items-center gap-2 h-8" onClick={handleNewDesign}>
        <Plus className="h-4 w-4" />
        New Design
      </Button>

      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={handleSignOut}
        title="Sign out"
      >
        <LogOut className="h-4 w-4" />
      </Button>
    </div>
  );
}
