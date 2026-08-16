"use client";

import React, { createContext, useContext, useState, useCallback } from "react";

export interface TaggedElement {
  id: string;
  label: string;
  tagName: string;
  classes: string;
  textContent?: string;
}

export interface HoveredElement {
  id: string;
  label: string;
  rect: { x: number; y: number; width: number; height: number };
}

interface InspectionContextType {
  taggedElements: TaggedElement[];
  isInspectMode: boolean;
  hoveredElement: HoveredElement | null;
  tagElement: (element: TaggedElement) => void;
  removeTag: (id: string) => void;
  clearTags: () => void;
  setInspectMode: (enabled: boolean) => void;
  setHoveredElement: (el: HoveredElement | null) => void;
}

const InspectionContext = createContext<InspectionContextType | undefined>(
  undefined
);

export function InspectionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [taggedElements, setTaggedElements] = useState<TaggedElement[]>([]);
  const [isInspectMode, setIsInspectMode] = useState(false);
  const [hoveredElement, setHoveredElement] = useState<HoveredElement | null>(
    null
  );

  const tagElement = useCallback((element: TaggedElement) => {
    setTaggedElements((prev) => {
      if (prev.some((e) => e.id === element.id)) return prev;
      return [...prev, element];
    });
  }, []);

  const removeTag = useCallback((id: string) => {
    setTaggedElements((prev) => prev.filter((e) => e.id !== id));
  }, []);

  const clearTags = useCallback(() => {
    setTaggedElements([]);
  }, []);

  const setInspectMode = useCallback((enabled: boolean) => {
    setIsInspectMode(enabled);
    if (!enabled) {
      setHoveredElement(null);
    }
  }, []);

  return (
    <InspectionContext.Provider
      value={{
        taggedElements,
        isInspectMode,
        hoveredElement,
        tagElement,
        removeTag,
        clearTags,
        setInspectMode,
        setHoveredElement,
      }}
    >
      {children}
    </InspectionContext.Provider>
  );
}

export function useInspection(): InspectionContextType {
  const context = useContext(InspectionContext);
  if (!context) {
    throw new Error("useInspection must be used within an InspectionProvider");
  }
  return context;
}
