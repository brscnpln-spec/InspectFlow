import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ArrowLeft } from "lucide-react";
import type { User } from "@shared/schema";

const inspectionFormSchema = z.object({
  companyName: z.string().min(1, "Company name is required"),
  contactPerson1: z.string().trim().min(1, "Contact person 1 is required"),
  contactPerson2: z.string().trim().min(1, "Contact person 2 is required"),
  phone1: z.string().trim().min(1, "Phone 1 is required"),
  phone2: z.string().trim().min(1, "Phone 2 is required"),
  email1: z.string().email("Valid email is required"),
  email2: z.string().email("Valid email is required"),
  notes: z.string().optional(),
  isEmergency: z.boolean().default(false),
  recurringDays: z.number().optional(),
  assignedServiceMemberId: z.string().optional(),
  inspectionDate: z.string().optional(),
  inspectionTime: z.string().optional(),
});

type InspectionFormValues = z.infer<typeof inspectionFormSchema>;

export default function InspectionFormPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { data: teamMembers = [] } = useQuery<User[]>({
    queryKey: ["/api/users/service-members"],
  });

  const form = useForm<InspectionFormValues>({
    resolver: zodResolver(inspectionFormSchema),
    defaultValues: {
      companyName: "",
      contactPerson1: "",
      contactPerson2: "",
      phone1: "",
      phone2: "",
      email1: "",
      email2: "",
      notes: "",
      isEmergency: false,
      assignedServiceMemberId: "",
      inspectionDate: "",
      inspectionTime: "",
    },
  });

  const mutation = useMutation({
    mutationFn: async (data: InspectionFormValues) => {
      const res = await apiRequest("POST", "/api/inspections", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inspections"] });
      toast({ title: "Inspection created successfully" });
      setLocation("/inspections");
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  return (
    <div className="p-6 overflow-auto h-full">
      <div className="max-w-2xl mx-auto">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setLocation("/inspections")}
          className="mb-4"
          data-testid="button-back"
        >
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back to Inspections
        </Button>

        <h1 className="text-xl font-bold mb-6">New Inspection Request</h1>

        <Form {...form}>
          <form onSubmit={form.handleSubmit((d) => mutation.mutate(d))} className="space-y-6">
            <Card>
              <CardHeader className="pb-3">
                <h2 className="font-semibold text-sm">Company Information</h2>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  control={form.control}
                  name="companyName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Company Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Enter company name" {...field} data-testid="input-company-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="contactPerson1"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Contact Person 1 *</FormLabel>
                        <FormControl>
                          <Input placeholder="Primary contact" {...field} data-testid="input-contact-1" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="contactPerson2"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Contact Person 2 *</FormLabel>
                        <FormControl>
                          <Input placeholder="Secondary contact" {...field} data-testid="input-contact-2" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="phone1"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Phone 1 *</FormLabel>
                        <FormControl>
                          <Input placeholder="+1 234 567 890" {...field} data-testid="input-phone-1" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="phone2"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Phone 2 *</FormLabel>
                        <FormControl>
                          <Input placeholder="+1 234 567 891" {...field} data-testid="input-phone-2" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="email1"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email 1 *</FormLabel>
                        <FormControl>
                          <Input placeholder="primary@company.com" {...field} data-testid="input-email-1" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="email2"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email 2 *</FormLabel>
                        <FormControl>
                          <Input placeholder="secondary@company.com" {...field} data-testid="input-email-2" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <h2 className="font-semibold text-sm">Assignment & Schedule</h2>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  control={form.control}
                  name="assignedServiceMemberId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Assign Service Member</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-service-member">
                            <SelectValue placeholder="Select a service member" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {teamMembers.map((member) => (
                            <SelectItem key={member.id} value={member.id}>
                              {member.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="inspectionDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Inspection Date</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} data-testid="input-date" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="inspectionTime"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Inspection Time</FormLabel>
                        <FormControl>
                          <Input type="time" {...field} data-testid="input-time" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="isEmergency"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between rounded-md border p-3">
                      <div>
                        <FormLabel className="mb-0">Emergency Inspection</FormLabel>
                        <FormDescription className="text-xs">
                          Mark this as an emergency inspection (SLA: 3 days)
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          data-testid="switch-emergency"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="recurringDays"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Recurring Interval (days)</FormLabel>
                      <Select
                        onValueChange={(v) => field.onChange(v ? Number(v) : undefined)}
                        value={field.value?.toString() || ""}
                      >
                        <FormControl>
                          <SelectTrigger data-testid="select-recurring">
                            <SelectValue placeholder="One-time inspection" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="0">One-time</SelectItem>
                          <SelectItem value="45">Every 45 days</SelectItem>
                          <SelectItem value="60">Every 60 days</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <h2 className="font-semibold text-sm">Additional Notes</h2>
              </CardHeader>
              <CardContent>
                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Textarea
                          placeholder="Any additional notes about this inspection..."
                          className="resize-none"
                          rows={4}
                          {...field}
                          data-testid="input-notes"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            <div className="flex justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setLocation("/inspections")}
                data-testid="button-cancel"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={mutation.isPending}
                data-testid="button-submit"
              >
                {mutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  "Create Inspection"
                )}
              </Button>
            </div>
          </form>
        </Form>
      </div>
    </div>
  );
}
