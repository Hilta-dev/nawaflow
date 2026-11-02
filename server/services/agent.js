import { chatJSON, isMockMode } from './meta.js';

const SYSTEM_PROMPT = `You are a bookkeeping assistant for small informal traders in Africa.
When given a voice transcript of a sale, payment, or stock update, extract the structured data and return ONLY valid JSON with this shape:
{
  "actions": [ <one or more action objects> ],
  "clarifying_question": "<string or null>"
}

Action types:

record_sale — someone bought goods:
{ "type": "record_sale", "customer": "<name>", "items": [{ "product": "<name>", "qty": <number>, "unit": "<bags|bottles|kg|null>" }], "total": <number>, "paid": <number> }

record_payment — a customer paid off some or all of a debt:
{ "type": "record_payment", "customer": "<name>", "amount": <number> }
Examples that should produce record_payment: "Maria paid the 50 she owed", "John paid me 20", "Grace settled her debt of 100".

flag_low_stock — trader is running low on something:
{ "type": "flag_low_stock", "product": "<name>" }

ask_question — not enough information to act:
{ "type": "ask_question", "question": "<text>" }

Return ONLY the JSON object, no markdown fences, no explanation.`;

export async function parseTranscript(transcript) {
  const { text, source } = await chatJSON({ system: SYSTEM_PROMPT, user: transcript });

  //strip markdown fences the model sometimes adds
  const clean = text.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim();

  //if the model returned nothing useful, return a clear result
  if (!clean) {
    return { actions: [], clarifying_question: 'Could not understand that. Please try again.', source };
  }

  let parsed;
  try {
    parsed = JSON.parse(clean);
  } catch (err) {
    //model returned non-JSON — return gracefully
    return { actions: [], clarifying_question: 'Could not understand that. Please try again.', source };
  }

  return { ...parsed, source };
}
