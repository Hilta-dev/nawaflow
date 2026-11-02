import { z } from 'zod';

//item part
const item = z.object({
  product: z.string().min(1),
  qty: z.number().positive(),
  unit: z.string().nullable().optional(),
});

//record sale part
const recordSale = z.object({
  type: z.literal('record_sale'),
  customer: z.string().nullable().optional(),
  items: z.array(item).min(1),
  total: z.number().nonnegative(),
  paid: z.number().nonnegative(),
});

//record payment part
const recordPayment = z.object({
  type: z.literal('record_payment'),
  customer: z.string().min(1),
  amount: z.number().positive(),
});

//add stock part
const addStock = z.object({
  type: z.literal('add_stock'),
  product: z.string().min(1),
  qty: z.number().positive(),
  unit: z.string().nullable().optional(),
});

//low stock part
const flagLowStock = z.object({
  type: z.literal('flag_low_stock'),
  product: z.string().min(1),
});

//reminder part
const setReminder = z.object({
  type: z.literal('set_reminder'),
  customer: z.string().min(1),
  message: z.string().min(1),
  due_date: z.string().nullable().optional(),
});

//question part
const askQuestion = z.object({
  type: z.literal('ask_question'),
  question: z.string().min(1),
});

export const actionSchema = z.discriminatedUnion('type', [
  recordSale,
  recordPayment,
  addStock,
  flagLowStock,
  setReminder,
  askQuestion,
]);

export const agentResultSchema = z.object({
  actions: z.array(actionSchema),
  clarifying_question: z.string().nullable().optional(),
});