"use client";
import { useEffect, useRef, useState } from "react";
import { logTabSwitch, terminateSession } from "@/lib/api";
import { useRouter } from "next/navigation";

export interface AntiCheatState {
  tabSwitchCount: number;
  showWarningModal: boolean;
  dismissWarning: () => void;
  aiExtensionDetected: boolean;
}

const AI_EXTENSION_KEYWORDS = ["grammarly", "chatgpt", "copilot", "gpt", "claude"];

export function useAntiCheat(candidateId: number): AntiCheatState {
  const [tabSwitchCount, setTabSwitchCount] = useState(0);
  const [showWarningModal, setShowWarningModal] = useState(false);
  const [aiExtensionDetected, setAiExtensionDetected] = useState(false);
  const router = useRouter();
  const countRef = useRef(0);

  // Disable right-click
  useEffect(() => {
    const blockCtxMenu = (e: MouseEvent) => e.preventDefault();
    document.addEventListener("contextmenu", blockCtxMenu);
    return () => document.removeEventListener("contextmenu", blockCtxMenu);
  }, []);

  // Disable keyboard shortcuts used for devtools / saving / printing
  useEffect(() => {
    const blockKeys = (e: KeyboardEvent) => {
      const isDevtools =
        e.key === "F12" ||
        (e.ctrlKey && e.shiftKey && (e.key === "I" || e.key === "J" || e.key === "C")) ||
        (e.ctrlKey && (e.key === "u" || e.key === "U"));
      const isSaveOrPrint =
        (e.ctrlKey && (e.key === "s" || e.key === "S" || e.key === "p" || e.key === "P"));
      const isPrintScreen = e.key === "PrintScreen";

      if (isDevtools || isSaveOrPrint || isPrintScreen) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    document.addEventListener("keydown", blockKeys, true);
    return () => document.removeEventListener("keydown", blockKeys, true);
  }, []);

  // Tab-switch / visibility detection (3-strike rule)
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.hidden) {
        countRef.current += 1;
        const newCount = countRef.current;
        setTabSwitchCount(newCount);

        try {
          await logTabSwitch(candidateId, newCount, new Date().toISOString());
        } catch {
          // Non-fatal: best-effort logging
        }

        if (newCount >= 3) {
          try {
            await terminateSession(candidateId, "integrity_violation");
          } catch {
            // Non-fatal
          }
          router.push(`/assessment/${candidateId}/terminated?reason=integrity`);
        } else {
          setShowWarningModal(true);
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [candidateId, router]);

  // AI extension detection (runs once on mount)
  useEffect(() => {
    const allElements = Array.from(document.querySelectorAll("*"));
    const found = allElements.some((el) => {
      const id = (el.id || "").toLowerCase();
      const aria = (el.getAttribute("aria-label") || "").toLowerCase();
      const dataExt = (el.getAttribute("data-extension") || "").toLowerCase();
      return AI_EXTENSION_KEYWORDS.some(
        (kw) => id.includes(kw) || aria.includes(kw) || dataExt.includes(kw)
      );
    });
    setAiExtensionDetected(found);
  }, []);

  const dismissWarning = () => setShowWarningModal(false);

  return { tabSwitchCount, showWarningModal, dismissWarning, aiExtensionDetected };
}
