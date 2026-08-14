"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, Copy, Check } from "lucide-react";
import { downloadProjectZip } from "@/lib/download-zip";
import { useToast } from "@/components/ui/toast";

interface ShareActionsProps {
  files: Record<string, string>;
}

export function ShareActions({ files }: ShareActionsProps) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const hasFiles = Object.keys(files).length > 0;

  const handleDownload = () => {
    if (!hasFiles) return;
    downloadProjectZip(new Map(Object.entries(files)), "oc_project.zip");
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      toast("Link copied to clipboard", "success");
    } catch {
      toast("Failed to copy link", "error");
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        className="h-8 gap-2"
        onClick={handleDownload}
        disabled={!hasFiles}
      >
        <Download className="h-4 w-4" />
        Download
      </Button>
      <Button variant="outline" className="h-8 gap-2" onClick={handleCopy}>
        {copied ? (
          <Check className="h-4 w-4 text-green-600" />
        ) : (
          <Copy className="h-4 w-4" />
        )}
        {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  );
}
