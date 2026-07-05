import React from "react";
import { useQuery } from "@tanstack/react-query";
import Image from "next/image";
import { useRouter } from "next/router";

import { CandidateClustersView, OwnClustersView } from "@/components/face-review/ClusterViews";
import FindMoreFacesView from "@/components/face-review/FindMoreFacesView";
import TaggedFacesView from "@/components/face-review/TaggedFacesView";
import PageLayout from "@/components/layouts/PageLayout";
import Header from "@/components/shared/Header";
import Loader from "@/components/ui/loader";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PERSON_THUBNAIL_PATH } from "@/config/routes";
import { getFaceReviewPersonInfo } from "@/handlers/api/faceReview.handler";
import { IFaceReviewScope } from "@/types/faceReview";

type IPrimaryTab = "tagged" | "find-more";
type ISubTab = "faces" | "clusters";

/**
 * Face Review page: 2 primary tabs (which face set) x 2 sub-tabs (which lens
 * on it) — Tagged faces = this person's own detections; Find more =
 * candidates near their centroid that aren't them yet. Faces = flat ranked
 * list; Clusters = mutual-similarity groups.
 */
export default function FaceReviewPersonPage() {
  const router = useRouter();
  const { personId } = router.query as { personId: string };
  const tab = (router.query.tab as IPrimaryTab) || "tagged";
  const sub = (router.query.sub as ISubTab) || "faces";
  const scope: IFaceReviewScope = router.query.scope === "named" ? "named" : "unnamed";

  const info = useQuery({
    queryKey: ["face-review", "info", personId],
    queryFn: () => getFaceReviewPersonInfo(personId),
    enabled: !!personId,
  });

  const setParams = (params: Record<string, string>) => {
    router.push(
      { pathname: router.pathname, query: { ...router.query, ...params } },
      undefined,
      { shallow: true }
    );
  };

  if (!personId || info.isLoading) return <Loader />;
  if (info.isError) {
    return (
      <PageLayout title="Face Review">
        <div className="p-8 text-center text-destructive">
          {String((info.error as any)?.error || "Person not found")}
        </div>
      </PageLayout>
    );
  }
  const person = info.data;

  return (
    <PageLayout className="!p-4" title={`Review: ${person?.name || "(unnamed)"}`}>
      <Header
        leftComponent={
          <div className="flex items-center gap-2">
            <Image
              src={PERSON_THUBNAIL_PATH(personId)}
              alt={person?.name || "person"}
              width={32}
              height={32}
              className="rounded-full"
            />
            <span className="font-medium">Reviewing: {person?.name || "(unnamed)"}</span>
            <span className="text-sm text-muted-foreground">
              {person?.faceCount?.toLocaleString?.() ?? person?.faceCount} faces
            </span>
          </div>
        }
      />
      <div className="flex flex-col gap-4 px-4 pb-8">
        <div className="flex flex-wrap items-center gap-3">
          <Tabs value={tab} onValueChange={(v) => setParams({ tab: v, sub: "faces" })}>
            <TabsList>
              <TabsTrigger value="tagged">Tagged faces</TabsTrigger>
              <TabsTrigger value="find-more">Find more</TabsTrigger>
            </TabsList>
          </Tabs>
          <Tabs value={sub} onValueChange={(v) => setParams({ sub: v })}>
            <TabsList>
              <TabsTrigger value="faces">Faces</TabsTrigger>
              <TabsTrigger value="clusters">Clusters</TabsTrigger>
            </TabsList>
          </Tabs>
          {tab === "find-more" && (
            <div className="flex items-center gap-2">
              <label className="text-sm text-muted-foreground">Include</label>
              <Select value={scope} onValueChange={(v) => setParams({ scope: v })}>
                <SelectTrigger className="w-48 h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="unnamed">Unnamed faces only</SelectItem>
                  <SelectItem value="named">Already-named faces</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {tab === "tagged" && sub === "faces" && (
          <TaggedFacesView personId={personId} personName={person?.name || ""} />
        )}
        {tab === "tagged" && sub === "clusters" && <OwnClustersView personId={personId} />}
        {tab === "find-more" && sub === "faces" && (
          <FindMoreFacesView personId={personId} personName={person?.name || ""} scope={scope} />
        )}
        {tab === "find-more" && sub === "clusters" && (
          <CandidateClustersView personId={personId} personName={person?.name || ""} scope={scope} />
        )}
      </div>
    </PageLayout>
  );
}
