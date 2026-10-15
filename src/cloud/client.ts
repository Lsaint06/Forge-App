import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { sessionStorage } from "../platform/sessionStorage";
import { AppState } from "react-native";
import type { CloudTransport, CloudRecord } from "./sync";
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
let client: SupabaseClient | null = null;
export function cloudClient() {
  if (!url || !key) return null;
  if (!/^https:\/\//.test(url)) throw new Error("Supabase URL must use HTTPS");
  if (!client) {
    client = createClient(url, key, {
      auth: {
        storage: sessionStorage,
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
