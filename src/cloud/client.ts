import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";
import { AppState } from "react-native";
import type { CloudTransport, CloudRecord } from "./sync";
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secureStorage = {
  async getItem(name: string) {
    const manifest = await SecureStore.getItemAsync(name);
    if (!manifest) return null;
    const { prefix, count } = JSON.parse(manifest) as {
      prefix: string;
      count: number;
    };
    const chunks = await Promise.all(
      Array.from({ length: count }, (_, i) =>
        SecureStore.getItemAsync(`${prefix}.${i}`),
      ),
    );
    return chunks.some((c) => c == null) ? null : chunks.join("");
  },
  async setItem(name: string, value: string) {
    const old = await SecureStore.getItemAsync(name);
    const prefix = `${name}.${Date.now()}.${Math.random().toString(36).slice(2)}`;
    const count = Math.ceil(value.length / 1800);
    for (let i = 0; i < count; i++)
      await SecureStore.setItemAsync(
        `${prefix}.${i}`,
        value.slice(i * 1800, (i + 1) * 1800),
      );
    await SecureStore.setItemAsync(name, JSON.stringify({ prefix, count }));
    if (old) {
      const m = JSON.parse(old) as { prefix: string; count: number };
      await Promise.all(
        Array.from({ length: m.count }, (_, i) =>
          SecureStore.deleteItemAsync(`${m.prefix}.${i}`),
        ),
      );
    }
  },
  async removeItem(name: string) {
    const old = await SecureStore.getItemAsync(name);
    await SecureStore.deleteItemAsync(name);
    if (old) {
      const m = JSON.parse(old) as { prefix: string; count: number };
      await Promise.all(
        Array.from({ length: m.count }, (_, i) =>
          SecureStore.deleteItemAsync(`${m.prefix}.${i}`),
        ),
      );
    }
  },
};
let client: SupabaseClient | null = null;
export function cloudClient() {
  if (!url || !key) return null;
  if (!/^https:\/\//.test(url)) throw new Error("Supabase URL must use HTTPS");
  if (!client) {
    client = createClient(url, key, {
      auth: {
        storage: secureStorage,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    });
    const created = client;
    AppState.addEventListener("change", (state) => {
      if (state === "active") created.auth.startAutoRefresh();
      else created.auth.stopAutoRefresh();
    });
  }
  return client;
}
export function transport(
  client: SupabaseClient,
  userId: string,
): CloudTransport {
  async function requireOwner() {
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    if (data.session?.user.id !== userId)
      throw new Error(
        "Authenticated account changed. Restart synchronization after logging in.",
      );
  }
  return {
    async list() {
      await requireOwner();
      const records: CloudRecord[] = [];
      for (let offset = 0; ; offset += 500) {
        const { data, error } = await client
          .from("forge_records")
          .select("id,kind,payload,revision,deleted")
          .order("id")
          .range(offset, offset + 499);
        if (error) throw error;
        await requireOwner();
        const page = data as CloudRecord[];
        records.push(...page);
        if (page.length < 500) break;
      }
      return records;
    },
    async write(op) {
      await requireOwner();
      const { data, error } = await client.rpc("forge_write", {
        record_id: op.id,
        record_kind: op.kind,
        record_payload: JSON.parse(op.payload) as unknown,
        base_revision: op.revision,
        is_deleted: !!op.deleted,
      });
      if (error) throw error;
      await requireOwner();
      const result = data as { revision?: number; conflict?: CloudRecord };
      if (result.conflict) return { conflict: result.conflict };
      if (typeof result.revision !== "number")
        throw new Error("Invalid synchronization response");
      return { revision: result.revision };
    },
  };
}
