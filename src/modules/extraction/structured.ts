import { chatJSON } from "../../infra/llm.js";
import { env } from "../../config/env.js";
import type { ExtractedDocument, StructuredExtractionSchema, StructuredExtractionResult } from "../../core/types.js";

export async function extractStructured(
  doc: ExtractedDocument,
  schema?: StructuredExtractionSchema
): Promise<StructuredExtractionResult> {
  if (!schema) {
    return {
      url: doc.url,
      title: doc.title,
      markdown: doc.markdown,
      structured: {},
    };
  }

  const propertiesDesc = Object.entries(schema.properties)
    .map(([key, val]) => `  "${key}" (${val.type}): ${val.description ?? ""}`)
    .join("\n");

  const prompt = `Extract structured data from the following document according to this schema:

Schema:
${JSON.stringify(schema, null, 2)}

Properties to extract:
${propertiesDesc}

Document title: "${doc.title}"
Document URL: ${doc.url}

Document content:
${doc.markdown.slice(0, 8000)}

Return a JSON object with ONLY the properties defined in the schema. Use null for missing values. No extra fields.`;

  const result = await chatJSON<Record<string, unknown>>(prompt, {
    model: env.LLM_RESEARCH_MODEL,
    maxTokens: 2000,
    temperature: 0,
  });

  return {
    url: doc.url,
    title: doc.title,
    markdown: doc.markdown,
    structured: result,
  };
}
