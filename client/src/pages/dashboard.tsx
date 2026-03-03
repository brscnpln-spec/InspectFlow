import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ClipboardList,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Plus,
  ArrowRight,
} from "lucide-react";
import { Link } from "wouter";
import type { InspectionRequest } from "@shared/schema";
import { useAuth } from "@/lib/auth";
import { format } from "date-fns";

function StatCard({
  title,
  value,
  icon: Icon,
  accent,
}: {
  title: string;
  value: string | number;
  icon: any;
  accent?: string;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between gap-1">
          <div>
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold mt-1">{value}</p>
          </div>
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: accent || "#ffb800" }}
          >
            <Icon className="w-5 h-5 text-black" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    new: { label: "New", variant: "default" },
    scheduled: { label: "Scheduled", variant: "secondary" },
    closed: { label: "Closed", variant: "outline" },
    final_closed: { label: "Final Closed", variant: "secondary" },
    canceled: { label: "Canceled", variant: "destructive" },
  };
  const c = config[status] || { label: status, variant: "outline" };
  return <Badge variant={c.variant} data-testid={`badge-status-${status}`}>{c.label}</Badge>;
}

export { StatusBadge };

export default function DashboardPage() {
  const { user } = useAuth();

  const { data: inspections = [], isLoading } = useQuery<InspectionRequest[]>({
    queryKey: ["/api/inspections"],
  });

  const pendingCount = inspections.filter((i) => i.assignmentStatus === "pending").length;
  const scheduledCount = inspections.filter((i) => i.status === "scheduled").length;
  const closedCount = inspections.filter((i) => i.status === "closed" || i.status === "final_closed").length;
  const emergencyCount = inspections.filter((i) => i.isEmergency).length;

  const recentInspections = [...inspections]
    .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
    .slice(0, 5);

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardContent className="p-5">
                <Skeleton className="h-16 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Card>
          <CardContent className="p-5">
            <Skeleton className="h-48 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 overflow-auto h-full">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold">Welcome back, {user?.name}</h1>
          <p className="text-sm text-muted-foreground">
            Here's what's happening with your inspections
          </p>
        </div>
        {user?.role === "admin" && (
          <Link href="/inspections/new">
            <Button data-testid="button-new-inspection">
              <Plus className="w-4 h-4 mr-2" />
              New Inspection
            </Button>
          </Link>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Pending Approval" value={pendingCount} icon={ClipboardList} accent="#ffb800" />
        <StatCard title="Scheduled" value={scheduledCount} icon={Clock} accent="#f59e0b" />
        <StatCard title="Completed" value={closedCount} icon={CheckCircle2} accent="#22c55e" />
        <StatCard title="Emergency" value={emergencyCount} icon={AlertTriangle} accent="#ef4444" />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-1 pb-4">
          <h3 className="font-semibold">Recent Inspections</h3>
          <Link href="/inspections">
            <Button variant="ghost" size="sm" data-testid="button-view-all">
              View All
              <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          {recentInspections.length === 0 ? (
            <div className="text-center py-12">
              <ClipboardList className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
              <p className="text-muted-foreground">No inspections yet</p>
              {user?.role === "admin" && (
                <Link href="/inspections/new">
                  <Button variant="outline" size="sm" className="mt-3">
                    Create your first inspection
                  </Button>
                </Link>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {recentInspections.map((inspection) => (
                <Link
                  key={inspection.id}
                  href={`/inspections/${inspection.id}`}
                >
                  <div
                    className="flex items-center justify-between gap-4 p-3 rounded-md hover-elevate cursor-pointer border"
                    data-testid={`card-inspection-${inspection.id}`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium text-sm truncate">
                          {inspection.companyName}
                        </p>
                        {inspection.isEmergency && (
                          <Badge variant="destructive" className="text-[10px]">
                            Emergency
                          </Badge>
                        )}
                        {inspection.assignmentStatus === "pending" && (
                          <Badge variant="outline" className="text-[10px] border-[#ffb800] text-[#b38200]">
                            Pending Approval
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {inspection.contactPerson1}
                        {inspection.inspectionDate &&
                          ` · ${inspection.inspectionDate}`}
                      </p>
                    </div>
                    <StatusBadge status={inspection.status} />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
