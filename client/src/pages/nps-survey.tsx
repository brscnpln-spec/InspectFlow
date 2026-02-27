import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ClipboardList,
  CheckCircle2,
  Calendar,
  User as UserIcon,
  Building2,
  Loader2,
  AlertCircle,
  Mail,
} from "lucide-react";

interface SurveyData {
  inspection: {
    companyName: string;
    inspectionDate: string;
    contactPerson1: string;
    email1: string;
  };
  serviceMember: {
    id: string;
    name: string;
  };
  expired: boolean;
  completed: boolean;
}

export default function NpsSurveyPage() {
  const [, params] = useRoute("/survey/:token");
  const [reportScore, setReportScore] = useState<number | null>(null);
  const [serviceScore, setServiceScore] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const { data: survey, isLoading, error } = useQuery<SurveyData>({
    queryKey: ["/api/survey", params?.token],
    enabled: !!params?.token,
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/survey/${params?.token}/respond`, {
        reportScore,
        serviceScore,
        comment: comment || undefined,
      });
    },
    onSuccess: () => setSubmitted(true),
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-lg space-y-4">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  if (error || !survey) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="py-12 text-center">
            <AlertCircle className="w-12 h-12 mx-auto text-destructive mb-3" />
            <h2 className="font-semibold text-lg">Survey Not Found</h2>
            <p className="text-sm text-muted-foreground mt-2">
              This survey link may be invalid or expired.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (survey.expired) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="py-12 text-center">
            <AlertCircle className="w-12 h-12 mx-auto text-[#ffb800] mb-3" />
            <h2 className="font-semibold text-lg">Survey Expired</h2>
            <p className="text-sm text-muted-foreground mt-2">
              This survey link has expired. Please contact the inspection team for a new link.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (survey.completed || submitted) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="py-12 text-center">
            <CheckCircle2 className="w-12 h-12 mx-auto text-green-500 mb-3" />
            <h2 className="font-semibold text-lg">Thank You!</h2>
            <p className="text-sm text-muted-foreground mt-2">
              Your feedback has been submitted successfully. We appreciate your time.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 py-8">
      <div className="max-w-lg mx-auto space-y-6">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[#ffb800] mb-3">
            <ClipboardList className="w-7 h-7 text-black" />
          </div>
          <h1 className="text-xl font-bold">Inspection Feedback</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Please share your experience with our inspection service
          </p>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <h2 className="font-semibold text-sm">Inspection Details</h2>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <Building2 className="w-4 h-4 text-[#ffb800] flex-shrink-0" />
              <span data-testid="text-survey-company">{survey.inspection.companyName}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Calendar className="w-4 h-4 text-[#ffb800] flex-shrink-0" />
              <span data-testid="text-survey-date">{survey.inspection.inspectionDate || "N/A"}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <UserIcon className="w-4 h-4 text-[#ffb800] flex-shrink-0" />
              <span data-testid="text-survey-contact">{survey.inspection.contactPerson1}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Mail className="w-4 h-4 text-[#ffb800] flex-shrink-0" />
              <span data-testid="text-survey-email">{survey.inspection.email1}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <UserIcon className="w-4 h-4 text-[#ffb800] flex-shrink-0" />
              <span className="text-muted-foreground">Service Member:</span>
              <span className="font-medium" data-testid="text-survey-member">{survey.serviceMember.name}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <h2 className="font-semibold text-sm">
              How satisfied were you with the overall inspection report? *
            </h2>
          </CardHeader>
          <CardContent>
            <ScoreSelector value={reportScore} onChange={setReportScore} testId="score-report" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <h2 className="font-semibold text-sm">
              How satisfied were you with the support and communication of the Service Member?
            </h2>
            <p className="text-xs text-muted-foreground">(Optional)</p>
          </CardHeader>
          <CardContent>
            <ScoreSelector value={serviceScore} onChange={setServiceScore} testId="score-service" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <h2 className="font-semibold text-sm">Additional Comments</h2>
            <p className="text-xs text-muted-foreground">(Optional)</p>
          </CardHeader>
          <CardContent>
            <Textarea
              placeholder="Share any additional feedback..."
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              className="resize-none"
              rows={4}
              data-testid="input-survey-comment"
            />
          </CardContent>
        </Card>

        <Button
          className="w-full"
          disabled={reportScore === null || submitMutation.isPending}
          onClick={() => submitMutation.mutate()}
          data-testid="button-submit-survey"
        >
          {submitMutation.isPending ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Submitting...
            </>
          ) : (
            "Submit Feedback"
          )}
        </Button>

        {submitMutation.isError && (
          <p className="text-sm text-destructive text-center">
            Failed to submit. Please try again.
          </p>
        )}
      </div>
    </div>
  );
}

function ScoreSelector({
  value,
  onChange,
  testId,
}: {
  value: number | null;
  onChange: (v: number) => void;
  testId: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-muted-foreground">Not likely</span>
        <span className="text-xs text-muted-foreground">Very likely</span>
      </div>
      <div className="grid grid-cols-11 gap-1">
        {Array.from({ length: 11 }, (_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onChange(i)}
            className={`
              h-10 rounded-md text-sm font-medium border transition-colors
              ${
                value === i
                  ? i >= 9
                    ? "bg-green-500 text-white border-green-500"
                    : i >= 7
                    ? "bg-[#ffb800] text-black border-[#ffb800]"
                    : "bg-red-500 text-white border-red-500"
                  : "bg-background border-border"
              }
            `}
            data-testid={`${testId}-${i}`}
          >
            {i}
          </button>
        ))}
      </div>
    </div>
  );
}
