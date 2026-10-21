import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AuthCard } from "@/features/auth/components/auth-card";
import { SignInForm } from "@/features/auth/components/sign-in-form";
import { SignInFormSkeleton } from "@/features/auth/components/sign-in-form-skeleton";
import { SignedOut } from "@/features/auth/components/signed-out";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to upload a lecture file.",
  robots: { index: false, follow: false },
};

export default function SignInPage() {
  return (
    <main className="flex flex-1 items-center justify-center bg-muted px-6 py-16">
      <AuthCard
        title="Sign in"
        description="Sign in to upload a lecture file."
        footer={
          <p className="text-sm text-muted-foreground">
            New here?{" "}
            <Link
              href="/sign-up"
              className="text-foreground underline underline-offset-4"
            >
              Sign up
            </Link>
          </p>
        }
      >
        <Suspense fallback={<SignInFormSkeleton />}>
          <SignedOut>
            <SignInForm />
          </SignedOut>
        </Suspense>
      </AuthCard>
    </main>
  );
}
