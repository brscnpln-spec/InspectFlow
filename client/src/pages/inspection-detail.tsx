import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  Building2,
  Phone,
  Mail,
  Calendar,
  Clock,
  User as UserIcon,
  FileText,
  Upload,
  CheckCircle2,
  Send,
  Loader2,
  AlertTriangle,
  Download,
  Trash2,
  File,
  Copy,
  Link,
  ExternalLink,
  Check,
  X,
  RefreshCw,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { StatusBadge } from "./dashboard";
import type { InspectionRequest, User, InspectionReport } from "@shared/schema";
import { useState, useRef, useEffect } from "react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Pencil } from "lucide-react";

export default function InspectionDetailPage() {
  const [, params] = useRoute("/inspections/:id");
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const isAdmin = user?.role === "admin";
  const [completionNotes, setCompletionNotes] = useState("");
  const [adminNotes, setAdminNotes] = useState("");
  const [assignMemberId, setAssignMemberId] = useState("");
  const [assignDate, setAssignDate] = useState("");
  const [assignTime, setAssignTime] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const completeFileInputRef = useRef<HTMLInputElement>(null);
  const [completeDialogOpen, setCompleteDialogOpen] = useState(false);
  const [surveyUrl, setSurveyUrl] = useState<string | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [reportReviewed, setReportReviewed] = useState(false);
  const [reportViewDialogOpen, setReportViewDialogOpen] = useState(false);
  const [viewingReportId, setViewingReportId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    notes: "",
    isEmergency: false,
    recurringDays: null as number | null,
    assignedServiceMemberId: "",
    inspectionDate: "",
    inspectionTime: "",
  });

  const { data: inspection, isLoading } = useQuery<InspectionRequest>({
    queryKey: ["/api/inspections", params?.id],
    enabled: !!params?.id,
  });

  const { data: teamMembers = [] } = useQuery<User[]>({
    queryKey: ["/api/users/service-members"],
    enabled: isAdmin,
  });

  const { data: assignedMember } = useQuery<User>({
    queryKey: ["/api/users", inspection?.assignedServiceMemberId],
    enabled: !!inspection?.assignedServiceMemberId,
  });

  const { data: reports = [], isLoading: reportsLoading } = useQuery<InspectionReport[]>({
    queryKey: ["/api/inspections", params?.id, "reports"],
    enabled: !!params?.id,
  });

  const { data: allMembers = [] } = useQuery<User[]>({
    queryKey: ["/api/users/service-members"],
    enabled: isAdmin && reports.length > 0,
  });

  const { data: npsSurveyData } = useQuery<{ surveyUrl: string; isActive: boolean; survey: { expiresAt: string; completedAt: string | null } }>({
    queryKey: ["/api/inspections", params?.id, "nps-survey"],
    enabled: isAdmin && inspection?.status === "final_closed",
  });

  const reactivateNpsMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/inspections/${params?.id}/reactivate-nps`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inspections", params?.id, "nps-survey"] });
      toast({ title: "NPS survey reactivated for 24 hours" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const assignMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("PATCH", `/api/inspections/${params?.id}/assign`, {
        assignedServiceMemberId: assignMemberId,
        inspectionDate: assignDate,
        inspectionTime: assignTime,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inspections", params?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/inspections"] });
      toast({ title: "Inspection assigned successfully" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const closeMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("PATCH", `/api/inspections/${params?.id}/close`, {
        completionNotes,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inspections", params?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/inspections"] });
      setCompleteDialogOpen(false);
      toast({ title: "Inspection marked as completed" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const finalCloseMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `/api/inspections/${params?.id}/final-close`, {
        adminNotes,
      });
      return res.json();
    },
    onSuccess: (data: { npsSurveyUrl?: string }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/inspections", params?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/inspections"] });
      setReportViewDialogOpen(false);
      toast({ title: "Inspection finalized" });
      if (data.npsSurveyUrl) {
        const fullUrl = `${window.location.origin}${data.npsSurveyUrl}`;
        setSurveyUrl(fullUrl);
      }
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const npsMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/inspections/${params?.id}/trigger-nps`);
      return res.json();
    },
    onSuccess: (data: { surveyUrl: string }) => {
      const fullUrl = `${window.location.origin}${data.surveyUrl}`;
      setSurveyUrl(fullUrl);
      toast({ title: "NPS survey created successfully" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const acceptAssignmentMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("PATCH", `/api/inspections/${params?.id}/accept-assignment`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inspections", params?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/inspections"] });
      toast({ title: "Inspection accepted" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const rejectAssignmentMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("PATCH", `/api/inspections/${params?.id}/reject-assignment`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inspections", params?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/inspections"] });
      toast({ title: "Inspection rejected" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("PATCH", `/api/inspections/${params?.id}/cancel`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inspections", params?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/inspections"] });
      toast({ title: "Inspection canceled" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const editMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("PATCH", `/api/inspections/${params?.id}`, {
        notes: editForm.notes || null,
        isEmergency: editForm.isEmergency,
        recurringDays: editForm.recurringDays || null,
        assignedServiceMemberId: editForm.assignedServiceMemberId || null,
        inspectionDate: editForm.inspectionDate || null,
        inspectionTime: editForm.inspectionTime || null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inspections", params?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/inspections"] });
      setEditDialogOpen(false);
      toast({ title: "Inspection updated successfully" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const openEditDialog = () => {
    if (!inspection) return;
    setEditForm({
      notes: inspection.notes || "",
      isEmergency: inspection.isEmergency || false,
      recurringDays: inspection.recurringDays || null,
      assignedServiceMemberId: inspection.assignedServiceMemberId || "",
      inspectionDate: inspection.inspectionDate || "",
      inspectionTime: inspection.inspectionTime || "",
    });
    setEditDialogOpen(true);
  };

  const handleFileUpload = async (file: File) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch(`/api/inspections/${params?.id}/reports`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Upload failed");
      }

      queryClient.invalidateQueries({ queryKey: ["/api/inspections", params?.id, "reports"] });
      toast({ title: "Report uploaded successfully" });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteReport = async (reportId: string) => {
    try {
      const res = await fetch(`/api/reports/${reportId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Delete failed");
      }
      queryClient.invalidateQueries({ queryKey: ["/api/inspections", params?.id, "reports"] });
      toast({ title: "Report deleted" });
    } catch (err: any) {
      toast({ title: "Delete failed", description: err.message, variant: "destructive" });
    }
  };

  const getMemberName = (id: string) => {
    const member = allMembers.find((m) => m.id === id);
    return member?.name || "Unknown";
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (isLoading) {
    return (
      <div className="p-6 max-w-3xl mx-auto space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!inspection) {
    return (
      <div className="p-6 text-center">
        <p className="text-muted-foreground">Inspection not found</p>
      </div>
    );
  }

  const isFinalClosed = inspection.status === "final_closed";
  const canUploadReport = !isFinalClosed && (isAdmin || inspection.status === "scheduled" || inspection.status === "closed");

  return (
    <div className="p-6 overflow-auto h-full">
      <div className="max-w-3xl mx-auto space-y-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setLocation(isAdmin ? "/inspections" : "/")}
          data-testid="button-back"
        >
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back
        </Button>

        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold">{inspection.companyName}</h1>
              {inspection.isEmergency && (
                <Badge variant="destructive">
                  <AlertTriangle className="w-3 h-3 mr-1" />
                  Emergency
                </Badge>
              )}
            </div>
            <StatusBadge status={inspection.status} />
            {isAdmin && inspection.status === "final_closed" && npsSurveyData && (
              <div className="flex items-center gap-2 mt-1">
                {npsSurveyData.survey.completedAt ? (
                  <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                    <CheckCircle2 className="w-3 h-3 mr-1" />
                    NPS Completed
                  </Badge>
                ) : npsSurveyData.isActive ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs border-[#ffb800] text-[#ffb800] hover:bg-[#ffb800]/10"
                    onClick={() => {
                      const fullUrl = `${window.location.origin}${npsSurveyData.surveyUrl}`;
                      navigator.clipboard.writeText(fullUrl);
                      toast({ title: "NPS survey link copied to clipboard" });
                    }}
                    data-testid="button-nps-active-link"
                  >
                    <Link className="w-3 h-3 mr-1" />
                    NPS Active — Copy Link
                  </Button>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <Badge variant="outline" className="bg-red-50 text-red-600 border-red-200">
                      <X className="w-3 h-3 mr-1" />
                      NPS Expired
                    </Badge>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => reactivateNpsMutation.mutate()}
                      disabled={reactivateNpsMutation.isPending}
                      data-testid="button-reactivate-nps"
                    >
                      {reactivateNpsMutation.isPending ? (
                        <Loader2 className="w-3 h-3 animate-spin mr-1" />
                      ) : (
                        <RefreshCw className="w-3 h-3 mr-1" />
                      )}
                      Reactivate
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {isAdmin && inspection.status === "new" && (
              <Dialog>
                <DialogTrigger asChild>
                  <Button size="sm" data-testid="button-assign">
                    <UserIcon className="w-4 h-4 mr-1" />
                    Assign
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Assign Service Member</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 pt-4">
                    <div>
                      <label className="text-sm font-medium mb-1.5 block">Service Member</label>
                      <Select onValueChange={setAssignMemberId} value={assignMemberId}>
                        <SelectTrigger data-testid="select-assign-member">
                          <SelectValue placeholder="Select member" />
                        </SelectTrigger>
                        <SelectContent>
                          {teamMembers.map((m) => (
                            <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-1.5 block">Date</label>
                      <Input
                        type="date"
                        value={assignDate}
                        onChange={(e) => setAssignDate(e.target.value)}
                        data-testid="input-assign-date"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-1.5 block">Time</label>
                      <Input
                        type="time"
                        value={assignTime}
                        onChange={(e) => setAssignTime(e.target.value)}
                        data-testid="input-assign-time"
                      />
                    </div>
                    <Button
                      className="w-full"
                      onClick={() => assignMutation.mutate()}
                      disabled={assignMutation.isPending || !assignMemberId || !assignDate}
                      data-testid="button-confirm-assign"
                    >
                      {assignMutation.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      ) : null}
                      Assign & Schedule
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            )}

            {!isAdmin && inspection.status === "scheduled" && (
              <Dialog open={completeDialogOpen} onOpenChange={setCompleteDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" data-testid="button-complete">
                    <CheckCircle2 className="w-4 h-4 mr-1" />
                    Complete
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Complete Inspection</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 pt-4">
                    <div>
                      <label className="text-sm font-medium mb-1.5 block">
                        Inspection Report File <span className="text-red-500">*</span>
                      </label>
                      {reports.length === 0 ? (
                        <div className="border-2 border-dashed border-red-300 rounded-lg p-4 text-center bg-red-50">
                          <Upload className="w-6 h-6 mx-auto mb-2 text-red-400" />
                          <p className="text-sm text-red-600 font-medium mb-2">Report file is required</p>
                          <input
                            ref={completeFileInputRef}
                            type="file"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) handleFileUpload(file);
                              e.target.value = "";
                            }}
                            data-testid="input-report-file-dialog"
                          />
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => completeFileInputRef.current?.click()}
                            disabled={uploading}
                            data-testid="button-upload-report-dialog"
                          >
                            {uploading ? (
                              <Loader2 className="w-4 h-4 animate-spin mr-1" />
                            ) : (
                              <Upload className="w-4 h-4 mr-1" />
                            )}
                            Upload Report
                          </Button>
                        </div>
                      ) : (
                        <div className="border border-green-300 rounded-lg p-3 bg-green-50">
                          <div className="flex items-center gap-2 text-green-700">
                            <CheckCircle2 className="w-4 h-4" />
                            <span className="text-sm font-medium">{reports.length} report(s) uploaded</span>
                          </div>
                          <div className="mt-2 space-y-1">
                            {reports.map((r) => (
                              <div key={r.id} className="flex items-center gap-2 text-xs text-green-600">
                                <File className="w-3 h-3" />
                                <span>{r.originalName}</span>
                                <span className="text-green-500">({formatFileSize(r.fileSize)})</span>
                              </div>
                            ))}
                          </div>
                          <div className="mt-2">
                            <input
                              ref={completeFileInputRef}
                              type="file"
                              className="hidden"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) handleFileUpload(file);
                                e.target.value = "";
                              }}
                            />
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-xs h-7"
                              onClick={() => completeFileInputRef.current?.click()}
                              disabled={uploading}
                              data-testid="button-upload-additional-report"
                            >
                              {uploading ? (
                                <Loader2 className="w-3 h-3 animate-spin mr-1" />
                              ) : (
                                <Upload className="w-3 h-3 mr-1" />
                              )}
                              Add another file
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-1.5 block">Completion Notes</label>
                      <Textarea
                        value={completionNotes}
                        onChange={(e) => setCompletionNotes(e.target.value)}
                        placeholder="Add notes about the inspection..."
                        className="resize-none"
                        rows={4}
                        data-testid="input-completion-notes"
                      />
                    </div>
                    <Button
                      className="w-full"
                      onClick={() => closeMutation.mutate()}
                      disabled={closeMutation.isPending || reports.length === 0}
                      data-testid="button-confirm-complete"
                    >
                      {closeMutation.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      ) : null}
                      Mark as Completed
                    </Button>
                    {reports.length === 0 && (
                      <p className="text-xs text-red-500 text-center">Upload a report file to complete this inspection</p>
                    )}
                  </div>
                </DialogContent>
              </Dialog>
            )}

            {isAdmin && inspection.status === "closed" && (
              <Button size="sm" data-testid="button-final-close" onClick={() => { setReportReviewed(false); setAdminNotes(""); setReportViewDialogOpen(true); }}>
                <CheckCircle2 className="w-4 h-4 mr-1" />
                Final Close
              </Button>
            )}

            <Dialog open={reportViewDialogOpen} onOpenChange={(open) => { if (!open) setReportViewDialogOpen(false); }}>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Review Report Before Final Close</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-2">
                  {!reportReviewed ? (
                    <>
                      <p className="text-sm text-muted-foreground">
                        You must review the inspection report before proceeding. Click on a report to view it, then confirm you have read it.
                      </p>
                      <div className="space-y-2">
                        {reports.map((report) => (
                          <div
                            key={report.id}
                            className={`flex items-center justify-between gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${viewingReportId === report.id ? "border-[#ffb800] bg-[#ffb800]/5" : "hover:bg-muted/50"}`}
                            onClick={() => {
                              setViewingReportId(report.id);
                              window.open(`/api/reports/${report.id}/download`, "_blank");
                            }}
                            data-testid={`review-report-${report.id}`}
                          >
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                              <div className="w-8 h-8 rounded bg-[#ffb800]/10 flex items-center justify-center flex-shrink-0">
                                <File className="w-4 h-4 text-[#ffb800]" />
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-medium truncate">{report.originalName}</p>
                                <p className="text-xs text-muted-foreground">{formatFileSize(report.fileSize)}</p>
                              </div>
                            </div>
                            <ExternalLink className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                          </div>
                        ))}
                      </div>
                      {reports.length === 0 && (
                        <p className="text-sm text-red-500 text-center py-4">No reports uploaded for this inspection.</p>
                      )}
                      <Button
                        className="w-full"
                        onClick={() => setReportReviewed(true)}
                        disabled={!viewingReportId}
                        data-testid="button-report-reviewed"
                      >
                        <Check className="w-4 h-4 mr-1" />
                        I Have Read the Report
                      </Button>
                      {!viewingReportId && reports.length > 0 && (
                        <p className="text-xs text-muted-foreground text-center">Click on a report above to open and review it first</p>
                      )}
                    </>
                  ) : (
                    <>
                      <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
                        <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
                        <p className="text-sm text-green-700 dark:text-green-400">Report reviewed</p>
                      </div>
                      <div>
                        <label className="text-sm font-medium mb-1.5 block">Admin Notes *</label>
                        <Textarea
                          value={adminNotes}
                          onChange={(e) => setAdminNotes(e.target.value)}
                          placeholder="Write your notes about the inspection report..."
                          className="resize-none"
                          rows={4}
                          data-testid="input-admin-notes"
                        />
                        <p className="text-xs text-muted-foreground mt-1">Admin notes are required to finalize the inspection.</p>
                      </div>
                      <Button
                        className="w-full"
                        onClick={() => finalCloseMutation.mutate()}
                        disabled={finalCloseMutation.isPending || !adminNotes.trim()}
                        data-testid="button-confirm-final-close"
                      >
                        {finalCloseMutation.isPending ? (
                          <Loader2 className="w-4 h-4 animate-spin mr-2" />
                        ) : (
                          <CheckCircle2 className="w-4 h-4 mr-2" />
                        )}
                        Confirm Final Close
                      </Button>
                    </>
                  )}
                </div>
              </DialogContent>
            </Dialog>

            <Dialog open={!!surveyUrl} onOpenChange={(open) => !open && setSurveyUrl(null)}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Link className="w-5 h-5 text-[#ffb800]" />
                    NPS Survey Link
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-2">
                  <p className="text-sm text-muted-foreground">
                    An NPS survey has been created and sent along with the final close notification. Share this link with the customer if needed. Valid for 24 hours.
                  </p>
                  <div className="flex items-center gap-2">
                    <Input
                      readOnly
                      value={surveyUrl || ""}
                      className="text-sm font-mono"
                      data-testid="input-survey-url"
                      onClick={(e) => (e.target as HTMLInputElement).select()}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      data-testid="button-copy-survey-url"
                      onClick={() => {
                        if (surveyUrl) {
                          navigator.clipboard.writeText(surveyUrl);
                          toast({ title: "Link copied to clipboard" });
                        }
                      }}
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    data-testid="button-open-survey"
                    onClick={() => window.open(surveyUrl!, "_blank")}
                  >
                    <ExternalLink className="w-4 h-4 mr-2" />
                    Open Survey in New Tab
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

            {isAdmin && !isFinalClosed && (
              <Button
                variant="outline"
                size="sm"
                onClick={openEditDialog}
                data-testid="button-edit-inspection"
              >
                <Pencil className="w-4 h-4 mr-1" />
                Edit
              </Button>
            )}

            {isAdmin && (inspection.status === "new" || inspection.status === "scheduled") && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => cancelMutation.mutate()}
                disabled={cancelMutation.isPending}
                data-testid="button-cancel-inspection"
              >
                Cancel
              </Button>
            )}
          </div>
        </div>

        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit Inspection</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="rounded-lg border bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground flex items-center gap-2">
                <Building2 className="w-3.5 h-3.5 flex-shrink-0" />
                <span>Company &amp; contact info is managed via the <strong>Tenants</strong> page and is read-only here.</span>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="edit-member">Service Member</Label>
                <Select
                  value={editForm.assignedServiceMemberId}
                  onValueChange={(val) => setEditForm({ ...editForm, assignedServiceMemberId: val === "none" ? "" : val })}
                >
                  <SelectTrigger data-testid="select-edit-member">
                    <SelectValue placeholder="Select a service member" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Unassigned</SelectItem>
                    {teamMembers.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {editForm.assignedServiceMemberId && editForm.assignedServiceMemberId !== inspection?.assignedServiceMemberId && (
                  <p className="text-xs text-[#ffb800] flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    Changing service member will reset assignment to pending and notify the new member
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="edit-date">Inspection Date</Label>
                  <Input
                    id="edit-date"
                    type="date"
                    value={editForm.inspectionDate}
                    onChange={(e) => setEditForm({ ...editForm, inspectionDate: e.target.value })}
                    data-testid="input-edit-date"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-time">Inspection Time</Label>
                  <Input
                    id="edit-time"
                    type="time"
                    value={editForm.inspectionTime}
                    onChange={(e) => setEditForm({ ...editForm, inspectionTime: e.target.value })}
                    data-testid="input-edit-time"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="flex items-center gap-3">
                  <Switch
                    id="edit-emergency"
                    checked={editForm.isEmergency}
                    onCheckedChange={(val) => setEditForm({ ...editForm, isEmergency: val })}
                    data-testid="switch-edit-emergency"
                  />
                  <Label htmlFor="edit-emergency">Emergency</Label>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-recurring">Recurring (days)</Label>
                  <Input
                    id="edit-recurring"
                    type="number"
                    min={0}
                    value={editForm.recurringDays ?? ""}
                    onChange={(e) => setEditForm({ ...editForm, recurringDays: e.target.value ? parseInt(e.target.value) : null })}
                    placeholder="e.g. 30, 45, 60"
                    data-testid="input-edit-recurring"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="edit-notes">Notes</Label>
                <Textarea
                  id="edit-notes"
                  value={editForm.notes}
                  onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                  rows={3}
                  data-testid="input-edit-notes"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="outline"
                  onClick={() => setEditDialogOpen(false)}
                  data-testid="button-edit-cancel"
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => editMutation.mutate()}
                  disabled={editMutation.isPending}
                  data-testid="button-edit-save"
                >
                  {editMutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
                  Save Changes
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {!isAdmin && inspection.assignmentStatus === "pending" && (
          <Card className="border-[#ffb800] border-2 bg-[#ffb800]/5">
            <CardContent className="p-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                <div className="flex-1">
                  <p className="font-semibold text-sm flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-[#ffb800]" />
                    Assignment Pending Your Response
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Please accept or reject this inspection assignment.
                    {inspection.assignmentExpiresAt && (
                      <> Expires: {new Date(inspection.assignmentExpiresAt).toLocaleString()}</>
                    )}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="bg-green-600 hover:bg-green-700"
                    onClick={() => acceptAssignmentMutation.mutate()}
                    disabled={acceptAssignmentMutation.isPending || rejectAssignmentMutation.isPending}
                    data-testid="button-accept-assignment"
                  >
                    {acceptAssignmentMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-1" />
                    ) : (
                      <Check className="w-4 h-4 mr-1" />
                    )}
                    Accept
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => rejectAssignmentMutation.mutate()}
                    disabled={acceptAssignmentMutation.isPending || rejectAssignmentMutation.isPending}
                    data-testid="button-reject-assignment"
                  >
                    {rejectAssignmentMutation.isPending ? (
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
        )}

        {isAdmin && inspection.assignmentStatus === "pending" && (
          <Card className="border-[#ffb800] bg-[#ffb800]/5">
            <CardContent className="p-4">
              <p className="text-sm flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-[#ffb800]" />
                <span className="font-medium">Waiting for service member response</span>
                {inspection.assignmentExpiresAt && (
                  <span className="text-xs text-muted-foreground ml-1">
                    (expires {new Date(inspection.assignmentExpiresAt).toLocaleString()})
                  </span>
                )}
              </p>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <Building2 className="w-4 h-4 text-[#ffb800]" />
                Company Details
              </h3>
            </CardHeader>
            <CardContent className="space-y-3">
              <InfoRow label="Company" value={inspection.companyName} />
              <InfoRow label="Contact 1" value={inspection.contactPerson1} />
              <InfoRow label="Contact 2" value={inspection.contactPerson2 || "Not provided"} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <Phone className="w-4 h-4 text-[#ffb800]" />
                Contact Information
              </h3>
            </CardHeader>
            <CardContent className="space-y-3">
              <InfoRow label="Phone 1" value={inspection.phone1} />
              <InfoRow label="Phone 2" value={inspection.phone2 || "Not provided"} />
              <InfoRow label="Email 1" value={inspection.email1} icon={<Mail className="w-3 h-3" />} />
              <InfoRow label="Email 2" value={inspection.email2 || "Not provided"} icon={<Mail className="w-3 h-3" />} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <Calendar className="w-4 h-4 text-[#ffb800]" />
                Schedule
              </h3>
            </CardHeader>
            <CardContent className="space-y-3">
              <InfoRow
                label="Date"
                value={inspection.inspectionDate || "Not scheduled"}
              />
              <InfoRow
                label="Time"
                value={inspection.inspectionTime || "Not set"}
              />
              {inspection.recurringDays && inspection.recurringDays > 0 && (
                <InfoRow label="Recurring" value={`Every ${inspection.recurringDays} days`} />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <UserIcon className="w-4 h-4 text-[#ffb800]" />
                Assignment
              </h3>
            </CardHeader>
            <CardContent className="space-y-3">
              <InfoRow
                label="Service Member"
                value={assignedMember?.name || "Unassigned"}
              />
              <InfoRow
                label="Status"
                value={inspection.status.replace("_", " ").replace(/\b\w/g, (l) => l.toUpperCase())}
              />
            </CardContent>
          </Card>
        </div>

        {(inspection.notes || inspection.completionNotes || inspection.adminNotes) && (
          <Card>
            <CardHeader className="pb-3">
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <FileText className="w-4 h-4 text-[#ffb800]" />
                Notes
              </h3>
            </CardHeader>
            <CardContent className="space-y-3">
              {inspection.notes && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Request Notes</p>
                  <p className="text-sm">{inspection.notes}</p>
                </div>
              )}
              {inspection.completionNotes && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Completion Notes</p>
                  <p className="text-sm">{inspection.completionNotes}</p>
                </div>
              )}
              {inspection.adminNotes && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Admin Notes</p>
                  <p className="text-sm">{inspection.adminNotes}</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <Upload className="w-4 h-4 text-[#ffb800]" />
                Inspection Reports
              </h3>
              {canUploadReport && (
                <>
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFileUpload(file);
                      e.target.value = "";
                    }}
                    data-testid="input-report-file"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    data-testid="button-upload-report"
                  >
                    {uploading ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-1" />
                    ) : (
                      <Upload className="w-4 h-4 mr-1" />
                    )}
                    Upload Report
                  </Button>
                </>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {reportsLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : reports.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground">
                <File className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">No reports uploaded yet</p>
                {canUploadReport && (
                  <p className="text-xs mt-1">Upload a report file to complete this inspection</p>
                )}
              </div>
            ) : (
              <div className="space-y-2" data-testid="reports-list">
                {reports.map((report) => (
                  <div
                    key={report.id}
                    className="flex items-center justify-between gap-3 p-3 rounded-lg border bg-muted/30"
                    data-testid={`report-item-${report.id}`}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="w-8 h-8 rounded bg-[#ffb800]/10 flex items-center justify-center flex-shrink-0">
                        <File className="w-4 h-4 text-[#ffb800]" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate" data-testid={`report-name-${report.id}`}>
                          {report.originalName}
                        </p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>{formatFileSize(report.fileSize)}</span>
                          {isAdmin && (
                            <>
                              <span>·</span>
                              <span data-testid={`report-uploader-${report.id}`}>
                                {getMemberName(report.uploadedById)}
                              </span>
                            </>
                          )}
                          {report.uploadedAt && (
                            <>
                              <span>·</span>
                              <span>{new Date(report.uploadedAt).toLocaleDateString()}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0"
                        onClick={() => window.open(`/api/reports/${report.id}/download`, "_blank")}
                        data-testid={`button-download-report-${report.id}`}
                      >
                        <Download className="w-4 h-4" />
                      </Button>
                      {!isFinalClosed && (isAdmin || (!isAdmin && report.uploadedById === user?.id && inspection.status === "scheduled")) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-red-500 hover:text-red-700"
                          onClick={() => handleDeleteReport(report.id)}
                          data-testid={`button-delete-report-${report.id}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function InfoRow({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-right flex items-center gap-1">
        {icon}
        {value}
      </span>
    </div>
  );
}
