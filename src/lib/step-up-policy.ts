import { NextRequest } from "next/server";
import { AuthBoundaryError } from "./session-auth";

export function requireStepUpForSensitiveAction(req: NextRequest): void {
  const marker = req.headers.get("x-step-up-authenticated");
  if (marker === "true") {
    return;
  }

  throw new AuthBoundaryError("FORBIDDEN", "Step-up authentication required for sensitive admin action");
}
