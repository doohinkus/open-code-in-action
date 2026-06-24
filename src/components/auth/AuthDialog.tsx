"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { SignInForm } from "./SignInForm";
import { SignUpForm } from "./SignUpForm";

interface AuthDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultMode?: "signin" | "signup";
}

export function AuthDialog({
  open,
  onOpenChange,
  defaultMode = "signin",
}: AuthDialogProps) {
  const [mode, setMode] = useState<"signin" | "signup">(defaultMode);

  useEffect(() => {
    setMode(defaultMode);
  }, [defaultMode]);

  const handleSuccess = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  const switchMode = useCallback(() => {
    setMode((prev) => (prev === "signin" ? "signup" : "signin"));
  }, []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]" aria-label={mode === "signin" ? "Sign in" : "Sign up"}>
        <DialogHeader>
          <DialogTitle>
            {mode === "signin" ? "Welcome back" : "Create an account"}
          </DialogTitle>
          <DialogDescription>
            {mode === "signin"
              ? "Sign in to your account to continue"
              : "Sign up to start creating AI-powered React components"}
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4">
          {mode === "signin" ? (
            <SignInForm key="signin" onSuccess={handleSuccess} />
          ) : (
            <SignUpForm key="signup" onSuccess={handleSuccess} />
          )}
        </div>

        <div className="mt-4 text-center text-sm">
          {mode === "signin" ? (
            <>
              Don&apos;t have an account?{" "}
              <Button
                variant="link"
                className="p-0 h-auto font-normal"
                onClick={switchMode}
              >
                Sign up
              </Button>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <Button
                variant="link"
                className="p-0 h-auto font-normal"
                onClick={switchMode}
              >
                Sign in
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
