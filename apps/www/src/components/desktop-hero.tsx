import { useRef } from "react";
import { motion, useInView } from "motion/react";
import appShot from "@/assets/app-shot.png";

export function DesktopHero() {
  const containerRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(containerRef, {
    once: true,
    margin: "0px 0px -15% 0px",
  });

  return (
    <div
      ref={containerRef}
      className="relative isolate mt-8 flex h-[clamp(24rem,58vw,42rem)] w-full max-w-6xl justify-center overflow-hidden px-2 sm:mt-10"
    >
      <motion.div
        initial={{ opacity: 0, y: 140 }}
        animate={{
          opacity: isInView ? 1 : 0,
          y: isInView ? 0 : 140,
        }}
        transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-6xl"
      >
        <img
          src={appShot}
          alt="Heydesk desktop workspace with an editable document and AI assistant"
          className="-mt-8 block h-auto w-full rounded-[1.5rem] shadow-2xl shadow-slate-300/50 sm:-mt-12 sm:rounded-[2.5rem] lg:-mt-16"
        />
      </motion.div>
    </div>
  );
}

export default DesktopHero;
