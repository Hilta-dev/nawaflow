# Nawa

**Speak a sale. Nawa keeps the books.**

Nawa is a voice powered bookkeeping app for small shop owners and market vendors. The owner says or types a sale or a payment, reviews what the AI understood, confirms, and Nawa keeps track of who owes what, what is left in stock, and which customers to remind.

Live demo: https://nawa-9y6c.onrender.com

Hackathon: Meta Global AI Developer Hackathon, theme **Build for Your World**.

---

## The problem

Many small vendors in Namibia sell on credit and write debts in a notebook, or keep them in their heads. Debts are forgotten, stock is guessed, and reminders are never sent. Typing into a typical accounting app is slow and hard for someone who is serving customers all day.

Nawa lets the vendor simply speak: "Sold one power bank to Anna, paid 150." Nawa turns that into a proper record.

## What Nawa can do

**Record sales by voice or by typing**
- Record with the microphone, with a live timer and Clear and Cancel buttons.
- A typed box is always available as a fallback.
- Meta AI turns the sentence into a structured sale: customer, product, quantity, total and amount paid.
- If something is missing, the AI asks a short clarifying question instead of guessing.

**Review before saving**
- Nothing is saved until the owner confirms an editable review card.
- Saving is blocked for an empty or unknown customer name.
- Walk in (cash) sales are always fully paid.
- A duplicate sale warning helps avoid recording the same sale twice.

**Payments and debts**
- Say "Anna paid 30", "Anna paid half" or "Anna paid everything". Half and everything are calculated from the customer's real balance, not guessed by the AI.
- Customer names are matched to real customers, so a small mishearing such as "Jon" for "John" still finds the right person.
- Unknown names are refused. A customer who owes nothing cannot be paid.
- An overpayment records only the balance owed and shows a change message.
- One field in the database (`customers.balance_owed`) is the single source of truth for debts.

**Stock**
- A Stock page with products, unit, selling price, cost price, quantity and a low stock alert.
- On the sale review card, the spoken product is matched to the stock list. The price for one is shown and the total is filled in automatically, and recalculated when the quantity changes.
- A warning (not a block) appears when the quantity sold is more than what is in stock.
- When a sale is saved, the stock quantity goes down and never below zero.

**Customer contact and receipts**
- Namibian phone number validation, stored in the +264 format.
- A customer who owes money must have a phone number. Two customers cannot share the same number.
- WhatsApp, SMS and Call buttons with a ready written reminder that uses the shop name.
- After a sale, a receipt can be sent by WhatsApp or SMS, or copied. A receipt button is also on each card in Recent activity.

**Dashboard**
- Totals for sales, collected money and money owed.
- Who owes you money, with contact buttons.
- Recent activity with status chips (Settled or Still owes), "Paid at sale" and "Still unpaid" labels.

**Accounts**
- Each shop has its own account (Supabase auth) with full name, business name, optional phone number and business category. Currency is fixed to N$.

## How Meta AI is used

| Part of Nawa | Meta model | What it does |
|---|---|---|
| Realtime speech transcription | `muse-voice-transcribe-1.0` | The browser streams 24 kHz audio to our server over a WebSocket. The server proxies it to Meta and sends partial and final transcripts back live. |
| Understanding the sentence | `muse-spark-1.1` (default, can be changed with a setting) | Turns the transcript or typed text into structured actions (sale, payment) as JSON, with a clarifying question when information is missing. |

Design choices that go beyond a basic integration:
- **The AI never writes to the books on its own.** It proposes, the owner reviews and confirms.
- **The AI proposes, the database decides.** Customer matching, "paid half", overpayments and stock warnings use real records, so the AI cannot invent a number.
- **Clarifying questions.** When the sentence has no price or no customer, Nawa asks instead of guessing.
- **Keys stay on the server.** The browser never sees the Meta key, because transcription is proxied through our Express server.
- **Reliability.** Calls to Meta are retried, and a failure returns a clear message in JSON instead of a raw error.

**Mock mode.** For development without a key, the server has a local mock mode. It switches on only when no Meta key is set, and it returns fixed, made up replies. The deployed demo runs on the real Meta models, and the review card shows a green "Meta AI" badge for real answers.

## Tech stack

- Client: Vite and React (mobile first, green design)
- Server: Node.js and Express 5 with `ws`, which also serves the built React app, so there is one deployment
- Database and auth: Supabase (Postgres with row level security)
- AI: Meta Model API (Muse voice transcription and Muse Spark)
- Hosting: Render
- Built with the help of IBM Bob, a coding assistant in VS Code

## Built during the hackathon

The repository history starts on 28 October 2026, inside the hackathon window, and everything in this project was built during it.

| Dates | What was built |
|---|---|
| 28 to 29 Oct | Project skeleton, Supabase login and schema, microphone recorder |
| 2 Nov | Live transcription, AI parsing, saving, typed input, Dashboard |
| 3 Nov | Smart payments, name matching, phone validation, contact buttons, restyled mobile design, receipts |
| 4 Nov | Stock page, product matching and price filling, stock reduction, unique phone numbers, registration, recording bar and success banner |

## Known limits (honest list)

- The transcriber can mishear names. Nawa reduces the risk by matching names to real customers and always showing a review card.
- A sale with no paid amount in the sentence is treated as not yet paid, so the owner should check the Paid box on the review card.
- Product matching works on names. Very different wording, or a plural form, may show "Not in your stock list". The sale still saves.
- Nobody can check whether a number is on WhatsApp without the paid WhatsApp Business API, so Nawa checks the number format and offers WhatsApp, SMS and Call.
- Stock goes down when a sale is saved, but sales cannot yet be edited or undone.
- Not built yet: offline saving, multiple languages, asking Nawa questions by voice, expenses, a profit card, Dashboard grouping by day, an installable app (PWA).

## Next steps

- Expenses ("Spent 80 on transport") and a profit card (sold, spent, estimated profit).
- Stock in by voice ("I bought 20 chargers at 85 each") with a review step.
- Warnings for low stock and for selling below cost.
- Undo for the last sale, with debts and stock restored.
- Recent activity grouped by day (Today, Yesterday).
- Languages used in Namibia, and offline saving.
- An installable app for phones.

## Run it locally

1. Create a Supabase project and run `supabase/schema.sql` in the SQL Editor. Then add the cost price column:
   ```sql
   alter table products add column if not exists cost_price numeric(12,2);
   ```
2. Create `server/.env` with these settings (never commit it): `PORT`, `META_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. Optional: `META_MODEL`.
3. Create `client/.env` with your two `VITE_SUPABASE` settings (project URL and anon key).
4. Install and start the server:
   ```
   cd server
   npm install
   npm start
   ```
5. Install and start the client:
   ```
   cd client
   npm install
   npm run dev
   ```
6. Open http://localhost:5173

Without a Meta key the server runs in mock mode.

## Security

No keys are stored in this repository. The Meta key and the Supabase service role key are used only on the server, and `.env` files are ignored by git.

## Author

Hilta Iita, second year Computer Science student, Namibia University of Science and Technology (NUST).


