"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * Quiet editorial motion, adapted from interaction *patterns* referenced by:
 * Motion Primitives (InView/Magnetic), React Bits (Animated Content),
 * 60fps.design (gesture & state response).
 *
 * No external animation runtime, WebGL, overlays, or recreated source code.
 * Reduced-motion, touch interfaces, keyboard focus and navigation still work.
 */
export function AuraMotionEnhancer() {
  const pathname = usePathname();
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      return;
    }

    let observer: IntersectionObserver | undefined;
    const entrances = new Set<Animation>();
    const raf = window.requestAnimationFrame(() => {
      const targets = document.querySelectorAll<HTMLElement>(
        [
          ".home .hero-copy > .eyebrow",
          ".home .hero-copy > h2",
          ".home .hero-copy > p",
          ".home .hero-copy > .actions",
          ".home .collection-card",
          ".home .promotion",
          ".home .product-rail .product-card",
          ".home .a86-atelier-intro-inner",
          ".home .partner-intro > h2",
          ".shop .shop-title",
          ".shop .product-grid .product-card",
          ".detail .detail-top",
          ".detail .a85-detail-dock",
          ".detail .related",
          ".detail .gift-options .gift-option",
          "[data-atelier-entry]",
          ".a86-cart .a86-cart-item",
          ".checkout .cart-layout",
          ".mypage .saved-recipe",
          ".mypage .account-panel",
          ".auth-page .auth-form",
        ].join(","),
      );
      observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) {
              continue;
            }

            // Animation effects do not mutate attributes owned by a hydrating React tree.
            const target = entry.target as HTMLElement;
            const animation = target.animate(
              [
                { opacity: 0, transform: "translateY(15px)" },
                { opacity: 1, transform: "none" },
              ],
              { duration: 620, easing: "cubic-bezier(0.22, 0.78, 0.25, 1)" },
            );
            entrances.add(animation);
            animation.finished.then(
              () => entrances.delete(animation),
              () => entrances.delete(animation),
            );
            observer?.unobserve(target);
          }
        },
        { rootMargin: "0px 0px -35px 0px", threshold: 0.06 },
      );
      targets.forEach((el) => observer?.observe(el));
    });
    const stopEntrances = () => {
      window.cancelAnimationFrame(raf);
      observer?.disconnect();
      for (const animation of entrances) {
        animation.cancel();
      }

      entrances.clear();
    };
    const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    if (!finePointer) {
      return stopEntrances;
    }

    const magnets =
      ".home .hero-copy .button,.home .a86-atelier-intro .button,.detail .purchase-row .button,[data-atelier-blend]";
    let current: HTMLElement | null = null;
    let magnet: Animation | undefined;
    const move = (event: PointerEvent) => {
      const el = (event.target as HTMLElement)?.closest<HTMLElement>(magnets);
      if (current && current !== el) {
        magnet?.cancel();
      }

      current = el;
      if (!el) {
        return;
      }

      const box = el.getBoundingClientRect();
      const dx = (event.clientX - (box.left + box.width / 2)) / Math.max(1, box.width);
      const dy = (event.clientY - (box.top + box.height / 2)) / Math.max(1, box.height);
      const x = Math.max(-5, Math.min(5, dx * 8)).toFixed(2);
      const y = Math.max(-4, Math.min(4, dy * 6)).toFixed(2);
      magnet?.cancel();
      magnet = el.animate([{ translate: `${x}px ${y}px` }], { duration: 0, fill: "forwards" });
    };
    const out = (event: PointerEvent) => {
      const to = event.relatedTarget as Node | null;
      if (current && (!to || !current.contains(to))) {
        magnet?.cancel();
        current = null;
      }
    };
    document.addEventListener("pointermove", move, { passive: true });
    document.addEventListener("pointerout", out, { passive: true });
    return () => {
      stopEntrances();
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerout", out);
      magnet?.cancel();
    };
  }, [pathname]);
  return null;
}
