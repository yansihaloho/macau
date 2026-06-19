import { pgTable, serial, text, integer, real, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const v4EngineStatsTable = pgTable(
  "v4_engine_stats",
  {
    id: serial("id").primaryKey(),
    engineName: text("engine_name").notNull(),
    period: text("period").notNull(),
    winCount: integer("win_count").notNull().default(0),
    lossCount: integer("loss_count").notNull().default(0),
    accuracy30: real("accuracy_30").notNull().default(0),
    accuracy100: real("accuracy_100").notNull().default(0),
    accuracy300: real("accuracy_300").notNull().default(0),
    accuracyGlobal: real("accuracy_global").notNull().default(0),
    currentWeight: real("current_weight").notNull().default(1.0),
    isActive: integer("is_active").notNull().default(1),
    consecutiveLosses: integer("consecutive_losses").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    index("v4_engine_stats_name_period_idx").on(table.engineName, table.period),
    index("v4_engine_stats_engine_idx").on(table.engineName),
  ]
);

export const insertV4EngineStatsSchema = createInsertSchema(v4EngineStatsTable).omit({ id: true });
export type InsertV4EngineStats = z.infer<typeof insertV4EngineStatsSchema>;
export type V4EngineStats = typeof v4EngineStatsTable.$inferSelect;
