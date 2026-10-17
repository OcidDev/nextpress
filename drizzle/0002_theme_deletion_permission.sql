-- Grant delete_themes to administrator roles on installations that stored their
-- role definitions before the capability existed. Role rows are JSONB, so the
-- capability is appended only when missing; custom roles are left untouched.
UPDATE "cms_options"
SET "value" = jsonb_set("value", '{administrator}', jsonb_set(
  "value" -> 'administrator',
  '{capabilities}',
  (("value" #> '{administrator,capabilities}') || '["delete_themes"]'::jsonb)
))
WHERE "name" = 'core:roles'
  AND "value" #> '{administrator,capabilities}' IS NOT NULL
  AND NOT ("value" #> '{administrator,capabilities}') @> '["delete_themes"]'::jsonb;
