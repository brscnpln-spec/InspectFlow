import { eq, and } from "drizzle-orm";
import { db } from "./db";
import {
  users,
  inspectionRequests,
  npsSurveys,
  npsResponses,
  type User,
  type InsertUser,
  type InspectionRequest,
  type InsertInspectionRequest,
  type NpsSurvey,
  type InsertNpsSurvey,
  type NpsResponse,
  type InsertNpsResponse,
} from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  getServiceMembers(): Promise<User[]>;
  getServiceMembersByAdmin(adminId: string): Promise<User[]>;

  getInspections(): Promise<InspectionRequest[]>;
  getInspectionsByServiceMember(memberId: string): Promise<InspectionRequest[]>;
  getInspection(id: string): Promise<InspectionRequest | undefined>;
  createInspection(data: Partial<InspectionRequest>): Promise<InspectionRequest>;
  updateInspection(id: string, data: Partial<InspectionRequest>): Promise<InspectionRequest | undefined>;

  createNpsSurvey(data: InsertNpsSurvey): Promise<NpsSurvey>;
  getNpsSurveyByToken(token: string): Promise<NpsSurvey | undefined>;
  getNpsSurveyByInspection(inspectionId: string): Promise<NpsSurvey | undefined>;
  updateNpsSurvey(id: string, data: Partial<NpsSurvey>): Promise<void>;

  createNpsResponse(data: InsertNpsResponse): Promise<NpsResponse>;
  getNpsResponses(): Promise<NpsResponse[]>;
  getNpsResponsesByMember(memberId: string): Promise<NpsResponse[]>;
}

export class DatabaseStorage implements IStorage {
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

  async getServiceMembers(): Promise<User[]> {
    return db.select().from(users).where(eq(users.role, "service_member"));
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
}

export const storage = new DatabaseStorage();
