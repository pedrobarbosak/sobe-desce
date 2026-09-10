import { useEffect, useRef } from "react";
import { useConvexAuth } from "convex/react";
import { authClient } from "@/lib/auth-client";

/** Signs every visitor in anonymously so they can create or join a game with zero clicks. */
export function useAuthBootstrap() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const attempted = useRef(false);
  useEffect(() => {
    if (isLoading || isAuthenticated || attempted.current) return;
    attempted.current = true;
    void authClient.signIn.anonymous().catch((err) => {
      console.error("anonymous sign-in failed", err);
      attempted.current = false;
    });
  }, [isLoading, isAuthenticated]);
  return { isLoading: isLoading || !isAuthenticated, isAuthenticated };
}
