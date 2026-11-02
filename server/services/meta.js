//settings part
const BASE = process.env.META_API_BASE || 'https://api.meta.ai/v1';
const MODEL = process.env.META_MODEL || 'muse-spark-1.1';

export function isMockMode() {
  return !process.env.META_API_KEY;
}

//mock part: simple pattern matching, NOT real AI
function mockReply(transcript) {
  const t = transcript.trim();
  const actions = [];
  let question = null;

  if (/who owes|what did i sell|how much/i.test(t)) {
    actions.push({ type: 'ask_question', question: t });
  } else {
    const sale = t.match(
      /sold\s+(\d+(?:\.\d+)?)\s+(?:(bags?|bottles?|packs?|kg)\s+of\s+)?([a-z ]+?)\s+to\s+([a-z]+)/i
    );
    const paid = t.match(/paid\s+(?:me\s+)?(\d+(?:\.\d+)?)/i);
    const owes = t.match(/owe[sd]?\s+(?:me\s+)?(\d+(?:\.\d+)?)/i);

    if (sale) {
      if (!paid && !owes) {
        question = 'How much was the total, and how much did they pay?';
      } else {
        const paidAmount = paid ? Number(paid[1]) : 0;
        const owedAmount = owes ? Number(owes[1]) : 0;
        actions.push({
          type: 'record_sale',
          customer: sale[4],
          items: [{ product: sale[3].trim(), qty: Number(sale[1]), unit: sale[2] || null }],
          total: paidAmount + owedAmount,
          paid: paidAmount,
        });
      }
    }

    const low = t.match(/(?:out of|low on|running low on)\s+([a-z ]+)/i);
    if (low) actions.push({ type: 'flag_low_stock', product: low[1].trim() });

    if (actions.length === 0 && !question) {
      question = 'Who did you sell to, and how much was paid?';
    }
  }

  return JSON.stringify({ actions, clarifying_question: question });
}

//real part: calls the Meta Model API (check the official docs for the exact URL and model name)
async function realReply(system, user) {
  const res = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.META_API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  });
  if (!res.ok) {
    throw new Error(`Meta API error ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? '';
}

//one function the rest of the app uses
export async function chatJSON({ system, user }) {
  if (isMockMode()) {
    return { text: mockReply(user), source: 'mock' };
  }
  return { text: await realReply(system, user), source: 'meta' };
}