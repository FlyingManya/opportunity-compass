import { handleAgent } from "@/lib/agent-api";
import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { Binary, MongoServerError } from "mongodb";
import { database, SetupError } from "@/lib/db";
import { identity, publicUser, makeSession, logout } from "@/lib/auth";
import {
  hashPassword,
  checkPassword,
  tokenHash,
  sameOrigin,
} from "@/lib/security";
import {
  signupSchema,
  loginSchema,
  profileSchema,
  savedSchema,
} from "@/lib/validation";
import { emptyProfile } from "@/lib/types";
import { catalog } from "@/lib/catalog";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 210;
const json = (data: unknown, status = 200) =>
  NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
async function input(req: NextRequest) {
  if (!req.headers.get("content-type")?.startsWith("application/json"))
    throw new Error("JSON_REQUIRED");
  const text = await req.text();
  if (text.length > 3_000_000) throw Error("TOO_LARGE");
  return JSON.parse(text);
}
async function throttle(email: string) {
  const db = await database();
  const bucket = Math.floor(Date.now() / 900000);
  const result = await db.collection("rate_limits").findOneAndUpdate(
    { _id: tokenHash(`${email}:${bucket}`) as never },
    {
      $inc: { count: 1 },
      $setOnInsert: { expiresAt: new Date(Date.now() + 1800000) },
    },
    { upsert: true, returnDocument: "after" },
  );
  return (result?.count || 0) <= 15;
}
async function handle(req: NextRequest) {
  try {
    const pathname = new URL(req.url).pathname.replace("/api/", "");
    if (req.method === "GET" && pathname === "status") {
      let db: "not-configured" | "connected" | "unavailable" = "not-configured";
      if (process.env.MONGODB_URI) {
        try {
          await (await database()).command({ ping: 1 });
          db = "connected";
        } catch {
          db = "unavailable";
        }
      }
      return json({
        database: db,
        research: "sample-data",
        calendar: "export-only",
      });
    }
    if (req.method !== "GET" && !sameOrigin(req.headers.get("origin"), req.url))
      return json({ error: "This request is not allowed." }, 403);
    if (req.method === "POST" && pathname === "auth/signup") {
      const b = signupSchema.parse(await input(req));
      const db = await database();
      if (!(await throttle(b.email)))
        return json(
          { error: "Too many attempts. Please try again in 15 minutes." },
          429,
        );
      const result = await db.collection("users").insertOne({
        email: b.email,
        passwordHash: await hashPassword(b.password),
        profile: { ...emptyProfile, name: b.name },
        createdAt: new Date(),
      });
      await makeSession(result.insertedId.toString());
      const u = await identity();
      return json({ user: await publicUser(u!) }, 201);
    }
    if (req.method === "POST" && pathname === "auth/login") {
      const b = loginSchema.parse(await input(req));
      const db = await database();
      if (!(await throttle(b.email)))
        return json(
          { error: "Too many attempts. Please try again in 15 minutes." },
          429,
        );
      const u = await db.collection("users").findOne({ email: b.email });
      const dummy =
        "compass-missing-user:00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000";
      const valid = await checkPassword(b.password, u?.passwordHash || dummy);
      if (!u || !valid)
        return json({ error: "The email or password is incorrect." }, 401);
      await makeSession(u._id.toString());
      return json({ user: await publicUser(u) });
    }
    if (req.method === "POST" && pathname === "auth/logout") {
      await logout();
      return json({ ok: true });
    }
    const u = await identity();
    if (req.method === "GET" && pathname === "me")
      return json({ user: u ? await publicUser(u) : null });
    if (!u)
      return json(
        { error: "Please sign in to save information to your account." },
        401,
      );
    const db = await database();
    const userId = u._id.toString();
    if (pathname.startsWith("agent/"))
      return await handleAgent(
        db,
        userId,
        u.profile,
        pathname,
        req.method,
        () => input(req),
      );
    if (req.method === "PUT" && pathname === "profile") {
      const profile = profileSchema.parse(await input(req));
      await db
        .collection("users")
        .updateOne(
          { _id: u._id },
          { $set: { profile, updatedAt: new Date() } },
        );
      return json({ user: await publicUser({ ...u, profile }) });
    }
    if (req.method === "GET" && pathname === "saved") {
      const items = await db
        .collection("saved")
        .find({ userId }, { projection: { _id: 0, userId: 0 } })
        .toArray();
      return json({ items });
    }
    if (req.method === "PUT" && pathname === "saved") {
      const b = savedSchema.parse(await input(req));
      const opportunity = catalog.find((o) => o.id === b.opportunityId);
      if (!opportunity) return json({ error: "Opportunity not found." }, 404);
      if (b.completedTasks.some((n) => n >= opportunity.tasks.length))
        return json({ error: "Invalid checklist item." }, 400);
      await db.collection("saved").updateOne(
        { userId, opportunityId: b.opportunityId },
        {
          $set: {
            status: b.status,
            completedTasks: [...new Set(b.completedTasks)],
          },
          $setOnInsert: { savedAt: new Date().toISOString() },
        },
        { upsert: true },
      );
      return json({ ok: true });
    }
    if (req.method === "DELETE" && pathname === "saved") {
      const b = await input(req);
      if (typeof b.opportunityId !== "string")
        return json({ error: "Choose an opportunity." }, 400);
      await db
        .collection("saved")
        .deleteOne({ userId, opportunityId: b.opportunityId });
      return json({ ok: true });
    }
    if (req.method === "POST" && pathname === "resume") {
      const b = await input(req);
      if (
        typeof b.name !== "string" ||
        typeof b.data !== "string" ||
        !["application/pdf", "text/plain"].includes(b.type)
      )
        return json({ error: "Choose a PDF or plain-text résumé." }, 400);
      const bytes = Buffer.from(b.data, "base64");
      if (bytes.length > 2 * 1024 * 1024 || !bytes.length)
        return json({ error: "Choose a file up to 2 MB." }, 400);
      if (
        b.type === "application/pdf" &&
        bytes.subarray(0, 5).toString() !== "%PDF-"
      )
        return json({ error: "This file is not a valid PDF." }, 400);
      await db.collection("resumes").updateOne(
        { userId },
        {
          $set: {
            name: b.name.slice(0, 180),
            type: b.type,
            size: bytes.length,
            data: new Binary(bytes),
            updatedAt: new Date(),
          },
        },
        { upsert: true },
      );
      return json({
        resume: { name: b.name.slice(0, 180), size: bytes.length },
      });
    }
    if (req.method === "GET" && pathname === "resume") {
      const r = await db.collection("resumes").findOne({ userId });
      if (!r) return json({ error: "No résumé uploaded yet." }, 404);
      return new Response(new Uint8Array(r.data.buffer), {
        headers: {
          "Content-Type": r.type,
          "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(r.name)}`,
          "Cache-Control": "no-store",
        },
      });
    }
    if (req.method === "DELETE" && pathname === "resume") {
      await db.collection("resumes").deleteOne({ userId });
      return json({ ok: true });
    }
    return json({ error: "Not found." }, 404);
  } catch (e) {
    if (e instanceof SetupError)
      return json({ error: e.message, code: "DATABASE_SETUP_REQUIRED" }, 503);
    if (e instanceof ZodError)
      return json(
        { error: e.issues[0]?.message || "Please check the form." },
        400,
      );
    if (e instanceof MongoServerError && e.code === 11000)
      return json(
        { error: "An account already exists for this email. Please sign in." },
        409,
      );
    if (e instanceof SyntaxError)
      return json({ error: "Invalid request." }, 400);
    return json(
      { error: "The request could not be completed. Please try again." },
      500,
    );
  }
}
export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const DELETE = handle;
