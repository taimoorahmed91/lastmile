
import { GoogleGenAI } from "@google/genai";
import { TripAnalysis } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

/**
 * Robust JSON extraction helper.
 * Finds the first valid JSON object in a string, ignoring surrounding text or markdown.
 */
function extractJSON(text: string | undefined): any {
  if (!text) return null;

  const startIndex = text.indexOf('{');
  if (startIndex === -1) return null;

  let braceCount = 0;
  let endIndex = -1;
  for (let i = startIndex; i < text.length; i++) {
    if (text[i] === '{') {
      braceCount++;
    } else if (text[i] === '}') {
      braceCount--;
    }
    if (braceCount === 0) {
      endIndex = i;
      break;
    }
  }

  if (endIndex === -1) return null;

  const jsonString = text.substring(startIndex, endIndex + 1);
  try {
    return JSON.parse(jsonString);
  } catch (e) {
    console.error("Failed to parse extracted JSON string:", { jsonString, error: e });
    return null;
  }
}

/**
 * Stage 1: Fast Core Intel
 * Fetches ETAs and basic operational status using Google Maps grounding.
 */
export async function getCoreAnalysis(destination: string, userLat: number, userLng: number): Promise<Partial<TripAnalysis>> {
  const prompt = `
    Analyze a trip to "${destination}" from (${userLat}, ${userLng}) using the googleMaps tool.
    
    **CRITICAL**: Your entire response MUST be a single, valid JSON object. Do not include markdown, comments, or any text outside of the JSON structure.
    **CRITICAL**: Do NOT return 0 for "driveTimeMins" or "walkTimeMins". Provide a realistic estimate if a precise value is unavailable.
    **CRITICAL**: If the tools do not provide enough information, you MUST still return the complete JSON structure with reasonable default values for the missing fields. NEVER return an empty response.
    
    The JSON object MUST conform to this exact structure:
    {
      "destination": "Name of Place",
      "isOpenAtArrival": boolean,
      "closingTime": "HH:MM AM/PM",
      "nextOpeningTime": "HH:MM AM/PM",
      "driving": {
        "driveTimeMins": number,
        "trafficStatus": "Clear" | "Moderate" | "Heavy" | "Gridlock"
      },
      "walking": {
        "walkTimeMins": number
      }
    }
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: { 
        tools: [{ googleMaps: {} }],
        temperature: 0.0
      }
    });

    const responseText = response.text;
    if (!responseText || responseText.trim() === '') {
        console.error("Core Analysis Failure: Model returned an empty text response. Full response object:", JSON.stringify(response, null, 2));
        throw new Error("Invalid intelligence response format: Empty response from model.");
    }

    const parsed = extractJSON(responseText);
    if (!parsed) {
      console.error("Core Analysis Failure: Raw response did not contain valid JSON. Raw text:", responseText);
      throw new Error("Invalid intelligence response format.");
    }
    
    // Proactive fix for "unknown" traffic
    if (!parsed.driving.trafficStatus || parsed.driving.trafficStatus.toLowerCase() === "unknown") {
      parsed.driving.trafficStatus = "Moderate";
    }

    // Validate time values
    if (!parsed.driving?.driveTimeMins || !parsed.walking?.walkTimeMins) {
      console.error("Core Analysis Failure: Model returned invalid or zero time values.", { parsed });
      throw new Error("Invalid intelligence response: missing or zero time values.");
    }

    return parsed;
  } catch (err) {
    console.error("Core Service Error:", err);
    throw err;
  }
}

/**
 * Stage 2: Deep Context Intel
 * Fetches Weather via search and Parking via Maps in the background.
 */
export async function getDeepAnalysis(destination: string, userLat: number, userLng: number): Promise<Partial<TripAnalysis>> {
  const prompt = `
    Find deep details for "${destination}" at (${userLat}, ${userLng}) using googleSearch and googleMaps.
    
    **CRITICAL**: Your entire response MUST be a single, valid JSON object. Do not include markdown, comments, or any text outside of the JSON structure.
    **CRITICAL**: If the tools do not provide enough information, you MUST still return the complete JSON structure with reasonable default values for the missing fields. NEVER return an empty response.

    The JSON object MUST conform to this exact structure:
    {
      "driving": {
        "trafficTrend": "improving" | "stable" | "worsening",
        "parkingOptions": [
          { "name": "Exact Lot Name", "walkTimeMins": number, "entranceType": "Gate" | "Garage" | "Entrance" }
        ]
      },
      "walking": {
        "temperature": number, // The current temperature in Celsius at the destination.
        "weatherCondition": "String", // A brief, one-or-two-word description like 'Sunny', 'Light Rain', 'Cloudy'.
        "weatherAlert": "Short alert for severe conditions (e.g. 'Hail Warning') or null if none.",
        "isRecommended": boolean, // Based on weather, is walking a good idea?
        "recommendationReason": "Short reason for the recommendation (e.g. 'Heavy Rain', 'Pleasant Weather')."
      }
    }
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        tools: [{ googleMaps: {} }, { googleSearch: {} }],
        toolConfig: { retrievalConfig: { latLng: { latitude: userLat, longitude: userLng } } },
        temperature: 0.0
      }
    });
    
    const responseText = response.text;
    if (!responseText || responseText.trim() === '') {
        console.error("Deep Analysis Failure: Model returned an empty text response. Full response object:", JSON.stringify(response, null, 2));
        return { groundingSources: [] };
    }

    const parsed = extractJSON(responseText);
    if (!parsed) {
        console.error("Deep Analysis Failure: Raw response did not contain valid JSON. Raw text:", responseText);
        return { groundingSources: [] };
    }

    const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    const sources = groundingChunks.map((chunk: any) => {
      if (chunk.maps) return { title: chunk.maps.title || "Map", uri: chunk.maps.uri };
      if (chunk.web) return { title: chunk.web.title || "Web", uri: chunk.web.uri };
      return null;
    }).filter(Boolean);

    return { ...parsed, groundingSources: sources };
  } catch (err) {
    console.error("Deep Service Error:", err);
    return { groundingSources: [] };
  }
}