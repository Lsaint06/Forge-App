export async function downloadBackup(text: string) {
  const url = URL.createObjectURL(
    new Blob([text], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `forge-backup-${Date.now()}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function pickBackup(): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json,text/plain";
    input.style.display = "none";
    document.body.appendChild(input);
    input.addEventListener("cancel", () => {
      input.remove();
      resolve(null);
    });
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      input.remove();
      if (!file) return resolve(null);
      if (file.size > 50_000_000)
        return reject(new Error("Backup exceeds 50 MB"));
      void file.text().then(resolve, reject);
    });
    input.click();
  });
}
