"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useRef, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { confirmSourceUpload, requestSourceUpload } from "../actions";
import type { RequestSourceUploadInput } from "../types";
import { requestSourceUploadSchema } from "../validations";

export function UploadSourceForm() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [isPending, startTransition] = useTransition();
  const form = useForm<RequestSourceUploadInput>({
    resolver: zodResolver(requestSourceUploadSchema),
    defaultValues: { filename: "", byteLength: 0 },
  });

  function onSubmit(data: RequestSourceUploadInput) {
    const file = fileRef.current?.files?.[0];
    if (!file || file.name !== data.filename || file.size !== data.byteLength) {
      form.setError("filename", { message: "Choose a file" });
      return;
    }

    startTransition(async () => {
      const requested = await requestSourceUpload(data);
      if (requested.errors) {
        for (const [field, messages] of Object.entries(requested.errors)) {
          if (messages?.[0]) {
            form.setError(field as keyof RequestSourceUploadInput, {
              message: messages[0],
            });
          }
        }
        return;
      }
      if (requested.error) {
        toast.error(requested.error);
        return;
      }

      const grant = requested.state;
      if (!grant?.uploadUrl || !grant.confirmation) {
        toast.error("The file could not be uploaded");
        return;
      }

      const uploaded = await fetch(grant.uploadUrl, {
        method: "PUT",
        body: file,
      });
      if (!uploaded.ok) {
        toast.error("The file could not be uploaded");
        return;
      }

      const confirmed = await confirmSourceUpload({
        confirmation: grant.confirmation,
      });
      if (confirmed.errors) {
        toast.error("The file could not be uploaded");
        return;
      }
      if (confirmed.error) {
        toast.error(confirmed.error);
        return;
      }
      if (confirmed.success) {
        form.reset({ filename: "", byteLength: 0 });
        if (fileRef.current) fileRef.current.value = "";
        toast.success(confirmed.success);
        router.refresh();
      }
    });
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)}>
      <FieldGroup>
        <Controller
          name="filename"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field
              data-invalid={fieldState.invalid}
              data-disabled={isPending ? true : undefined}
            >
              <FieldLabel htmlFor="source-file">Lecture file</FieldLabel>
              <Input
                id="source-file"
                type="file"
                accept=".pdf,.doc,.docx,.ppt,.pptx"
                aria-invalid={fieldState.invalid}
                disabled={isPending}
                ref={(node) => {
                  field.ref(node);
                  fileRef.current = node;
                }}
                onBlur={field.onBlur}
                onChange={(event) => {
                  const selected = event.target.files?.[0];
                  field.onChange(selected?.name ?? "");
                  form.setValue("byteLength", selected?.size ?? 0);
                }}
              />
              {(fieldState.invalid || form.formState.errors.byteLength) && (
                <FieldError
                  errors={[fieldState.error, form.formState.errors.byteLength]}
                />
              )}
            </Field>
          )}
        />
        <Button type="submit" disabled={isPending}>
          {isPending ? "Uploading..." : "Upload"}
        </Button>
      </FieldGroup>
    </form>
  );
}
