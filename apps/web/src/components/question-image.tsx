import { useState, type CSSProperties } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { fileUrl } from "@/lib/api";
import { pageImageUrl, type Box, type DisplayImage } from "@/lib/review";
import { cn } from "@/lib/utils";

/**
 * Shows a region of a rendered page image without creating a new file:
 * the full page is scaled and offset inside a box with the region's aspect ratio.
 */
export function CropImage({ src, box, alt, className }: { src: string; box: Box; alt: string; className?: string }) {
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const bw = Math.max(0.01, box.x1 - box.x0);
  const bh = Math.max(0.01, box.y1 - box.y0);
  // A4 portrait until the image reports its real size.
  const ratio = natural ? (bw * natural.w) / (bh * natural.h) : (bw * 1) / (bh * 1.414);

  return (
    <div className={cn("relative overflow-hidden", className)} style={{ aspectRatio: ratio }} role="img" aria-label={alt}>
      <img
        src={src}
        alt=""
        draggable={false}
        loading="lazy"
        onLoad={(e) => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
        data-loaded={!!natural}
        className="fade-img absolute max-w-none select-none"
        style={{
          width: `${100 / bw}%`,
          height: `${100 / bh}%`,
          left: `${(-box.x0 / bw) * 100}%`,
          top: `${(-box.y0 / bh) * 100}%`,
        }}
      />
    </div>
  );
}

/**
 * A question figure: the server-cropped file, or a live crop after re-cropping in the editor.
 * Shown at the size it has on the printed page (a small diagram stays small), click to zoom.
 */
export function QuestionImage({ image, paperId, alt, className }: { image: DisplayImage; paperId: string; alt: string; className?: string }) {
  const [zoom, setZoom] = useState(false);
  // A full A4 page width = ~760 px on phones / tablets, ~540 px on laptops (diagrams stay compact there).
  const frac = image.box.x1 - image.box.x0;
  const size = {
    "--fig-w-sm": `${Math.max(240, Math.round(frac * 760))}px`,
    "--fig-w-lg": `${Math.max(220, Math.round(frac * 540))}px`,
  } as CSSProperties;
  if (image.path) {
    const src = fileUrl(image.path);
    return (
      <>
        <button type="button" onClick={() => setZoom(true)} className="fig-size block max-w-full cursor-zoom-in" style={size} title="Click to enlarge">
          <FadeImg src={src} alt={alt} className={cn("max-h-[420px] w-full rounded-lg lg:max-h-[300px] border bg-white object-contain p-1", className)} />
        </button>
        <Dialog open={zoom} onOpenChange={setZoom}>
          <DialogContent className="max-h-[92vh] w-auto max-w-[min(96vw,1100px)] overflow-auto bg-white p-3 sm:max-w-[min(96vw,1100px)]">
            <DialogTitle className="sr-only">{alt}</DialogTitle>
            <img src={src} alt={alt} className="h-auto max-h-[85vh] w-auto max-w-full object-contain" />
          </DialogContent>
        </Dialog>
      </>
    );
  }
  return (
    <div className={cn("fig-size overflow-hidden rounded-lg border bg-white p-1", className)} style={size}>
      <CropImage src={pageImageUrl(paperId, image.page)} box={image.box} alt={alt} />
    </div>
  );
}

function FadeImg({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const [loaded, setLoaded] = useState(false);
  return <img src={src} alt={alt} loading="lazy" decoding="async" data-loaded={loaded} onLoad={() => setLoaded(true)} className={cn("fade-img", className)} />;
}
