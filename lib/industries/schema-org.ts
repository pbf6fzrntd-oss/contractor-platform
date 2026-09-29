/**
 * schema.org business types we use on hosted profiles (JSON-LD), checked
 * against the official vocabulary (schema-dts 2.0.0, generated from
 * schema.org, 2026-09-29). Only types in this list may appear in an industry
 * config; a unit test enforces it.
 *
 * NOT in schema.org (so we fall back to the closest parent): CleaningService,
 * HouseCleaning, PestControl, PoolService, LawnCare, Landscaper, JunkRemoval,
 * PressureWashing, PetGrooming, DogTrainer. ProfessionalService exists but is
 * deprecated, so we never use it.
 */
export const SCHEMA_ORG_PARENTS: Record<string, string> = {
  LocalBusiness: "Organization",
  HomeAndConstructionBusiness: "LocalBusiness",
  Electrician: "HomeAndConstructionBusiness",
  GeneralContractor: "HomeAndConstructionBusiness",
  HousePainter: "HomeAndConstructionBusiness",
  HVACBusiness: "HomeAndConstructionBusiness",
  Locksmith: "HomeAndConstructionBusiness",
  MovingCompany: "HomeAndConstructionBusiness",
  Plumber: "HomeAndConstructionBusiness",
  RoofingContractor: "HomeAndConstructionBusiness",
  AutomotiveBusiness: "LocalBusiness",
  AutoBodyShop: "AutomotiveBusiness",
  AutoRepair: "AutomotiveBusiness",
  AutoWash: "AutomotiveBusiness",
  EmergencyService: "LocalBusiness",
  AnimalShelter: "LocalBusiness",
  PetStore: "Store",
  // VeterinaryCare sits under MedicalOrganization (not LocalBusiness), so
  // mobile vets also list LocalBusiness for hours and service area.
  VeterinaryCare: "MedicalOrganization",
};

export const SCHEMA_ORG_TYPES = new Set(Object.keys(SCHEMA_ORG_PARENTS));

export function isVerifiedSchemaType(type: string): boolean {
  return SCHEMA_ORG_TYPES.has(type);
}
