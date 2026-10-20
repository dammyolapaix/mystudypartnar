"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup } from "@/components/ui/field";
import { retrySource } from "../actions";
import type { RetrySourceInput } from "../types";
import { retrySourceSchema } from "../validations";

export function RetrySourceForm({ sourceId }: { sourceId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const form = useForm<RetrySourceInput>({
    resolver: zodResolver(retrySourceSchema),
    defaultValues: { sourceId },
  });

  function onSubmit(data: RetrySourceInput) {
    startTransition(async () => {
      const result = await retrySource({ sourceId: data.sourceId || sourceId });
      if (result.errors?.sourceId?.[0]) {
        form.setError("sourceId", { message: result.errors.sourceId[0] });
        return;
      }
      if (result.error) {
        toast.error(result.error);
        return;
      }
      if (result.success) {
        form.reset({ sourceId });
        toast.success(result.success);
        router.refresh();
      }
    });
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit(onSubmit)(event);
      }}
    >
      <FieldGroup>
        <input
          type="hidden"
          defaultValue={sourceId}
          {...form.register("sourceId")}
        />
        <Field data-invalid={form.formState.errors.sourceId ? true : undefined}>
          <Button type="submit" variant="outline" size="sm" disabled={isPending}>
            Retry
          </Button>
          <FieldError errors={[form.formState.errors.sourceId]} />
        </Field>
      </FieldGroup>
    </form>
  );
}
