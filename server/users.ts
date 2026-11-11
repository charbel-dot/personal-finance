import { z } from 'zod';
import { id, username as usernameSchema, type Role, type UserSummary } from '../shared/schema';
import { hashPassword, randomId } from './crypto';
import { ValidationError, NotFoundError } from './data';
import type { Env } from './env';
import { listKeys, readJson, updateJson } from './store';

/**
 * Accounts. The owner is the account configured with the AUTH_USERNAME / AUTH_PASSWORD_HASH
 * secrets; their data lives at the bucket root, exactly where it always has (no migration).
 * Every other user is created by the owner, stored in `auth/users.json`, and keeps their data
 * under `users/<id>/`, so one user's requests can never read or write another user's objects.
 */

export const OWNER_ID = 'owner';
const USERS_KEY = 'auth/users.json';
const MAX_USERS = 50;

const userRecord = z.object({
  id,
  username: usernameSchema,
  passwordHash: z.string().min(1),
  createdAt: z.string(),
});
type UserRecord = z.infer<typeof userRecord>;
const usersDoc = z.object({ items: z.array(userRecord) });
const emptyUsers = () => ({ items: [] as UserRecord[] });

/** Who a request acts as. `secret` feeds the session fingerprint: a new password ends old sessions. */
export interface Principal {
  id: string;
  username: string;
  role: Role;
  secret: string;
}

export function ownerPrincipal(env: Env): Principal {
  return { id: OWNER_ID, username: env.AUTH_USERNAME, role: 'owner', secret: env.AUTH_PASSWORD_HASH };
}

const toPrincipal = (u: UserRecord): Principal => ({
  id: u.id,
  username: u.username,
  role: 'member',
  secret: u.passwordHash,
});

const summary = (u: UserRecord): UserSummary => ({ id: u.id, username: u.username, createdAt: u.createdAt });

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export async function listUsers(bucket: R2Bucket): Promise<UserSummary[]> {
  const { data } = await readJson(bucket, USERS_KEY, usersDoc, emptyUsers);
  return data.items.map(summary);
}

export async function findMember(bucket: R2Bucket, by: { id?: string; username?: string }) {
  const { data } = await readJson(bucket, USERS_KEY, usersDoc, emptyUsers);
  const user = data.items.find((u) =>
    by.id ? u.id === by.id : by.username ? sameName(u.username, by.username) : false,
  );
  return user ? { principal: toPrincipal(user), passwordHash: user.passwordHash } : null;
}

/** Resolves a session's user id; null when the user no longer exists. */
export async function principalFor(env: Env, uid: string): Promise<Principal | null> {
  if (uid === OWNER_ID) return ownerPrincipal(env);
  return (await findMember(env.BUCKET, { id: uid }))?.principal ?? null;
}

export async function createUser(env: Env, input: { username: string; password: string }): Promise<UserSummary> {
  if (sameName(input.username, env.AUTH_USERNAME)) throw new ValidationError('That username is taken');
  const passwordHash = await hashPassword(input.password);
  const { result } = await updateJson(env.BUCKET, USERS_KEY, usersDoc, emptyUsers, (current) => {
    if (current.items.some((u) => sameName(u.username, input.username))) {
      throw new ValidationError('That username is taken');
    }
    if (current.items.length >= MAX_USERS) throw new ValidationError(`You can have up to ${MAX_USERS} users`);
    const user: UserRecord = {
      id: randomId('u'),
      username: input.username,
      passwordHash,
      createdAt: new Date().toISOString(),
    };
    return { next: { items: [...current.items, user] }, result: summary(user) };
  });
  if (!result) throw new Error('User was not created');
  return result;
}

export async function setPassword(bucket: R2Bucket, userId: string, password: string): Promise<Principal> {
  const passwordHash = await hashPassword(password);
  const { result } = await updateJson(bucket, USERS_KEY, usersDoc, emptyUsers, (current) => {
    const user = current.items.find((u) => u.id === userId);
    if (!user) throw new NotFoundError('User');
    const next = { ...user, passwordHash };
    return { next: { items: current.items.map((u) => (u.id === userId ? next : u)) }, result: toPrincipal(next) };
  });
  if (!result) throw new NotFoundError('User');
  return result;
}

/** Removes the account and permanently deletes everything stored under it. */
export async function deleteUser(bucket: R2Bucket, userId: string): Promise<void> {
  const { changed } = await updateJson(bucket, USERS_KEY, usersDoc, emptyUsers, (current) => {
    const items = current.items.filter((u) => u.id !== userId);
    return items.length === current.items.length ? undefined : { next: { items }, result: undefined };
  });
  if (!changed) throw new NotFoundError('User');
  // Sweep twice: a request or cron run that passed its session check just before the account was
  // removed can still write once, after the first listing.
  await purgePrefix(bucket, userPrefix(userId));
  await purgePrefix(bucket, userPrefix(userId));
}

async function purgePrefix(bucket: R2Bucket, prefix: string) {
  const keys = await listKeys(bucket, prefix);
  const batches = [];
  for (let i = 0; i < keys.length; i += 1000) batches.push(keys.slice(i, i + 1000));
  await Promise.all(batches.map((batch) => bucket.delete(batch)));
}

export async function memberIds(bucket: R2Bucket): Promise<string[]> {
  const { data } = await readJson(bucket, USERS_KEY, usersDoc, emptyUsers);
  return data.items.map((u) => u.id);
}

function userPrefix(userId: string) {
  return `users/${userId}/`;
}

/**
 * The storage a user's requests see. The owner gets the bucket itself; a member gets a view that
 * prefixes every key with their folder, so the data layer works unchanged and cannot escape it.
 */
export function dataBucket(bucket: R2Bucket, userId: string): R2Bucket {
  if (userId === OWNER_ID) return bucket;
  return scopedBucket(bucket, userPrefix(userId));
}

export function scopedBucket(bucket: R2Bucket, prefix: string): R2Bucket {
  const k = (key: string) => prefix + key;
  const scoped: Pick<R2Bucket, 'get' | 'head' | 'put' | 'delete' | 'list'> = {
    head: (key) => bucket.head(k(key)),
    get: (key: string, options?: R2GetOptions) => bucket.get(k(key), options),
    put: ((key: string, value: Parameters<R2Bucket['put']>[1], options?: R2PutOptions) =>
      bucket.put(k(key), value, options)) as R2Bucket['put'],
    delete: (keys) => bucket.delete(Array.isArray(keys) ? keys.map(k) : k(keys)),
    list: async (options) => {
      const page = await bucket.list({ ...options, prefix: prefix + (options?.prefix ?? '') });
      return {
        ...page,
        // Same object with the folder stripped from its key (an own property shadows the original).
        objects: page.objects.map((o) =>
          Object.defineProperty(Object.create(o) as R2Object, 'key', { value: o.key.slice(prefix.length) }),
        ),
        delimitedPrefixes: page.delimitedPrefixes.map((p) => p.slice(prefix.length)),
      };
    },
  };
  return scoped as R2Bucket;
}
