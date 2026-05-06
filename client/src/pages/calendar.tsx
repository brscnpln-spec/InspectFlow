import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronLeft, ChevronRight, Clock, RefreshCw } from "lucide-react";
import { useState, useMemo } from "react";
import { Link } from "wouter";
import type { InspectionRequest, User } from "@shared/schema";
import { useAuth } from "@/lib/auth";

const MEMBER_COLORS = [
  { bg: "bg-blue-100 dark:bg-blue-900/40", border: "border-blue-400", text: "text-blue-800 dark:text-blue-200", dot: "bg-blue-500" },
  { bg: "bg-emerald-100 dark:bg-emerald-900/40", border: "border-emerald-400", text: "text-emerald-800 dark:text-emerald-200", dot: "bg-emerald-500" },
  { bg: "bg-purple-100 dark:bg-purple-900/40", border: "border-purple-400", text: "text-purple-800 dark:text-purple-200", dot: "bg-purple-500" },
  { bg: "bg-orange-100 dark:bg-orange-900/40", border: "border-orange-400", text: "text-orange-800 dark:text-orange-200", dot: "bg-orange-500" },
  { bg: "bg-pink-100 dark:bg-pink-900/40", border: "border-pink-400", text: "text-pink-800 dark:text-pink-200", dot: "bg-pink-500" },
  { bg: "bg-cyan-100 dark:bg-cyan-900/40", border: "border-cyan-400", text: "text-cyan-800 dark:text-cyan-200", dot: "bg-cyan-500" },
  { bg: "bg-amber-100 dark:bg-amber-900/40", border: "border-amber-400", text: "text-amber-800 dark:text-amber-200", dot: "bg-amber-500" },
  { bg: "bg-rose-100 dark:bg-rose-900/40", border: "border-rose-400", text: "text-rose-800 dark:text-rose-200", dot: "bg-rose-500" },
  { bg: "bg-indigo-100 dark:bg-indigo-900/40", border: "border-indigo-400", text: "text-indigo-800 dark:text-indigo-200", dot: "bg-indigo-500" },
  { bg: "bg-teal-100 dark:bg-teal-900/40", border: "border-teal-400", text: "text-teal-800 dark:text-teal-200", dot: "bg-teal-500" },
];

const UNASSIGNED_COLOR = { bg: "bg-gray-100 dark:bg-gray-800", border: "border-gray-400", text: "text-gray-700 dark:text-gray-300", dot: "bg-gray-400" };

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

function nextBusinessDay(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  if (day === 6) d.setDate(d.getDate() + 2);
  else if (day === 0) d.setDate(d.getDate() + 1);
  return d;
}

function toDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

type CalendarEvent = {
  inspection: InspectionRequest;
  date: string;
  isRecurring: boolean;
  occurrenceNum: number;
};

const MAX_RECURRING_OCCURRENCES = 60;
const RECURRING_YEARS_AHEAD = 3;

export default function CalendarPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [currentYear, setCurrentYear] = useState(today.getFullYear());

  const { data: inspections, isLoading: loadingInspections } = useQuery<InspectionRequest[]>({
    queryKey: ["/api/inspections"],
  });

  const { data: members } = useQuery<Omit<User, "password">[]>({
    queryKey: ["/api/users/service-members"],
  });

  const memberColorMap = useMemo(() => {
    const map = new Map<string, typeof MEMBER_COLORS[0]>();
    if (members) {
      members.forEach((m, i) => {
        map.set(m.id, MEMBER_COLORS[i % MEMBER_COLORS.length]);
      });
    }
    return map;
  }, [members]);

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    if (!inspections) return map;

    const cutoff = new Date();
    cutoff.setFullYear(cutoff.getFullYear() + RECURRING_YEARS_AHEAD);

    const addEvent = (event: CalendarEvent) => {
      const existing = map.get(event.date) ?? [];
      existing.push(event);
      map.set(event.date, existing);
    };

    inspections.forEach((insp) => {
      if (!insp.inspectionDate) return;

      addEvent({ inspection: insp, date: insp.inspectionDate, isRecurring: false, occurrenceNum: 0 });

      if (insp.recurringDays && insp.recurringDays > 0) {
        const baseDate = new Date(`${insp.inspectionDate}T12:00:00`);
        const msPerDay = 86_400_000;

        for (let n = 1; n <= MAX_RECURRING_OCCURRENCES; n++) {
          const rawDate = new Date(baseDate.getTime() + n * insp.recurringDays * msPerDay);
          if (rawDate > cutoff) break;

          const adjusted = nextBusinessDay(rawDate);
          addEvent({ inspection: insp, date: toDateStr(adjusted), isRecurring: true, occurrenceNum: n });
        }
      }
    });

    return map;
  }, [inspections]);

  const daysInMonth = getDaysInMonth(currentYear, currentMonth);
  const firstDay = getFirstDayOfMonth(currentYear, currentMonth);

  const prevMonth = () => {
    if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear(currentYear - 1); }
    else setCurrentMonth(currentMonth - 1);
  };

  const nextMonth = () => {
    if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear(currentYear + 1); }
    else setCurrentMonth(currentMonth + 1);
  };

  const goToToday = () => {
    setCurrentMonth(today.getMonth());
    setCurrentYear(today.getFullYear());
  };

  const getColorForMember = (memberId: string | null) =>
    memberId ? (memberColorMap.get(memberId) ?? UNASSIGNED_COLOR) : UNASSIGNED_COLOR;

  const getMemberName = (memberId: string | null) => {
    if (!memberId || !members) return "Unassigned";
    return members.find((m) => m.id === memberId)?.name ?? "Unknown";
  };

  const calendarCells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) calendarCells.push(null);
  for (let d = 1; d <= daysInMonth; d++) calendarCells.push(d);

  if (loadingInspections) {
    return (
      <div className="p-6 space-y-4 overflow-auto h-full" data-testid="calendar-loading">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-[600px] w-full" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4 overflow-auto h-full" data-testid="page-calendar">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold" data-testid="calendar-title">Calendar</h1>
          <p className="text-sm text-muted-foreground">
            {isAdmin ? "All scheduled inspections" : "Your scheduled inspections"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={goToToday} data-testid="button-today">
            Today
          </Button>
          <Button variant="outline" size="icon" onClick={prevMonth} data-testid="button-prev-month">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-lg font-semibold min-w-[180px] text-center" data-testid="calendar-month-year">
            {MONTHS[currentMonth]} {currentYear}
          </span>
          <Button variant="outline" size="icon" onClick={nextMonth} data-testid="button-next-month">
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {isAdmin && members && members.length > 0 && (
        <Card>
          <CardContent className="p-3">
            <div className="flex flex-wrap gap-3" data-testid="member-legend">
              {members.map((m) => {
                const color = getColorForMember(m.id);
                return (
                  <div key={m.id} className="flex items-center gap-1.5 text-xs">
                    <span className={`w-3 h-3 rounded-full ${color.dot}`} />
                    <span className="font-medium">{m.name}</span>
                  </div>
                );
              })}
              <div className="flex items-center gap-1.5 text-xs">
                <span className={`w-3 h-3 rounded-full ${UNASSIGNED_COLOR.dot}`} />
                <span className="font-medium text-muted-foreground">Unassigned</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground border-l pl-3">
                <RefreshCw className="w-3 h-3" />
                <span>Recurring</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          <div className="grid grid-cols-7 border-b">
            {DAYS.map((day) => (
              <div key={day} className="p-2 text-center text-xs font-semibold text-muted-foreground border-r last:border-r-0">
                {day}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {calendarCells.map((day, idx) => {
              if (day === null) {
                return <div key={`empty-${idx}`} className="min-h-[100px] border-r border-b last:border-r-0 bg-muted/30" />;
              }

              const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              const dayEvents = eventsByDate.get(dateStr) ?? [];
              const isToday =
                day === today.getDate() &&
                currentMonth === today.getMonth() &&
                currentYear === today.getFullYear();

              return (
                <div
                  key={`day-${day}`}
                  className={`min-h-[100px] border-r border-b last:border-r-0 p-1 ${isToday ? "bg-[#ffb800]/5" : ""}`}
                  data-testid={`calendar-day-${day}`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span
                      className={`text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full ${
                        isToday ? "bg-[#ffb800] text-black font-bold" : "text-muted-foreground"
                      }`}
                    >
                      {day}
                    </span>
                    {dayEvents.length > 0 && (
                      <Badge variant="secondary" className="text-[10px] h-4 px-1">
                        {dayEvents.length}
                      </Badge>
                    )}
                  </div>
                  <div className="space-y-1">
                    {dayEvents.slice(0, 3).map((event) => {
                      const { inspection: insp, isRecurring, occurrenceNum } = event;
                      const color = getColorForMember(insp.assignedServiceMemberId);
                      const isPending = insp.assignmentStatus === "pending";
                      return (
                        <Link
                          key={`${insp.id}-${occurrenceNum}`}
                          href={`/inspections/${insp.id}`}
                          data-testid={`calendar-event-${insp.id}${isRecurring ? `-r${occurrenceNum}` : ""}`}
                        >
                          <div
                            className={`${color.bg} ${color.text} border-l-2 ${color.border} rounded-r px-1.5 py-0.5 text-[10px] leading-tight cursor-pointer hover:opacity-80 transition-opacity truncate ${
                              isPending ? "opacity-40 border-dashed" : ""
                            } ${isRecurring ? "opacity-75" : ""}`}
                          >
                            <div className="font-semibold truncate flex items-center gap-0.5">
                              {isPending && <Clock className="w-2.5 h-2.5 flex-shrink-0" />}
                              {isRecurring && <RefreshCw className="w-2.5 h-2.5 flex-shrink-0 opacity-70" />}
                              {insp.companyName}
                            </div>
                            {isAdmin && (
                              <div className="truncate opacity-75">
                                {isPending ? "⏳ " : ""}{getMemberName(insp.assignedServiceMemberId)}
                              </div>
                            )}
                            {insp.inspectionTime && (
                              <div className="flex items-center gap-0.5 opacity-75">
                                <Clock className="w-2.5 h-2.5" />
                                {insp.inspectionTime}
                              </div>
                            )}
                          </div>
                        </Link>
                      );
                    })}
                    {dayEvents.length > 3 && (
                      <div className="text-[10px] text-muted-foreground text-center">
                        +{dayEvents.length - 3} more
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
