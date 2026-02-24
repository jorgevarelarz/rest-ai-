import { GoogleGenAI, type Content } from "@google/genai";

export const config = {
  maxDuration: 60,
};

type GeneratePayload = {
  modelCandidates?: string[];
  systemInstruction?: string;
  temperature?: number;
  contents?: Content[];
};

const json = (res: any, status: number, body: unknown): void => {
  res.status(status).setHeader("Content-Type", "application/json; charset=utf-8").send(JSON.stringify(body));
};

const readKey = (): string => {
  const key = String(
    process.env.GEMINI_API_KEY ||
      process.env.VITE_GEMINI_API_KEY ||
      process.env.API_KEY ||
      ""
  ).trim();
  return key;
};

const isModelNotFoundError = (error: unknown): boolean => {
  const msg = error instanceof Error ? error.message : String(error);
  return msg.includes("NOT_FOUND") || msg.includes("is not found for API version");
};

const isQuotaError = (error: unknown): boolean => {
  const msg = error instanceof Error ? error.message : String(error);
  return msg.includes('"status":"RESOURCE_EXHAUSTED"') || msg.includes("quota") || msg.includes("429");
};

export default async function handler(req: any, res: any): Promise<void> {
  if (req.method !== "POST") {
    json(res, 405, { error: "method_not_allowed" });
    return;
  }

  const apiKey = readKey();
  if (!apiKey) {
    json(res, 500, { error: "gemini_api_key_missing" });
    return;
  }

  const payload = (req.body || {}) as GeneratePayload;
  const modelCandidates = Array.isArray(payload.modelCandidates) ? payload.modelCandidates : [];
  const uniqueModels = Array.from(new Set(modelCandidates.map((m) => String(m || "").trim()).filter(Boolean)));
  const fallbackModels = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"];
  const models = uniqueModels.length ? uniqueModels : fallbackModels;
  const contents = Array.isArray(payload.contents) ? payload.contents : [];

  if (!contents.length) {
    json(res, 400, { error: "contents_required" });
    return;
  }

  const ai = new GoogleGenAI({ apiKey });
  let lastError: unknown = null;

  for (const model of models) {
    try {
      const response = await ai.models.generateContent({
        model,
        config: {
          systemInstruction: String(payload.systemInstruction || ""),
          temperature: Number.isFinite(payload.temperature as number) ? Number(payload.temperature) : 0.3,
        },
        contents,
      });
      json(res, 200, { text: response.text || "", model });
      return;
    } catch (error) {
      lastError = error;
      if (!isModelNotFoundError(error) && !isQuotaError(error)) {
        break;
      }
    }
  }

  const message = lastError instanceof Error ? lastError.message : String(lastError || "generate_failed");
  json(res, 502, { error: "generate_failed", detail: message });
}
