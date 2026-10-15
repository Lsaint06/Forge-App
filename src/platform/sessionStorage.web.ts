// Browser sessions are scoped to this tab, rather than claiming native
// SecureStore security or keeping health-account tokens indefinitely.
export const sessionStorage = {
  async getItem(name: string) {
    return window.sessionStorage.getItem(name);
  },
  async setItem(name: string, value: string) {
    window.sessionStorage.setItem(name, value);
  },
  async removeItem(name: string) {
    window.sessionStorage.removeItem(name);
  },
};
