import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Image from "next/image";
import Link from "next/link";
import { Loader2, ScanFace, Trash2 } from "lucide-react";
import toast from "react-hot-toast";

import PageLayout from "@/components/layouts/PageLayout";
import Header from "@/components/shared/Header";
import { AlertDialog } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { PERSON_THUBNAIL_PATH } from "@/config/routes";
import {
  clearEmptyPeople, listFaceReviewPeople, scanMissing,
} from "@/handlers/api/faceReview.handler";
import { IFaceReviewPerson } from "@/types/faceReview";

const FILTERS = [
  { value: "named", label: "Named people" },
  { value: "unnamed", label: "Unnamed only" },
  { value: "strangers", label: "Strangers (split-offs)" },
  { value: "prebirth", label: "Pre-birth faces" },
  { value: "hidden", label: "Hidden" },
  { value: "all", label: "All" },
];

/**
 * Face Review landing: pick a person to review. Deliberately NOT another
 * people browser (Manage People already exists) — this grid is ordered by
 * face count because more faces = more room for misassignments.
 */
export default function FaceReviewIndexPage() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState("named");
  const [busy, setBusy] = useState<null | "scan" | "clear">(null);

  const query = useQuery({
    queryKey: ["face-review", "people", filter],
    queryFn: () => listFaceReviewPeople(filter),
  });

  const runScan = async () => {
    setBusy("scan");
    try {
      await scanMissing();
      toast.success("Facial recognition (Missing) queued — new faces get assigned without re-clustering your corrections.");
    } catch (e: any) {
      toast.error(`Failed: ${e?.error || e?.message || "unknown"}`);
    } finally {
      setBusy(null);
    }
  };

  const runClear = async () => {
    setBusy("clear");
    try {
      const res = await clearEmptyPeople();
      toast.success(`Deleted ${res.deleted} empty ${res.deleted === 1 ? "person" : "people"}`);
      queryClient.invalidateQueries({ queryKey: ["face-review", "people"] });
    } catch (e: any) {
      toast.error(`Failed: ${e?.error || e?.message || "unknown"}`);
    } finally {
      setBusy(null);
    }
  };

  const people: IFaceReviewPerson[] = query.data?.people ?? [];

  return (
    <PageLayout title="Face Review">
      <Header
        leftComponent="Face Review"
        rightComponent={
          <div className="flex items-center gap-2">
            <AlertDialog
              asChild
              disabled={!!busy}
              title="Run facial recognition on missing faces?"
              description={'Queues Immich\'s Facial Recognition job in "Missing" mode: detected faces that aren\'t assigned to anyone yet get matched. It never re-clusters existing assignments, so your manual corrections are safe. (The dangerous variant is "All", which this tool never uses.)'}
              onConfirm={runScan}
            >
              <Button size="sm" variant="outline" disabled={!!busy}>
                {busy === "scan" ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <ScanFace size={14} className="mr-1" />}
                Scan unassigned faces
              </Button>
            </AlertDialog>
            <AlertDialog
              asChild
              disabled={!!busy}
              title="Delete empty person records?"
              description="Removes YOUR person records that have zero visible faces — leftovers from failed or retried reassignments. People with any face at all are untouched, and other users' records are never affected."
              onConfirm={runClear}
            >
              <Button size="sm" variant="outline" disabled={!!busy}>
                {busy === "clear" ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Trash2 size={14} className="mr-1" />}
                Delete empty people
              </Button>
            </AlertDialog>
          </div>
        }
      />
      <div className="flex flex-col gap-4 p-4">
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted-foreground">Show</label>
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-52 h-8"><SelectValue /></SelectTrigger>
            <SelectContent>
              {FILTERS.map((f) => (
                <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="ml-auto text-sm text-muted-foreground">
            {people.length} {people.length === 1 ? "person" : "people"}
          </span>
        </div>
        {query.isLoading ? (
          <div className="flex justify-center py-16"><Loader2 className="animate-spin" /></div>
        ) : !people.length ? (
          <div className="py-16 text-center text-muted-foreground">No people in this view.</div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-4">
            {people.map((p) => (
              <Link
                key={p.id}
                href={`/face-review/${p.id}`}
                className="flex flex-col items-center gap-2 rounded-xl border bg-card p-4 transition-colors hover:border-primary"
              >
                <Image
                  src={PERSON_THUBNAIL_PATH(p.id)}
                  alt={p.name || "(unnamed)"}
                  width={96}
                  height={96}
                  className="h-24 w-24 rounded-full object-cover bg-muted"
                  unoptimized
                />
                <span className="text-sm font-medium text-center leading-tight">
                  {p.name || <span className="italic text-muted-foreground">(unnamed)</span>}
                </span>
                <span className="text-xs text-muted-foreground">
                  {p.faceCount.toLocaleString()} face{p.faceCount === 1 ? "" : "s"}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </PageLayout>
  );
}
