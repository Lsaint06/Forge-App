import * as SecureStore from "expo-secure-store";
export const sessionStorage = {
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
