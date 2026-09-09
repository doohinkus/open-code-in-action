"use client";

import { useState } from "react";
import { ChevronDown, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/components/ui/toast";
import { ALL_FREE_MODELS, modelName } from "@/lib/models";
import { getStoredModel, setStoredModel } from "@/lib/model-selector";

const PROVIDER_LABELS: Record<string, string> = {
  google: "Google Gemini",
  groq: "Groq",
};

// Free models grouped by provider, following ALL_FREE_MODELS order: groups
// appear in the order they first appear in the list (Groq first), and models
// keep the list's fallback priority order within each group.
const PROVIDER_GROUP_LIST = [...new Set(ALL_FREE_MODELS.map((m) => m.provider))].map(
  (provider) => ({
    provider,
    label: PROVIDER_LABELS[provider] ?? provider,
    models: ALL_FREE_MODELS.filter((m) => m.provider === provider),
  })
);

export function ModelSelector() {
  const { toast } = useToast();
  const [model, setModel] = useState<string>(() => getStoredModel());

  const handleSelect = (id: string) => {
    setStoredModel(id);
    setModel(id);
    toast(`Model switched to ${modelName(id)}`);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 px-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent rounded-full"
          title="Switch model"
        >
          <Sparkles className="h-3 w-3 text-primary" />
          <span className="max-w-[140px] truncate">{modelName(model)}</span>
          <ChevronDown className="h-3 w-3 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>Model</DropdownMenuLabel>
        {PROVIDER_GROUP_LIST.map((group) => (
          <div key={group.provider}>
            <DropdownMenuLabel className="px-2 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {group.label}
            </DropdownMenuLabel>
            <DropdownMenuRadioGroup value={model} onValueChange={handleSelect}>
              {group.models.map((m) => (
                <DropdownMenuRadioItem key={m.id} value={m.id}>
                  <span className="truncate">{m.name}</span>
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
