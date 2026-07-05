import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import toast from "react-hot-toast";

import FaceCard from "@/components/face-review/FaceCard";
import Lightbox from "@/components/face-review/Lightbox";
import { addRejects, clearRejects, loadRejects } from "@/components/face-review/rejectList";
import { Button } from "@/components/ui/button";
import { getCandidates, reassignFaces } from "@/handlers/api/faceReview.handler";
import { IFaceReviewFace, IFaceReviewScope } from "@/types/faceReview";

const BATCH = 24;

/**
 * "Find more > Faces": Yes/No staged review of look-alike candidates,
 * closest-first. Nothing is written until Apply: Yes faces get reassigned
 * to this person; No faces go to the per-device reject list (reviewer
 * scratch state — deliberately never written to Immich).
 */
export default function FindMoreFacesView({
  personId,
  personName,
  scope,
}: {
  personId: string;
  personName: string;
  scope: IFaceReviewScope;
}) {
  const [cards, setCards] = useState<IFaceReviewFace[]>([]);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [picks, setPicks] = useState<Set<string>>(new Set());
  const [rejects, setRejects] = useState<Set<string>>(new Set());
  const [skipCount, setSkipCount] = useState(0);
  const [lightboxAsset, setLightboxAsset] = useState<string | null>(null);

  const refreshSkipCount = useCallback(() => setSkipCount(loadRejects(personId).size), [personId]);

  const load = useCallback(
    async (reset: boolean) => {
      setLoading(true);
      try {
        const res = await getCandidates(personId, {
          scope,
          exclude: [...loadRejects(personId)],
          limit: BATCH,
          offset: reset ? 0 : cards.length,
        });
        setCards((prev) => (reset ? res.candidates : [...prev, ...res.candidates]));
        setHasNext(res.hasNext);
      } catch (e: any) {
        toast.error(`Failed: ${e?.error || e?.message || "unknown"}`);
      } finally {
        setLoading(false);
      }
    },
    [personId, scope, cards.length]
  );

  useEffect(() => {
    setCards([]);
    setPicks(new Set());
    setRejects(new Set());
    refreshSkipCount();
    load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personId, scope]);

  const verdict = (faceId: string, kind: "yes" | "no") => {
    const from = kind === "yes" ? setPicks : setRejects;
    const other = kind === "yes" ? setRejects : setPicks;
    from((prev) => {
      const next = new Set(prev);
      if (next.has(faceId)) next.delete(faceId);
      else next.add(faceId);
      return next;
    });
    other((prev) => {
      const next = new Set(prev);
      next.delete(faceId);
      return next;
    });
  };

  const apply = async () => {
    if (applying) return;
    const yes = [...picks], no = [...rejects];
    if (!yes.length && !no.length) return;
    setApplying(true);
    try {
      const results: string[] = [];
      if (yes.length) {
        const res = await reassignFaces({ faceIds: yes, personId });
        results.push(`added ${res.done}` + (res.failed ? `, ${res.failed} failed` : ""));
      }
      if (no.length) {
        addRejects(personId, no); // only now do the No marks persist
        results.push(`skipped ${no.length}`);
      }
      toast.success(`Applied: ${results.join(" · ")}`);
      setPicks(new Set());
      setRejects(new Set());
      refreshSkipCount();
      load(true);
    } catch (e: any) {
      toast.error(`Failed: ${e?.error || e?.message || "unknown"}`); // staged marks stay for retry
    } finally {
      setApplying(false);
    }
  };

  const stagedCount = picks.size + rejects.size;
  const emptyText = useMemo(
    () =>
      scope === "named"
        ? "No already-named look-alike faces left."
        : 'No unnamed look-alike faces left. Try "Already-named faces" above.',
    [scope]
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span>
          &quot;Yes&quot; assigns the face to {personName || "this person"}; &quot;No&quot; skips it for good on this
          device. Nothing happens until you press Apply.
        </span>
        {skipCount > 0 && (
          <span className="ml-auto">
            {skipCount} face{skipCount === 1 ? "" : "s"} skipped on this device ·{" "}
            <button
              className="underline hover:text-foreground"
              onClick={() => {
                if (!confirm('Forget the faces you marked "No" for this person on this device? They can then reappear as candidates.')) return;
                clearRejects(personId);
                refreshSkipCount();
                load(true);
              }}
            >
              reset
            </button>
          </span>
        )}
      </div>

      {stagedCount > 0 && (
        <div className="sticky top-0 z-20 flex flex-wrap items-center gap-3 rounded-lg border border-primary bg-card px-4 py-3">
          <span className="text-sm font-semibold">
            {picks.size} Yes · {rejects.size} No
          </span>
          <Button size="sm" disabled={applying} onClick={apply}>
            {applying && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
            Apply to {personName || "this person"}
          </Button>
          <Button
            size="sm" variant="ghost" disabled={applying}
            onClick={() => { setPicks(new Set()); setRejects(new Set()); }}
          >
            Clear
          </Button>
        </div>
      )}

      {!cards.length && !loading ? (
        <div className="py-16 text-center text-muted-foreground">{emptyText}</div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-4">
          {cards.map((face) => (
            <FaceCard
              key={face.faceId}
              face={face}
              verdict={picks.has(face.faceId) ? "yes" : rejects.has(face.faceId) ? "no" : null}
              onCropClick={() => setLightboxAsset(face.assetId)}
            >
              <div className="mt-2 flex gap-1">
                <Button
                  size="sm"
                  variant={picks.has(face.faceId) ? "default" : "outline"}
                  className="flex-1 h-7 text-xs"
                  onClick={() => verdict(face.faceId, "yes")}
                >
                  Yes
                </Button>
                <Button
                  size="sm"
                  variant={rejects.has(face.faceId) ? "destructive" : "outline"}
                  className="flex-1 h-7 text-xs"
                  onClick={() => verdict(face.faceId, "no")}
                >
                  No
                </Button>
              </div>
            </FaceCard>
          ))}
        </div>
      )}

      <div className="flex justify-center">
        {loading ? (
          <Loader2 className="animate-spin text-muted-foreground" />
        ) : hasNext ? (
          <Button variant="ghost" onClick={() => load(false)}>Load more</Button>
        ) : null}
      </div>
      <Lightbox assetId={lightboxAsset} onClose={() => setLightboxAsset(null)} />
    </div>
  );
}
