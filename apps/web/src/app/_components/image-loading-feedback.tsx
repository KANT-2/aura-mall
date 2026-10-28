"use client";

import { useEffect, useRef } from "react";
import styles from "@/app/_components/image-loading-feedback.module.css";

export function ImageLoadingFeedback() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) {
      return;
    }

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const pending = new Map<
      HTMLImageElement,
      {
        overlay: HTMLDivElement;
        blur: Animation;
        settling?: boolean;
        reveal?: Animation;
        fade?: Animation;
      }
    >();
    let frame = 0;

    function dispose(image: HTMLImageElement) {
      const entry = pending.get(image);
      if (!entry) {
        return;
      }

      entry.blur.cancel();
      entry.reveal?.cancel();
      entry.fade?.cancel();
      entry.overlay.remove();
      pending.delete(image);
      visibility.unobserve(image);
    }

    function finish(image: HTMLImageElement) {
      const entry = pending.get(image);
      if (!entry) {
        return;
      }

      if (!image.isConnected || !image.naturalWidth || reducedMotion.matches) {
        dispose(image);
        return;
      }

      if (entry.settling) {
        return;
      }

      entry.settling = true;
      const source = image.currentSrc;
      // Decode before revealing so pixels cannot appear halfway through the fade.
      void image
        .decode()
        .catch(() => {})
        .then(() => {
          if (pending.get(image) !== entry) {
            return;
          }

          if (!image.isConnected || !image.complete || image.currentSrc !== source) {
            dispose(image);
            track(image);
            return;
          }

          if (reducedMotion.matches) {
            dispose(image);
            return;
          }

          const blurred = getComputedStyle(image).filter;
          entry.blur.cancel();
          const clear = getComputedStyle(image).filter;
          entry.reveal = image.animate([{ filter: blurred }, { filter: clear }], {
            duration: 420,
            easing: "cubic-bezier(0.22, 1, 0.36, 1)",
            fill: "both",
          });
          entry.fade = entry.overlay.animate(
            [{ opacity: getComputedStyle(entry.overlay).opacity }, { opacity: 0 }],
            { duration: 280, easing: "ease-out", fill: "both" },
          );
          void entry.reveal.finished
            .then(() => {
              if (pending.get(image) === entry) {
                dispose(image);
              }
            })
            .catch(() => {});
        });
    }

    function position() {
      frame = 0;
      let visible = false;
      for (const [image, entry] of pending) {
        if (!image.isConnected || image.complete) {
          finish(image);
          if (!pending.has(image)) {
            continue;
          }
        }

        const box = image.getBoundingClientRect();
        let left = Math.max(0, box.left);
        let top = Math.max(0, box.top);
        let right = Math.min(window.innerWidth, box.right);
        let bottom = Math.min(window.innerHeight, box.bottom);
        let zIndex = 1;
        let hidden = getComputedStyle(image).visibility === "hidden";
        for (let parent = image.parentElement; parent; parent = parent.parentElement) {
          const css = getComputedStyle(parent);
          hidden ||= css.visibility === "hidden" || css.display === "none";
          zIndex = Math.max(zIndex, (Number.parseInt(css.zIndex, 10) || 0) + 1);
          if (css.overflowX !== "visible" || css.overflowY !== "visible") {
            const clip = parent.getBoundingClientRect();
            if (css.overflowX !== "visible") {
              left = Math.max(left, clip.left);
              right = Math.min(right, clip.right);
            }

            if (css.overflowY !== "visible") {
              top = Math.max(top, clip.top);
              bottom = Math.min(bottom, clip.bottom);
            }
          }
        }

        const width = right - left;
        const height = bottom - top;
        const show = !hidden && width > 4 && height > 4;
        entry.overlay.hidden = !show;
        if (!show) {
          continue;
        }

        visible = true;
        Object.assign(entry.overlay.style, {
          left: `${left}px`,
          top: `${top}px`,
          width: `${width}px`,
          height: `${height}px`,
          zIndex: String(zIndex),
          "--spinner-size": `${Math.min(28, width * 0.4, height * 0.4)}px`,
        });
      }

      if (visible) {
        frame = requestAnimationFrame(position);
      }
    }

    function schedule() {
      if (!frame) {
        frame = requestAnimationFrame(position);
      }
    }

    const visibility = new IntersectionObserver(schedule);

    function track(image: HTMLImageElement) {
      if (image.complete || !image.getAttribute("src")) {
        finish(image);
        return;
      }

      if (pending.has(image)) {
        if (pending.get(image)!.settling) {
          dispose(image);
        } else {
          pending.get(image)!.overlay.dataset.imageLoading = image.getAttribute("src") ?? "";
          schedule();
          return;
        }
      }

      const overlay = document.createElement("div");
      overlay.className = styles.overlay;
      overlay.dataset.imageLoading = image.getAttribute("src") ?? "";
      overlay.hidden = true;
      const spinner = document.createElement("span");
      spinner.className = styles.spinner;
      overlay.append(spinner);
      root!.append(overlay);

      // Animation effects preserve React's attributes and the image's existing filters.
      const filter = getComputedStyle(image).filter;
      const blurred = `${filter === "none" ? "" : filter} blur(8px)`;
      const blur = image.animate([{ filter: blurred }, { filter: blurred }], {
        duration: 1,
        fill: "both",
      });
      pending.set(image, { overlay, blur });
      visibility.observe(image);
      schedule();
    }

    const observer = new MutationObserver((records) => {
      for (const record of records) {
        if (root!.contains(record.target)) {
          continue;
        }

        if (record.type === "attributes" && record.target instanceof HTMLImageElement) {
          track(record.target);
        }

        for (const node of record.addedNodes) {
          if (node instanceof HTMLImageElement) {
            track(node);
          } else if (node instanceof Element) {
            node.querySelectorAll("img").forEach(track);
          }
        }
      }

      for (const image of pending.keys()) {
        if (!image.isConnected) {
          dispose(image);
        }
      }

      schedule();
    });
    const settled = (event: Event) => {
      if (event.target instanceof HTMLImageElement) {
        track(event.target);
      }
    };

    document.addEventListener("load", settled, true);
    document.addEventListener("error", settled, true);
    document.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["src", "srcset", "sizes"],
    });
    document.querySelectorAll("img").forEach(track);

    return () => {
      observer.disconnect();
      visibility.disconnect();
      document.removeEventListener("load", settled, true);
      document.removeEventListener("error", settled, true);
      document.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
      cancelAnimationFrame(frame);
      for (const image of pending.keys()) {
        dispose(image);
      }
    };
  }, []);

  return <div ref={rootRef} className={styles.root} aria-hidden="true" />;
}
