import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import {
  BarChart3,
  ChevronsUpDown,
  Check,
  ExternalLink,
  MessageSquare,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  X,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";

type SingleResponse = {
  id: string;
  reportScore: number;
  serviceScore: number | null;
  comment: string | null;
  respondentEmail: string;
  createdAt: string | null;
};

type InspectionFeedback = {
  inspectionId: string;
  companyName: string;
  tenantId: string | null;
  memberId: string;
  memberName: string;
  inspectionDate: string | null;
  reportAvg: number;
  serviceAvg: number | null;
  responseCount: number;
  responses: SingleResponse[];
};

const PAGE_SIZE = 10;

function overallAvg(rows: InspectionFeedback[], field: "reportAvg" | "serviceAvg"): number | null {
  const vals = rows.flatMap((r) => {
    const v = r[field];
    return v !== null ? [v] : [];
  });
  if (vals.length === 0) return null;
  return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
}

function scoreColor(score: number | null): string {
  if (score === null) return "#d1d5db";
  if (score >= 8) return "#22c55e";
  if (score >= 6) return "#f59e0b";
  if (score >= 4) return "#f97316";
  return "#ef4444";
}

function scoreLabel(score: number | null): string {
  if (score === null) return "N/A";
  if (score >= 8) return "Excellent";
  if (score >= 6) return "Good";
  if (score >= 4) return "Fair";
  return "Poor";
}

function GaugeChart({ value, label }: { value: number | null; label: string }) {
  const score = value ?? 0;
  const noData = value === null;
  const color = scoreColor(value);

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: 180, height: 100 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={[
                { value: noData ? 10 : score },
                { value: noData ? 0 : 10 - score },
              ]}
              cx="50%"
              cy="100%"
              startAngle={180}
              endAngle={0}
              innerRadius={55}
              outerRadius={80}
              dataKey="value"
              strokeWidth={0}
              isAnimationActive
            >
              <Cell fill={noData ? "#e5e7eb" : color} />
              <Cell fill="#e5e7eb" />
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-x-0 flex flex-col items-center" style={{ bottom: 4 }}>
          <span className="text-2xl font-bold" style={{ color: noData ? "#9ca3af" : color }}>
            {noData ? "—" : score.toFixed(1)}
          </span>
          <span className="text-[10px] text-muted-foreground">/ 10</span>
        </div>
      </div>
      <p className="text-xs font-medium text-center">{label}</p>
      {!noData && (
        <span
          className="text-[10px] px-2 py-0.5 rounded-full font-medium"
          style={{ background: `${color}20`, color }}
        >
          {scoreLabel(value)}
        </span>
      )}
    </div>
  );
}

function GaugePair({ rows }: { rows: InspectionFeedback[] }) {
  const reportAvg = overallAvg(rows, "reportAvg");
  const serviceAvg = overallAvg(rows, "serviceAvg");
  const totalResponses = rows.reduce((s, r) => s + r.responseCount, 0);

  return (
    <Card>
      <CardContent className="pt-5 pb-4">
        <p className="text-xs text-muted-foreground text-center mb-4">
          Based on <strong>{rows.length}</strong> inspection{rows.length !== 1 ? "s" : ""}{" "}
          ({totalResponses} individual response{totalResponses !== 1 ? "s" : ""})
        </p>
        <div className="flex items-end justify-center gap-10 flex-wrap">
          <GaugeChart value={reportAvg} label="Report Quality" />
          <GaugeChart value={serviceAvg} label="Service Quality" />
        </div>
      </CardContent>
    </Card>
  );
}

function ScoreBadge({ score }: { score: number | null | undefined }) {
  if (score == null) return <span className="text-muted-foreground text-xs">—</span>;
  const color = scoreColor(score);
  return (
    <span
      className="inline-flex items-center justify-center text-xs font-bold rounded px-1.5 py-0.5 min-w-[2.4rem]"
      style={{ background: `${color}20`, color }}
    >
      {score.toFixed(1)}
    </span>
  );
}

type SortKey = "inspectionId" | "companyName" | "memberName" | "inspectionDate" | "reportAvg" | "serviceAvg" | "responseCount";

function FeedbackTable({
  rows,
  onDetail,
}: {
  rows: InspectionFeedback[];
  onDetail: (row: InspectionFeedback) => void;
}) {
  const [, setLocation] = useLocation();
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "inspectionDate",
    dir: "desc",
  });
  const [page, setPage] = useState(1);

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      let av: string | number | null = a[sort.key] ?? "";
      let bv: string | number | null = b[sort.key] ?? "";
      if (typeof av === "string") av = av.toLowerCase();
      if (typeof bv === "string") bv = bv.toLowerCase();
      if (av === bv) return 0;
      const cmp = av < bv ? -1 : 1;
      return sort.dir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [rows, sort.key, sort.dir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginated = sorted.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const toggleSort = (key: SortKey) => {
    setSort((prev) =>
      prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" }
    );
    setPage(1);
  };

  const SortIcon = ({ k }: { k: SortKey }) =>
    sort.key !== k ? (
      <ChevronUp className="w-3 h-3 opacity-20" />
    ) : sort.dir === "asc" ? (
      <ChevronUp className="w-3 h-3" />
    ) : (
      <ChevronDown className="w-3 h-3" />
    );

  const Th = ({ k, label }: { k: SortKey; label: string }) => (
    <th
      className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground whitespace-nowrap"
      onClick={() => toggleSort(k)}
    >
      <div className="flex items-center gap-1">
        {label}
        <SortIcon k={k} />
      </div>
    </th>
  );

  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center">
          <MessageSquare className="w-8 h-8 mx-auto text-muted-foreground/40 mb-2" />
          <p className="text-sm text-muted-foreground">No feedback data for this selection</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/30">
              <tr>
                <Th k="inspectionId" label="Inspection ID" />
                <Th k="companyName" label="Tenant" />
                <Th k="memberName" label="Team Member" />
                <Th k="inspectionDate" label="Date" />
                <Th k="reportAvg" label="Report Avg" />
                <Th k="serviceAvg" label="Service Avg" />
                <Th k="responseCount" label="Responses" />
                <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">
                  Feedbacks
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {paginated.map((row) => (
                <tr key={row.inspectionId} className="hover:bg-muted/20 transition-colors">
                  <td className="px-3 py-2.5">
                    <button
                      className="text-[#ffb800] hover:underline font-mono text-[11px] flex items-center gap-1"
                      onClick={() => setLocation(`/inspections/${row.inspectionId}`)}
                      data-testid={`link-inspection-${row.inspectionId}`}
                    >
                      {row.inspectionId.slice(0, 8)}…
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  </td>
                  <td className="px-3 py-2.5 text-sm">{row.companyName || "—"}</td>
                  <td className="px-3 py-2.5 text-sm">{row.memberName}</td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                    {row.inspectionDate
                      ? new Date(row.inspectionDate).toLocaleDateString("tr-TR")
                      : "—"}
                  </td>
                  <td className="px-3 py-2.5">
                    <ScoreBadge score={row.reportAvg} />
                  </td>
                  <td className="px-3 py-2.5">
                    {row.serviceAvg !== null ? (
                      <ScoreBadge score={row.serviceAvg} />
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-center text-muted-foreground">
                    {row.responseCount} / 2
                  </td>
                  <td className="px-3 py-2.5">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs gap-1"
                      onClick={() => onDetail(row)}
                      data-testid={`button-feedback-${row.inspectionId}`}
                    >
                      <MessageSquare className="w-3 h-3" />
                      View
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-t">
            <p className="text-xs text-muted-foreground">
              {rows.length} inspection{rows.length !== 1 ? "s" : ""} · Page {safePage} of {totalPages}
            </p>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={safePage === 1}
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </Button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                <Button
                  key={p}
                  variant={p === safePage ? "default" : "outline"}
                  size="sm"
                  className="h-7 w-7 p-0 text-xs"
                  onClick={() => setPage(p)}
                >
                  {p}
                </Button>
              ))}
              <Button
                variant="outline"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={safePage === totalPages}
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function FeedbackDetailModal({
  row,
  onClose,
}: {
  row: InspectionFeedback;
  onClose: () => void;
}) {
  const [, setLocation] = useLocation();

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Feedback Detail</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-1">
          <div className="text-xs text-muted-foreground space-y-0.5">
            <p><span className="font-medium text-foreground">Tenant:</span> {row.companyName || "—"}</p>
            <p><span className="font-medium text-foreground">Team Member:</span> {row.memberName}</p>
            {row.inspectionDate && (
              <p>
                <span className="font-medium text-foreground">Inspection Date:</span>{" "}
                {new Date(row.inspectionDate).toLocaleDateString("tr-TR")}
              </p>
            )}
          </div>

          {row.responseCount === 2 && (
            <div className="rounded-lg border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              2 responses received — inspection averages shown below.
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border p-3 text-center space-y-1">
              <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Report Quality</p>
              <p className="text-2xl font-bold" style={{ color: scoreColor(row.reportAvg) }}>
                {row.reportAvg.toFixed(1)}<span className="text-sm font-normal text-muted-foreground">/10</span>
              </p>
              <p className="text-[11px]" style={{ color: scoreColor(row.reportAvg) }}>
                {scoreLabel(row.reportAvg)}
              </p>
            </div>
            <div className="rounded-lg border p-3 text-center space-y-1">
              <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Service Quality</p>
              {row.serviceAvg !== null ? (
                <>
                  <p className="text-2xl font-bold" style={{ color: scoreColor(row.serviceAvg) }}>
                    {row.serviceAvg.toFixed(1)}<span className="text-sm font-normal text-muted-foreground">/10</span>
                  </p>
                  <p className="text-[11px]" style={{ color: scoreColor(row.serviceAvg) }}>
                    {scoreLabel(row.serviceAvg)}
                  </p>
                </>
              ) : (
                <p className="text-2xl font-bold text-muted-foreground mt-2">—</p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Individual Responses ({row.responseCount})
            </p>
            {row.responses.map((r, idx) => (
              <div key={r.id} className="rounded-lg border p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium">Contact {idx + 1}</span>
                  <span className="text-xs text-muted-foreground">{r.respondentEmail}</span>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <span
                    className="text-xs px-2 py-0.5 rounded font-medium"
                    style={{ background: `${scoreColor(r.reportScore)}20`, color: scoreColor(r.reportScore) }}
                  >
                    Report: {r.reportScore}/10
                  </span>
                  {r.serviceScore !== null && (
                    <span
                      className="text-xs px-2 py-0.5 rounded font-medium"
                      style={{ background: `${scoreColor(r.serviceScore)}20`, color: scoreColor(r.serviceScore) }}
                    >
                      Service: {r.serviceScore}/10
                    </span>
                  )}
                </div>
                {r.comment && (
                  <p className="text-xs text-muted-foreground italic">"{r.comment}"</p>
                )}
              </div>
            ))}
          </div>

          <Button
            variant="outline"
            size="sm"
            className="w-full gap-1.5"
            onClick={() => { setLocation(`/inspections/${row.inspectionId}`); onClose(); }}
          >
            <ExternalLink className="w-3.5 h-3.5" />
            View Inspection
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SearchableSelect({
  options,
  value,
  onChange,
  placeholder,
  searchPlaceholder,
}: {
  options: { value: string; label: string }[];
  value: string | null;
  onChange: (val: string | null) => void;
  placeholder: string;
  searchPlaceholder: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value) ?? null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full max-w-sm justify-between font-normal"
          data-testid="searchable-select-trigger"
        >
          <span className={cn(!selected && "text-muted-foreground")}>
            {selected ? selected.label : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>
            <CommandGroup>
              {value && (
                <CommandItem
                  value="__clear__"
                  onSelect={() => { onChange(null); setOpen(false); }}
                  className="text-muted-foreground text-xs"
                >
                  <X className="mr-2 h-3 w-3" />
                  Clear selection
                </CommandItem>
              )}
              {options.map((opt) => (
                <CommandItem
                  key={opt.value}
                  value={opt.label}
                  onSelect={() => { onChange(opt.value); setOpen(false); }}
                >
                  <Check className={cn("mr-2 h-4 w-4", value === opt.value ? "opacity-100" : "opacity-0")} />
                  {opt.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export default function AnalyticsPage() {
  const [detailRow, setDetailRow] = useState<InspectionFeedback | null>(null);
  const [selectedTenantKey, setSelectedTenantKey] = useState<string | null>(null);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);

  const { data: rows = [], isLoading } = useQuery<InspectionFeedback[]>({
    queryKey: ["/api/feedback"],
  });

  const tenantOptions = useMemo(() => {
    const seen = new Map<string, string>();
    rows.forEach((r) => {
      const key = r.tenantId ?? r.companyName;
      if (key && !seen.has(key)) seen.set(key, r.companyName || key);
    });
    return Array.from(seen.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [rows]);

  const memberOptions = useMemo(() => {
    const seen = new Map<string, string>();
    rows.forEach((r) => {
      if (!seen.has(r.memberId)) seen.set(r.memberId, r.memberName);
    });
    return Array.from(seen.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [rows]);

  const tenantRows = useMemo(
    () => (selectedTenantKey ? rows.filter((r) => (r.tenantId ?? r.companyName) === selectedTenantKey) : []),
    [rows, selectedTenantKey]
  );

  const memberRows = useMemo(
    () => (selectedMemberId ? rows.filter((r) => r.memberId === selectedMemberId) : []),
    [rows, selectedMemberId]
  );

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-44 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="p-6 overflow-auto h-full">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-[#ffb800]" />
          <h1 className="text-xl font-bold">Feedback Manager</h1>
          {rows.length > 0 && (
            <span className="ml-1 text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">
              {rows.length} inspection{rows.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        <Tabs defaultValue="general">
          <TabsList className="inline-flex w-auto">
            <TabsTrigger value="general" data-testid="tab-general">General</TabsTrigger>
            <TabsTrigger value="customer" data-testid="tab-customer">Customer</TabsTrigger>
            <TabsTrigger value="team" data-testid="tab-team">Team Member</TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="mt-5 space-y-4">
            {rows.length === 0 ? (
              <Card>
                <CardContent className="py-16 text-center">
                  <BarChart3 className="w-12 h-12 mx-auto text-muted-foreground/40 mb-3" />
                  <p className="text-muted-foreground">No feedback collected yet</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Feedback will appear here once customers complete their surveys
                  </p>
                </CardContent>
              </Card>
            ) : (
              <>
                <GaugePair rows={rows} />
                <div>
                  <p className="text-sm font-medium mb-3">All Inspections with Feedback</p>
                  <FeedbackTable rows={rows} onDetail={setDetailRow} />
                </div>
              </>
            )}
          </TabsContent>

          <TabsContent value="customer" className="mt-5 space-y-4">
            <div className="flex items-center gap-3 flex-wrap">
              <SearchableSelect
                options={tenantOptions}
                value={selectedTenantKey}
                onChange={setSelectedTenantKey}
                placeholder="Select a customer / tenant"
                searchPlaceholder="Search tenant..."
              />
              {selectedTenantKey && (
                <p className="text-xs text-muted-foreground">
                  {tenantRows.length} inspection{tenantRows.length !== 1 ? "s" : ""}
                </p>
              )}
            </div>

            {!selectedTenantKey ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <p className="text-sm text-muted-foreground">Select a customer above to view their feedback</p>
                </CardContent>
              </Card>
            ) : tenantRows.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <p className="text-sm text-muted-foreground">No feedback found for this customer</p>
                </CardContent>
              </Card>
            ) : (
              <>
                <GaugePair rows={tenantRows} />
                <FeedbackTable rows={tenantRows} onDetail={setDetailRow} />
              </>
            )}
          </TabsContent>

          <TabsContent value="team" className="mt-5 space-y-4">
            <div className="flex items-center gap-3 flex-wrap">
              <SearchableSelect
                options={memberOptions}
                value={selectedMemberId}
                onChange={setSelectedMemberId}
                placeholder="Select a team member"
                searchPlaceholder="Search team member..."
              />
              {selectedMemberId && (
                <p className="text-xs text-muted-foreground">
                  {memberRows.length} inspection{memberRows.length !== 1 ? "s" : ""}
                </p>
              )}
            </div>

            {!selectedMemberId ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Users className="w-8 h-8 mx-auto text-muted-foreground/40 mb-2" />
                  <p className="text-sm text-muted-foreground">Select a team member above to view their feedback</p>
                </CardContent>
              </Card>
            ) : memberRows.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <p className="text-sm text-muted-foreground">No feedback found for this team member</p>
                </CardContent>
              </Card>
            ) : (
              <>
                <GaugePair rows={memberRows} />
                <FeedbackTable rows={memberRows} onDetail={setDetailRow} />
              </>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {detailRow && (
        <FeedbackDetailModal row={detailRow} onClose={() => setDetailRow(null)} />
      )}
    </div>
  );
}
