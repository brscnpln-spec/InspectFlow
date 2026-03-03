import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Search, ClipboardList } from "lucide-react";
import { Link } from "wouter";
import type { InspectionRequest } from "@shared/schema";
import { StatusBadge } from "./dashboard";
import { useAuth } from "@/lib/auth";

export default function InspectionsPage() {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const { data: inspections = [], isLoading } = useQuery<InspectionRequest[]>({
    queryKey: ["/api/inspections"],
  });

  const filtered = inspections.filter((i) => {
    const matchSearch =
      i.companyName.toLowerCase().includes(search.toLowerCase()) ||
      i.contactPerson1.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || i.status === statusFilter;
    const matchType = !i.isEmergency;
    return matchSearch && matchStatus && matchType;
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-10 w-48" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 overflow-auto h-full">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-xl font-bold">Inspections</h1>
        {user?.role === "admin" && (
          <Link href="/inspections/new">
            <Button data-testid="button-create-inspection">
              <Plus className="w-4 h-4 mr-2" />
              New Inspection
            </Button>
          </Link>
        )}
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search inspections..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            data-testid="input-search-inspections"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]" data-testid="select-status-filter">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="new">New</SelectItem>
            <SelectItem value="scheduled">Scheduled</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
            <SelectItem value="final_closed">Final Closed</SelectItem>
            <SelectItem value="canceled">Canceled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <ClipboardList className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
            <p className="text-muted-foreground">
              {search || statusFilter !== "all"
                ? "No inspections match your filters"
                : "No inspections yet"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((inspection) => (
            <Link key={inspection.id} href={`/inspections/${inspection.id}`}>
              <Card
                className="cursor-pointer hover-elevate"
                data-testid={`card-inspection-${inspection.id}`}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-sm">
                          {inspection.companyName}
                        </h3>
                        {inspection.isEmergency && (
                          <Badge variant="destructive" className="text-[10px]">
                            Emergency
                          </Badge>
                        )}
                        {inspection.assignmentStatus === "pending" && (
                          <Badge variant="outline" className="text-[10px] border-[#ffb800] text-[#b38200]" data-testid={`badge-pending-${inspection.id}`}>
                            Pending Approval
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Contact: {inspection.contactPerson1}
                        {inspection.contactPerson2 && `, ${inspection.contactPerson2}`}
                      </p>
                      <div className="flex items-center gap-3 mt-2 flex-wrap">
                        {inspection.inspectionDate && (
                          <span className="text-xs text-muted-foreground">
                            {inspection.inspectionDate}
                            {inspection.inspectionTime && ` at ${inspection.inspectionTime}`}
                          </span>
                        )}
                        {inspection.notes && (
                          <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                            {inspection.notes}
                          </span>
                        )}
                      </div>
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
