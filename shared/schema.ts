import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, boolean, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const userRoleEnum = pgEnum("user_role", ["admin", "service_member"]);
export const inspectionStatusEnum = pgEnum("inspection_status", ["new", "scheduled", "closed", "final_closed", "canceled"]);

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  role: userRoleEnum("role").notNull().default("service_member"),
  assignedAdminId: varchar("assigned_admin_id"),
});

export const inspectionRequests = pgTable("inspection_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyName: text("company_name").notNull(),
  contactPerson1: text("contact_person_1").notNull(),
  contactPerson2: text("contact_person_2"),
  phone1: text("phone_1").notNull(),
  phone2: text("phone_2"),
  email1: text("email_1").notNull(),
  email2: text("email_2"),
  notes: text("notes"),
  status: inspectionStatusEnum("status").notNull().default("new"),
  assignedServiceMemberId: varchar("assigned_service_member_id"),
  assignedByAdminId: varchar("assigned_by_admin_id"),
  inspectionDate: text("inspection_date"),
  inspectionTime: text("inspection_time"),
  reportUrl: text("report_url"),
  completionNotes: text("completion_notes"),
  adminNotes: text("admin_notes"),
  isEmergency: boolean("is_emergency").default(false),
  recurringDays: integer("recurring_days"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const npsSurveys = pgTable("nps_surveys", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  inspectionId: varchar("inspection_id").notNull(),
  token: text("token").notNull().unique(),
  sentAt: timestamp("sent_at").defaultNow(),
  completedAt: timestamp("completed_at"),
  expiresAt: timestamp("expires_at").notNull(),
  triggeredBy: varchar("triggered_by"),
  isManual: boolean("is_manual").default(false),
});

export const npsResponses = pgTable("nps_responses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  surveyId: varchar("survey_id").notNull(),
  inspectionId: varchar("inspection_id").notNull(),
  serviceMemberId: varchar("service_member_id").notNull(),
  reportScore: integer("report_score").notNull(),
  serviceScore: integer("service_score"),
  comment: text("comment"),
  respondentEmail: text("respondent_email").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).omit({ id: true });
export const insertInspectionSchema = createInsertSchema(inspectionRequests).omit({ id: true, createdAt: true, updatedAt: true, status: true });
export const insertNpsSurveySchema = createInsertSchema(npsSurveys).omit({ id: true, sentAt: true, completedAt: true });
export const insertNpsResponseSchema = createInsertSchema(npsResponses).omit({ id: true, createdAt: true });

export const loginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type InspectionRequest = typeof inspectionRequests.$inferSelect;
export type InsertInspectionRequest = z.infer<typeof insertInspectionSchema>;
export type NpsSurvey = typeof npsSurveys.$inferSelect;
export type InsertNpsSurvey = z.infer<typeof insertNpsSurveySchema>;
export type NpsResponse = typeof npsResponses.$inferSelect;
export type InsertNpsResponse = z.infer<typeof insertNpsResponseSchema>;
