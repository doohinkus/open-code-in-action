"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth/client";

export function useAuth() {
  const [isLoading, setIsLoading] = useState(false);

  const signInWithGoogle = async () => {
    setIsLoading(true);
    try {
      await authClient.signIn.social({
        provider: "google",
        callbackURL: window.location.origin,
      });
    } catch (error) {
      // Re-throw so callers (HeaderActions) can surface a toast; otherwise
      // a blocked popup or provider outage fails silently.
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  return {
    signInWithGoogle,
    isLoading,
  };
}
