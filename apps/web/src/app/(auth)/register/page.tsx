"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import React, { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { api, ApiError } from "@/lib/api";
import { useApp } from "@/lib/app-context";

export default function RegisterPage() {
  const router = useRouter();
  const { bootstrap } = useApp();
  const toast = useToast();
  const [form, setForm] = useState({ full_name: "", email: "", workspace_name: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: e.target.value });

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (form.password.length < 10) {
      setError("Password must be at least 10 characters.");
      return;
    }
    setLoading(true);
    try {
      await api.post("/api/v1/auth/register", form);
      await bootstrap();
      toast.success("Workspace created", "Welcome to ContentCal — let’s plan something great.");
      router.push("/dashboard");
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Registration failed. Please try again.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">Create your workspace</h1>
      <p className="mt-1.5 text-sm text-gray-500 dark:text-slate-400">Your calendar, content, and channels — all in one place.</p>

      <form onSubmit={onSubmit} className="mt-8 space-y-5" noValidate>
        {error && (
          <div role="alert" className="rounded-lg border border-rose-100 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">
            {error}
          </div>
        )}
        <div>
          <Label htmlFor="full_name">Your name</Label>
          <Input id="full_name" autoComplete="name" required value={form.full_name} onChange={set("full_name")} placeholder="Maya Chen" />
        </div>
        <div>
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" autoComplete="email" required value={form.email} onChange={set("email")} placeholder="you@studio.com" />
        </div>
        <div>
          <Label htmlFor="workspace_name">Workspace name</Label>
          <Input id="workspace_name" required value={form.workspace_name} onChange={set("workspace_name")} placeholder="Northwind Studio" />
        </div>
        <div>
          <Label htmlFor="password" hint="min. 10 characters">
            Password
          </Label>
          <Input id="password" type="password" autoComplete="new-password" required value={form.password} onChange={set("password")} placeholder="••••••••••" />
        </div>
        <Button type="submit" size="lg" loading={loading} className="w-full">
          Create workspace
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-gray-500 dark:text-slate-400">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-brand-600 transition-colors hover:text-brand-700">
          Sign in
        </Link>
      </p>
    </>
  );
}
