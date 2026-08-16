import { db } from './connection.ts'
import type { Secret, SecretCreate, SecretUpdate } from '@mik/contracts/secrets'
import type { JWTUser } from '../routes/auth/token.ts'

// Get all secrets ordered alphabetically by secret_key
// If isAdmin is false, only MEMBER class secrets are returned
export const getAllSecrets = async (isAdmin: boolean): Promise<Secret[]> => {
  const secrets = await db
    .selectFrom('secrets')
    .select([
      'id',
      'secretKey',
      'secretValue',
      'secretClass',
      'createdAt',
      'updatedAt',
      'createdBy',
      'updatedBy',
    ])
    .$if(!isAdmin, (qb) => qb.where('secretClass', '=', 'MEMBER'))
    .orderBy('secretKey', 'asc')
    .execute()

  return secrets.map((secret) => ({
    ...secret,
    id: Number(secret.id),
    createdAt: secret.createdAt.toISOString(),
    updatedAt: secret.updatedAt.toISOString(),
  }))
}

// Get a single secret by ID
export const getSecretById = async (id: number): Promise<Secret | undefined> => {
  const secret = await db
    .selectFrom('secrets')
    .select([
      'id',
      'secretKey',
      'secretValue',
      'secretClass',
      'createdAt',
      'updatedAt',
      'createdBy',
      'updatedBy',
    ])
    .where('id', '=', String(id))
    .executeTakeFirst()

  if (!secret) {
    return undefined
  }

  return {
    ...secret,
    id: Number(secret.id),
    createdAt: secret.createdAt.toISOString(),
    updatedAt: secret.updatedAt.toISOString(),
  }
}

// Create a new secret
export const createSecret = async (secret: SecretCreate, user: JWTUser): Promise<Secret> => {
  const newSecret = await db
    .insertInto('secrets')
    .values({
      secretKey: secret.secretKey,
      secretValue: secret.secretValue,
      secretClass: secret.secretClass,
      createdBy: user.memberId,
      updatedBy: user.memberId,
    })
    .returning([
      'id',
      'secretKey',
      'secretValue',
      'secretClass',
      'createdAt',
      'updatedAt',
      'createdBy',
      'updatedBy',
    ])
    .executeTakeFirstOrThrow()

  return {
    ...newSecret,
    id: Number(newSecret.id),
    createdAt: newSecret.createdAt.toISOString(),
    updatedAt: newSecret.updatedAt.toISOString(),
  }
}

// Update an existing secret
export const updateSecret = async (
  id: number,
  secret: SecretUpdate,
  user: JWTUser,
): Promise<Secret | undefined> => {
  const updatedSecret = await db
    .updateTable('secrets')
    .set({
      ...(secret.secretKey && { secretKey: secret.secretKey }),
      ...(secret.secretValue && { secretValue: secret.secretValue }),
      ...(secret.secretClass && { secretClass: secret.secretClass }),
      updatedBy: user.memberId,
      updatedAt: new Date().toISOString(),
    })
    .where('id', '=', String(id))
    .returning([
      'id',
      'secretKey',
      'secretValue',
      'secretClass',
      'createdAt',
      'updatedAt',
      'createdBy',
      'updatedBy',
    ])
    .executeTakeFirst()

  if (!updatedSecret) {
    return undefined
  }

  return {
    ...updatedSecret,
    id: Number(updatedSecret.id),
    createdAt: updatedSecret.createdAt.toISOString(),
    updatedAt: updatedSecret.updatedAt.toISOString(),
  }
}

// Delete a secret
export const deleteSecret = async (id: number): Promise<boolean> => {
  const result = await db.deleteFrom('secrets').where('id', '=', String(id)).execute()

  return result.length > 0 && Number(result[0].numDeletedRows) > 0
}
