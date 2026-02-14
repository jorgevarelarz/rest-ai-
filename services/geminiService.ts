import { GoogleGenAI, Content, Part } from "@google/genai";
import { BASE_SYSTEM_PROMPT } from '../constants';
import { AvailabilityStatus, ChatMessage, AssistantParsedResponse, ReservationState, ReservationContext } from '../types';
import { RestaurantRepository } from "./restaurants/repository";
import { RestaurantConfigRepository } from "./restaurants/configRepository";
import { MenuRepository } from "./menu/repository";
import { ReservationRepository } from "./reservations/repository";

type SuggestedAlternative = { date: string; time: string };

interface GenerateResponseParams {
  restaurant_id: string;
  history: ChatMessage[];
  lastUserMessage?: string;
  availabilityStatus: AvailabilityStatus;
  suggestedAlternatives?: SuggestedAlternative[];
  backendResult?: any;
  lockBackendAction?: boolean;
  apiKey: string;
  reservationState: ReservationState;
  reservationContext: ReservationContext;
}

export const generateResponse = async ({
  restaurant_id,
  history,
  lastUserMessage,
  availabilityStatus,
  suggestedAlternatives,
  backendResult,
  lockBackendAction,
  apiKey,
  reservationState,
  reservationContext
}: GenerateResponseParams): Promise<{ text: string; raw: string; parsedData: AssistantParsedResponse | null }> => {
  if (!apiKey) {
    throw new Error("API Key is missing.");
  }

  const ai = new GoogleGenAI({ apiKey });

  const restaurant = RestaurantRepository.getById(restaurant_id);
  if (!restaurant) {
    throw new Error("Restaurant not configured.");
  }
  if (restaurant.status !== "active") {
    throw new Error("Restaurant disabled.");
  }

  const config = RestaurantConfigRepository.get(restaurant_id);
  const menuCategories = MenuRepository.listCategories(restaurant_id);
  const menuItems = MenuRepository.listItems(restaurant_id);
  const activeReservations = ReservationRepository.getByPhone(restaurant_id, reservationContext.simulatedUserPhone);
  const now = new Date();
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const localNow = now.toLocaleString("es-ES", {
    timeZone,
    hour12: false,
  });
  const utcNow = now.toISOString();

  // Interpolate the prompt with restaurant config
  let systemInstruction = BASE_SYSTEM_PROMPT
    .replace(/{{RESTAURANTE}}/g, restaurant.name)
    .replace(/{{DIRECCION}}/g, config.address)
    .replace(/{{HORARIO}}/g, config.hours)
    .replace(/{{TELEFONO}}/g, config.phone)
    .replace(/{{TURNOS}}/g, config.shifts)
    .replace(/{{TERRAZA_BOOL}}/g, config.hasTerrace.toString())
    .replace(/{{TRONAS_BOOL}}/g, config.hasHighChair.toString())
    .replace(/{{MASCOTAS_BOOL}}/g, config.petsAllowed.toString())
    .replace(/{{GRACE_MIN}}/g, config.gracePeriodMin.toString())
    .replace(/{{NOSHOW_POLICY}}/g, config.noShowPolicy)
    .replace(/{{AVAILABILITY_STATUS}}/g, availabilityStatus)
    .replace(/{{HAS_ACTIVE_RESERVATION}}/g, (activeReservations.length > 0).toString())
    .replace(/{{ACTIVE_RESERVATION_COUNT}}/g, activeReservations.length.toString());

  // Append State Context
  const restaurantContext = `
RESTAURANT (tenant):
- restaurant_id: "${restaurant_id}"
- name: "${restaurant.name}"
- whatsapp_number_e164: "${restaurant.whatsapp_number_e164}"
client:
- phone: "${reservationContext.simulatedUserPhone}"
- active_reservations: ${JSON.stringify(activeReservations.map(r => ({ id: r.id, date: r.date, time: r.time, partySize: r.partySize, name: r.name, notes: r.notes ?? null })))}
`;

  const menuContext = `
MENU (solo de este restaurante):
${JSON.stringify({ categories: menuCategories, items: menuItems })}
`;

  const availabilityContext = `
CONTEXTO ACTUALIZADO (fuente de verdad):
availability:
- status: "${availabilityStatus}"
- suggested_alternatives: ${JSON.stringify(suggestedAlternatives ?? [])}
- reason: ${backendResult?.reason ? JSON.stringify(backendResult.reason) : "null"}
- normalized_time: ${backendResult?.normalized_time ? JSON.stringify(backendResult.normalized_time) : "null"}

REGLA:
- Si suggested_alternatives NO está vacío, úsalas tal cual (mismas fechas/horas) y NO inventes otras.
- Si normalized_time existe y es distinto a lo que pidió el usuario, pregunta confirmación usando normalized_time.
`;

  const backendContext = backendResult ? `
RESULTADO DEL BACKEND (ya ejecutado):
${JSON.stringify(backendResult)}

INSTRUCCIÓN:
- Responde al usuario usando este resultado.
- No generes ni solicites nuevas acciones.
- Si backendResult.data.time existe, usa esa hora como la hora final (no la inventes).
- Si backendResult.reason es "out_of_hours" o "turn_end", indica de forma breve el horario del local (hours y/o shifts) y ofrece intentar otra hora dentro de ese rango.
` : '';

  const backendLockContext = lockBackendAction ? `
REGLA ESTRICTA:
- backend_action.type DEBE ser "none" (no llames al backend de nuevo en este turno).
` : '';

  const runtimeTimeContext = `
TIEMPO ACTUAL (DINÁMICO):
- now_local: "${localNow}"
- now_utc: "${utcNow}"
- timezone: "${timeZone}"

REGLAS DE FECHA RELATIVA:
- "hoy" = fecha local de now_local.
- "mañana" = now_local + 1 día.
- "pasado mañana" = now_local + 2 días.
- Si el usuario usa fecha relativa, conviértela a YYYY-MM-DD usando este contexto temporal.
`;

  const stateContext = `
ESTADO ACTUAL:
- step: ${reservationState.step}
- date: ${reservationState.date ?? "unknown"}
- time: ${reservationState.time ?? "unknown"}
- party_size: ${reservationState.party_size ?? "unknown"}
- name: ${reservationState.name ?? "unknown"}
${reservationState.pendingAction ? `\npending_action:\n- type: ${reservationState.pendingAction.type}` : ''}

INSTRUCCIÓN:
Pregunta SOLO por el siguiente dato lógico según el step.
No repitas preguntas ya respondidas.
`;
  
  systemInstruction += runtimeTimeContext + restaurantContext + menuContext + availabilityContext + backendContext + backendLockContext + stateContext;

  // Convert internal message format to Gemini Content format
  // We only send text parts for this simple chat.
  const contents: Content[] = history.map((msg) => ({
    role: msg.role,
    parts: [{ text: msg.raw || msg.text }] as Part[],
  }));

  // If caller passed lastUserMessage separately, only append it if history doesn't already include it.
  if (lastUserMessage) {
    const last = history[history.length - 1];
    const lastText = last ? (last.raw || last.text) : null;
    const alreadyIncluded = last?.role === 'user' && lastText === lastUserMessage;
    if (!alreadyIncluded) {
      contents.push({
        role: 'user',
        parts: [{ text: lastUserMessage }] as Part[],
      });
    }
  }

  const preferredModel = ((import.meta as any)?.env?.VITE_GEMINI_MODEL as string | undefined)?.trim();
  const candidateModels = [
    preferredModel,
    "gemini-2.5-flash",
    "gemini-2.0-flash",
    "gemini-1.5-flash",
  ].filter((m): m is string => Boolean(m));
  const uniqueCandidateModels = Array.from(new Set(candidateModels));

  const isModelNotFoundError = (error: unknown): boolean => {
    if (!error) return false;
    const msg = error instanceof Error ? error.message : String(error);
    return msg.includes("NOT_FOUND") || msg.includes("is not found for API version");
  };

  const isQuotaError = (error: unknown): boolean => {
    if (!error) return false;
    const msg = error instanceof Error ? error.message : String(error);
    return msg.includes('"status":"RESOURCE_EXHAUSTED"') || msg.includes("quota") || msg.includes("429");
  };

  try {
    let response: { text?: string } | null = null;
    let lastError: unknown = null;

    for (const model of uniqueCandidateModels) {
      try {
        response = await ai.models.generateContent({
          model,
          config: {
            systemInstruction: systemInstruction,
            temperature: 0.3, // Lower creativity for operational reliability
          },
          contents: contents,
        });
        break;
      } catch (error) {
        lastError = error;
        if (!isModelNotFoundError(error) && !isQuotaError(error)) {
          throw error;
        }
      }
    }

    if (!response) {
      throw lastError ?? new Error("No model available for generateContent.");
    }

    const rawText = response.text || "";
    
    // Parse JSON from the response
    const jsonMatch = rawText.match(/```json\s*([\s\S]*?)\s*```/);
    let parsedData: AssistantParsedResponse | null = null;
    let cleanText = rawText;

    if (jsonMatch && jsonMatch[1]) {
      try {
        parsedData = JSON.parse(jsonMatch[1]);
        // Remove the JSON block from the text shown to user
        cleanText = rawText.replace(/```json[\s\S]*?```/, '').trim();
      } catch (e) {
        console.error("Failed to parse JSON from response", e);
      }
    } else {
        // Fallback: try to find just a block starting with { and ending with } at the end
        const fallbackMatch = rawText.match(/(\{[\s\S]*\})$/);
         if (fallbackMatch && fallbackMatch[1]) {
            try {
                parsedData = JSON.parse(fallbackMatch[1]);
                cleanText = rawText.replace(fallbackMatch[1], '').trim();
            } catch (e) {
                 console.error("Failed to parse fallback JSON", e);
            }
         }
    }

    return {
      text: cleanText,
      raw: rawText,
      parsedData
    };

  } catch (error) {
    console.error("Gemini API Error:", error);
    throw error;
  }
};
