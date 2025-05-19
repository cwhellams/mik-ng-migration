import {
  ART_ENTRY_ERROR_CODE,
  ART_EQUIP_FEE_CODE,
  ART_EQUIP_USAGE_FEE_CODE,
  ART_FOR_AIRCRAFT_CODE,
  ART_JUNIOR_MEMBER_FEE_CODE,
  ART_MEMBER_FEE_CODE,
  ART_SUPPORTING_MEMBER_FEE_CODE,
  CC_EQUIPMENT_FEE,
  CC_FOR_AIRCRAFT,
  CC_MEMBERSHIP_FEE,
} from '../../../src/services/accounting/config.ts'

describe('All config constants are as expected', () => {
  it('has expected cost centre code', () => {
    expect(CC_MEMBERSHIP_FEE).toEqual('Varainhankinta')
    expect(CC_EQUIPMENT_FEE).toEqual('Varainhankinta')
    expect(CC_FOR_AIRCRAFT('OH-IHQ')).toEqual('OH-IHQ')
  })

  it('has expected article code', () => {
    expect(ART_EQUIP_FEE_CODE).toEqual('KALUSTO')
    expect(ART_EQUIP_USAGE_FEE_CODE).toEqual('KALUSTONKAYTTO')
    expect(ART_ENTRY_ERROR_CODE).toEqual('VIRHEMERKINTA')
    expect(ART_MEMBER_FEE_CODE).toEqual('JASEN')
    expect(ART_JUNIOR_MEMBER_FEE_CODE).toEqual('NJASEN')
    expect(ART_SUPPORTING_MEMBER_FEE_CODE).toEqual('KJASEN')
    expect(ART_FOR_AIRCRAFT_CODE('OH-IHQ')).toEqual('OH-IHQ')
  })
})
