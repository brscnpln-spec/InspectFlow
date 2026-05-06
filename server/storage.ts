import { eq, and, lt, inArray, desc } from "drizzle-orm";
import { db } from "./db";
import {
  tenants,
  users,
  inspectionRequests,
  npsSurveys,
  npsResponses,
  inspectionReports,
  notifications,
  type Tenant,
  type InsertTenant,
  type User,
  type InsertUser,
  type InspectionRequest,
  type InsertInspectionRequest,
  type NpsSurvey,
  type InsertNpsSurvey,
  type NpsResponse,
  type InsertNpsResponse,
  type InspectionReport,
  type InsertInspectionReport,
  type Notification,
} from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  getTenants(): Promise<Tenant[]>;
  getTenantsByIds(ids: string[]): Promise<Tenant[]>;
  getTenant(id: string): Promise<Tenant | undefined>;
  createTenant(data: InsertTenant): Promise<Tenant>;
  updateTenant(id: string, data: Partial<Tenant>): Promise<Tenant | undefined>;
  deleteTenant(id: string): Promise<void>;

  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  getAllUsers(): Promise<User[]>;
  getServiceMembers(): Promise<User[]>;
  getServiceMembersByAdmin(adminId: string): Promise<User[]>;
  updateUser(id: string, data: Partial<User>): Promise<User | undefined>;
  deleteUser(id: string): Promise<void>;

  getInspections(): Promise<InspectionRequest[]>;
  getInspectionsByServiceMember(memberId: string): Promise<InspectionRequest[]>;
  getInspection(id: string): Promise<InspectionRequest | undefined>;
  createInspection(data: Partial<InspectionRequest>): Promise<InspectionRequest>;
  updateInspection(id: string, data: Partial<InspectionRequest>): Promise<InspectionRequest | undefined>;
  getPendingExpiredAssignments(): Promise<InspectionRequest[]>;
  getOverdueInspections(): Promise<InspectionRequest[]>;
  getScheduledInspectionsByDate(dateStr: string): Promise<InspectionRequest[]>;

  createNpsSurvey(data: InsertNpsSurvey): Promise<NpsSurvey>;
  getNpsSurveyByToken(token: string): Promise<NpsSurvey | undefined>;
  getNpsSurveyByInspection(inspectionId: string): Promise<NpsSurvey | undefined>;
  updateNpsSurvey(id: string, data: Partial<NpsSurvey>): Promise<void>;
  getExpiredUncompletedSurveys(): Promise<NpsSurvey[]>;

  createNpsResponse(data: InsertNpsResponse): Promise<NpsResponse>;
  getNpsResponses(): Promise<NpsResponse[]>;
  getNpsResponsesByMember(memberId: string): Promise<NpsResponse[]>;

  createInspectionReport(data: InsertInspectionReport): Promise<InspectionReport>;
  getReportsByInspection(inspectionId: string): Promise<InspectionReport[]>;
  getReportsByUploader(inspectionId: string, uploadedById: string): Promise<InspectionReport[]>;
  getReport(id: string): Promise<InspectionReport | undefined>;
  deleteReport(id: string): Promise<void>;

  getNotifications(): Promise<Notification[]>;
  getUnreadNotificationCount(): Promise<number>;
  createNotification(data: Partial<Notification>): Promise<Notification | null>;
  markNotificationRead(id: string): Promise<void>;
  markAllNotificationsRead(): Promise<void>;
  notificationExists(deduplicationKey: string): Promise<boolean>;
}

export class DatabaseStorage implements IStorage {
  async getTenants(): Promise<Tenant[]> {
    return db.select().from(tenants).orderBy(tenants.companyName);
  }

  async getTenantsByIds(ids: string[]): Promise<Tenant[]> {
    if (ids.length === 0) return [];
    return db.select().from(tenants).where(inArray(tenants.id, ids));
  }

  async getTenant(id: string): Promise<Tenant | undefined> {
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, id));
    return tenant;
  }

  async createTenant(data: InsertTenant): Promise<Tenant> {
    const [tenant] = await db.insert(tenants).values(data).returning();
    return tenant;
  }

  async updateTenant(id: string, data: Partial<Tenant>): Promise<Tenant | undefined> {
    const [tenant] = await db.update(tenants).set(data).where(eq(tenants.id, id)).returning();
    return tenant;
  }

  async deleteTenant(id: string): Promise<void> {
    await db.delete(tenants).where(eq(tenants.id, id));
  }

  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async getAllUsers(): Promise<User[]> {
    return db.select().from(users);
  }

  async getServiceMembers(): Promise<User[]> {
    return db.select().from(users).where(eq(users.role, "service_member"));
  }

  async updateUser(id: string, data: Partial<User>): Promise<User | undefined> {
    const [user] = await db.update(users).set(data).where(eq(users.id, id)).returning();
    return user;
  }

  async deleteUser(id: string): Promise<void> {
    await db.delete(users).where(eq(users.id, id));
  }

  async getServiceMembersByAdmin(adminId: string): Promise<User[]> {
    return db.select().from(users).where(
      and(eq(users.role, "service_member"), eq(users.assignedAdminId, adminId))
    );
  }

  async getInspections(): Promise<InspectionRequest[]> {
    return db.select().from(inspectionRequests).orderBy(inspectionRequests.createdAt);
  }

  async getInspectionsByServiceMember(memberId: string): Promise<InspectionRequest[]> {
    return db.select().from(inspectionRequests)
      .where(eq(inspectionRequests.assignedServiceMemberId, memberId))
      .orderBy(inspectionRequests.createdAt);
  }

  async getInspection(id: string): Promise<InspectionRequest | undefined> {
    const [inspection] = await db.select().from(inspectionRequests).where(eq(inspectionRequests.id, id));
    return inspection;
  }

  async createInspection(data: Partial<InspectionRequest>): Promise<InspectionRequest> {
    const [inspection] = await db.insert(inspectionRequests).values(data as any).returning();
    return inspection;
  }

  async updateInspection(id: string, data: Partial<InspectionRequest>): Promise<InspectionRequest | undefined> {
    const [inspection] = await db.update(inspectionRequests)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(inspectionRequests.id, id))
      .returning();
    return inspection;
  }

  async getPendingExpiredAssignments(): Promise<InspectionRequest[]> {
    return db.select().from(inspectionRequests).where(
      and(
        eq(inspectionRequests.assignmentStatus, "pending"),
        lt(inspectionRequests.assignmentExpiresAt, new Date())
      )
    );
  }

  async getOverdueInspections(): Promise<InspectionRequest[]> {
    const threeBizDaysAgo = new Date();
    let daysBack = 0;
    let counted = 0;
    while (counted < 3) {
      threeBizDaysAgo.setDate(threeBizDaysAgo.getDate() - 1);
      daysBack++;
      const dow = threeBizDaysAgo.getDay();
      if (dow !== 0 && dow !== 6) counted++;
    }
    const cutoffStr = `${threeBizDaysAgo.getFullYear()}-${String(threeBizDaysAgo.getMonth() + 1).padStart(2, "0")}-${String(threeBizDaysAgo.getDate()).padStart(2, "0")}`;

    const all = await db.select().from(inspectionRequests).where(
      eq(inspectionRequests.status, "scheduled")
    );
    return all.filter(i => i.inspectionDate && i.inspectionDate <= cutoffStr);
  }

  async getScheduledInspectionsByDate(dateStr: string): Promise<InspectionRequest[]> {
    const all = await db.select().from(inspectionRequests).where(
      eq(inspectionRequests.status, "scheduled")
    );
    return all.filter(i => i.inspectionDate === dateStr);
  }

  async createNpsSurvey(data: InsertNpsSurvey): Promise<NpsSurvey> {
    const [survey] = await db.insert(npsSurveys).values(data).returning();
    return survey;
  }

  async getNpsSurveyByToken(token: string): Promise<NpsSurvey | undefined> {
    const [survey] = await db.select().from(npsSurveys).where(eq(npsSurveys.token, token));
    return survey;
  }

  async getNpsSurveyByInspection(inspectionId: string): Promise<NpsSurvey | undefined> {
    const [survey] = await db.select().from(npsSurveys).where(eq(npsSurveys.inspectionId, inspectionId));
    return survey;
  }

  async updateNpsSurvey(id: string, data: Partial<NpsSurvey>): Promise<void> {
    await db.update(npsSurveys).set(data).where(eq(npsSurveys.id, id));
  }

  async getExpiredUncompletedSurveys(): Promise<NpsSurvey[]> {
    return db.select().from(npsSurveys).where(
      and(
        lt(npsSurveys.expiresAt, new Date()),
      )
    ).then(rows => rows.filter(s => !s.completedAt));
  }

  async createNpsResponse(data: InsertNpsResponse): Promise<NpsResponse> {
    const [response] = await db.insert(npsResponses).values(data).returning();
    return response;
  }

  async getNpsResponses(): Promise<NpsResponse[]> {
    return db.select().from(npsResponses).orderBy(npsResponses.createdAt);
  }

  async getNpsResponsesByMember(memberId: string): Promise<NpsResponse[]> {
    return db.select().from(npsResponses).where(eq(npsResponses.serviceMemberId, memberId));
  }

  async createInspectionReport(data: InsertInspectionReport): Promise<InspectionReport> {
    const [report] = await db.insert(inspectionReports).values(data).returning();
    return report;
  }

  async getReportsByInspection(inspectionId: string): Promise<InspectionReport[]> {
    return db.select().from(inspectionReports)
      .where(eq(inspectionReports.inspectionId, inspectionId))
      .orderBy(inspectionReports.uploadedAt);
  }

  async getReportsByUploader(inspectionId: string, uploadedById: string): Promise<InspectionReport[]> {
    return db.select().from(inspectionReports)
      .where(and(
        eq(inspectionReports.inspectionId, inspectionId),
        eq(inspectionReports.uploadedById, uploadedById)
      ))
      .orderBy(inspectionReports.uploadedAt);
  }

  async getReport(id: string): Promise<InspectionReport | undefined> {
    const [report] = await db.select().from(inspectionReports).where(eq(inspectionReports.id, id));
    return report;
  }

  async deleteReport(id: string): Promise<void> {
    await db.delete(inspectionReports).where(eq(inspectionReports.id, id));
  }

  async getNotifications(): Promise<Notification[]> {
    return db.select().from(notifications).orderBy(desc(notifications.createdAt));
  }

  async getUnreadNotificationCount(): Promise<number> {
    const rows = await db.select().from(notifications).where(eq(notifications.isRead, false));
    return rows.length;
  }

  async createNotification(data: Partial<Notification>): Promise<Notification | null> {
    if (data.deduplicationKey) {
      const exists = await this.notificationExists(data.deduplicationKey);
      if (exists) return null;
    }
    try {
      const [notif] = await db.insert(notifications).values(data as any).returning();
      return notif;
    } catch {
      return null;
    }
  }

  async markNotificationRead(id: string): Promise<void> {
    await db.update(notifications).set({ isRead: true, readAt: new Date() }).where(eq(notifications.id, id));
  }

  async markAllNotificationsRead(): Promise<void> {
    await db.update(notifications).set({ isRead: true, readAt: new Date() }).where(eq(notifications.isRead, false));
  }

  async notificationExists(deduplicationKey: string): Promise<boolean> {
    const [row] = await db.select({ id: notifications.id }).from(notifications).where(eq(notifications.deduplicationKey, deduplicationKey));
    return !!row;
  }
}

export const storage = new DatabaseStorage();
