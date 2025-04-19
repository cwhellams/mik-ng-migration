import dayjs from 'dayjs'
import type { Selectable } from 'kysely'

import * as connection from './connection.ts'
import type { FlightAircraft } from './schema.js'
import {
  type Aircraft,
  type AircraftAlert,
  type AircraftDocument,
  type AircraftNote,
  type AircraftStatus,
} from '../routes/aircrafts/models.ts'

// Get all aircraft
export const getAllAircraft = async (onlyActive: boolean): Promise<Aircraft[]> => {
  const rows = await connection.db
    .selectFrom('flight.aircraft')
    .selectAll()
    .$if(onlyActive, qb => qb.where('active', '=', true))
    .orderBy('display_name')
    .execute()

  return Promise.all(
    rows.map(async row => {
      const aircraft = toAircraft(row, await getDocuments(row.registration))
      return {
        ...aircraft,
        status: aircraftStatus(aircraft),
      }
    }),
  )
}

// Get aircraft by registration
export const getAircraftByRegistration = async (
  registration: string,
  onlyActive: boolean,
): Promise<Aircraft | undefined> => {
  const row = await connection.db
    .selectFrom('flight.aircraft')
    .selectAll()
    .where('registration', '=', registration)
    .$if(onlyActive, qb => qb.where('active', '=', true))
    .executeTakeFirst()
  if (row) {
    const aircraft = toAircraft(row, await getDocuments(row.registration))
    return {
      ...aircraft,
      status: aircraftStatus(aircraft),
    }
  }
}

const getDocuments = async (registration: string): Promise<AircraftDocument[]> => {
  const records = await connection.db
    .selectFrom('flight.aircraft_documents')
    .selectAll()
    .where('registration', '=', registration)
    .execute()
  return records.map(record => ({
    documentId: record.document_id,
    description: record.display_name,
    startDate: record.start_date,
    endDate: record.end_date,
    alertDaysBefore: record.alert_days_before,
    softLimit: record.soft_limit,
    hardLimit: record.hard_limit,
    isPublic: record.is_public,
    createdAt: record.created_at?.toISOString(),
    updatedAt: record.updated_at?.toISOString(),
    createdBy: record.created_by,
    updatedBy: record.updated_by,
  }))
}

const toAircraft = (
  aircraft: Selectable<FlightAircraft>,
  documents: AircraftDocument[],
): Aircraft => ({
  registration: aircraft.registration,
  displayName: aircraft.display_name,
  model: aircraft.model,
  manufacturer: aircraft.manufacturer,
  yearOfManufacture: aircraft.year_of_manufacture,

  documents: documents,
  maintenance: {
    maintenanceCycle: aircraft.maintenance_cycle,
    lastMaintenanceDate: aircraft.last_maintenance_date,
    lastMaintenanceType: aircraft.next_maintenance_type,
    lastMaintenanceTach: aircraft.last_maintenance_tach,
    nextMaintenanceDate: aircraft.next_maintenance_date,
    nextMaintenanceType: aircraft.next_maintenance_type,
    nextMaintenanceTach: aircraft.next_maintenance_tach,

    totalPercentageHours: aircraft.total_percentage_hours,
    usablePercentageHours: aircraft.usable_percentage_hours,
  },

  notes: aircraft.notes as AircraftNote[],

  location: aircraft.location,
  equipment: aircraft.equipment,
  hourlyRateEur: aircraft.hourly_rate_eur,
  createdAt: aircraft.created_at?.toISOString(),
  updatedAt: aircraft.updated_at?.toISOString(),
  createdBy: aircraft.created_by,
  updatedBy: aircraft.updated_by,
})

const daysUntilExpiration = (expirationDate: string): number =>
  dayjs(expirationDate).endOf('day').diff(dayjs().endOf('day'), 'days')

const expiredDocuments = (aircraft: Aircraft) => {
  const alerts: AircraftAlert[] = aircraft.documents
    .map(doc => {
      if (doc.endDate) {
        return {
          alertId: `aircraft.document.${doc.documentId}`,
          description: doc.description,
          untilExpiration: daysUntilExpiration(doc.endDate),
          hardLimit: doc.hardLimit,
          softLimit: doc.softLimit,
        }
      } else {
        return undefined
      }
    })
    .filter(d => d !== undefined)

  const warnings = alerts.filter(doc => {
    return doc.hardLimit !== null && doc.untilExpiration !== null
      ? doc.untilExpiration < doc.hardLimit
      : false
  })

  const cautions = alerts.filter(doc => {
    if (warnings.some(w => w.alertId == doc.alertId)) {
      // there is already a warning, no need for caution message
      return false
    }

    return doc.softLimit !== null && doc.untilExpiration !== null
      ? doc.untilExpiration <= doc.softLimit
      : false
  })

  return {
    warnings,
    cautions,
  }
}

const aircraftStatus = (aircraft: Aircraft): AircraftStatus => {
  const { maintenance } = aircraft

  const totalTime = maintenance.lastMaintenanceTach + 45

  const tachUntilNextMaintenance = maintenance.nextMaintenanceTach - totalTime
  const usablePercentageHours = tachUntilNextMaintenance + maintenance.usablePercentageHours
  const totalPercentageHours = tachUntilNextMaintenance + maintenance.totalPercentageHours

  const daysUntilNextMaintenance = maintenance.nextMaintenanceDate
    ? daysUntilExpiration(maintenance.nextMaintenanceDate)
    : undefined

  const documents = expiredDocuments(aircraft)

  const warnings: AircraftAlert[] = [
    tachUntilNextMaintenance <= 0 && usablePercentageHours <= 0
      ? {
          description: 'aircraft.alerts.noUsableHours',
          untilExpiration: totalPercentageHours,
          hardLimit: maintenance.totalPercentageHours,
          softLimit: maintenance.usablePercentageHours,
        }
      : undefined,
    ...documents.warnings.map(warn => ({
      ...warn,
      description: 'aircraft.alerts.expired',
    })),
    //.map(
    //  doc => `${doc.description} expired ${Math.abs(doc.daysUntilExpiration)} days ago`,
    //),
  ].filter(w => w !== undefined)

  const cautions: AircraftAlert[] = [
    tachUntilNextMaintenance <= 0 && usablePercentageHours > 0
      ? {
          description: 'aircraft.alerts.usableHours',
          untilExpiration: usablePercentageHours,
          hardLimit: maintenance.totalPercentageHours,
          softLimit: maintenance.usablePercentageHours,
        }
      : //`${usablePercentageHours} usable percent hours remaining`
        undefined,
    ...documents.cautions.map(warn => ({
      ...warn,
      description: 'aircraft.alerts.expiring',
    })),
    // .map(
    //   doc => `${doc.description} expires soon in ${doc.daysUntilExpiration} days`,
    // ),
  ].filter(w => w !== undefined)

  return {
    totalTime,

    daysUntilNextMaintenance,
    tachUntilNextMaintenance,
    usablePercentageHours,
    totalPercentageHours,

    warnings,
    cautions,
  }
}
