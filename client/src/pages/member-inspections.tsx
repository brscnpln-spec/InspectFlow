import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ClipboardList,
  Check,
  X,
  Loader2,
  Clock,
  AlertTriangle,
  Calendar,
  Building2,
} from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import type { InspectionRequest } from "@shared/schema";
import { StatusBadge } from "./dashboard";

function formatTimeRemaining(expiresAt: string | Date | null): string {
  if (!expiresAt) return "";
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return "Expired";
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  if (hours > 0) return `${hours}h ${mins}m remaining`;
  return `${mins}m remaining`;
}

export default function MemberInspectionsPage() {
  const { toast } = useToast();
  const { data: inspections = [], isLoading } = useQuery<InspectionRequest[]>({
    queryKey: ["/api/inspections"],
  });

  const pendingAssignments = inspections.filter(
    (i) => i.status === "scheduled" && i.assignmentStatus === "pending"
  );
  const scheduled = inspections.filter(
    (i) => i.status === "scheduled" && i.assignmentStatus === "accepted"
  );
  const completed = inspections.filter(
    (i) => i.status === "closed" || i.status === "final_closed"
  );

  const acceptMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("PATCH", `/api/inspections/${id}/accept-assignment`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inspections"] });
      toast({ title: "Inspection accepted" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("PATCH", `/api/inspections/${id}/reject-assignment`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inspections"] });
      toast({ title: "Inspection rejected" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-10 w-48" />
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 overflow-auto h-full">
      <h1 className="text-xl font-bold">My Inspections</h1>

      {inspections.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <ClipboardList className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
            <p className="text-muted-foreground">No inspections assigned to you yet</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {pendingAssignments.length > 0 && (
            <div>
              <h2 className="font-semibold text-sm mb-3 text-[#ffb800] uppercase tracking-wide flex items-center gap-1.5">
                <Clock className="w-4 h-4" />
                Pending Approval ({pendingAssignments.length})
              </h2>
              <div className="space-y-3">
                {pendingAssignments.map((inspection) => (
                  <Card
                    key={inspection.id}
                    className="border-[#ffb800] border-2 bg-[#ffb800]/5"
                    data-testid={`card-pending-${inspection.id}`}
                  >
                    <CardContent className="p-4">
                      <div className="space-y-3">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <h3 className="font-semibold text-sm">{inspection.companyName}</h3>
                              {inspection.isEmergency && (
                                <Badge variant="destructive" className="text-[10px]">
                                  <AlertTriangle className="w-3 h-3 mr-0.5" /> Emergency
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-1 mt-1">
                              <Building2 className="w-3 h-3 text-muted-foreground" />
                              <p className="text-xs text-muted-foreground">{inspection.contactPerson1}</p>
                            </div>
                            <div className="flex items-center gap-1 mt-0.5">
                              <Calendar className="w-3 h-3 text-muted-foreground" />
                              <p className="text-xs text-muted-foreground">
                                {inspection.inspectionDate}
                                {inspection.inspectionTime && ` at ${inspection.inspectionTime}`}
                              </p>
                            </div>
                            {inspection.notes && (
                              <p className="text-xs text-muted-foreground mt-1 italic">
                                {inspection.notes}
                              </p>
                            )}
                          </div>
                          <Badge variant="secondary" className="text-[10px] bg-[#ffb800]/20 text-[#b38200]">
                            <Clock className="w-3 h-3 mr-0.5" />
                            {formatTimeRemaining(inspection.assignmentExpiresAt)}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            className="flex-1 bg-green-600 hover:bg-green-700"
                            onClick={(e) => {
                              e.preventDefault();
                              acceptMutation.mutate(inspection.id);
                            }}
                            disabled={acceptMutation.isPending || rejectMutation.isPending}
                            data-testid={`button-accept-${inspection.id}`}
                          >
                            {acceptMutation.isPending ? (
                              <Loader2 className="w-4 h-4 animate-spin mr-1" />
                            ) : (
                              <Check className="w-4 h-4 mr-1" />
                            )}
                            Accept
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            className="flex-1"
                            onClick={(e) => {
                              e.preventDefault();
                              rejectMutation.mutate(inspection.id);
                            }}
                            disabled={acceptMutation.isPending || rejectMutation.isPending}
                            data-testid={`button-reject-${inspection.id}`}
                          >
                            {rejectMutation.isPending ? (
                              <Loader2 className="w-4 h-4 animate-spin mr-1" />
                            ) : (
                              <X className="w-4 h-4 mr-1" />
                            )}
                            Reject
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {scheduled.length > 0 && (
            <div>
              <h2 className="font-semibold text-sm mb-3 text-muted-foreground uppercase tracking-wide">
                Upcoming ({scheduled.length})
              </h2>
              <div className="space-y-3">
                {scheduled.map((inspection) => (
                  <Link key={inspection.id} href={`/inspections/${inspection.id}`}>
                    <Card className="cursor-pointer hover-elevate" data-testid={`card-scheduled-${inspection.id}`}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-sm">{inspection.companyName}</h3>
                            <p className="text-xs text-muted-foreground mt-1">
                              {inspection.contactPerson1}
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {inspection.inspectionDate}
                              {inspection.inspectionTime && ` at ${inspection.inspectionTime}`}
                            </p>
                          </div>
                          <StatusBadge status={inspection.status} />
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {completed.length > 0 && (
            <div>
              <h2 className="font-semibold text-sm mb-3 text-muted-foreground uppercase tracking-wide">
                Completed ({completed.length})
              </h2>
              <div className="space-y-3">
                {completed.map((inspection) => (
                  <Link key={inspection.id} href={`/inspections/${inspection.id}`}>
                    <Card className="cursor-pointer hover-elevate" data-testid={`card-completed-${inspection.id}`}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-sm">{inspection.companyName}</h3>
                            <p className="text-xs text-muted-foreground mt-1">
                              {inspection.contactPerson1}
                            </p>
                          </div>
                          <StatusBadge status={inspection.status} />
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
