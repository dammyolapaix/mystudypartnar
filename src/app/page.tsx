import type { Metadata } from "next";
import { Suspense } from "react";
import { SourceList } from "@/features/sources/components/source-list";
import { SourceListSkeleton } from "@/features/sources/components/source-list-skeleton";

export const metadata: Metadata = {
  title: "Sources",
  description: "Upload a lecture file and see it while it is preparing.",
};

export default function SourcesPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Sources</h1>
      <Suspense fallback={<SourceListSkeleton />}>
        <SourceList />
      </Suspense>
    </main>
  );
}
