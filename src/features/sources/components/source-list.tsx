import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { getSession } from "@/lib/session";
import { listSources } from "../queries";
import type { SourceRecord } from "../types";
import { DeleteSourceForm } from "./delete-source-form";
import { RetrySourceForm } from "./retry-source-form";
import { SourceRunSubscription } from "./source-run-subscription";
import { UploadSourceForm } from "./upload-source-form";

export async function SourceList() {
  const session = await getSession();

  if (!session) {
    return <p className="text-muted-foreground">Sign in to upload a file.</p>;
  }

  const items = await listSources(session.user.id);
  const preparingRunIds = items.flatMap((source) =>
    source.status === "preparing" && source.runId ? [source.runId] : [],
  );

  return (
    <div className="flex flex-col gap-8">
      <UploadSourceForm />
      <SourceRunSubscription runIds={preparingRunIds}>
        {items.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>No sources yet</EmptyTitle>
              <EmptyDescription>
                Upload a PDF, Word, or PowerPoint file.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul className="flex flex-col gap-3">
            {items.map((source) => (
              <li
                key={source.id}
                className="flex flex-col gap-2 rounded-lg border px-4 py-3"
              >
                <p className="font-medium">{source.filename}</p>
                <p className="text-sm text-muted-foreground">
                  {sourceStatusCopy(source.status)}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  {source.status === "failed" ? (
                    <RetrySourceForm sourceId={source.id} />
                  ) : null}
                  <DeleteSourceForm sourceId={source.id} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </SourceRunSubscription>
    </div>
  );
}

function sourceStatusCopy(status: SourceRecord["status"]) {
  if (status === "ready") return "Ready";
  if (status === "failed") return "We couldn't process this file.";
  return "Processing your file…";
}
