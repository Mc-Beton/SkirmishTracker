"use client";

// Web Push on this device: subscribe / unsubscribe and keep the server's copy in sync.
import { api } from "@/lib/api";

export type PushState = "unsupported" | "no-worker" | "denied" | "off" | "on";

export function pushSupported(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

function keyBytes(b64url: string): Uint8Array<ArrayBuffer> {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(b64url.length / 4) * 4, "=");
  const raw = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function sameKey(sub: PushSubscription, publicKey: string): boolean {
  const current = sub.options?.applicationServerKey;
  if (!current) return true;
  const a = new Uint8Array(current);
  const b = keyBytes(publicKey);
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/** The worker is registered in production builds only (see ServiceWorkerRegistration). */
async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!pushSupported()) return null;
  return (await navigator.serviceWorker.getRegistration("/")) ?? null;
}

export async function pushState(): Promise<PushState> {
  if (!pushSupported()) return "unsupported";
  const reg = await registration();
  if (!reg) return "no-worker";
  if (Notification.permission === "denied") return "denied";
  const sub = await reg.pushManager.getSubscription();
  return sub && Notification.permission === "granted" ? "on" : "off";
}

/** Asks for permission, subscribes this device and registers it for the signed-in user. */
export async function enablePush(): Promise<PushState> {
  const reg = await registration();
  if (!reg) return pushSupported() ? "no-worker" : "unsupported";
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission === "denied" ? "denied" : "off";
  const { publicKey } = await api<{ publicKey: string }>("GET", "/api/push/key");
  let sub = await reg.pushManager.getSubscription();
  if (sub && !sameKey(sub, publicKey)) {
    await sub.unsubscribe();
    sub = null;
  }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
  await api("POST", "/api/push/subscriptions", sub.toJSON());
  return "on";
}

/** Removes this device (server and browser). Called on sign-out, so the next person does not get these pushes. */
export async function disablePush(): Promise<void> {
  const reg = await registration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await api("DELETE", "/api/push/subscriptions", { endpoint: sub.endpoint }).catch(() => undefined);
  await sub.unsubscribe().catch(() => false);
}

/** After sign-in / on start: re-send an existing subscription so it belongs to the current user. */
export async function syncPush(): Promise<void> {
  if (!pushSupported() || Notification.permission !== "granted") return;
  const reg = await registration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await api("POST", "/api/push/subscriptions", sub.toJSON()).catch(() => undefined);
}

export async function testPush(): Promise<void> {
  await api("POST", "/api/push/test");
}
