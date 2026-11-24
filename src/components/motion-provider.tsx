"use client";
import { MotionConfig } from "motion/react";

/** Respects the user's reduced-motion preference for every Motion animation in the app. */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return (
    <MotionConfig reducedMotion="user" transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}>
      {children}
    </MotionConfig>
  );
}
