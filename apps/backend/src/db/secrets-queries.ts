import { db } from './connection.ts'
import type { Secret, SecretCreate, SecretUpdate } from '../routes/secrets/models.ts'
import type { JWTUser } from '../routes/auth/token.ts'

// Get all secrets ordered alphabetically by secret_key
// If isAdmin is false, only MEMBER class secrets are returned
export const getAllSecrets = async (isAdmin: boolean): Promise<Secret[]> => {
  const secrets = await db
    .selectFrom('secrets')
    .select([
      'id',
      'secret_key as secretKey',
      'secret_value as secretValue',
      'secret_class as secretClass',
      'created_at as createdAt',
      'updated_at as updatedAt',
      'created_by as createdBy',
      'updated_by as updatedBy',
    ])
    .$if(!isAdmin, (qb) => qb.where('secret_class', '=', 'MEMBER'))
    .orderBy('secret_key', 'asc')
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
      'secret_key as secretKey',
      'secret_value as secretValue',
      'secret_class as secretClass',
      'created_at as createdAt',
      'updated_at as updatedAt',
      'created_by as createdBy',
      'updated_by as updatedBy',
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
      secret_key: secret.secretKey,
      secret_value: secret.secretValue,
      secret_class: secret.secretClass,
      created_by: user.memberId,
      updated_by: user.memberId,
    })
    .returning([
      'id',
      'secret_key as secretKey',
      'secret_value as secretValue',
      'secret_class as secretClass',
      'created_at as createdAt',
      'updated_at as updatedAt',
      'created_by as createdBy',
      'updated_by as updatedBy',
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
      ...(secret.secretKey && { secret_key: secret.secretKey }),
      ...(secret.secretValue && { secret_value: secret.secretValue }),
      ...(secret.secretClass && { secret_class: secret.secretClass }),
      updated_by: user.memberId,
      updated_at: new Date().toISOString(),
    })
    .where('id', '=', String(id))
    .returning([
      'id',
      'secret_key as secretKey',
      'secret_value as secretValue',
      'secret_class as secretClass',
      'created_at as createdAt',
      'updated_at as updatedAt',
      'created_by as createdBy',
      'updated_by as updatedBy',
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
