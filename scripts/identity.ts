export function normalizeIdentity(value: string) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("zh-CN")
    .replace(/[·・•—–\-_|｜:：,，。.!！?？"'“”‘’《》【】()[\]（）\s]/g, "");
}
