const rolePrefix = /^(?:(?:音乐总监(?:\s*[&＆/]\s*指挥)?|艺术总监|首席指挥|常任指挥|指挥|小提琴|中提琴|大提琴|钢琴|长笛|双簧管|单簧管|圆号|小号|二胡|古筝|琵琶|独奏|演奏|女高音|男高音|女中音|男中音|导聆)\s*[：:]\s*)+/i;
const latinLetter = /[A-Za-zÀ-ÖØ-öø-ÿĀ-ž]/;
const chineseCharacter = /[\u3400-\u9fff]/;

export function canonicalPersonName(value: string) {
  const variants = personNameVariants(value);
  return variants.find((variant) => chineseCharacter.test(variant) && !latinLetter.test(variant))
    ?? variants[0]
    ?? value.trim();
}

export function personNameVariants(value: string) {
  const raw = value.normalize("NFKC").replace(/\*\*/g, "").trim();
  const stripped = raw.replace(rolePrefix, "").trim();
  const variants = [stripped];
  const latinIndex = stripped.search(latinLetter);

  if (latinIndex > 0) {
    const chinese = stripped.slice(0, latinIndex).replace(/[\s/|｜,，;；·•—–-]+$/g, "").trim();
    const latin = stripped.slice(latinIndex).replace(/^[\s/|｜,，;；·•—–-]+/g, "").trim();
    if (chineseCharacter.test(chinese) && latin) variants.push(chinese, latin);
  }

  if (raw !== stripped) variants.push(raw);
  return Array.from(new Set(variants.filter(Boolean)));
}

export function normalizePersonIdentity(value: string) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("zh-CN")
    .replace(rolePrefix, "")
    .replace(/[·・•—–\-_|｜:：,，。.!！?？"'“”‘’《》【】()[\]（）\s]/g, "");
}

export function samePersonName(left: string, right: string) {
  const leftVariants = new Set(personNameVariants(left).map(normalizePersonIdentity).filter(Boolean));
  return personNameVariants(right).some((variant) => leftVariants.has(normalizePersonIdentity(variant)));
}

export function personNameAppearsInText(name: string, text: string) {
  const normalizedText = normalizePersonIdentity(text);
  return personNameVariants(name)
    .map(normalizePersonIdentity)
    .filter((variant) => variant.length >= 2)
    .some((variant) => normalizedText.includes(variant));
}

export function isEnsembleName(value: string) {
  return /(?:交响乐团|爱乐乐团|管弦乐团|室内乐团|民族乐团|合唱团|四重奏|三重奏|orchestra|philharmonic|ensemble|quartet|trio)/i.test(value);
}
