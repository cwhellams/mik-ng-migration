//SimplBooks Cost centres
export const CC_MEMBERSHIP_FEE = 'Varainhankinta'
export const CC_EQUIPMENT_FEE = 'Varainhankinta'
export const CC_FOR_AIRCRAFT = (registration: string) => {
  return registration
}

//SimplBooks articles  - the products
export const ART_EQUIP_FEE_CODE = 'KALUSTO'
export const ART_EQUIP_USAGE_FEE_CODE = 'KALUSTONKAYTTO' //If EQUIP FEE IS NOT PAID THEN THIS IS APPLIED TO THE INVOICE
export const ART_ENTRY_ERROR_CODE = 'VIRHEMERKINTA'
export const ART_MEMBER_FEE_CODE = 'JASEN'
export const ART_JUNIOR_MEMBER_FEE_CODE = 'NJASEN'
export const ART_SUPPORTING_MEMBER_FEE_CODE = 'KJASEN'
export const ART_FOR_AIRCRAFT_CODE = (registration: string) => {
  return registration
}
