import express from "express";
import path from "path";
import dotenv from "dotenv";
import { GoogleGenAI, Type } from "@google/genai";
import { createServer as createViteServer } from "vite";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// Initialize Gemini SDK lazily to avoid startup crashes if key is initially missing
let aiClient: GoogleGenAI | null = null;

function getGeminiClient(): GoogleGenAI {
  if (!aiClient) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error("GEMINI_API_KEY environment variable is required");
    }
    aiClient = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return aiClient;
}

// Healthy status check
app.get("/api/health", (req, res) => {
  res.json({ status: "healthy", time: new Date().toISOString() });
});

// Parsing Voice Transcript Endpoint
app.post("/api/parse-expenses", async (req, res) => {
  try {
    const { transcript, existingMembers, ownerName } = req.body;

    if (!transcript || typeof transcript !== "string") {
      res.status(400).json({ error: "Transcript is required and must be a string." });
      return;
    }

    const ai = getGeminiClient();

    const userDefinedName = ownerName && typeof ownerName === "string" ? ownerName : "Kaushik";

    const groupContext = existingMembers && Array.isArray(existingMembers) && existingMembers.length > 0
      ? `The current group members are: ${existingMembers.join(", ")}.`
      : "";

    const systemInstruction = `You are an expert financial voice parser that specializes in extracting shared expenses and group participants from spoken speech transcripts.
Your task is to carefully analyze the spoken text to identify names (which might be multi-national), currency amounts, and brief spending descriptions.
${groupContext}
PRONOUN RESOLUTION RULE: If the spoken transcript references 'I', 'me', 'my', 'myself', or 'we' (when referring to the speaker), map that spender or participant directly to the user name: "${userDefinedName}".
If the spoken text references names that sound highly similar to the current group members, map them to those exact names. Otherwise, do not hesitate to extract new names as necessary (supports beautiful multi-national names like Svetlana, Kaushik, Amadou, Hiroshi, etc.).
Extract all transactions (who spent what, how much, and on what if specified).
Additionally, identify all participants involved in the overall split. This includes everyone mentioned in the transcript, even if they didn't spend any money directly (e.g., "Alex spent 30 dollars on pizza and shared it with Julia" -> Julia spent 0 but is an active participant in this split; Alex, Julia are suggested participants. "Kaushik and Svetlana went for coffee and Kaushik paid 12" -> Kaushik paid 12, Svetlana paid 0, both are participants).
All currency amounts must be converted into simple numbers. If multiple currencies are mixed, parse the pure numerical amount under the assumption of a single uniform ledger currency.
If no specific transactions or expenses can be parsed from the voice, return an empty expenses array, but you may still suggest names if any were mentioned.`;

    const prompt = `Translate this spoken transcript into a structured expense ledger list:\n"${transcript}"`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            expenses: {
              type: Type.ARRAY,
              description: "Array of extracted expenditures",
              items: {
                type: Type.OBJECT,
                properties: {
                  name: {
                    type: Type.STRING,
                    description: "Proper capitalized name of the spender, matched to existing group members if highly similar",
                  },
                  amount: {
                    type: Type.NUMBER,
                    description: "Pure numeric value spent. Must be a positive decimal or integer",
                  },
                  description: {
                    type: Type.STRING,
                    description: "Extremely short 1-3 word description of what was purchased (e.g. 'Lunch', 'Bus ticket', 'Drinks', or 'Spent' if unspecified)",
                  },
                },
                required: ["name", "amount", "description"],
              },
            },
            suggestedParticipants: {
              type: Type.ARRAY,
              description: "List of all people participating in this ledger, including both spenders and non-spenders mentioned.",
              items: {
                type: Type.STRING,
              },
            },
          },
          required: ["expenses", "suggestedParticipants"],
        },
      },
    });

    const resultText = response.text;
    if (!resultText) {
      throw new Error("No text returned from Gemini API");
    }

    const parsedData = JSON.parse(resultText.trim());
    res.json(parsedData);
  } catch (err: any) {
    console.error("Error calling Gemini:", err);
    res.status(500).json({
      error: "Failed to parse spoken text using Gemini API.",
      details: err?.message || String(err),
    });
  }
});

// Configure Vite middleware or serve static product build assets
async function setupServer() {
  if (process.env.NODE_ENV !== "production") {
    console.log("Setting up Vite development server middleware...");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    console.log("Serving compiled production client assets...");
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server listening on status http://0.0.0.0:${PORT}`);
  });
}

setupServer().catch((err) => {
  console.error("Vite/Express initialization failed:", err);
  process.exit(1);
});
