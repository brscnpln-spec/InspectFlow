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
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { useToast } from "@/hooks/use-toast";
import { Loader2, ArrowLeft, Building2, User as UserIcon, Phone, Mail, Hash, ChevronsUpDown, Check } from "lucide-react";
import type { User, Tenant } from "@shared/schema";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const inspectionFormSchema = z.object({
  tenantId: z.string().min(1, "Please select a tenant"),
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
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);
  const [tenantOpen, setTenantOpen] = useState(false);

  const { data: teamMembers = [] } = useQuery<User[]>({
    queryKey: ["/api/users/service-members"],
  });

  const { data: tenants = [], isLoading: tenantsLoading } = useQuery<Tenant[]>({
    queryKey: ["/api/tenants"],
  });

  const form = useForm<InspectionFormValues>({
    resolver: zodResolver(inspectionFormSchema),
    defaultValues: {
      tenantId: "",
      notes: "",
      isEmergency: false,
      assignedServiceMemberId: "",
      inspectionDate: "",
      inspectionTime: "",
    },
  });

  const mutation = useMutation({
    mutationFn: async (data: InspectionFormValues) => {
      const res = await apiRequest("POST", "/api/inspections", {
        ...data,
        recurringDays: data.recurringDays || undefined,
        assignedServiceMemberId: data.assignedServiceMemberId || undefined,
        inspectionDate: data.inspectionDate || undefined,
        inspectionTime: data.inspectionTime || undefined,
      });
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

  const handleTenantChange = (tenantId: string) => {
    form.setValue("tenantId", tenantId);
    const tenant = tenants.find((t) => t.id === tenantId) || null;
    setSelectedTenant(tenant);
  };

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
                <h2 className="font-semibold text-sm">Select Tenant</h2>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  control={form.control}
                  name="tenantId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tenant / Company *</FormLabel>
                      <Popover open={tenantOpen} onOpenChange={setTenantOpen}>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant="outline"
                              role="combobox"
                              aria-expanded={tenantOpen}
                              className={cn(
                                "w-full justify-between font-normal",
                                !field.value && "text-muted-foreground"
                              )}
                              disabled={tenantsLoading}
                              data-testid="select-tenant"
                            >
                              {tenantsLoading
                                ? "Loading tenants..."
                                : field.value
                                ? (tenants.find((t) => t.id === field.value)?.companyName ?? "Select a tenant")
                                : "Select a tenant"}
                              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                          <Command>
                            <CommandInput placeholder="Search tenant..." />
                            <CommandList>
                              <CommandEmpty>No tenant found.</CommandEmpty>
                              <CommandGroup>
                                {tenants.map((tenant) => (
                                  <CommandItem
                                    key={tenant.id}
                                    value={`${tenant.companyName} ${tenant.klx} ${tenant.klCustomerNumber}`}
                                    onSelect={() => {
                                      field.onChange(tenant.id);
                                      handleTenantChange(tenant.id);
                                      setTenantOpen(false);
                                    }}
                                  >
                                    <Check
                                      className={cn(
                                        "mr-2 h-4 w-4",
                                        field.value === tenant.id ? "opacity-100" : "opacity-0"
                                      )}
                                    />
                                    <div className="flex flex-col">
                                      <span className="text-sm">{tenant.companyName}</span>
                                      <span className="text-xs text-muted-foreground">{tenant.klx} · {tenant.klCustomerNumber}</span>
                                    </div>
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {selectedTenant && (
                  <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-[#ffb800]" />
                      <span className="font-medium text-sm">{selectedTenant.companyName}</span>
                      <Badge variant="outline" className="text-[10px]">
                        <Hash className="w-2.5 h-2.5 mr-0.5" />
                        {selectedTenant.klx}
                      </Badge>
                      <Badge variant="secondary" className="text-[10px]">
                        KL: {selectedTenant.klCustomerNumber}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-muted-foreground">
                      <div className="space-y-1">
                        <p className="font-medium text-foreground text-[11px] uppercase tracking-wide">Contact 1</p>
                        <div className="flex items-center gap-1.5">
                          <UserIcon className="w-3 h-3" />
                          <span>{selectedTenant.contactPerson1}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Phone className="w-3 h-3" />
                          <span>{selectedTenant.phone1}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Mail className="w-3 h-3" />
                          <span>{selectedTenant.email1}</span>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <p className="font-medium text-foreground text-[11px] uppercase tracking-wide">Contact 2</p>
                        <div className="flex items-center gap-1.5">
                          <UserIcon className="w-3 h-3" />
                          <span>{selectedTenant.contactPerson2}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Phone className="w-3 h-3" />
                          <span>{selectedTenant.phone2}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Mail className="w-3 h-3" />
                          <span>{selectedTenant.email2}</span>
                        </div>
                      </div>
                    </div>
                    <p className="text-[11px] text-muted-foreground italic">
                      Company info is read-only. Edit from the Tenants page.
                    </p>
                  </div>
                )}
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

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="isEmergency"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Emergency</FormLabel>
                        <div className="flex items-center gap-2 h-10">
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              data-testid="switch-emergency"
                            />
                          </FormControl>
                          <span className="text-sm text-muted-foreground">
                            {field.value ? "Yes — 12h response window" : "No — 24h response window"}
                          </span>
                        </div>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="recurringDays"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Recurring (days)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={0}
                            placeholder="e.g. 30, 45, 60"
                            value={field.value ?? ""}
                            onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                            data-testid="input-recurring"
                          />
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
                          rows={3}
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

            <Button
              type="submit"
              className="w-full"
              disabled={mutation.isPending}
              data-testid="button-submit"
            >
              {mutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : null}
              Create Inspection
            </Button>
          </form>
        </Form>
      </div>
    </div>
  );
}
