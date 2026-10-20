"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { deleteSource } from "../actions";
import type { DeleteSourceInput } from "../types";
import { deleteSourceSchema } from "../validations";

export function DeleteSourceForm({ sourceId }: { sourceId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const form = useForm<DeleteSourceInput>({
    resolver: zodResolver(deleteSourceSchema),
    defaultValues: { sourceId },
  });
  const formId = `delete-source-${sourceId}`;
  const buttonId = `delete-source-button-${sourceId}`;
  const sourceIdInvalid = Boolean(form.formState.errors.sourceId);

  function onSubmit(data: DeleteSourceInput) {
    startTransition(async () => {
      const result = await deleteSource({ sourceId: data.sourceId || sourceId });
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
        setOpen(false);
        router.refresh();
      }
    });
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!isPending) setOpen(next);
      }}
    >
      <form
        id={formId}
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit(onSubmit)(event);
        }}
      >
        <FieldGroup>
          <input type="hidden" defaultValue={sourceId} {...form.register("sourceId")} />
          <Field data-invalid={sourceIdInvalid || undefined}>
            <FieldLabel htmlFor={buttonId} className="sr-only">
              Delete
            </FieldLabel>
            <AlertDialogTrigger
              render={
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  id={buttonId}
                  aria-invalid={sourceIdInvalid || undefined}
                />
              }
            >
              Delete
            </AlertDialogTrigger>
            <FieldError errors={[form.formState.errors.sourceId]} />
          </Field>
        </FieldGroup>
      </form>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this source?</AlertDialogTitle>
          <AlertDialogDescription>
            The file will leave your list.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            type="submit"
            form={formId}
            variant="destructive"
            disabled={isPending}
          >
            {isPending ? "Deleting..." : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
