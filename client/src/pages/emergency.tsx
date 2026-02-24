import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, AlertTriangle } from "lucide-react";
import { Link } from "wouter";
import type { InspectionRequest } from "@shared/schema";
import { StatusBadge } from "./dashboard";

export default function EmergencyPage() {
  const { data: inspections = [], isLoading } = useQuery<InspectionRequest[]>({
    queryKey: ["/api/inspections"],
  });

  const emergencies = inspections.filter((i) => i.isEmergency);

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-10 w-48" />
        {[1, 2].map((i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 overflow-auto h-full">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-destructive" />
          <h1 className="text-xl font-bold">Emergency Inspections</h1>
        </div>
        <Link href="/inspections/new">
          <Button data-testid="button-new-emergency">
            <Plus className="w-4 h-4 mr-2" />
            New Emergency
          </Button>
        </Link>
      </div>

      {emergencies.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <AlertTriangle className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
            <p className="text-muted-foreground">No emergency inspections</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {emergencies.map((inspection) => (
            <Link key={inspection.id} href={`/inspections/${inspection.id}`}>
              <Card className="cursor-pointer hover-elevate" data-testid={`card-emergency-${inspection.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-sm">{inspection.companyName}</h3>
                        <Badge variant="destructive" className="text-[10px]">Emergency</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {inspection.contactPerson1}
                        {inspection.inspectionDate && ` · ${inspection.inspectionDate}`}
                      </p>
                    </div>
                    <StatusBadge status={inspection.status} />
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
