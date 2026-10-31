import { cookies } from "next/headers";
import { ObjectId } from "mongodb";
import { database } from "./db";
import { newToken, tokenHash } from "./security";
import type { User, Profile } from "./types";
export const COOKIE = "compass_session";
export async function identity() {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const db = await database();
  const s = await db
    .collection("sessions")
    .findOne({
      _id: tokenHash(token) as never,
      expiresAt: { $gt: new Date() },
    });
  if (!s) return null;
  return db.collection("users").findOne({ _id: new ObjectId(s.userId) });
}
export async function publicUser(
  u: NonNullable<Awaited<ReturnType<typeof identity>>>,
): Promise<User> {
  const resume = await (
    await database()
  )
    .collection("resumes")
    .findOne(
      { userId: u._id.toString() },
      { projection: { name: 1, size: 1 } },
    );
  return {
    id: u._id.toString(),
    email: u.email,
    profile: u.profile as Profile,
    resume: resume ? { name: resume.name, size: resume.size } : null,
  };
}
export async function makeSession(userId: string) {
  const token = newToken();
  await (
    await database()
  )
    .collection("sessions")
    .insertOne({
      _id: tokenHash(token) as never,
      userId,
      expiresAt: new Date(Date.now() + 7 * 86400000),
    });
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.APP_ORIGIN?.startsWith("https:") || false,
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 86400,
  });
}
export async function logout() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token)
    await (
      await database()
    )
      .collection("sessions")
      .deleteOne({ _id: tokenHash(token) as never });
  jar.delete(COOKIE);
}
