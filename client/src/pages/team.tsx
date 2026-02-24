import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, Mail, ClipboardList } from "lucide-react";
import type { User, InspectionRequest } from "@shared/schema";

export default function TeamPage() {
  const { data: members = [], isLoading } = useQuery<User[]>({
    queryKey: ["/api/users/service-members"],
  });

  const { data: inspections = [] } = useQuery<InspectionRequest[]>({
    queryKey: ["/api/inspections"],
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-10 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 overflow-auto h-full">
      <div className="flex items-center gap-2">
        <Users className="w-5 h-5 text-[#ffb800]" />
        <h1 className="text-xl font-bold">Service Team</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {members.map((member) => {
          const memberInspections = inspections.filter(
            (i) => i.assignedServiceMemberId === member.id
          );
          const activeCount = memberInspections.filter(
            (i) => i.status === "scheduled"
          ).length;
          const completedCount = memberInspections.filter(
            (i) => i.status === "closed" || i.status === "final_closed"
          ).length;

          return (
            <Card key={member.id} data-testid={`card-member-${member.id}`}>
              <CardContent className="p-5">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-[#ffb800] flex items-center justify-center text-sm font-bold text-black flex-shrink-0">
                    {member.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-sm">{member.name}</h3>
                    <div className="flex items-center gap-1 mt-0.5">
                      <Mail className="w-3 h-3 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground truncate">
                        {member.email}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-3 flex-wrap">
                      <div className="flex items-center gap-1">
                        <ClipboardList className="w-3 h-3 text-[#ffb800]" />
                        <span className="text-xs">{activeCount} active</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-muted-foreground">
                          {completedCount} completed
                        </span>
                      </div>
                      <Badge variant="secondary" className="text-[10px]">
                        {memberInspections.length} total
                      </Badge>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
