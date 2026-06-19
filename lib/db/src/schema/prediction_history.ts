import { pgTable, serial, text, integer, real, timestamp, date, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const predictionHistoryTable = pgTable(
  "prediction_history",
  {
    id: serial("id").primaryKey(),
    date: date("date", { mode: "string" }).notNull(),
    period: text("period").notNull(),
    prediction: text("prediction").notNull(),
    actualResult: text("actual_result"),
    matchedDigits: integer("matched_digits"),
    accuracy: real("accuracy"),
    status: text("status").notNull().default("pending"),
    engineBreakdown: text("engine_breakdown"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    index("prediction_history_date_idx").on(table.date),
    index("prediction_history_status_idx").on(table.status),
  ]
);

export const insertPredictionHistorySchema = createInsertSchema(predictionHistoryTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertPredictionHistory = z.infer<typeof insertPredictionHistorySchema>;
export type PredictionHistory = typeof predictionHistoryTable.$inferSelect;
