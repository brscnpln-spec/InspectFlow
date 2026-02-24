import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ClipboardList } from "lucide-react";
import { Link } from "wouter";
import type { InspectionRequest } from "@shared/schema";
import { StatusBadge } from "./dashboard";

export default function MemberInspectionsPage() {
  const { data: inspections = [], isLoading } = useQuery<InspectionRequest[]>({
    queryKey: ["/api/inspections"],
  });

  const scheduled = inspections.filter((i) => i.status === "scheduled");
  const completed = inspections.filter((i) => i.status === "closed" || i.status === "final_closed");

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
