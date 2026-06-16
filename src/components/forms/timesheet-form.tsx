"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { AppDatePicker } from "@/components/ui/date-picker";
import { createTimesheet, updateTimesheet } from "@/actions/hrm.actions";
import { showSuccess, showError } from "@/lib/utils/toast";
import { Label } from "@/components/ui/shadcn/label";
import { Input } from "@/components/ui/shadcn/input";
import { Textarea } from "@/components/ui/shadcn/textarea";
import { Combobox } from "@/components/ui/combobox";
import { AppTimePicker } from "@/components/ui/time-picker";
import {
  FormCard,
  FormSection,
  FormActions,
} from "@/components/ui/form-section";
import { Button } from "@/components/ui/button";

interface TimesheetFormProps {
  employees: { id: number; name: string }[];
  projects: { id: number; name: string }[];
  tasks?: { id: number; title: string; projectId: number }[];
  timesheet?: {
    id: number;
    employeeId: number;
    projectId: number;
    taskId?: number | null;
    date: string;
    startTime?: string | null;
    endTime?: string | null;
    hours: number;
    description?: string | null;
  };
  breakStart?: string | null;
  breakEnd?: string | null;
}

export function TimesheetForm({
  employees,
  projects,
  tasks = [],
  timesheet,
  breakStart,
  breakEnd,
}: TimesheetFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [employeeId, setEmployeeId] = useState<string | null>(
    timesheet ? String(timesheet.employeeId) : null,
  );
  const [projectId, setProjectId] = useState<string | null>(
    timesheet?.projectId ? String(timesheet.projectId) : null,
  );
  const [taskId, setTaskId] = useState<string | null>(
    timesheet?.taskId ? String(timesheet.taskId) : null,
  );
  const [startTime, setStartTime] = useState(timesheet?.startTime ?? "");
  const [endTime, setEndTime] = useState(timesheet?.endTime ?? "");
  const [hours, setHours] = useState(
    timesheet?.hours != null ? String(timesheet.hours) : "",
  );

  function computeHours(start: string, end: string): string {
    if (!start || !end) return "";
    const toMin = (t: string) => {
      const [h, m] = t.split(":").map(Number);
      return Number.isNaN(h) || Number.isNaN(m) ? null : h * 60 + m;
    };
    const sMin = toMin(start);
    const eMin = toMin(end);
    if (sMin == null || eMin == null) return "";
    let workMin = eMin - sMin;
    if (workMin < 0) workMin += 24 * 60; // melewati tengah malam

    // Kurangi irisan dengan jam istirahat (dari Pengaturan)
    const bs = breakStart ? toMin(breakStart) : null;
    const be = breakEnd ? toMin(breakEnd) : null;
    if (bs != null && be != null && be > bs) {
      const overlap = Math.max(0, Math.min(eMin, be) - Math.max(sMin, bs));
      workMin -= overlap;
    }
    if (workMin < 0) workMin = 0;
    return String(Math.round((workMin / 60) * 100) / 100);
  }

  function handleStartChange(value: string) {
    setStartTime(value);
    const computed = computeHours(value, endTime);
    if (computed) setHours(computed);
  }

  function handleEndChange(value: string) {
    setEndTime(value);
    const computed = computeHours(startTime, value);
    if (computed) setHours(computed);
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    startTransition(async () => {
      try {
        const formData = new FormData(e.currentTarget);
        const result = timesheet?.id
          ? await updateTimesheet(timesheet.id, formData)
          : await createTimesheet(formData);
        if (result && !result.success) {
          showError(result.error || "Gagal menyimpan data");
          return;
        }
        showSuccess(
          timesheet?.id
            ? "Data berhasil diperbarui"
            : "Data berhasil ditambahkan",
        );
        router.push("/sdm/lembar-waktu");
        router.refresh();
      } catch (error) {
        showError(
          error instanceof Error ? error.message : "Gagal menyimpan data",
        );
      }
    });
  }

  return (
    <form onSubmit={onSubmit}>
      <FormCard>
        <FormSection title="Informasi Umum">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="employeeId">Karyawan *</Label>
            <Combobox
              id="employeeId"
              name="employeeId"
              options={employees.map((e) => ({
                value: String(e.id),
                label: e.name,
              }))}
              value={employeeId}
              onChange={setEmployeeId}
              placeholder="Cari karyawan..."
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="projectId">Proyek *</Label>
            <Combobox
              id="projectId"
              name="projectId"
              options={projects.map((p) => ({
                value: String(p.id),
                label: p.name,
              }))}
              value={projectId}
              onChange={setProjectId}
              placeholder="Cari proyek..."
            />
          </div>
          {tasks.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="taskId">Tugas</Label>
              <Combobox
                id="taskId"
                name="taskId"
                options={tasks.map((t) => ({
                  value: String(t.id),
                  label: t.title,
                }))}
                value={taskId}
                onChange={setTaskId}
                placeholder="Cari tugas..."
              />
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <AppDatePicker
              label="Tanggal *"
              name="date"
              defaultValue={timesheet?.date ?? ""}
              onChange={() => {}}
              required
            />
          </div>
        </FormSection>
        <FormSection title="Detail Jam">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="startTime">Jam Mulai</Label>
            <AppTimePicker
              id="startTime"
              name="startTime"
              value={startTime}
              onChange={handleStartChange}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="endTime">Jam Selesai</Label>
            <AppTimePicker
              id="endTime"
              name="endTime"
              value={endTime}
              onChange={handleEndChange}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="hours">Total Jam *</Label>
            <Input
              id="hours"
              name="hours"
              type="number"
              step="0.25"
              min="0.25"
              max="24"
              required
              readOnly
              value={hours}
              placeholder="Otomatis dari jam mulai & selesai"
              className="bg-muted"
            />
          </div>
        </FormSection>
        <FormSection title="Lainnya" columns={1}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="description">Deskripsi Pekerjaan</Label>
            <Textarea
              id="description"
              name="description"
              rows={3}
              placeholder="Deskripsi pekerjaan yang dilakukan..."
              defaultValue={timesheet?.description ?? ""}
            />
          </div>
        </FormSection>
        <FormActions>
          <Button type="button" onPress={() => router.back()}>
            Batal
          </Button>
          <Button type="submit" variant="primary" isDisabled={isPending}>
            {isPending ? "Menyimpan..." : timesheet?.id ? "Perbarui" : "Simpan"}
          </Button>
        </FormActions>
      </FormCard>
    </form>
  );
}
