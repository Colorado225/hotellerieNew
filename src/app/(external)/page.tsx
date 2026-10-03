import Link from "next/link";

import type { Metadata } from "next";

import { Separator } from "@/components/ui/separator";
import { APP_CONFIG } from "@/config/app-config";

import { Footer } from "./_components/footer";
import { Intro } from "./_components/intro";
import { LandingThemeSwitcher } from "./_components/landing-theme-switcher";
import { Overview } from "./_components/overview";
import { Showcase } from "./_components/showcase";
import styles from "./landing.module.css";

export const metadata: Metadata = {
  title: APP_CONFIG.meta.title,
  description: APP_CONFIG.meta.description,
  alternates: {
    canonical: "/",
  },
};

export default function Home() {
  // Keeps landing-page colors independent from saved dashboard theme presets.
  return (
    <main className={`${styles.landing} min-h-screen bg-background text-foreground`} data-landing-page>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-4 sm:gap-8 sm:p-6 md:p-8">
        <header className="flex items-start justify-between gap-4 sm:items-center sm:gap-6">
          <Link
            className="font-medium text-base tracking-tight"
            href="/"
            aria-label={`${APP_CONFIG.name} — accueil`}
            prefetch={false}
          >
            {APP_CONFIG.name}
          </Link>
          <LandingThemeSwitcher />
        </header>
        <Intro />
        <Showcase />
        <Separator />
        <Overview />
        <Separator />
        <Footer />
      </div>
    </main>
  );
}
