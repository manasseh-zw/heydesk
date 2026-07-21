import { useEffect, useState } from "react";
import type { Variants } from "motion/react";

import DesktopHero from "@/components/desktop-hero";
import { AnimatedGroup } from "@/components/animated-group";
import { AppleDownloadButton } from "@/components/apple-download";
import { GitHubButton } from "@/components/github-button";
import { LogoMark } from "@/components/logo";

const githubUrl = "https://github.com/manasseh-zw/heydesk";
const releasesUrl = `${githubUrl}/releases`;

function findLatestDmgUrl(value: unknown) {
  if (!Array.isArray(value)) return null;

  for (const release of value) {
    if (typeof release !== "object" || release === null) continue;
    if (!("draft" in release) || release.draft !== false) continue;
    if (!("assets" in release) || !Array.isArray(release.assets)) continue;

    for (const asset of release.assets) {
      if (typeof asset !== "object" || asset === null) continue;
      if (!("name" in asset) || typeof asset.name !== "string") continue;
      if (
        !("browser_download_url" in asset) ||
        typeof asset.browser_download_url !== "string"
      ) {
        continue;
      }

      if (asset.name.endsWith(".dmg")) return asset.browser_download_url;
    }
  }

  return null;
}

export function HeroSection2() {
  const [isVisible, setIsVisible] = useState(false);
  const [macDownloadUrl, setMacDownloadUrl] = useState(releasesUrl);

  useEffect(() => {
    const controller = new AbortController();

    setIsVisible(true);

    void fetch(
      "https://api.github.com/repos/manasseh-zw/heydesk/releases?per_page=20",
      {
        headers: {
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        signal: controller.signal,
      },
    )
      .then((response) => (response.ok ? response.json() : null))
      .then((releases: unknown) => {
        const latestDmgUrl = findLatestDmgUrl(releases);
        if (latestDmgUrl) setMacDownloadUrl(latestDmgUrl);
      })
      .catch(() => undefined);

    return () => controller.abort();
  }, []);

  const transitionVariants: { item: Variants; container: Variants } = {
    item: {
      hidden: { opacity: 0, filter: "blur(15px)", y: 20 },
      visible: {
        opacity: 1,
        filter: "blur(0px)",
        y: 0,
        transition: {
          type: "spring" as const,
          bounce: 0.2,
          duration: 1.5,
          staggerChildren: 0.1,
          delayChildren: 0.1,
        },
      },
    },
    container: {
      hidden: { opacity: 0 },
      visible: {
        opacity: 1,
        transition: { staggerChildren: 0.12, delayChildren: 0.2 },
      },
    },
  };

  return (
    <section
      id="hero"
      className="relative flex h-svh w-full flex-col items-center justify-center overflow-hidden pt-20 font-sans"
    >
      <LogoMark
        className={`absolute top-6 left-6 z-50 size-9 transition-opacity duration-1000 sm:top-8 sm:left-8 sm:size-10 ${
          isVisible ? "opacity-100" : "opacity-0"
        }`}
        aria-label="Heydesk"
        role="img"
      />

      <AnimatedGroup variants={transitionVariants} className="max-w-4xl px-6">
        <div
          className={`mb-8 text-center transition-opacity duration-1000 ${
            isVisible ? "opacity-100" : "opacity-0"
          }`}
        >
          <h1 className="mb-4 text-balance font-display text-5xl font-medium leading-[0.94] text-black md:text-7xl">
            Turn your ideas into polished documents with{" "}
            <span className="whitespace-nowrap text-lime-600">Heydesk</span>.
          </h1>
          <p className="mx-auto mb-8 text-balance text-lg leading-7 tracking-tight text-black/70 md:text-xl">
            A local-first documents workspace with Codex by your side.
          </p>

          <div
            id="download"
            className="flex flex-col items-center justify-center gap-3 pt-5 sm:flex-row"
          >
            <AppleDownloadButton
              href={macDownloadUrl}
              target="_blank"
              rel="noreferrer"
              aria-label="Download Heydesk for Mac"
            />
            <GitHubButton
              href={githubUrl}
              target="_blank"
              rel="noreferrer"
              aria-label="Star Heydesk on GitHub"
            />
          </div>
        </div>
      </AnimatedGroup>

      <DesktopHero />

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-40 h-40 bg-gradient-to-t from-slate-50 to-transparent" />
    </section>
  );
}

export default HeroSection2;
