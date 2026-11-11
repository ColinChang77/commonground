"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { ActivityItem } from "@/lib/realtime";

export type PresenceUser = { uid: string; name: string; avatar: string | null; focus: string | null };
type Status = "connecting" | "live" | "offline" | "disabled";
type Ctx = { status: Status; users: PresenceUser[]; live: ActivityItem[]; setFocus: (f: string | null) => void; selfId: string | null };

const RoomContext = createContext<Ctx>({ status: "disabled", users: [], live: [], setFocus: () => {}, selfId: null });
export const useRoom = () => useContext(RoomContext);

function focusFromPath(path: string): string {
  if (/\/tasks\/[^/]+$/.test(path)) return "Looking at a task";
  if (path.endsWith("/tasks")) return "Looking at the shared work";
  if (path.endsWith("/opportunities")) return "Browsing ways to help";
  if (path.endsWith("/discussion")) return "In the conversation";
  if (path.endsWith("/build")) return "On Website & app";
  if (path.endsWith("/updates") || path.endsWith("/contributors")) return "Looking at results";
  if (path.endsWith("/settings")) return "In settings";
  if (path.startsWith("/d/")) return "Reading this post";
  return "On the project home";
}

/**
 * One WebSocket per room (project or discussion). Presence and events come only from the realtime
 * service; when it's unreachable the UI says so instead of pretending.
 */
export function RoomProvider({ room, selfId, children }: { room: string; selfId: string | null; children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [status, setStatus] = useState<Status>(selfId ? "connecting" : "disabled");
  const [users, setUsers] = useState<PresenceUser[]>([]);
  const [live, setLive] = useState<ActivityItem[]>([]);
  const ws = useRef<WebSocket | null>(null);
  const focusOverride = useRef<string | null>(null);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sendFocus = useCallback(() => {
    const s = ws.current;
    if (s?.readyState === WebSocket.OPEN) s.send(JSON.stringify({ type: "focus", focus: focusOverride.current ?? focusFromPath(pathname) }));
  }, [pathname]);

  const setFocus = useCallback((f: string | null) => { focusOverride.current = f; sendFocus(); }, [sendFocus]);

  useEffect(() => { focusOverride.current = null; sendFocus(); }, [pathname, sendFocus]);

  useEffect(() => {
    if (!selfId) return;
    let stopped = false;
    let attempt = 0;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let ping: ReturnType<typeof setInterval> | null = null;
    const connect = async () => {
      if (stopped) return;
      setStatus("connecting");
      try {
        const res = await fetch(`/api/realtime/ticket?room=${encodeURIComponent(room)}`, { cache: "no-store" });
        if (res.status === 503) { setStatus("disabled"); return; }
        if (!res.ok) throw new Error(String(res.status));
        const { url } = (await res.json()) as { url: string };
        const sock = new WebSocket(url);
        ws.current = sock;
        sock.onopen = () => { attempt = 0; setStatus("live"); sendFocus(); ping = setInterval(() => sock.readyState === WebSocket.OPEN && sock.send('{"type":"ping"}'), 25_000); };
        sock.onmessage = (m) => {
          const msg = JSON.parse(String(m.data));
          if (msg.type === "presence") setUsers(msg.users);
          if (msg.type === "event") {
            const ev = msg.event;
            if (ev.kind === "activity") setLive((l) => (l.some((x) => x.id === ev.item.id) ? l : [ev.item, ...l].slice(0, 30)));
            // Re-render server components (task board, comments, counts) shortly after any change.
            if (refreshTimer.current) clearTimeout(refreshTimer.current);
            refreshTimer.current = setTimeout(() => router.refresh(), 350);
          }
        };
        sock.onclose = () => {
          if (ping) clearInterval(ping);
          setUsers([]);
          if (stopped) return;
          setStatus("offline");
          retry = setTimeout(connect, Math.min(15_000, 1000 * 2 ** attempt++));
        };
      } catch {
        if (stopped) return;
        setStatus("offline");
        retry = setTimeout(connect, Math.min(15_000, 1000 * 2 ** attempt++));
      }
    };
    connect();
    const onVisible = () => { if (document.visibilityState === "visible" && ws.current?.readyState !== WebSocket.OPEN && !stopped) { if (retry) clearTimeout(retry); connect(); } };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", onVisible);
      if (retry) clearTimeout(retry);
      if (ping) clearInterval(ping);
      ws.current?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reconnect only when the room/user changes
  }, [room, selfId]);

  return <RoomContext.Provider value={{ status, users, live, setFocus, selfId }}>{children}</RoomContext.Provider>;
}

/** Lets a page describe what the viewer is doing more precisely ("Working on “Design the poster”"). */
export function FocusLabel({ label }: { label: string }) {
  const { setFocus } = useRoom();
  useEffect(() => { setFocus(label); return () => setFocus(null); }, [label, setFocus]);
  return null;
}
