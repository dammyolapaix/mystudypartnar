import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AuthCard } from "@/features/auth/components/auth-card";
import { SignUpForm } from "@/features/auth/components/sign-up-form";
import { SignUpFormSkeleton } from "@/features/auth/components/sign-up-form-skeleton";
import { SignedOut } from "@/features/auth/components/signed-out";

export const metadata: Metadata = {
  title: "Sign up",
  description: "Sign up to upload a lecture file.",
  robots: { index: false, follow: false },
};

export default function SignUpPage() {
  return (
    <main className="flex flex-1 items-center justify-center bg-muted px-6 py-16">
      <AuthCard
        title="Sign up"
        description="Sign up to upload a lecture file."
        footer={
          <p className="text-sm text-muted-foreground">
            Already signed up?{" "}
            <Link
              href="/sign-in"
              className="text-foreground underline underline-offset-4"
            >
              Sign in
            </Link>
          </p>
        }
      >
        <Suspense fallback={<SignUpFormSkeleton />}>
          <SignedOut>
            <SignUpForm />
          </SignedOut>
        </Suspense>
      </AuthCard>
    </main>
  );
}
