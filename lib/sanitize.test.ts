import { describe, it, expect } from "vitest";
import { sanitizeFilePath, sanitizeCodeContent, MAX_CODE_LENGTH } from "./sanitize";

describe("sanitizeFilePath", () => {
  it("retorna null para path null ou undefined", () => {
    expect(sanitizeFilePath(null)).toBe(null);
    expect(sanitizeFilePath(undefined)).toBe(null);
  });

  it("retorna null para string vazia ou só espaços", () => {
    expect(sanitizeFilePath("")).toBe(null);
    expect(sanitizeFilePath("   ")).toBe(null);
  });

  it("rejeita path com .. (path traversal)", () => {
    expect(sanitizeFilePath("../etc/passwd")).toBe(null);
    expect(sanitizeFilePath("src/../secret")).toBe(null);
  });

  it("rejeita path com //", () => {
    expect(sanitizeFilePath("src//file.ts")).toBe(null);
  });

  it("rejeita caracteres inválidos", () => {
    expect(sanitizeFilePath("file<name>.ts")).toBe(null);
    expect(sanitizeFilePath("file:name.ts")).toBe(null);
    expect(sanitizeFilePath('file|name.ts')).toBe(null);
    expect(sanitizeFilePath("file?name.ts")).toBe(null);
    expect(sanitizeFilePath("file*name.ts")).toBe(null);
  });

  it("remove barra inicial e retorna path válido", () => {
    expect(sanitizeFilePath("/src/index.ts")).toBe("src/index.ts");
  });

  it("aceita path válido", () => {
    expect(sanitizeFilePath("src/components/Button.tsx")).toBe("src/components/Button.tsx");
    expect(sanitizeFilePath("package.json")).toBe("package.json");
  });

  it("retorna null se path exceder tamanho máximo", () => {
    const long = "a".repeat(513);
    expect(sanitizeFilePath(long)).toBe(null);
  });
});

describe("sanitizeCodeContent", () => {
  it("retorna string vazia para null ou undefined", () => {
    expect(sanitizeCodeContent(null)).toBe("");
    expect(sanitizeCodeContent(undefined)).toBe("");
  });

  it("retorna o conteúdo quando dentro do limite", () => {
    const content = "console.log('hello');";
    expect(sanitizeCodeContent(content)).toBe(content);
  });

  it("trunca conteúdo acima de MAX_CODE_LENGTH", () => {
    const long = "x".repeat(MAX_CODE_LENGTH + 100);
    const result = sanitizeCodeContent(long);
    expect(result.length).toBe(MAX_CODE_LENGTH);
    expect(result).toBe("x".repeat(MAX_CODE_LENGTH));
  });

  it("aceita conteúdo exatamente no limite", () => {
    const exact = "a".repeat(MAX_CODE_LENGTH);
    expect(sanitizeCodeContent(exact)).toBe(exact);
  });
});
