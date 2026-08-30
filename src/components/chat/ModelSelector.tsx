"use client";

import { Fragment, useState } from "react";
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
import { ALL_FREE_MODELS, modelName, ModelProvider } from "@/lib/models";
import { getStoredModel, setStoredModel } from "@/lib/model-selector";

const PROVIDER_GROUPS: { provider: ModelProvider; label: string }[] = [
  { provider: "google", label: "Google Gemini" },
  { provider: "zen", label: "OpenCode Zen" },
];

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
        <DropdownMenuRadioGroup value={model} onValueChange={handleSelect}>
          {PROVIDER_GROUPS.map((group) => (
            <Fragment key={group.provider}>
              <DropdownMenuLabel className="px-2 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {group.label}
              </DropdownMenuLabel>
              {ALL_FREE_MODELS.filter((m) => m.provider === group.provider).map((m) => (
                <DropdownMenuRadioItem key={m.id} value={m.id}>
                  <span className="truncate">{m.name}</span>
                </DropdownMenuRadioItem>
              ))}
            </Fragment>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
