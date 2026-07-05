import React, { useEffect, useRef } from "react";

import { IFaceReviewFace } from "@/types/faceReview";

/**
 * Square face crop drawn on a canvas from the asset's preview thumbnail.
 * Power Tools never had this primitive — it only ever shows a person's
 * representative avatar; reviewing individual detections needs the actual
 * bounding-box crop.
 *
 * Crop math ported verbatim from the source tool's faces.js: the bbox lives
 * in the ML model's coordinate space (imageWidth/Height on asset_face), so
 * it is scaled to the loaded preview's natural size, padded 40%, squared,
 * and clamped inside the image so edge faces don't get blank bands.
 */
export default function FaceCrop({
  face,
  size = 200,
  className,
  onClick,
  title,
}: {
  face: IFaceReviewFace;
  size?: number;
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
  title?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const img = new Image();
    img.src = `/api/immich-proxy/asset/thumbnail/${face.assetId}?size=preview`;
    let cancelled = false;
    img.onload = () => {
      if (cancelled) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const { boundingBoxX1: x1, boundingBoxY1: y1, boundingBoxX2: x2, boundingBoxY2: y2 } = face;
      const mlW = face.imageWidth, mlH = face.imageHeight;

      if ([x1, y1, x2, y2].some((v) => typeof v !== "number" || Number.isNaN(v)) || !(x2 > x1)) {
        ctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight, 0, 0, canvas.width, canvas.height);
        return;
      }
      const scaleX = mlW ? img.naturalWidth / mlW : 1;
      const scaleY = mlH ? img.naturalHeight / mlH : 1;
      let sx = x1 * scaleX;
      let sy = y1 * scaleY;
      let sw = (x2 - x1) * scaleX;
      let sh = (y2 - y1) * scaleY;
      const padX = sw * 0.4, padY = sh * 0.4;
      sx = Math.max(0, sx - padX);
      sy = Math.max(0, sy - padY);
      sw = Math.min(img.naturalWidth - sx, sw + padX * 2);
      sh = Math.min(img.naturalHeight - sy, sh + padY * 2);
      const cropSize = Math.min(Math.max(sw, sh), img.naturalWidth, img.naturalHeight);
      sx = Math.min(Math.max(0, sx + sw / 2 - cropSize / 2), img.naturalWidth - cropSize);
      sy = Math.min(Math.max(0, sy + sh / 2 - cropSize / 2), img.naturalHeight - cropSize);
      ctx.drawImage(img, sx, sy, cropSize, cropSize, 0, 0, canvas.width, canvas.height);
    };
    img.onerror = () => {
      if (cancelled) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.fillStyle = "#3a1f1f";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#e0524a";
      ctx.font = "13px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("load failed", canvas.width / 2, canvas.height / 2);
    };
    return () => { cancelled = true; };
  }, [face.assetId, face.boundingBoxX1, face.boundingBoxY1, face.boundingBoxX2, face.boundingBoxY2, face.imageWidth, face.imageHeight]);

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      onClick={onClick}
      title={title}
      className={className}
    />
  );
}
