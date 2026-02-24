import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  Minus,
  Users,
} from "lucide-react";
import type { NpsResponse, User } from "@shared/schema";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";

function classifyNps(score: number): "promoter" | "passive" | "detractor" {
  if (score >= 9) return "promoter";
  if (score >= 7) return "passive";
  return "detractor";
}

function calculateNps(scores: number[]): number {
  if (scores.length === 0) return 0;
  const promoters = scores.filter((s) => s >= 9).length;
  const detractors = scores.filter((s) => s <= 6).length;
  return Math.round(((promoters - detractors) / scores.length) * 100);
}

const NPS_COLORS = {
  promoter: "#22c55e",
  passive: "#f59e0b",
  detractor: "#ef4444",
};

export default function AnalyticsPage() {
  const { data: responses = [], isLoading: loadingResponses } = useQuery<NpsResponse[]>({
    queryKey: ["/api/nps/responses"],
  });

  const { data: members = [], isLoading: loadingMembers } = useQuery<User[]>({
    queryKey: ["/api/users/service-members"],
  });

  const isLoading = loadingResponses || loadingMembers;

  const reportScores = responses.map((r) => r.reportScore);
  const serviceScores = responses.filter((r) => r.serviceScore !== null).map((r) => r.serviceScore!);

  const globalReportNps = calculateNps(reportScores);
  const globalServiceNps = calculateNps(serviceScores);
  const totalResponses = responses.length;
  const responseRate = totalResponses > 0 ? Math.round((totalResponses / Math.max(totalResponses, 1)) * 100) : 0;

  const reportDistribution = Array.from({ length: 11 }, (_, i) => ({
    score: i,
    count: reportScores.filter((s) => s === i).length,
    fill: i >= 9 ? NPS_COLORS.promoter : i >= 7 ? NPS_COLORS.passive : NPS_COLORS.detractor,
  }));

  const serviceDistribution = Array.from({ length: 11 }, (_, i) => ({
    score: i,
    count: serviceScores.filter((s) => s === i).length,
    fill: i >= 9 ? NPS_COLORS.promoter : i >= 7 ? NPS_COLORS.passive : NPS_COLORS.detractor,
  }));

  const memberStats = members.map((m) => {
    const memberResponses = responses.filter((r) => r.serviceMemberId === m.id);
    const mReportScores = memberResponses.map((r) => r.reportScore);
    const mServiceScores = memberResponses.filter((r) => r.serviceScore !== null).map((r) => r.serviceScore!);
    return {
      name: m.name,
      reportNps: calculateNps(mReportScores),
      serviceNps: calculateNps(mServiceScores),
      responses: memberResponses.length,
    };
  }).filter((m) => m.responses > 0);

  const pieData = [
    { name: "Promoters", value: reportScores.filter((s) => s >= 9).length, color: NPS_COLORS.promoter },
    { name: "Passives", value: reportScores.filter((s) => s >= 7 && s <= 8).length, color: NPS_COLORS.passive },
    { name: "Detractors", value: reportScores.filter((s) => s <= 6).length, color: NPS_COLORS.detractor },
  ].filter((d) => d.value > 0);

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-10 w-48" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 overflow-auto h-full">
      <div className="flex items-center gap-2">
        <BarChart3 className="w-5 h-5 text-[#ffb800]" />
        <h1 className="text-xl font-bold">NPS Analytics</h1>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <NpsScoreCard label="Report NPS" score={globalReportNps} />
        <NpsScoreCard label="Service NPS" score={globalServiceNps} />
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Total Responses</p>
            <p className="text-2xl font-bold mt-1">{totalResponses}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Team Members</p>
            <p className="text-2xl font-bold mt-1">{members.length}</p>
          </CardContent>
        </Card>
      </div>

      {totalResponses === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <BarChart3 className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
            <p className="text-muted-foreground">No NPS data yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Survey responses will appear here once customers complete their feedback
            </p>
          </CardContent>
        </Card>
      ) : (
        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
            <TabsTrigger value="report" data-testid="tab-report">Report NPS</TabsTrigger>
            <TabsTrigger value="service" data-testid="tab-service">Service NPS</TabsTrigger>
            <TabsTrigger value="team" data-testid="tab-team">By Team Member</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-3">
                  <h3 className="font-semibold text-sm">NPS Distribution</h3>
                </CardHeader>
                <CardContent>
                  {pieData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={250}>
                      <PieChart>
                        <Pie
                          data={pieData}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={100}
                          dataKey="value"
                          label={({ name, value }) => `${name}: ${value}`}
                        >
                          {pieData.map((entry, idx) => (
                            <Cell key={idx} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className="text-center text-muted-foreground py-8">No data</p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <h3 className="font-semibold text-sm">Recent Responses</h3>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {responses.slice(0, 5).map((r) => (
                      <div key={r.id} className="flex items-center justify-between gap-2 p-2 rounded-md border">
                        <div>
                          <p className="text-xs text-muted-foreground">{r.respondentEmail}</p>
                          <div className="flex gap-2 mt-1 flex-wrap">
                            <Badge variant="outline" className="text-[10px]">Report: {r.reportScore}/10</Badge>
                            {r.serviceScore !== null && (
                              <Badge variant="outline" className="text-[10px]">Service: {r.serviceScore}/10</Badge>
                            )}
                          </div>
                        </div>
                        <NpsIndicator score={r.reportScore} />
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="report" className="mt-4">
            <Card>
              <CardHeader className="pb-3">
                <h3 className="font-semibold text-sm">Report Score Distribution (0-10)</h3>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={reportDistribution}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="score" />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                      {reportDistribution.map((entry, idx) => (
                        <Cell key={idx} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="service" className="mt-4">
            <Card>
              <CardHeader className="pb-3">
                <h3 className="font-semibold text-sm">Service Score Distribution (0-10)</h3>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={serviceDistribution}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="score" />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                      {serviceDistribution.map((entry, idx) => (
                        <Cell key={idx} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="team" className="mt-4">
            <div className="space-y-3">
              {memberStats.length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center">
                    <Users className="w-10 h-10 mx-auto text-muted-foreground/50 mb-2" />
                    <p className="text-muted-foreground">No team member data yet</p>
                  </CardContent>
                </Card>
              ) : (
                memberStats.map((stat) => (
                  <Card key={stat.name}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between gap-4 flex-wrap">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-[#ffb800] flex items-center justify-center text-sm font-bold text-black">
                            {stat.name.charAt(0)}
                          </div>
                          <div>
                            <h3 className="font-semibold text-sm">{stat.name}</h3>
                            <p className="text-xs text-muted-foreground">{stat.responses} responses</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4 flex-wrap">
                          <div className="text-center">
                            <p className="text-xs text-muted-foreground">Report NPS</p>
                            <p className="font-bold text-sm">{stat.reportNps}</p>
                          </div>
                          <div className="text-center">
                            <p className="text-xs text-muted-foreground">Service NPS</p>
                            <p className="font-bold text-sm">{stat.serviceNps}</p>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

function NpsScoreCard({ label, score }: { label: string; score: number }) {
  const Icon = score > 0 ? TrendingUp : score < 0 ? TrendingDown : Minus;
  const color = score > 0 ? "text-green-600" : score < 0 ? "text-red-600" : "text-muted-foreground";
  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-sm text-muted-foreground">{label}</p>
        <div className="flex items-center gap-2 mt-1">
          <p className={`text-2xl font-bold ${color}`}>{score}</p>
          <Icon className={`w-4 h-4 ${color}`} />
        </div>
      </CardContent>
    </Card>
  );
}

function NpsIndicator({ score }: { score: number }) {
  const type = classifyNps(score);
  const config = {
    promoter: { label: "Promoter", color: "bg-green-100 text-green-800" },
    passive: { label: "Passive", color: "bg-yellow-100 text-yellow-800" },
    detractor: { label: "Detractor", color: "bg-red-100 text-red-800" },
  };
  const c = config[type];
  return (
    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${c.color}`}>
      {c.label}
    </span>
  );
}
