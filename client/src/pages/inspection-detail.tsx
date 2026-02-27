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
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { StatusBadge } from "./dashboard";
import type { InspectionRequest, User, InspectionReport } from "@shared/schema";
import { useState, useRef } from "react";

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
      return apiRequest("PATCH", `/api/inspections/${params?.id}/final-close`, {
        adminNotes,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inspections", params?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/inspections"] });
      toast({ title: "Inspection finalized" });
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

  const canUploadReport = !isAdmin && (inspection.status === "scheduled" || inspection.status === "closed");

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
              <>
                <Dialog>
                  <DialogTrigger asChild>
                    <Button size="sm" data-testid="button-final-close">
                      <CheckCircle2 className="w-4 h-4 mr-1" />
                      Final Close
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Final Close Inspection</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 pt-4">
                      <div>
                        <label className="text-sm font-medium mb-1.5 block">Admin Notes</label>
                        <Textarea
                          value={adminNotes}
                          onChange={(e) => setAdminNotes(e.target.value)}
                          placeholder="Additional comments..."
                          className="resize-none"
                          rows={4}
                          data-testid="input-admin-notes"
                        />
                      </div>
                      <Button
                        className="w-full"
                        onClick={() => finalCloseMutation.mutate()}
                        disabled={finalCloseMutation.isPending}
                        data-testid="button-confirm-final-close"
                      >
                        {finalCloseMutation.isPending ? (
                          <Loader2 className="w-4 h-4 animate-spin mr-2" />
                        ) : null}
                        Confirm Final Close
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => npsMutation.mutate()}
                  disabled={npsMutation.isPending}
                  data-testid="button-trigger-nps"
                >
                  {npsMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-1" />
                  ) : (
                    <Send className="w-4 h-4 mr-1" />
                  )}
                  Send NPS Survey
                </Button>

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
                        Share this link with the customer. The survey is valid for 24 hours.
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
              </>
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
              {inspection.contactPerson2 && (
                <InfoRow label="Contact 2" value={inspection.contactPerson2} />
              )}
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
              {inspection.phone2 && <InfoRow label="Phone 2" value={inspection.phone2} />}
              <InfoRow label="Email 1" value={inspection.email1} icon={<Mail className="w-3 h-3" />} />
              {inspection.email2 && (
                <InfoRow label="Email 2" value={inspection.email2} icon={<Mail className="w-3 h-3" />} />
              )}
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
                      {(!isAdmin && report.uploadedById === user?.id && inspection.status === "scheduled") && (
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
