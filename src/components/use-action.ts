"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import type { ActionResult } from "@/lib/action";

/** Calls a server action, toasts the outcome, and refreshes server components on success. */
export function useAction() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  async function exec<T>(fn: () => Promise<ActionResult<T>>, opts: { success?: string; refresh?: boolean } = {}): Promise<ActionResult<T>> {
    setPending(true);
    try {
      const res = await fn();
      if (!res.ok) toast.error(res.error);
      else {
        const msg = opts.success ?? res.message;
        if (msg) toast.success(msg);
        if (opts.refresh !== false) router.refresh();
      }
      return res;
    } finally {
      setPending(false);
    }
  }
  return { exec, pending };
}
