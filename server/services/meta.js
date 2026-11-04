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
    // ── payment detection (check before sale to avoid overlap) ───────────────
    // "John paid 50", "Maria paid me 100", "Grace settled her debt", "Tom paid half"
    const payCustomer = t.match(/^([a-z]+)\s+(?:paid(?:\s+me)?|settled|cleared)/i);
    if (payCustomer) {
      const name = payCustomer[1];
      const exactAmt = t.match(/(?:paid(?:\s+me)?|settled|cleared)[^0-9]*?(\d+(?:\.\d+)?)/i);
      const isAll  = /settle[sd]?|cleared?|paid\s+(?:everything|it\s+all|all|(?:it\s+)?off|in\s+full|the\s+(?:full|rest|total|balance|debt))/i.test(t);
      const isHalf = /paid\s+half/i.test(t);
      if (isHalf) {
        actions.push({ type: 'record_payment', customer: name, amount: null, amount_mode: 'half' });
      } else if (isAll || (!exactAmt && /settled|cleared/i.test(t))) {
        actions.push({ type: 'record_payment', customer: name, amount: null, amount_mode: 'all' });
      } else if (exactAmt) {
        actions.push({ type: 'record_payment', customer: name, amount: Number(exactAmt[1]), amount_mode: 'exact' });
      } else {
        question = `How much did ${name} pay?`;
      }
    } else {
      // ── sale detection ─────────────────────────────────────────────────────
      // sale WITH customer: "sold N <unit> of <product> to <customer>"
      const saleWithCustomer = t.match(
        /sold\s+(\d+(?:\.\d+)?)\s+(?:(bags?|bottles?|packs?|kg)\s+of\s+)?([a-z ]+?)\s+to\s+([a-z]+)/i
      );
      // sale WITHOUT customer: "sold N <unit> of <product>" (no "to <name>")
      const saleNoCustomer = !saleWithCustomer && t.match(
        /sold\s+(\d+(?:\.\d+)?)\s+(?:(bags?|bottles?|packs?|kg)\s+of\s+)?([a-z ]+?)(?:\s+for\s+\d|\s+paid|\s+ow|$)/i
      );

      const paid   = t.match(/paid\s+(?:me\s+)?(\d+(?:\.\d+)?)/i);
      const forAmt = t.match(/for\s+(\d+(?:\.\d+)?)/i);
      const owes   = t.match(/owe[sd]?\s+(?:me\s+)?(\d+(?:\.\d+)?)/i);

      if (saleWithCustomer) {
        const sale = saleWithCustomer;
        if (!paid && !owes && !forAmt) {
          question = 'How much was the total, and how much did they pay?';
        } else {
          const paidAmount = paid   ? Number(paid[1])   : (forAmt ? Number(forAmt[1]) : 0);
          const owedAmount = owes   ? Number(owes[1])   : 0;
          actions.push({
            type:     'record_sale',
            customer: sale[4],
            items:    [{ product: sale[3].trim(), qty: Number(sale[1]), unit: sale[2] || null }],
            total:    paidAmount + owedAmount,
            paid:     paidAmount,
          });
        }
      } else if (saleNoCustomer) {
        const sale = saleNoCustomer;
        const paidAmount = paid   ? Number(paid[1])   : (forAmt ? Number(forAmt[1]) : 0);
        const owedAmount = owes   ? Number(owes[1])   : 0;
        if (!paidAmount && !owedAmount) {
          question = 'How much was the total, and how much did they pay?';
        } else {
          actions.push({
            type:     'record_sale',
            customer: null,
            items:    [{ product: sale[3].trim(), qty: Number(sale[1]), unit: sale[2] || null }],
            total:    paidAmount + owedAmount,
            paid:     paidAmount,
          });
          question = 'Who was the customer?';
        }
      }

      const low = t.match(/(?:out of|low on|running low on)\s+([a-z ]+)/i);
      if (low) actions.push({ type: 'flag_low_stock', product: low[1].trim() });
    }

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
    const body = await res.text();
    const err = new Error(`Meta API error ${res.status}`);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? '';
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Retry wrapper: up to 3 attempts with 1 s then 2 s delay.
// Retries on network errors (fetch throws) or 5xx responses.
// Throws immediately on 4xx.
async function realReplyWithRetry(system, user) {
  const delays = [1000, 2000];
  let lastErr;
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      return await realReply(system, user);
    } catch (err) {
      const status = err.status;
      // 4xx: wrong request, no point retrying
      if (status && status >= 400 && status < 500) {
        console.error('[meta] 4xx error status=%d — not retrying', status);
        throw err;
      }
      // Network error or 5xx: log and maybe retry
      console.error('[meta] attempt %d failed status=%s message=%s',
        attempt + 1, status ?? 'network', err.message);
      lastErr = err;
      if (attempt < delays.length) {
        await sleep(delays[attempt]);
      }
    }
  }
  throw lastErr;
}

//one function the rest of the app uses
export async function chatJSON({ system, user }) {
  if (isMockMode()) {
    return { text: mockReply(user), source: 'mock' };
  }
  return { text: await realReplyWithRetry(system, user), source: 'meta' };
}