import { storage } from "./storage";
import { hashPassword } from "./auth";
import crypto from "crypto";

/**
 * Read a seed password from the environment, or generate a random one.
 * Generated passwords are printed ONCE so the developer can set them.
 * Never falls back to a known default string so the repo stays credential-free.
 */
function resolveSeedPassword(envVar: string): string {
  const val = process.env[envVar]?.trim();
  if (val) return val;
  const generated = crypto.randomBytes(16).toString("hex");
  console.warn(`\n[seed] WARNING: ${envVar} is not set.`);
  console.warn(`[seed] Generated a random password: ${generated}`);
  console.warn(`[seed] Add ${envVar}=<password> to your environment to fix seed credentials.\n`);
  return generated;
}

export async function seedDatabase() {
  // Guard key uses the first admin username defined below.
  const existingAdmin = await storage.getUserByUsername("admin1");
  if (existingAdmin) return;

  const adminPassword = await hashPassword(resolveSeedPassword("SEED_ADMIN_PASSWORD"));
  const memberPassword = await hashPassword(resolveSeedPassword("SEED_MEMBER_PASSWORD"));

  // All names and emails below are entirely fictional.
  // Domain: example.com — reserved by RFC 2606, guaranteed not to belong to any real person or company.

  const admin1 = await storage.createUser({
    username: "admin1",
    password: adminPassword,
    name: "Alice Ingram",
    email: "alice.ingram@example.com",
    role: "admin",
    assignedAdminId: null,
  });

  const admin2 = await storage.createUser({
    username: "admin2",
    password: adminPassword,
    name: "Bob Marsh",
    email: "bob.marsh@example.com",
    role: "admin",
    assignedAdminId: null,
  });

  const memberNames1 = [
    { name: "Carl Novak",   username: "member1" },
    { name: "Dana Ellis",   username: "member2" },
    { name: "Evan Torres",  username: "member3" },
    { name: "Fiona Blake",  username: "member4" },
    { name: "Glen Harmon",  username: "member5" },
  ];

  const memberNames2 = [
    { name: "Hana Wolfe",   username: "member6" },
    { name: "Ivan Cross",   username: "member7" },
    { name: "Jana Reed",    username: "member8" },
    { name: "Kyle Stone",   username: "member9" },
    { name: "Lena Frost",   username: "member10" },
  ];

  const members: any[] = [];

  for (const m of memberNames1) {
    const member = await storage.createUser({
      username: m.username,
      password: memberPassword,
      name: m.name,
      email: `${m.username}@example.com`,
      role: "service_member",
      assignedAdminId: admin1.id,
    });
    members.push(member);
  }

  for (const m of memberNames2) {
    const member = await storage.createUser({
      username: m.username,
      password: memberPassword,
      name: m.name,
      email: `${m.username}@example.com`,
      role: "service_member",
      assignedAdminId: admin2.id,
    });
    members.push(member);
  }

  const companies = [
    { name: "Acme Industries",       contact1: "John Smith",      contact2: "Jane Doe",         phone1: "+1-555-0101", phone2: "+1-555-0102", email1: "john@acme.example.com",       email2: "jane@acme.example.com" },
    { name: "Global Tech Solutions",  contact1: "Michael Chen",    contact2: "Sarah Lee",        phone1: "+1-555-0201", phone2: "+1-555-0202", email1: "michael@globaltech.example.com", email2: "sarah@globaltech.example.com" },
    { name: "Petromax Corp",          contact1: "David Brown",     contact2: "Lisa Wang",        phone1: "+1-555-0301", phone2: "+1-555-0302", email1: "david@petromax.example.com",  email2: "lisa@petromax.example.com" },
    { name: "Nordic Engineering",     contact1: "Erik Larson",     contact2: "Anna Svensson",    phone1: "+46-555-0401", phone2: "+46-555-0402", email1: "erik@nordic.example.com",   email2: "anna@nordic.example.com" },
    { name: "Arabian Gas Works",      contact1: "Omar Al-Hassan",  contact2: "Fatima Al-Said",  phone1: "+971-555-0501", phone2: "+971-555-0502", email1: "omar@agw.example.com",     email2: "fatima@agw.example.com" },
  ];

  const inspections: Array<typeof companies[0] & { member: typeof members[0]; admin: typeof admin1; status: "new" | "scheduled" | "closed" | "final_closed"; date: string | null; time: string | null; recurring: number | null; emergency?: boolean }> = [
    { ...companies[0], member: members[0], admin: admin1, status: "scheduled",   date: "2026-03-05", time: "09:00", recurring: 45 },
    { ...companies[1], member: members[1], admin: admin1, status: "new",         date: null,         time: null,    recurring: 60 },
    { ...companies[2], member: members[2], admin: admin1, status: "closed",      date: "2026-02-20", time: "14:00", recurring: 45 },
    { ...companies[3], member: members[5], admin: admin2, status: "final_closed", date: "2026-02-15", time: "10:30", recurring: 60 },
    { ...companies[4], member: members[6], admin: admin2, status: "scheduled",   date: "2026-03-10", time: "11:00", recurring: null, emergency: true },
  ];

  for (const ins of inspections) {
    const inspection = await storage.createInspection({
      companyName: ins.name,
      contactPerson1: ins.contact1,
      contactPerson2: ins.contact2,
      phone1: ins.phone1,
      phone2: ins.phone2,
      email1: ins.email1,
      email2: ins.email2,
      notes: `Regular inspection for ${ins.name}`,
      status: ins.status,
      assignedServiceMemberId: ins.status !== "new" ? ins.member.id : null,
      assignedByAdminId: ins.admin.id,
      inspectionDate: ins.date,
      inspectionTime: ins.time,
      isEmergency: ins.emergency || false,
      recurringDays: ins.recurring,
      completionNotes: ins.status === "closed" || ins.status === "final_closed" ? "Inspection completed successfully. All parameters within acceptable range." : null,
      adminNotes: ins.status === "final_closed" ? "Reviewed and approved. Good work." : null,
    });

    if (ins.status === "final_closed") {
      const token = randomUUID();
      const survey = await storage.createNpsSurvey({
        inspectionId: inspection.id,
        token,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        triggeredBy: ins.admin.id,
        isManual: false,
      });

      await storage.createNpsResponse({
        surveyId: survey.id,
        inspectionId: inspection.id,
        serviceMemberId: ins.member.id,
        reportScore: 9,
        serviceScore: 8,
        comment: "Excellent inspection service. Very thorough and professional.",
        respondentEmail: ins.email1,
      });
    }
  }

  console.log("Database seeded successfully");
}

function randomUUID() {
  return crypto.randomUUID();
}
