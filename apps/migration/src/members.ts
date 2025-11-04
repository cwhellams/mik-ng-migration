import { conn } from './services/db.ts'
import { type RegisterRequest } from '../../backend/src/routes/auth/schema.ts'
import { request } from './services/api.ts'
import {
  MIKLang,
  MIKMemberTypes,
  type Member,
} from '../../backend/src/routes/members/models.ts'
import dayjs from 'dayjs'
import type { Flight } from './flights.ts'

type WPUser = {
  ID: number
  user_login: string
  user_pass: string
  user_nicename: string
  user_email: string
  user_url: string
  user_registered: Date
  user_activation_key: string
  user_status: number
  display_name: string

  // store migrated mik member id here
  ng_id: string | null
}

type MemberMeta = {
  umeta_id: number
  user_id: number
  meta_key: string
  meta_value: string
}

type Yhdistysavain = {
  Jäsentyyppi: string
  Etunimi: string
  Sukunimi: string
  Syntymäaika: string
  Sähköpostiosoite: string
  Matkapuhelinnumero: string
  Lähiosoite: string
  Postinumero: string
  Postitoimipaikka: string
  Salasana: string
  'Jäsenmaksu 2018 on laskutettu': string
  Tarkkailulista: string
  'Odottaa tunnuksia jäsenalueelle': string
  'Irtisanoutuu kauden lopussa': string
  Aktiivinen: string
  Pääkäyttäjät: string
  Hallitus: string
  Täysjäsen: string
  Kannatusjäsen: string
  Nuorisojäsen: string
}

const roles: Record<number, string[]> = {
  373: ['ADMIN'], // Niko
  561: ['ADMIN'], // Juho
  330: ['ADMIN'], // Chris

  882: ['SECRETARY'], // Mika

  652: ['PLANE_CAPTAIN'], // Aleksi
  815: ['PLANE_CAPTAIN'], // Kalle
  856: ['PLANE_CAPTAIN', 'INSTRUCTOR'], // Jani
  1014: ['PLANE_CAPTAIN'], // Oskar

  1091: ['MAINTENANCE'], // Camo

  110: ['INSTRUCTOR'], // Stude
  1011: ['INSTRUCTOR'], // Jyrki
  170: ['INSTRUCTOR'], // Janne
  144: ['INSTRUCTOR'], // Jouko
  92: ['INSTRUCTOR'], // Harri
  138: ['INSTRUCTOR'], // Antti
  925: ['INSTRUCTOR'], // Thomas
}

export type Instructor = { ope_id: number; nimi: string }

export const migrateMembers = async (start: string, limit: number) => {
  // add mapping table
  await conn.query<WPUser[]>(
    `create table if not exists mik_ng (id bigint(20), username VARCHAR(60),ng_id VARCHAR(9))`
  )

  const members = await conn.query<WPUser[]>(
    `SELECT * FROM mikweb2_wp_users u
    where u.ID >= ${start}
    AND NOT exists(select 1 from mik_ng where id = u.ID)
    order by u.ID asc
    limit ${limit}`
  )

  const official = await conn.query<Yhdistysavain[]>(
    `SELECT * FROM Jasentiedot`
  )

  for (const member of members) {
    const meta = await conn.query<MemberMeta[]>(
      `SELECT * FROM mikweb2_wp_usermeta m 
      WHERE m.user_id = ${member.ID}`
    )

    const getMeta = (key: string): string | undefined => {
      return meta.find((m) => m.meta_key === key)?.meta_value
    }
    //console.log(meta)

    const officialData = official.find(
      (o) =>
        o['Sähköpostiosoite'] === member.user_email ||
        `${o['Etunimi']} ${o['Sukunimi']}` === member.display_name ||
        (getMeta('first_name') == o['Etunimi'] &&
          getMeta('last_name') == o['Sukunimi'])
    )

    try {
      if (officialData) {
        await migrateMember(member, officialData, getMeta)
      } else {
        const flights = await conn.query<{ count: number }[]>(
          `SELECT count(*) as count FROM kirja_lennot 
              WHERE username = ?`,
          [member.user_login]
        )

        const lastName = getMeta('last_name') || member.user_login

        const instructors = await conn.query<{ count: number }[]>(
          `SELECT count(*) as count from kirja_opettajat where nimi like '%${lastName}%'`
        )

        if (flights[0].count > 0 || instructors[0].count > 0) {
          await migrateRemovedMember(member, lastName)
        } else {
          console.log(
            `Skipping member ${member.ID}/${member.user_login}, no official data and no flights`
          )
        }
      }
    } catch (error) {
      console.error(`Failed to migrate member ${member.ID}:`, error)
      return
    }
  }
}

const migrateMember = async (
  member: WPUser,
  officialData: Yhdistysavain,
  getMeta: (key: string) => string | undefined
) => {
  // skip duplicate accounts
  if (
    getMeta('first_name') == 'Former' ||
    getMeta('last_name') == 'User' ||
    getMeta('wpum_jasentyyppi') == 'PIK' ||
    member.user_login.includes('testi') ||
    (getMeta('wpum_puhelinnumero') == '' &&
      getMeta('wpum_jasennumero') == '99999')
  ) {
    return console.log(`Skipping former user ${member.ID}/${member.user_login}`)
  }

  const memberType = getMemberType(officialData)

  const payload: RegisterRequest = {
    email: getEmail(member, officialData),
    firstName: officialData['Etunimi'],
    lastName: officialData['Sukunimi'],

    phoneNumber: getPhoneNumber(
      member,
      getMeta('wpum_puhelinnumero'),
      officialData
    ),
    streetAddress: officialData?.['Lähiosoite'],
    postcode: officialData?.['Postinumero']?.toString(),
    townCity: officialData?.['Postitoimipaikka'],

    dateOfBirth: getBirthDate(officialData?.['Syntymäaika']),

    memberType,
    lang: MIKLang.FI,
  }

  const res = await request<RegisterRequest, Member>(
    'POST',
    'v1/members',
    payload
  )
  if (!res?.memberId) {
    throw new Error(`Failed to create member ${member.ID}/${member.user_login}`)
  }
  await storeMapping(member, res.memberId)

  const roles = await getRoles(officialData, member.ID, res)

  await request<Partial<Member>>('PATCH', `v1/members/${res.memberId}`, {
    billingId: getMeta('wpum_jasennumero'),
    roles: roles.map((roleId) => ({
      roleId,
    })),
    memberSince: await getMemberSince(member),
    isTrainingProgramPilot: !!getMeta('wpum_lupakirjaoppilas'),
  })

  if (officialData?.['Odottaa tunnuksia jäsenalueelle'] != 'X') {
    await request<Partial<Member>>('POST', `v1/members/${res.memberId}/approve`)
  } else {
    console.log(
      `Non approved member ${member.ID}/${member.user_login} -> ${res.memberId}`
    )
  }
}

export const migrateRemovedMember = async (
  member: WPUser,
  lastName: string
) => {
  const payload: RegisterRequest = {
    email: `removed-${member.ID}@mik.fi`,
    firstName: '',
    lastName,

    phoneNumber: null,
    streetAddress: null,
    postcode: null,
    townCity: null,

    dateOfBirth: null,

    memberType: MIKMemberTypes.REMOVED,
    lang: MIKLang.FI,
  }

  const res = await request<RegisterRequest, Member>(
    'POST',
    'v1/members',
    payload
  )
  if (!res?.memberId) {
    throw new Error(`Failed to create user ${member.ID}/${member.user_login}`)
  }
  await storeMapping(member, res.memberId)

  await request<Partial<Member>>('PATCH', `v1/members/${res.memberId}`, {
    roles: (await isInstructor(member.ID, res))
      ? [{ roleId: 'INSTRUCTOR' }]
      : [],
    memberSince: await getMemberSince(member),
  })

  await request<Partial<Member>>('POST', `v1/members/${res.memberId}/approve`)
  console.log(
    `Created user ${member.ID}/${member.user_login} -> ${res.memberId}`
  )
}

const getMemberSince = async (member: WPUser): Promise<string | undefined> => {
  if (member.user_registered) {
    return dayjs(member.user_registered).format('YYYY-MM-DD')
  }

  const firstLogin = await conn.query<{ login_date: string }[]>(
    `select login_date from mikweb2_wp_ft_lua_userlogins log
    where login_username = '${member.user_login}'
    ORDER BY login_date desc
    LIMIT 1`
  )
  if (firstLogin.length > 0) {
    return dayjs(firstLogin[0].login_date).format('YYYY-MM-DD')
  }

  const firstFlight = await conn.query<Flight[]>(
    `SELECT offblock FROM kirja_lennot
    where username = '${member.user_login}' and deptime > '2000-01-01'
    ORDER BY deptime ASC
    LIMIT 1`
  )
  if (firstFlight.length > 0) {
    return dayjs(firstFlight[0].offblock).format('YYYY-MM-DD')
  }
}

const storeMapping = async (member: WPUser, memberId: string) => {
  await conn.query(
    `insert into mik_ng (id, username, ng_id) values (${member.ID}, '${member.user_login}', '${memberId}')`
  )
}

const getMemberType = (officialData: Yhdistysavain): MIKMemberTypes => {
  if (officialData?.['Täysjäsen'] == 'X') {
    return MIKMemberTypes.FLYING
  } else if (officialData?.['Kannatusjäsen'] == 'X') {
    return MIKMemberTypes.NONFLYING
  } else if (officialData?.['Nuorisojäsen'] == 'X') {
    return MIKMemberTypes.JUNIOR
  } else {
    if (officialData?.['Jäsentyyppi'].includes('kannatusjäseneksi')) {
      return MIKMemberTypes.NONFLYING
    }
    if (officialData?.['Jäsentyyppi'].includes('täysjäseneksi')) {
      return MIKMemberTypes.FLYING
    }

    throw new Error(`No member type ${officialData.Sähköpostiosoite}}`)
  }
}

const getPhoneNumber = (
  member: WPUser,
  phone?: string,
  officialData?: Yhdistysavain
): string | undefined => {
  const sanitize = (num?: string): string | undefined => {
    if (!num) {
      return undefined
    }
    const cleaned = num.replace(/[\s,-]+/g, '') ?? ''
    if (cleaned[0] === '0') {
      return '+358' + cleaned.slice(1)
    }
    if (cleaned.startsWith('358')) {
      return `+${cleaned}`
    }
    return cleaned
  }

  const metaPhone = sanitize(phone)
  const officialPhone = sanitize(officialData?.['Matkapuhelinnumero'])

  if (metaPhone && metaPhone != officialPhone) {
    console.log(
      `Phone number conflict ${member.ID}/${member.user_login}, yhdistysavain ${officialPhone}, site ${metaPhone}`
    )
  }
  return officialPhone
}

const getEmail = (member: WPUser, officialData?: Yhdistysavain): string => {
  const email =
    officialData?.['Sähköpostiosoite'] ?? `removed-${member.ID}@mik.fi`
  if (
    !email ||
    (officialData?.['Sähköpostiosoite'] && email != member.user_email)
  ) {
    console.log(
      `Email conflict ${member.ID}/${member.user_login}, yhdistysavain ${officialData?.['Sähköpostiosoite']}, site ${member.user_email}`
    )
  }

  // no real emails while testing migration
  // return roles?.[member.ID]?.includes('ADMIN')
  //   ? email
  //   : `valid-${member.ID}@example.com`
  return email
}

const getBirthDate = (dateString?: string): string | undefined => {
  if (!dateString || dateString == 'na' || dateString == '999999') {
    return undefined
  }

  // date is in format dd.mm.yyyy
  const parts = dateString.replaceAll('-', '.').replaceAll('/', '.').split('.')

  // 24.12.[99,1999]
  if (parts.length === 3) {
    const [d, m, y] = parts

    const year = y.length == 2 ? `19${y}` : y
    return `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }

  // 1999
  if (parts.length == 1 && parts[0].length == 4 && parts[0].startsWith('19')) {
    return `${parts[0]}-01-01`
  }

  // 241299
  if (parts.length <= 2 && parts[0].length == 6) {
    return `19${parts[0].slice(4, 6)}-${parts[0].slice(2, 4)}-${parts[0].slice(0, 2)}`
  }

  // 24121999
  if (
    parts.length == 1 &&
    parts[0].length == 8 &&
    parts[0].slice(4, 6) == '19'
  ) {
    return `${parts[0].slice(4, 8)}-${parts[0].slice(2, 4)}-${parts[0].slice(0, 2)}`
  }

  console.log(`Invalid date format: ${dateString}, ${parts.length}`)
  return undefined
}

const getRoles = async (
  officialData: Yhdistysavain,
  userId: number,
  member: Member
): Promise<string[]> => {
  return [
    ...new Set([
      ...(roles?.[userId] ? roles[userId] : []),
      ...(officialData['Hallitus'] == 'X' ? ['COMMITTEE'] : []),
      ...(member.memberType === MIKMemberTypes.FLYING ||
      member.memberType === MIKMemberTypes.JUNIOR
        ? ['MEMBER', 'FLYING_MEMBER']
        : []),
      ...(member.memberType === MIKMemberTypes.NONFLYING ? ['MEMBER'] : []),

      ...((await isInstructor(userId, member)) ? ['INSTRUCTOR'] : []),
    ]),
  ]
}

// Try to match all current and former instructors for flight migration.
// Later leave INSTRUCTOR role only to current instructors.
const isInstructor = async (
  userId: number,
  member: Member
): Promise<boolean> => {
  const hasInstructorRole = await conn.query<{ user_id: number }[]>(
    `SELECT user_id from mikweb2_wp_uam_accessgroup_to_user
    WHERE user_id = ${userId} and group_id = 9`
  )
  if (hasInstructorRole.length > 0) {
    return true
  }

  const instructors = await conn.query<Instructor[]>(
    `SELECT * from kirja_opettajat where nimi like '%${member.lastName}%'`
  )
  return instructors.length > 0
}
