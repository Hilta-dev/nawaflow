import { chatJSON, isMockMode } from './meta.js';

const SYSTEM_PROMPT = `You are a bookkeeping assistant for small informal traders in Africa.
When given a voice transcript of a sale or stock update, extract the structured data and return ONLY valid JSON with this shape:
{
  "actions": [
    {
      "type": "record_sale",
      "customer": "<name>",
      "items": [{ "product": "<name>", "qty": <number>, "unit": "<bags|bottles|kg|null>" }],
      "total": <number>,
      "paid": <number>
    }
  ],
  "clarifying_question": "<string or null>"
}
Possible action types: record_sale, flag_low_stock, ask_question.
For flag_low_stock include: { "type": "flag_low_stock", "product": "<name>" }.
Return ONLY the JSON object, no markdown fences, no explanation.`;

export async function parseTranscript(transcript) {
  const { text, source } = await chatJSON({ system: SYSTEM_PROMPT, user: transcript });

  //strip markdown fences the model sometimes adds
  const clean = text.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim();

  //if the model returned nothing useful, return a clear no-sale result
  if (!clean) {
    return { actions: [], clarifying_question: 'No sale found in that recording.', source };
  }

  let parsed;
  try {
    parsed = JSON.parse(clean);
  } catch (err) {
    //model returned non-JSON — treat as no-sale rather than crashing
    return { actions: [], clarifying_question: 'No sale found in that recording.', source };
  }

  return { ...parsed, source };
}
