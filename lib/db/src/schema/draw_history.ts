import { pgTable, serial, text, integer, timestamp, date, index, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const drawHistoryTable = pgTable(
  "draw_history",
  {
    id: serial("id").primaryKey(),
    date: date("date", { mode: "string" }).notNull(),
    period: text("period").notNull(),
    result: text("result").notNull(),
    year: integer("year").notNull(),
    month: integer("month").notNull(),
    day: text("day").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("draw_history_date_idx").on(table.date),
    index("draw_history_year_month_idx").on(table.year, table.month),
    index("draw_history_result_idx").on(table.result),
    unique("draw_history_date_period_uniq").on(table.date, table.period),
  ]
);

export const insertDrawHistorySchema = createInsertSchema(drawHistoryTable).omit({
  id: true,
  createdAt: true,
});
export type InsertDrawHistory = z.infer<typeof insertDrawHistorySchema>;
export type DrawHistory = typeof drawHistoryTable.$inferSelect;
