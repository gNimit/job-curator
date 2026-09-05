import { GoogleGenAI, Type } from '@google/genai';
import { config } from '../utils/config.js';
import { Logger } from '../utils/logger.js';

import { AIConnectionPool } from './pool.js';

export class AIClient {
  private static instance: GoogleGenAI | null = null;

  static isConfigured(): boolean {
    return Boolean(config.geminiApiKey && config.geminiApiKey.trim().length > 0);
  }

  static getClient(): GoogleGenAI {
    if (!this.instance) {
      if (!this.isConfigured()) {
        throw new Error(
          'GEMINI_API_KEY is not set. Please set it in your .env file or environment variable.'
        );
      }
      this.instance = new GoogleGenAI({ apiKey: config.geminiApiKey });
    }
    return this.instance;
  }

  /**
   * Structured JSON generation using Google GenAI SDK routed through AIConnectionPool.
   */
  static async generateStructuredJson<T>(
    prompt: string,
    schema: any,
    systemInstruction?: string,
    options?: { priority?: number; label?: string; model?: string }
  ): Promise<T> {
    const pool = AIConnectionPool.getInstance();

    return pool.execute(async () => {
      const ai = this.getClient();
      const primaryModel = options?.model || config.geminiModel;

      try {
        return await this.callModelWithSchema<T>(ai, primaryModel, prompt, schema, systemInstruction);
      } catch (err: any) {
        // If the primary model returned 404 (model deprecated/unavailable) and isn't gemini-3.7-flash, try fallback to gemini-3.7-flash
        if (err?.status === 404 && primaryModel !== 'gemini-3.7-flash') {
          Logger.warn(`Model ${primaryModel} returned 404. Falling back to gemini-3.7-flash...`);
          return await this.callModelWithSchema<T>(ai, 'gemini-3.7-flash', prompt, schema, systemInstruction);
        }
        throw err;
      }
    }, options?.priority ?? 0, options?.label);
  }

  private static async callModelWithSchema<T>(
    ai: GoogleGenAI,
    model: string,
    prompt: string,
    schema: any,
    systemInstruction?: string
  ): Promise<T> {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: schema,
        temperature: 0.1,
      },
    });

    const text = response.text;
    if (!text) {
      throw new Error('Gemini API returned an empty response');
    }

    try {
      return JSON.parse(text) as T;
    } catch (err: any) {
      // Clean up markdown code block wrapping if any
      const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      return JSON.parse(cleaned) as T;
    }
  }
}
