import "server-only";
import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { and, eq, ne, sql } from "drizzle-orm";
import { createDb } from "@/db";
import * as schema from "@/db/schema";
import { getEnv, type AppEnv, appUrl, secret, isProduction, mediaBucket } from "@/lib/env";
import { actionEmail, sendEmail } from "@/lib/email";

function buildAuth(env: AppEnv) {
  const db = createDb(env.DB);
  const socialProviders: Record<string, { clientId: string; clientSecret: string }> = {};
  const gId = secret("GOOGLE_CLIENT_ID", env);
  const gSecret = secret("GOOGLE_CLIENT_SECRET", env);
  if (gId && gSecret) socialProviders.google = { clientId: gId, clientSecret: gSecret };
  const ghId = secret("GITHUB_CLIENT_ID", env);
  const ghSecret = secret("GITHUB_CLIENT_SECRET", env);
  if (ghId && ghSecret) socialProviders.github = { clientId: ghId, clientSecret: ghSecret };

  return betterAuth({
    appName: "CommonGround",
    baseURL: appUrl(env),
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [appUrl(env)],
    database: drizzleAdapter(db, {
      provider: "sqlite",
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
        rateLimit: schema.rateLimit,
      },
    }),
    advanced: { database: { generateId: "uuid" }, useSecureCookies: isProduction(env) },
    session: { expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24, freshAge: 60 * 15 },
    emailAndPassword: {
      enabled: true,
      // Without a mail provider in production nobody could verify their email, so refuse sign-ups outright.
      disableSignUp: !emailReady(env),
      requireEmailVerification: true,
      minPasswordLength: 10,
      maxPasswordLength: 128,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        const m = actionEmail({
          heading: "Reset your CommonGround password",
          body: "Someone (hopefully you) asked to reset the password for this account. The link expires in one hour.",
          cta: "Choose a new password",
          url,
        });
        await sendEmail(env, { to: user.email, subject: "Reset your password", ...m, url });
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) => {
        const m = actionEmail({
          heading: "Confirm your email",
          body: "Welcome to CommonGround. Confirm your email address to start posting and collaborating.",
          cta: "Confirm email",
          url,
        });
        await sendEmail(env, { to: user.email, subject: "Confirm your email for CommonGround", ...m, url });
      },
    },
    socialProviders,
    account: { encryptOAuthTokens: true, accountLinking: { enabled: true, trustedProviders: ["google", "github"] } },
    user: {
      deleteUser: {
        enabled: true,
        beforeDelete: async (u) => {
          // Owners must hand over or archive projects that other people depend on.
          const shared = await db
            .select({ id: schema.projects.id, title: schema.projects.title })
            .from(schema.projects)
            .innerJoin(schema.projectMembers, eq(schema.projectMembers.projectId, schema.projects.id))
            .where(and(eq(schema.projects.ownerId, u.id), ne(schema.projectMembers.userId, u.id), sql`${schema.projects.status} != 'archived'`))
            .limit(1);
          if (shared.length) {
            throw new APIError("BAD_REQUEST", {
              message: `Transfer or archive "${shared[0].title}" before deleting your account — other members depend on it.`,
            });
          }
        },
        afterDelete: async (u) => {
          const keys = await db.select({ key: schema.media.key }).from(schema.media).where(eq(schema.media.ownerId, u.id));
          const bucket = mediaBucket(env);
          if (bucket) await Promise.all(keys.map((k) => bucket.delete(k.key)));
        },
      },
    },
    rateLimit: {
      enabled: true,
      storage: "database",
      modelName: "rateLimit",
      window: 60,
      max: 60,
      customRules: {
        "/sign-in/email": { window: 60, max: 8 },
        "/sign-up/email": { window: 3600, max: 10 },
        "/request-password-reset": { window: 3600, max: 5 },
        "/send-verification-email": { window: 3600, max: 5 },
      },
    },
    plugins: [nextCookies()],
  });
}

type Auth = ReturnType<typeof buildAuth>;
const cache = new WeakMap<object, Auth>();

export function getAuth(env: AppEnv = getEnv()): Auth {
  let a = cache.get(env.DB);
  if (!a) {
    a = buildAuth(env);
    cache.set(env.DB, a);
  }
  return a;
}

export function emailReady(env: AppEnv = getEnv()) {
  return !isProduction(env) || Boolean(secret("RESEND_API_KEY", env) && secret("EMAIL_FROM", env));
}

export function enabledSocialProviders(env: AppEnv = getEnv()) {
  return {
    google: Boolean(secret("GOOGLE_CLIENT_ID", env) && secret("GOOGLE_CLIENT_SECRET", env)),
    github: Boolean(secret("GITHUB_CLIENT_ID", env) && secret("GITHUB_CLIENT_SECRET", env)),
  };
}
