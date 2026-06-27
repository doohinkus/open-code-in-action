"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn as signInAction, signUp as signUpAction } from "@/actions";
import { authClient } from "@/lib/auth/client";
import { getAnonWorkData, clearAnonWork } from "@/lib/anon-work-tracker";
import { getProjects } from "@/actions/get-projects";
import { createProject } from "@/actions/create-project";

export function useAuth() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  const handlePostSignIn = async () => {
    const anonWork = getAnonWorkData();
    if (anonWork && anonWork.messages.length > 0) {
      const project = await createProject({
        name: `Design from ${new Date().toLocaleTimeString()}`,
        messages: anonWork.messages,
        data: anonWork.fileSystemData,
      });
      clearAnonWork();
      router.push(`/${project.id}`);
      return;
    }
    const projects = await getProjects();
    if (projects.length > 0) {
      router.push(`/${projects[0].id}`);
      return;
    }
    const newProject = await createProject({
      name: `New Design #${~~(Math.random() * 100000)}`,
      messages: [],
      data: {},
    });
    router.push(`/${newProject.id}`);
  };

  const signIn = async (email: string, password: string) => {
    setIsLoading(true);
    try {
      const result = await signInAction(email, password);
      if (result.success) {
        await handlePostSignIn();
      }
      return result;
    } finally {
      setIsLoading(false);
    }
  };

  const signUp = async (email: string, password: string) => {
    setIsLoading(true);
    try {
      const result = await signUpAction(email, password);
      if (result.success) {
        await handlePostSignIn();
      }
      return result;
    } finally {
      setIsLoading(false);
    }
  };

  const signInWithGoogle = async () => {
    setIsLoading(true);
    try {
      await authClient.signIn.social({
        provider: "google",
        callbackURL: window.location.origin,
      });
    } finally {
      setIsLoading(false);
    }
  };

  return {
    signIn,
    signUp,
    signInWithGoogle,
    isLoading,
  };
}
