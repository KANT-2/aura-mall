"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

const NotificationContext = createContext<((message: string) => void) | null>(null);
export function NotificationProvider({ children }: { children: ReactNode }) {
  const [message, notify] = useState("");
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => notify(""), 3200);
    return () => clearTimeout(timer);
  }, [message]);
  return (
    <NotificationContext value={notify}>
      {children}
      <div className={`toast ${message ? "visible" : ""}`} role="status">
        {message}
      </div>
    </NotificationContext>
  );
}
export function useNotify() {
  const notify = useContext(NotificationContext);
  if (!notify) throw new Error("NotificationProvider is required");
  return notify;
}
