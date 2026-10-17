import { useState } from "react";

export interface AiStudyFeedState {
  status: "waiting" | "calibrating" | "optimized" | "active";
  message: string;
  averageVelocity: number | null;
  knowledgeBase: any | null;
  strategy: any | null;
}

export function useAiStudyFeed(_sendWsMessage: (msg: any) => boolean): AiStudyFeedState {
  return {
    status: "calibrating",
    message: "AI study feed unavailable (Cotrade has no AI synthesis backend).",
    averageVelocity: null,
    knowledgeBase: null,
    strategy: null,
  };
}