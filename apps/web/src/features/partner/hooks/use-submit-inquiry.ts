"use client";
import { useMutation } from "@tanstack/react-query";
import { submitInquiry } from "@/features/partner/api/inquiries";
export function useSubmitInquiry() {
  return useMutation({ mutationFn: submitInquiry });
}
