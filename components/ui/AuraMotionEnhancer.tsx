"use client";

import {useEffect} from "react";
import {usePathname} from "next/navigation";

/**
 * Quiet editorial motion, adapted from interaction *patterns* referenced by:
 * Motion Primitives (InView/Magnetic), React Bits (Animated Content),
 * 60fps.design (gesture & state response).
 *
 * No external animation runtime, WebGL, overlays, or recreated source code.
 * Reduced-motion, touch interfaces, keyboard focus and navigation still work.
 */
export function AuraMotionEnhancer(){
  const pathname=usePathname();
  useEffect(()=>{
    const reduced=window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if(reduced)return;
    let observer:IntersectionObserver|undefined;
    const raf=window.requestAnimationFrame(()=>{
      const targets=document.querySelectorAll<HTMLElement>([
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
        ".a-v3.a-atelier .a-entry",
        ".a86-cart .a86-cart-item",
        ".checkout .cart-layout",
        ".mypage .saved-recipe",
        ".mypage .account-panel",
        ".auth-page .auth-form"
      ].join(","));
      observer=new IntersectionObserver((entries)=>{
        for(const entry of entries){
          if(!entry.isIntersecting)continue;
          const target=entry.target as HTMLElement;
          target.dataset.auraEnter="visible";
          observer?.unobserve(target);
        }
      },{rootMargin:"0px 0px -35px 0px",threshold:.06});
      targets.forEach((el,index)=>{
        el.dataset.auraEnter="pending";
        el.style.setProperty("--aura-delay",Math.min(index%4,3)*56+"ms");
        observer?.observe(el);
      });
    });
    const finePointer=window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    if(!finePointer)return ()=>{window.cancelAnimationFrame(raf);observer?.disconnect();};
    const magnets=".home .hero-copy .button,.home .a86-atelier-intro .button,.detail .purchase-row .button,.a-v3.a-atelier .a-blend-button";
    let current:HTMLElement|null=null;
    const move=(event:PointerEvent)=>{
      const el=(event.target as HTMLElement)?.closest<HTMLElement>(magnets);
      if(current&&current!==el){current.style.removeProperty("--aura-mx");current.style.removeProperty("--aura-my");}
      current=el;
      if(!el)return;
      const box=el.getBoundingClientRect();
      const dx=(event.clientX-(box.left+box.width/2))/Math.max(1,box.width);
      const dy=(event.clientY-(box.top+box.height/2))/Math.max(1,box.height);
      el.style.setProperty("--aura-mx",Math.max(-5,Math.min(5,dx*8)).toFixed(2)+"px");
      el.style.setProperty("--aura-my",Math.max(-4,Math.min(4,dy*6)).toFixed(2)+"px");
    };
    const out=(event:PointerEvent)=>{
      const to=event.relatedTarget as Node|null;
      if(current&&(!to||!current.contains(to))){
        current.style.removeProperty("--aura-mx");
        current.style.removeProperty("--aura-my");
        current=null;
      }
    };
    document.addEventListener("pointermove",move,{passive:true});
    document.addEventListener("pointerout",out,{passive:true});
    return()=>{
      window.cancelAnimationFrame(raf);
      observer?.disconnect();
      document.removeEventListener("pointermove",move);
      document.removeEventListener("pointerout",out);
      if(current){current.style.removeProperty("--aura-mx");current.style.removeProperty("--aura-my");}
    };
  },[pathname]);
  return null;
}
