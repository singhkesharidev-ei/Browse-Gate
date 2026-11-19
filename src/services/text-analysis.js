export function analyzeText(value = "") {
  const text = String(value);
  const words = text.trim().match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu) || [];
  const sentences = text.trim() ? (text.trim().match(/[^.!?。！？]+(?:[.!?。！？]+|$)/gu) || []).filter((part) => /[\p{L}\p{N}]/u.test(part)) : [];
  const paragraphs = text.split(/\r\n|\r|\n|\u2028|\u2029/).filter((line) => line.trim());
  return { words: words.length, characters: [...text].length, charactersNoSpaces: [...text].filter((character) => !/\s/u.test(character)).length, sentences: sentences.length, paragraphs: paragraphs.length, readingMinutes: words.length ? Math.max(1, Math.ceil(words.length / 200)) : 0 };
}
