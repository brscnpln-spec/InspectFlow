import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Building2,
  Plus,
  Search,
  Pencil,
  Trash2,
  Phone,
  Mail,
  User as UserIcon,
  Hash,
  Loader2,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import type { Tenant } from "@shared/schema";

const EMPTY_FORM = {
  companyName: "",
  klx: "",
  klCustomerNumber: "",
  contactPerson1: "",
  phone1: "",
  email1: "",
  contactPerson2: "",
  phone2: "",
  email2: "",
};

type TenantForm = typeof EMPTY_FORM;

function validateForm(form: TenantForm): string | null {
  if (!form.companyName.trim()) return "Company name is required";
  if (!form.klx.trim()) return "KLX is required";
  if (!form.klCustomerNumber.trim()) return "KL Customer Number is required";
  if (!form.contactPerson1.trim()) return "Contact 1 name is required";
  if (!form.phone1.trim()) return "Contact 1 phone is required";
  if (!form.email1.trim()) return "Contact 1 email is required";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email1)) return "Contact 1 email is invalid";
  if (!form.contactPerson2.trim()) return "Contact 2 name is required";
  if (!form.phone2.trim()) return "Contact 2 phone is required";
  if (!form.email2.trim()) return "Contact 2 email is required";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email2)) return "Contact 2 email is invalid";
  return null;
}

const PAGE_SIZE = 10;

export default function TenantsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const isAdmin = user?.role === "admin";

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);
  const [form, setForm] = useState<TenantForm>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const { data: tenants = [], isLoading } = useQuery<Tenant[]>({
    queryKey: ["/api/tenants"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: TenantForm) => {
      const res = await apiRequest("POST", "/api/tenants", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants"] });
      toast({ title: "Tenant created successfully" });
      closeDialog();
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: TenantForm }) => {
      const res = await apiRequest("PATCH", `/api/tenants/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants"] });
      toast({ title: "Tenant updated successfully" });
      closeDialog();
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/tenants/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants"] });
      toast({ title: "Tenant deleted" });
      setDeleteConfirmId(null);
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const filtered = tenants.filter(
    (t) =>
      t.companyName.toLowerCase().includes(search.toLowerCase()) ||
      t.klx.toLowerCase().includes(search.toLowerCase()) ||
      t.klCustomerNumber.toLowerCase().includes(search.toLowerCase()) ||
      t.contactPerson1.toLowerCase().includes(search.toLowerCase()) ||
      t.contactPerson2.toLowerCase().includes(search.toLowerCase())
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginated = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const openCreate = () => {
    setEditingTenant(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setDialogOpen(true);
  };

  const openEdit = (tenant: Tenant) => {
    setEditingTenant(tenant);
    setForm({
      companyName: tenant.companyName,
      klx: tenant.klx,
      klCustomerNumber: tenant.klCustomerNumber,
      contactPerson1: tenant.contactPerson1,
      phone1: tenant.phone1,
      email1: tenant.email1,
      contactPerson2: tenant.contactPerson2,
      phone2: tenant.phone2,
      email2: tenant.email2,
    });
    setFormError(null);
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingTenant(null);
    setForm(EMPTY_FORM);
    setFormError(null);
  };

  const handleSubmit = () => {
    const error = validateForm(form);
    if (error) {
      setFormError(error);
      return;
    }
    setFormError(null);
    if (editingTenant) {
      updateMutation.mutate({ id: editingTenant.id, data: form });
    } else {
      createMutation.mutate(form);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  const f = (key: keyof TenantForm) => ({
    value: form[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm({ ...form, [key]: e.target.value }),
  });

  return (
    <div className="p-6 overflow-auto h-full">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-bold">Tenants</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Manage company tenants for inspections</p>
          </div>
          {isAdmin && (
            <Button onClick={openCreate} data-testid="button-new-tenant">
              <Plus className="w-4 h-4 mr-1" />
              New Tenant
            </Button>
          )}
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search tenants..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="pl-9"
            data-testid="input-tenant-search"
          />
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-32 w-full" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center">
              <Building2 className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">
                {search ? "No tenants match your search" : "No tenants yet. Create the first one."}
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
          <div className="space-y-3">
            {paginated.map((tenant) => (
              <Card key={tenant.id} data-testid={`card-tenant-${tenant.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-sm">{tenant.companyName}</h3>
                        <Badge variant="outline" className="text-[10px]">
                          <Hash className="w-2.5 h-2.5 mr-0.5" />
                          {tenant.klx}
                        </Badge>
                        <Badge variant="secondary" className="text-[10px]">
                          KL: {tenant.klCustomerNumber}
                        </Badge>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1 text-xs text-muted-foreground">
                        <div>
                          <p className="font-medium text-foreground mb-0.5">Contact 1</p>
                          <div className="flex items-center gap-1">
                            <UserIcon className="w-3 h-3" />
                            <span>{tenant.contactPerson1}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Phone className="w-3 h-3" />
                            <span>{tenant.phone1}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Mail className="w-3 h-3" />
                            <span>{tenant.email1}</span>
                          </div>
                        </div>
                        <div>
                          <p className="font-medium text-foreground mb-0.5">Contact 2</p>
                          <div className="flex items-center gap-1">
                            <UserIcon className="w-3 h-3" />
                            <span>{tenant.contactPerson2}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Phone className="w-3 h-3" />
                            <span>{tenant.phone2}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Mail className="w-3 h-3" />
                            <span>{tenant.email2}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEdit(tenant)}
                        data-testid={`button-edit-tenant-${tenant.id}`}
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      {isAdmin && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-500 hover:text-red-600 hover:bg-red-50"
                          onClick={() => setDeleteConfirmId(tenant.id)}
                          data-testid={`button-delete-tenant-${tenant.id}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between gap-2 pt-1">
              <p className="text-xs text-muted-foreground">
                {filtered.length} tenant{filtered.length !== 1 ? "s" : ""} · Page {safePage} of {totalPages}
              </p>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={safePage === 1}
                  data-testid="button-prev-page"
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                  <Button
                    key={p}
                    variant={p === safePage ? "default" : "outline"}
                    size="sm"
                    className="h-8 w-8 p-0 text-xs"
                    onClick={() => setPage(p)}
                    data-testid={`button-page-${p}`}
                  >
                    {p}
                  </Button>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={safePage === totalPages}
                  data-testid="button-next-page"
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
          </>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingTenant ? "Edit Tenant" : "New Tenant"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-1">
            <Card>
              <CardHeader className="pb-2 pt-3 px-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Company Details</p>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-3">
                <div className="space-y-1.5">
                  <Label>Company Name *</Label>
                  <Input placeholder="Acme Corp" {...f("companyName")} data-testid="input-tenant-company" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>KLX *</Label>
                    <Input placeholder="KLX" {...f("klx")} data-testid="input-tenant-klx" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>KL Customer Number *</Label>
                    <Input placeholder="0010XXXXXX" {...f("klCustomerNumber")} data-testid="input-tenant-klcn" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2 pt-3 px-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Contact Person 1</p>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-3">
                <div className="space-y-1.5">
                  <Label>Name *</Label>
                  <Input placeholder="Jane Smith" {...f("contactPerson1")} data-testid="input-tenant-contact1" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Phone *</Label>
                    <Input placeholder="+1 555 0101" {...f("phone1")} data-testid="input-tenant-phone1" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Email *</Label>
                    <Input type="email" placeholder="jane@company.com" {...f("email1")} data-testid="input-tenant-email1" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2 pt-3 px-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Contact Person 2</p>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-3">
                <div className="space-y-1.5">
                  <Label>Name *</Label>
                  <Input placeholder="John Smith" {...f("contactPerson2")} data-testid="input-tenant-contact2" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Phone *</Label>
                    <Input placeholder="+1 555 0102" {...f("phone2")} data-testid="input-tenant-phone2" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Email *</Label>
                    <Input type="email" placeholder="john@company.com" {...f("email2")} data-testid="input-tenant-email2" />
                  </div>
                </div>
              </CardContent>
            </Card>

            {formError && (
              <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                {formError}
              </div>
            )}

            <Button
              className="w-full"
              onClick={handleSubmit}
              disabled={isPending}
              data-testid="button-save-tenant"
            >
              {isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : null}
              {editingTenant ? "Save Changes" : "Create Tenant"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteConfirmId} onOpenChange={(open) => !open && setDeleteConfirmId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Tenant</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <p className="text-sm text-muted-foreground">
              Are you sure you want to delete this tenant? This action cannot be undone. Existing inspections linked to this tenant will retain their data.
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setDeleteConfirmId(null)}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                className="flex-1"
                onClick={() => deleteConfirmId && deleteMutation.mutate(deleteConfirmId)}
                disabled={deleteMutation.isPending}
                data-testid="button-confirm-delete-tenant"
              >
                {deleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                Delete
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
