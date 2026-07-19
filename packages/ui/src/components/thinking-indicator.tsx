"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { forwardRef, useEffect, useState, type HTMLAttributes } from "react";

import { cn } from "@heydesk/ui/lib/utils";

const circleA =
  "M 12 8 C 14.21 8 16 9.79 16 12 C 16 14.21 14.21 16 12 16 C 9.79 16 8 14.21 8 12 C 8 9.79 9.79 8 12 8 Z";

const infinity =
  "M 12 12 C 14 8.5 19 8.5 19 12 C 19 15.5 14 15.5 12 12 C 10 8.5 5 8.5 5 12 C 5 15.5 10 15.5 12 12 Z";

const circleB =
  "M 12 16 C 14.21 16 16 14.21 16 12 C 16 9.79 14.21 8 12 8 C 9.79 8 8 9.79 8 12 C 8 14.21 9.79 16 12 16 Z";

const words = ["Thinking", "Planning", "Working", "Refining"];

type ThinkingIndicatorProps = HTMLAttributes<HTMLDivElement> & {
  showIcon?: boolean;
};

const ThinkingIndicator = forwardRef<HTMLDivElement, ThinkingIndicatorProps>(
  ({ className, showIcon = true, ...props }, ref) => {
  const [index, setIndex] = useState(0);
  const reduceMotion = useReducedMotion() ?? false;

  useEffect(() => {
    if (reduceMotion) return;
    const interval = setInterval(() => {
      setIndex((i) => (i + 1) % words.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [reduceMotion]);

  return (
    <div
      ref={ref}
      role="status"
      className={cn("flex items-center gap-2 px-3 py-2", className)}
      {...props}
    >
      <span className="sr-only">Thinking…</span>
      {showIcon && (
        <motion.svg
          aria-hidden
          width={20}
          height={20}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="shrink-0 text-muted-foreground"
        >
          {reduceMotion ? (
            <path d={infinity} />
          ) : (
            <motion.path
              animate={{
                d: [circleA, infinity, circleB, infinity, circleA],
              }}
              transition={{
                d: {
                  duration: 6,
                  ease: "easeInOut",
                  repeat: Infinity,
                  times: [0, 0.25, 0.5, 0.75, 1.0],
                },
              }}
            />
          )}
        </motion.svg>
      )}
      <span
        aria-hidden="true"
        className="inline-grid overflow-hidden bg-[linear-gradient(90deg,color-mix(in_oklch,currentColor_40%,transparent)_0%,color-mix(in_oklch,currentColor_40%,transparent)_30%,currentColor_50%,color-mix(in_oklch,currentColor_40%,transparent)_70%,color-mix(in_oklch,currentColor_40%,transparent)_100%)] bg-size-[200%_100%] bg-clip-text text-[13px] font-medium text-muted-foreground [-webkit-text-fill-color:transparent] animate-[text-shimmer_2.2s_linear_infinite]"
      >
        <span className="invisible col-start-1 row-start-1">
          {words.reduce((a, b) => (a.length >= b.length ? a : b))}
        </span>
        {reduceMotion ? (
          <span className="col-start-1 row-start-1">{words[0]}</span>
        ) : (
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={words[index]}
              className="col-start-1 row-start-1"
              initial={{ y: "80%", opacity: 0 }}
              animate={{
                y: 0,
                opacity: 1,
                transition: { duration: 0.24, ease: [0.4, 0, 0.2, 1] },
              }}
              exit={{
                y: "-80%",
                opacity: 0,
                transition: { duration: 0.16, ease: [0.4, 0, 0.2, 1] },
              }}
            >
              {words[index]}
            </motion.span>
          </AnimatePresence>
        )}
      </span>
    </div>
  );
});

ThinkingIndicator.displayName = "ThinkingIndicator";

export { ThinkingIndicator };
export type { ThinkingIndicatorProps };
export default ThinkingIndicator;
