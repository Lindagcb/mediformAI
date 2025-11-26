import { useEffect, useRef, useState } from "react";
import { GlobalWorkerOptions, getDocument, version } from "pdfjs-dist/legacy/build/pdf";

export default function PdfCanvasViewer({ url, zoom, rotation }) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);

  // ⭐ Drag state
  const isDragging = useRef(false);
  const start = useRef({ x: 0, y: 0 });
  const scrollStart = useRef({ left: 0, top: 0 });

  const onMouseDown = (e: React.MouseEvent) => {
    const outer = outerRef.current;
    if (!outer) return;

    isDragging.current = true;
    start.current = { x: e.clientX, y: e.clientY };
    scrollStart.current = { left: outer.scrollLeft, top: outer.scrollTop };
    outer.style.cursor = "grabbing";
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (!isDragging.current) return;

    const outer = outerRef.current;
    if (!outer) return;

    const dx = e.clientX - start.current.x;
    const dy = e.clientY - start.current.y;

    outer.scrollLeft = scrollStart.current.left - dx;
    outer.scrollTop = scrollStart.current.top - dy;
  };

  const onMouseUp = () => {
    isDragging.current = false;
    const outer = outerRef.current;
    if (outer) outer.style.cursor = "grab";
  };

  useEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner || !url) return;

    // Clear once
    inner.innerHTML = "";

    GlobalWorkerOptions.workerSrc =
      `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${version}/pdf.worker.min.js`;

    const loadPDF = async () => {
      const pdf = await getDocument(url).promise;
      const page = await pdf.getPage(1); // render first page only

      const viewport = page.getViewport({ scale: 1 });

      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d")!;
      canvas.width = viewport.width;
      canvas.height = viewport.height;

      inner.appendChild(canvas);

      await page.render({
        canvasContext: ctx,
        viewport,
      }).promise;
    };

    loadPDF();
  }, [url]);

  // ⭐ Apply zoom + rotation smoothly without re-rendering
  useEffect(() => {
    const inner = innerRef.current;
    if (!inner) return;

    inner.style.transformOrigin = "top left";
    inner.style.transform = `scale(${zoom}) rotate(${rotation}deg)`;
  }, [zoom, rotation]);

  return (
    <div
      ref={outerRef}
      className="w-full h-full overflow-auto bg-white p-4 rounded border cursor-grab"
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
    >
      <div ref={innerRef}></div>
    </div>
  );
}
